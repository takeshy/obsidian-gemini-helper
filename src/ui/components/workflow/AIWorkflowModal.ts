import { App, Modal, Notice, parseYaml, TFile, setIcon, MarkdownRenderer, Component } from "obsidian";
import type { GeminiHelperPlugin } from "src/plugin";
import { GeminiClient } from "src/core/gemini";
import { tracing } from "src/core/tracingHooks";
import { getAvailableModels, SKILLS_FOLDER, WORKFLOWS_FOLDER, type ModelType, type Attachment, type StreamChunkUsage } from "src/types";
import { getWorkflowSpecification, buildWorkflowSpecContext } from "src/workflow/workflowSpec";
import type { SidebarNode, WorkflowNodeType, ExecutionStep } from "src/workflow/types";
import { listWorkflowOptions, normalizeYamlText } from "src/workflow/parser";
import { ExecutionHistoryManager } from "src/workflow/history";
import { renderDiffView, createDiffViewToggle } from "./DiffRenderer";
import { WorkflowGenerationModal } from "./WorkflowGenerationModal";
import { showWorkflowPreview } from "./WorkflowPreviewModal";
import { showExecutionHistorySelect } from "./ExecutionHistorySelectModal";
import { ConfirmModal } from "../ConfirmModal";
import { formatError } from "src/utils/error";
import { t, getLocale } from "src/i18n";

// Supported file types for attachments
const SUPPORTED_TYPES = {
  image: ["image/png", "image/jpeg", "image/gif", "image/webp"],
  pdf: ["application/pdf"],
  text: ["text/plain", "text/markdown", "text/csv", "application/json"],
};

export type AIWorkflowMode = "create" | "modify";

export interface ResolvedMention {
  original: string; // e.g., "@notes/file.md"
  content: string;  // The file content
}

export interface AIWorkflowResult {
  yaml: string;
  nodes: SidebarNode[];
  name: string;
  outputPath?: string; // Only for create mode
  explanation?: string; // AI's explanation of changes
  description?: string; // User's original request
  mode?: AIWorkflowMode; // "create" or "modify"
  resolvedMentions?: ResolvedMention[]; // File contents that were embedded
  createAsSkill?: boolean; // If true, create as agent skill
  rawMarkdown?: string; // Complete markdown from external LLM (saved as-is)
  skillInstructions?: string; // AI-generated SKILL.md instructions body
}

// Result type for confirmation modal
export type ConfirmResult = "ok" | "no" | "cancel";

export interface WorkflowConfirmResult {
  result: ConfirmResult;
  additionalRequest?: string;
}

/** Context from the generation phases, shown in preview/confirm modals */
export interface GenerationContext {
  plan?: string;
  thinking?: string;
  review?: string;
}

// Confirmation modal for reviewing changes
class WorkflowConfirmModal extends Modal {
  private oldYaml: string;
  private newYaml: string;
  private explanation?: string;
  private userRequest: string;
  private generationContext: GenerationContext;
  private isSkill: boolean;
  /** For Modify Skill with AI: old SKILL.md instructions body (diff "before"). */
  private oldInstructions?: string;
  /** For Modify Skill with AI: new SKILL.md instructions body (diff "after"). */
  private newInstructions?: string;
  private resolvePromise: (result: WorkflowConfirmResult) => void;
  private additionalRequestEl: HTMLTextAreaElement | null = null;
  private markdownComponent: Component | null = null;

  constructor(
    app: App,
    oldYaml: string,
    newYaml: string,
    explanation: string | undefined,
    userRequest: string,
    generationContext: GenerationContext,
    isSkill: boolean,
    resolvePromise: (result: WorkflowConfirmResult) => void,
    oldInstructions?: string,
    newInstructions?: string,
  ) {
    super(app);
    this.oldYaml = oldYaml;
    this.newYaml = newYaml;
    this.explanation = explanation;
    this.userRequest = userRequest;
    this.generationContext = generationContext;
    this.isSkill = isSkill;
    this.oldInstructions = oldInstructions;
    this.newInstructions = newInstructions;
    this.resolvePromise = resolvePromise;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("ai-workflow-confirm-modal");
    modalEl.addClass("gemini-helper-modal-resizable");

    // Drag handle with title
    const dragHandle = contentEl.createDiv({ cls: "modal-drag-handle" });
    dragHandle.createEl("h2", {
      text: this.isSkill ? t("aiWorkflow.confirmSkillChanges") : t("aiWorkflow.confirmChanges"),
    });
    this.setupDragHandle(dragHandle, modalEl);

    // Scrollable middle area holds everything that can grow (explanation + diff + context)
    // so the textarea and buttons below always remain visible.
    const scrollable = contentEl.createDiv({ cls: "ai-workflow-confirm-scrollable" });

    // Read-only display of the user's request for this iteration so the user
    // can see what was asked without re-prefilling the refinement textarea.
    if (this.userRequest?.trim()) {
      const requestContainer = scrollable.createDiv({ cls: "ai-workflow-confirm-user-request" });
      requestContainer.createEl("div", {
        cls: "ai-workflow-confirm-user-request-label",
        text: t("workflow.generation.yourRequest"),
      });
      requestContainer.createEl("div", {
        cls: "ai-workflow-confirm-user-request-body",
        text: this.userRequest.trim(),
      });
    }

    // Explanation section (if available). For skill mode we suppress it here
    // because the AI's pre-YAML text IS the new SKILL.md body and will be
    // rendered as a proper diff below instead.
    const hasInstructionsDiff = this.isSkill && this.newInstructions !== undefined;
    if (this.explanation && !hasInstructionsDiff) {
      const explanationContainer = scrollable.createDiv({ cls: "ai-workflow-explanation" });
      const header = explanationContainer.createDiv({ cls: "workflow-generation-section-header" });
      header.createEl("h3", { text: t("aiWorkflow.aiExplanation") });
      const explanation = this.explanation;
      const copyBtn = header.createEl("button", {
        cls: "workflow-generation-copy-btn",
        text: t("message.copy"),
      });
      copyBtn.addEventListener("click", () => {
        void navigator.clipboard.writeText(explanation).then(() => {
          const original = copyBtn.textContent;
          copyBtn.textContent = "✓";
          setTimeout(() => { copyBtn.textContent = original; }, 1200);
        });
      });
      explanationContainer.createEl("p", { text: this.explanation });
    }

    // Skill mode: render SKILL.md instructions diff (old body vs new body) so
    // the user can see both instruction-body changes and workflow YAML changes.
    if (hasInstructionsDiff) {
      const instrLabel = scrollable.createDiv({ cls: "gemini-helper-edit-confirm-preview-label" });
      instrLabel.createEl("span", { text: t("aiWorkflow.skillInstructionsChanges") });
      const instrUnchanged = (this.oldInstructions ?? "") === this.newInstructions;
      if (instrUnchanged) {
        scrollable.createDiv({
          cls: "ai-workflow-confirm-no-changes",
          text: t("aiWorkflow.noChanges"),
        });
      } else {
        const instrWrapper = scrollable.createDiv({ cls: "ai-workflow-confirm-diff-wrapper" });
        const instrDiffState = renderDiffView(instrWrapper, this.oldInstructions ?? "", this.newInstructions!);
        createDiffViewToggle(instrLabel, instrDiffState);
      }
    }

    // Create diff view with toggle
    const diffLabel = scrollable.createDiv({ cls: "gemini-helper-edit-confirm-preview-label" });
    diffLabel.createEl("span", {
      text: hasInstructionsDiff ? t("aiWorkflow.workflowYamlChanges") : t("workflowModal.changes"),
    });
    const yamlUnchanged = this.oldYaml === this.newYaml;
    if (yamlUnchanged) {
      scrollable.createDiv({
        cls: "ai-workflow-confirm-no-changes",
        text: t("aiWorkflow.noChanges"),
      });
    } else {
      const diffWrapper = scrollable.createDiv({ cls: "ai-workflow-confirm-diff-wrapper" });
      const diffState = renderDiffView(diffWrapper, this.oldYaml, this.newYaml);
      createDiffViewToggle(diffLabel, diffState);
    }

    // Generation context (plan/thinking/review)
    this.markdownComponent = new Component();
    this.markdownComponent.load();
    // In the confirm modal the diff is the primary content; keep the generation
    // context (plan/review/thinking) collapsed by default so the diff is visible.
    renderGenerationContext(scrollable, this.generationContext, this.app, this.markdownComponent, { defaultOpen: false });

    // Feedback textarea (always visible)
    const additionalRequestContainer = contentEl.createDiv({
      cls: "workflow-preview-additional",
    });
    additionalRequestContainer.createEl("label", {
      text: t("workflow.preview.additionalRequest"),
    });
    this.additionalRequestEl = additionalRequestContainer.createEl("textarea", {
      cls: "workflow-preview-additional-input",
      attr: {
        placeholder: t("workflow.preview.additionalPlaceholder"),
        rows: "3",
      },
    });

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "ai-workflow-buttons" });

    const cancelBtn = buttonContainer.createEl("button", { text: t("workflow.preview.cancel") });
    cancelBtn.addEventListener("click", () => {
      this.resolvePromise({ result: "cancel" });
      this.close();
    });

    const requestChangesBtn = buttonContainer.createEl("button", {
      text: t("message.requestChanges"),
      cls: "mod-warning",
    });
    // Start disabled — enabled once the user types a refinement.
    requestChangesBtn.disabled = true;
    this.additionalRequestEl.addEventListener("input", () => {
      requestChangesBtn.disabled = !(this.additionalRequestEl?.value?.trim());
    });
    requestChangesBtn.addEventListener("click", () => {
      const additionalRequest = this.additionalRequestEl?.value?.trim() || "";
      this.resolvePromise({
        result: "no",
        additionalRequest,
      });
      this.close();
    });

    const applyBtn = buttonContainer.createEl("button", {
      text: t("workflow.confirm.useThis"),
      cls: "mod-cta",
    });
    applyBtn.addEventListener("click", () => {
      this.resolvePromise({ result: "ok" });
      this.close();
    });
  }

  private setupDragHandle(dragHandle: HTMLElement, modalEl: HTMLElement): void {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = modalEl.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      // Set position to fixed for dragging
      modalEl.setCssStyles({
        position: "fixed",
        left: `${startLeft}px`,
        top: `${startTop}px`,
        transform: "none",
        margin: "0",
      });

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      modalEl.setCssStyles({
        left: `${startLeft + dx}px`,
        top: `${startTop + dy}px`,
      });
    };

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    dragHandle.addEventListener("mousedown", onMouseDown);
  }

  onClose(): void {
    if (this.markdownComponent) {
      this.markdownComponent.unload();
      this.markdownComponent = null;
    }
    const { contentEl } = this;
    contentEl.empty();
  }
}

// Helper function to show confirmation modal
function showWorkflowConfirmation(
  app: App,
  oldYaml: string,
  newYaml: string,
  explanation: string | undefined,
  userRequest: string,
  generationContext: GenerationContext,
  isSkill: boolean,
  oldInstructions?: string,
  newInstructions?: string,
): Promise<WorkflowConfirmResult> {
  return new Promise((resolve) => {
    const modal = new WorkflowConfirmModal(
      app, oldYaml, newYaml, explanation, userRequest,
      generationContext, isSkill, resolve,
      oldInstructions, newInstructions,
    );
    modal.open();
  });
}

// Mention item interface
interface MentionItem {
  value: string;
  description: string;
}

export class AIWorkflowModal extends Modal {
  private plugin: GeminiHelperPlugin;
  private mode: AIWorkflowMode;
  private existingYaml?: string;
  private existingName?: string;
  /** When true, treat this session as a skill even without the checkbox (used for Modify Skill with AI). */
  private forceSkill = false;
  /** Existing skill instructions (SKILL.md body), passed when modifying a skill. */
  private existingInstructions?: string;
  private resolvePromise: (result: AIWorkflowResult | null) => void;

  private nameInputEl: HTMLInputElement | null = null;
  private outputPathEl: HTMLInputElement | null = null;
  private skillCheckbox: HTMLInputElement | null = null;
  private descriptionEl: HTMLTextAreaElement | null = null;
  private modelSelect: HTMLSelectElement | null = null;
  private confirmCheckbox: HTMLInputElement | null = null;
  private generateBtn: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private isGenerating = false;

  // Paste response section (for external LLM flow)
  private pasteSectionEl: HTMLElement | null = null;
  private pasteTextareaEl: HTMLTextAreaElement | null = null;
  private cachedResolvedDescription: string | null = null;
  private cachedResolvedMentions: ResolvedMention[] | null = null;

  // Mention autocomplete state
  private mentionAutocompleteEl: HTMLElement | null = null;
  private mentionItems: MentionItem[] = [];
  private mentionIndex = 0;
  private mentionStartPos = 0;
  private showingMentionAutocomplete = false;
  private clickOutsideHandler: ((e: MouseEvent) => void) | null = null;

  private defaultOutputPath?: string;

  // Resize state
  private isDragging = false;
  private isResizing = false;
  private resizeDirection = "";
  private dragStartX = 0;
  private dragStartY = 0;
  private modalStartX = 0;
  private modalStartY = 0;
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;

  // File attachment state
  private pendingAttachments: Attachment[] = [];
  private attachmentsContainerEl: HTMLElement | null = null;
  private fileInputEl: HTMLInputElement | null = null;

  // Execution history state (for modify mode)
  private selectedExecutionSteps: ExecutionStep[] = [];
  private executionHistoryInfoEl: HTMLElement | null = null;

  constructor(
    app: App,
    plugin: GeminiHelperPlugin,
    mode: AIWorkflowMode,
    resolvePromise: (result: AIWorkflowResult | null) => void,
    existingYaml?: string,
    existingName?: string,
    defaultOutputPath?: string,
    options?: { isSkill?: boolean; existingInstructions?: string }
  ) {
    super(app);
    this.plugin = plugin;
    this.mode = mode;
    this.existingYaml = existingYaml;
    this.existingName = existingName;
    this.resolvePromise = resolvePromise;
    this.defaultOutputPath = defaultOutputPath;
    this.forceSkill = options?.isSkill ?? false;
    this.existingInstructions = options?.existingInstructions;
  }

  /** Whether this session is operating on a skill (either forced via constructor or chosen via checkbox). */
  private isSkill(): boolean {
    return this.forceSkill || (this.skillCheckbox?.checked ?? false);
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("ai-workflow-modal");
    modalEl.addClass("gemini-helper-resizable-modal");

    // Drag handle with title
    const dragHandle = contentEl.createDiv({ cls: "modal-drag-handle" });
    const title =
      this.mode === "create"
        ? this.forceSkill
          ? t("aiWorkflow.createSkillTitle")
          : t("aiWorkflow.createTitle")
        : this.forceSkill
          ? t("aiWorkflow.modifySkillTitle")
          : t("aiWorkflow.modifyTitle");
    dragHandle.createEl("h2", { text: title });
    this.setupDrag(dragHandle, modalEl);

    // Add resize handles
    this.addResizeHandles(modalEl);

    // Name and output path (only for create mode)
    if (this.mode === "create") {
      // Name input — label & placeholder depend on whether we're creating a workflow or a skill
      const nameContainer = contentEl.createDiv({ cls: "ai-workflow-input-row" });
      nameContainer.createEl("label", {
        text: this.forceSkill ? t("aiWorkflow.skillName") : t("aiWorkflow.workflowName"),
      });
      this.nameInputEl = nameContainer.createEl("input", {
        type: "text",
        cls: "ai-workflow-name-input",
        attr: {
          placeholder: this.forceSkill
            ? t("aiWorkflow.skillNamePlaceholder")
            : t("aiWorkflow.namePlaceholder"),
        },
      });

      // Output path input.
      // When creating a skill the path is fixed to SKILLS_FOLDER and locked —
      // skills are addressed by folder name so the generator shouldn't be able
      // to drop them elsewhere.
      const pathContainer = contentEl.createDiv({ cls: "ai-workflow-input-row" });
      pathContainer.createEl("label", { text: t("aiWorkflow.outputPath") });
      const defaultPath = this.forceSkill
        ? `${SKILLS_FOLDER}/{{name}}`
        : this.defaultOutputPath || `${WORKFLOWS_FOLDER}/{{name}}`;
      this.outputPathEl = pathContainer.createEl("input", {
        type: "text",
        cls: "ai-workflow-path-input",
        value: defaultPath,
        attr: { placeholder: `${WORKFLOWS_FOLDER}/{{name}}` },
      });
      if (this.forceSkill) {
        this.outputPathEl.disabled = true;
      }
      pathContainer.createEl("div", {
        cls: "ai-workflow-hint",
        text: t("aiWorkflow.pathHint"),
      });

      // "Create as skill" checkbox is only relevant when the caller did not
      // already commit to a specific mode (i.e., forceSkill is false). When
      // forceSkill is true the user picked "Create skill with AI" up front so
      // the modal is skill-only; when forceSkill is false the modal is
      // workflow-only and the checkbox would be redundant. Drop it entirely.
    }

    // Description label
    const descLabel =
      this.mode === "create"
        ? this.forceSkill
          ? t("aiWorkflow.describeCreateSkill")
          : t("aiWorkflow.describeCreate")
        : t("aiWorkflow.describeModify");

    contentEl.createEl("label", {
      text: descLabel,
      cls: "ai-workflow-label",
    });

    // Description textarea container (for autocomplete positioning)
    const textareaContainer = contentEl.createDiv({ cls: "ai-workflow-textarea-container" });

    // Mention autocomplete dropdown
    this.mentionAutocompleteEl = textareaContainer.createDiv({
      cls: "gemini-helper-autocomplete ai-workflow-mention-autocomplete is-hidden",
    });

    // Description textarea
    this.descriptionEl = textareaContainer.createEl("textarea", {
      cls: "ai-workflow-textarea",
      attr: {
        placeholder:
          this.mode === "create"
            ? this.forceSkill
              ? t("aiWorkflow.placeholderCreateSkill")
              : t("aiWorkflow.placeholderCreate")
            : t("aiWorkflow.placeholderModify"),
        rows: "6",
      },
    });

    // Invalidate cached mentions when description changes
    this.descriptionEl.addEventListener("input", () => {
      this.cachedResolvedDescription = null;
      this.cachedResolvedMentions = null;
    });

    // Setup mention autocomplete handlers
    this.setupMentionAutocomplete();

    // Hint for @ mention
    contentEl.createEl("div", {
      cls: "ai-workflow-hint",
      text: t("aiWorkflow.mentionHint"),
    });

    // File attachment section
    const attachmentRow = contentEl.createDiv({ cls: "ai-workflow-attachment-row" });

    // Hidden file input
    this.fileInputEl = attachmentRow.createEl("input", {
      type: "file",
      attr: {
        multiple: "true",
        accept: this.getAllAcceptedTypes(),
        style: "display: none",
      },
    });
    this.fileInputEl.addEventListener("change", (e) => {
      void this.handleFileSelect(e);
    });

    // Attachment button
    const attachBtn = attachmentRow.createEl("button", {
      cls: "ai-workflow-attach-btn",
      attr: { type: "button" },
    });
    const iconSpan = attachBtn.createSpan();
    setIcon(iconSpan, "paperclip");
    attachBtn.createSpan({ text: " " + t("input.attach") });
    attachBtn.addEventListener("click", () => {
      this.fileInputEl?.click();
    });

    // Attachments container
    this.attachmentsContainerEl = attachmentRow.createDiv({ cls: "ai-workflow-attachments" });

    // Show current workflow for modify mode
    if (this.mode === "modify" && this.existingYaml) {
      const details = contentEl.createEl("details", {
        cls: "ai-workflow-existing",
      });
      details.createEl("summary", { text: t("aiWorkflow.currentWorkflow") });
      details.createEl("pre", {
        text: this.existingYaml,
        cls: "ai-workflow-yaml-preview",
      });
    }

    // Model selection row
    const modelContainer = contentEl.createDiv({ cls: "ai-workflow-model-row" });
    modelContainer.createEl("label", { text: t("aiWorkflow.model") });

    this.modelSelect = modelContainer.createEl("select", {
      cls: "ai-workflow-model-select",
    });

    // Only include API models if API key is configured
    const baseModels = this.plugin.settings.googleApiKey ? getAvailableModels(this.plugin.settings.apiPlan) : [];
    const availableModels = baseModels;
    // Use last used model for AI workflow, or fall back to selected model
    const lastAIWorkflowModel = this.plugin.settings.lastAIWorkflowModel;
    const defaultModel = lastAIWorkflowModel && availableModels.some(m => m.name === lastAIWorkflowModel && !m.isImageModel)
      ? lastAIWorkflowModel
      : this.plugin.getSelectedModel();

    for (const model of availableModels) {
      // Skip image models
      if (model.isImageModel) continue;

      const option = this.modelSelect.createEl("option", {
        text: model.displayName,
        value: model.name,
      });
      if (model.name === defaultModel) {
        option.selected = true;
      }
    }

    // Confirmation checkbox (only for modify mode)
    if (this.mode === "modify") {
      const confirmContainer = contentEl.createDiv({ cls: "ai-workflow-confirm-row" });
      this.confirmCheckbox = confirmContainer.createEl("input", {
        type: "checkbox",
        attr: { id: "ai-workflow-confirm-checkbox" },
      });
      this.confirmCheckbox.checked = true; // Default to checked
      confirmContainer.createEl("label", {
        text: t("aiWorkflow.confirmCheckbox"),
        attr: { for: "ai-workflow-confirm-checkbox" },
      });

      // Execution history reference row (only for modify mode)
      const executionHistoryRow = contentEl.createDiv({ cls: "ai-workflow-execution-history-row" });

      const executionHistoryBtn = executionHistoryRow.createEl("button", {
        cls: "ai-workflow-execution-history-btn",
      });
      const historyIcon = executionHistoryBtn.createSpan();
      setIcon(historyIcon, "history");
      executionHistoryBtn.createSpan({ text: " " + t("workflow.preview.referenceHistory") });

      this.executionHistoryInfoEl = executionHistoryRow.createDiv({
        cls: "ai-workflow-execution-history-info"
      });

      executionHistoryBtn.addEventListener("click", () => {
        void this.openExecutionHistorySelect();
      });
    }

    // Status area
    this.statusEl = contentEl.createDiv({ cls: "ai-workflow-status" });

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "ai-workflow-buttons" });

    const cancelBtn = buttonContainer.createEl("button", { text: t("common.cancel") });
    cancelBtn.addEventListener("click", () => {
      this.resolvePromise(null);
      this.close();
    });

    const copyPromptBtn = buttonContainer.createEl("button", {
      text: t("aiWorkflow.copyPrompt"),
    });
    copyPromptBtn.addEventListener("click", () => {
      void this.exportPrompt();
    });

    this.generateBtn = buttonContainer.createEl("button", {
      text: this.mode === "create" ? t("aiWorkflow.generate") : t("aiWorkflow.modify"),
      cls: "mod-cta",
    });
    this.generateBtn.addEventListener("click", () => {
      void this.generate();
    });

    // Paste response section (hidden until Copy Prompt is clicked)
    this.pasteSectionEl = contentEl.createDiv({ cls: "ai-workflow-paste-section is-hidden" });

    this.pasteSectionEl.createEl("label", {
      text: t("aiWorkflow.pasteLabel"),
      cls: "ai-workflow-label",
    });

    this.pasteTextareaEl = this.pasteSectionEl.createEl("textarea", {
      cls: "ai-workflow-textarea",
      attr: {
        placeholder: t("aiWorkflow.pastePlaceholder"),
        rows: "10",
      },
    });

    const pasteButtonContainer = this.pasteSectionEl.createDiv({ cls: "ai-workflow-buttons" });
    const applyBtn = pasteButtonContainer.createEl("button", {
      text: t("aiWorkflow.applyPasted"),
      cls: "mod-cta",
    });
    applyBtn.addEventListener("click", () => {
      void this.applyPastedResponse();
    });

    // Focus appropriate field
    if (this.mode === "create") {
      setTimeout(() => this.nameInputEl?.focus(), 50);
    } else {
      setTimeout(() => this.descriptionEl?.focus(), 50);
    }
  }

  /**
   * Open execution history select modal (for modify mode)
   */
  private async openExecutionHistorySelect(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice(t("workflowModal.noExecutionHistory"));
      return;
    }

    try {
      const encryption = this.plugin.settings.encryption;
      const encryptionConfig = encryption?.enabled ? {
        enabled: true,
        encryptWorkflowHistory: encryption.encryptWorkflowHistory,
        publicKey: encryption.publicKey || "",
        encryptedPrivateKey: encryption.encryptedPrivateKey || "",
        salt: encryption.salt || "",
      } : undefined;
      const historyManager = new ExecutionHistoryManager(
        this.app,
        encryptionConfig,
        this.plugin.settings.workspaceFolder
      );
      const executionRecords = await historyManager.loadRecords(activeFile.path);

      if (executionRecords.length === 0) {
        new Notice(t("workflowModal.noExecutionHistory"));
        return;
      }

      const result = await showExecutionHistorySelect(this.app, executionRecords);
      if (result && result.selectedSteps.length > 0) {
        this.selectedExecutionSteps = result.selectedSteps;
        this.updateExecutionHistoryInfo();
      }
    } catch (e) {
      console.error("Failed to load execution history:", formatError(e));
      new Notice(t("workflowModal.noExecutionHistory"));
    }
  }

  /**
   * Update execution history info display
   */
  private updateExecutionHistoryInfo(): void {
    if (!this.executionHistoryInfoEl) return;

    if (this.selectedExecutionSteps.length > 0) {
      this.executionHistoryInfoEl.textContent = t("workflow.preview.stepsSelected", {
        count: String(this.selectedExecutionSteps.length),
      });
      this.executionHistoryInfoEl.removeClass("is-hidden");
    } else {
      this.executionHistoryInfoEl.textContent = "";
      this.executionHistoryInfoEl.addClass("is-hidden");
    }
  }

  /**
   * Copy the full prompt (system + user) to clipboard for use with external LLMs.
   */
  private async exportPrompt(): Promise<void> {
    // Validate name for create mode
    if (this.mode === "create") {
      const name = this.nameInputEl?.value?.trim();
      if (!name) {
        new Notice(t("aiWorkflow.enterName"));
        return;
      }
    }

    const description = this.descriptionEl?.value?.trim();
    if (!description) {
      new Notice(t("aiWorkflow.enterDescription"));
      return;
    }

    const workflowName = this.mode === "create"
      ? this.nameInputEl?.value?.trim() || "workflow"
      : this.existingName || "workflow";

    // Resolve @ mentions
    const { resolved, mentions } = await this.resolveMentions(description);
    this.cachedResolvedDescription = resolved;
    this.cachedResolvedMentions = mentions;

    const isSkill = this.isSkill();
    const systemPrompt = this.buildSystemPrompt(true, isSkill);
    const userPrompt = this.buildUserPrompt(
      resolved,
      workflowName,
      undefined,
      [],
      this.selectedExecutionSteps.length > 0 ? this.selectedExecutionSteps : undefined,
      isSkill
    );

    const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

    // Copy to clipboard
    await navigator.clipboard.writeText(fullPrompt);

    // Show paste response section, scroll it into view, and focus the textarea
    this.pasteSectionEl?.removeClass("is-hidden");
    this.pasteSectionEl?.scrollIntoView({ behavior: "smooth", block: "end" });
    setTimeout(() => this.pasteTextareaEl?.focus(), 100);

    new Notice(t("aiWorkflow.promptCopied"));
  }

  /**
   * Apply a pasted response from an external LLM.
   */
  private async applyPastedResponse(): Promise<void> {
    const pastedText = this.pasteTextareaEl?.value?.trim();
    if (!pastedText) {
      new Notice(t("aiWorkflow.enterPastedYaml"));
      return;
    }

    const workflowName = this.mode === "create"
      ? this.nameInputEl?.value?.trim() || "workflow"
      : this.existingName || "workflow";

    // Re-resolve mentions if cache was invalidated (description changed after Copy Prompt)
    if (this.cachedResolvedDescription === null) {
      const rawDesc = this.descriptionEl?.value?.trim() || "";
      const { resolved, mentions } = await this.resolveMentions(rawDesc);
      this.cachedResolvedDescription = resolved;
      this.cachedResolvedMentions = mentions;
    }

    const description = this.cachedResolvedDescription || this.descriptionEl?.value?.trim() || "";
    const resolvedMentions = this.cachedResolvedMentions?.length
      ? this.cachedResolvedMentions
      : undefined;

    if (this.mode === "create") {
      const isSkill = this.isSkill();

      // Create mode: save markdown directly (validate it has workflow blocks)
      const options = listWorkflowOptions(pastedText);
      if (options.length === 0) {
        // Fallback: try parsing as raw YAML
        const parsed = parseWorkflowResponse(pastedText);
        if (!parsed) {
          new Notice(t("workflow.generation.parseFailed"));
          return;
        }
        // Return as normal result (will be built into markdown by save logic)
        parsed.name = workflowName;
        parsed.description = description;
        parsed.mode = "create";
        parsed.resolvedMentions = resolvedMentions;
        const outputPathTemplate = this.outputPathEl?.value?.trim() || `${WORKFLOWS_FOLDER}/{{name}}`;
        parsed.outputPath = outputPathTemplate.replace(/\{\{name\}\}/g, workflowName);
        if (isSkill) {
          parsed.createAsSkill = true;
          // Extract skill instructions from explanation (text before YAML, strip trailing ---)
          if (parsed.explanation) {
            parsed.skillInstructions = parsed.explanation.replace(/\n---\s*$/, "").trim();
          }
        }
        this.resolvePromise(parsed);
        this.close();
        return;
      }

      // Extract skill instructions from text before first ```workflow block
      let skillInstructions: string | undefined;
      let workflowMarkdown = pastedText;
      if (isSkill) {
        const workflowBlockMatch = pastedText.match(/^`{3,}workflow/m);
        if (workflowBlockMatch && workflowBlockMatch.index !== undefined && workflowBlockMatch.index > 0) {
          const textBefore = pastedText.substring(0, workflowBlockMatch.index).trim();
          if (textBefore) {
            skillInstructions = textBefore;
          }
          workflowMarkdown = pastedText.substring(workflowBlockMatch.index);
        }
      }

      // Save as raw markdown
      const outputPathTemplate = this.outputPathEl?.value?.trim() || `${WORKFLOWS_FOLDER}/{{name}}`;
      const result: AIWorkflowResult = {
        yaml: "",
        nodes: [],
        name: workflowName,
        outputPath: outputPathTemplate.replace(/\{\{name\}\}/g, workflowName),
        description,
        mode: "create",
        resolvedMentions,
        createAsSkill: isSkill,
        rawMarkdown: workflowMarkdown,
        skillInstructions,
      };
      this.resolvePromise(result);
      this.close();
    } else {
      // Modify mode: parse YAML and return nodes
      const result = parseWorkflowResponse(pastedText);
      if (!result) {
        new Notice(t("workflow.generation.parseFailed"));
        return;
      }

      result.name = workflowName;
      result.description = description;
      result.mode = this.mode;
      result.resolvedMentions = resolvedMentions;

      this.resolvePromise(result);
      this.close();
    }
  }

  private async generate(): Promise<void> {
    if (this.isGenerating) return;

    // Validate name for create mode
    if (this.mode === "create") {
      const name = this.nameInputEl?.value?.trim();
      if (!name) {
        new Notice(t("aiWorkflow.enterName"));
        return;
      }
    }

    const description = this.descriptionEl?.value?.trim();
    if (!description) {
      new Notice(t("aiWorkflow.enterDescription"));
      return;
    }

    const selectedModel = this.modelSelect?.value as ModelType;
    if (!selectedModel) {
      new Notice(t("aiWorkflow.selectModel"));
      return;
    }

    // Check API key
    if (!this.plugin.settings.googleApiKey) {
      new Notice(t("aiWorkflow.apiKeyNotConfigured"));
      return;
    }

    // Get name for create mode
    const workflowName = this.mode === "create"
      ? this.nameInputEl?.value?.trim() || "workflow"
      : this.existingName || "workflow";

    // Get output path template for create mode
    const outputPathTemplate = this.mode === "create"
      ? this.outputPathEl?.value?.trim() || `${WORKFLOWS_FOLDER}/{{name}}/main`
      : undefined;

    // Resolve @ mentions (embed file content, selection, etc.)
    const { resolved: resolvedDescription, mentions: resolvedMentions } = await this.resolveMentions(description);

    // Get model display name from select element
    const modelDisplayName = this.modelSelect?.options[this.modelSelect.selectedIndex]?.text || selectedModel;

    // Close input modal and start generation flow
    this.close();

    // Determine the workflow path for loading execution history
    // For modify mode, use the active file path; for create mode, we'll construct it later
    const activeFile = this.app.workspace.getActiveFile();
    const workflowPath = this.mode === "modify" && activeFile ? activeFile.path : undefined;

    // Start the generation with preview loop
    // Use resolved description (with @mentions expanded) as the request
    // Pass selected execution steps if any (for modify mode)
    await this.runGenerationLoop(
      resolvedDescription,
      workflowName,
      outputPathTemplate,
      selectedModel,
      resolvedMentions,
      workflowPath,
      modelDisplayName,
      undefined,  // previousYaml
      [],         // requestHistory
      this.selectedExecutionSteps.length > 0 ? this.selectedExecutionSteps : undefined
    );
  }

  /**
   * Run the generation loop with progress display and preview confirmation.
   * Runs three phases:
   *   1. Planning - produces a structured plan before generation
   *   2. Generation - creates the workflow YAML using the plan as context
   *   3. Review - critiques the output and auto-refines if high-severity issues found
   */
  private async runGenerationLoop(
    currentRequest: string,
    workflowName: string,
    outputPathTemplate: string | undefined,
    selectedModel: ModelType,
    resolvedMentions: ResolvedMention[],
    workflowPath: string | undefined,
    modelDisplayName: string,
    previousYaml?: string,
    requestHistory: string[] = [],
    selectedExecutionSteps?: import("src/workflow/types").ExecutionStep[]
  ): Promise<void> {

    // Create AbortController for cancellation
    const abortController = new AbortController();
    let generationCancelled = false;

    // Planning runs on first creation only (not on user-requested revisions
    // or modifications to existing workflows); review always runs.
    const shouldPlan = requestHistory.length === 0 && !this.existingYaml;

    // Open the generation modal
    const generationModal = new WorkflowGenerationModal(
      this.app,
      currentRequest,
      abortController,
      () => { generationCancelled = true; },
      selectedExecutionSteps?.length ?? 0,
      modelDisplayName,
      shouldPlan
    );
    generationModal.open();

    const traceId = tracing.traceStart("workflow-generation", {
      input: currentRequest,
      metadata: {
        model: selectedModel,
        isModify: !!this.existingYaml,
        pluginVersion: this.plugin.manifest.version,
      },
    });

    try {
      const isSkill = this.isSkill();

      // API model with streaming thinking support
      const client = new GeminiClient(
        this.plugin.settings.googleApiKey,
        selectedModel
      );

      const isCancelled = () => generationCancelled || abortController.signal.aborted;

      let totalUsage: StreamChunkUsage | undefined;
      const apiStartTime = Date.now();

      // === PHASE 1: PLANNING ===
      let plan: string | undefined;
      if (shouldPlan) {
        let planRequest = currentRequest;
        // Planning loop: generate plan → confirm → optionally re-plan
        while (true) {
          generationModal.setPhase("planning");
          const planResult = await this.runPlanningPhase(
            client, planRequest, workflowName, isSkill,
            generationModal, traceId, isCancelled
          );
          plan = planResult.plan;
          totalUsage = mergeUsage(totalUsage, planResult.usage);
          if (isCancelled()) {
            generationModal.close();
            tracing.traceEnd(traceId, { metadata: { status: "cancelled" } });
            this.resolvePromise(null);
            return;
          }

          // Ask user to confirm the plan
          const confirm = await generationModal.showPlanConfirmation();
          if (confirm.action === "cancel") {
            generationModal.close();
            tracing.traceEnd(traceId, { metadata: { status: "cancelled" } });
            this.resolvePromise(null);
            return;
          }
          if (confirm.action === "ok") {
            break;
          }
          // Re-plan: append feedback and loop
          planRequest = `${currentRequest}\n\nFeedback on previous plan:\n${confirm.feedback}`;
          generationModal.resetForReplan();
        }
      }

      // === PHASE 2: GENERATION ===
      generationModal.appendThinkingSeparator(t("workflow.generation.phaseGenerate"));
      generationModal.setPhase("generating");

      const systemPrompt = this.buildSystemPrompt(false, isSkill);
      const userPrompt = this.buildUserPrompt(
        currentRequest, workflowName, previousYaml, requestHistory,
        selectedExecutionSteps, isSkill, plan
      );

      let response = "";

      for await (const chunk of client.generateWorkflowStream(
        [{
          role: "user",
          content: userPrompt,
          timestamp: Date.now(),
          attachments: this.pendingAttachments.length > 0 ? this.pendingAttachments : undefined,
        }],
        systemPrompt,
        traceId
      )) {
        if (isCancelled()) break;

        if (chunk.type === "thinking" && chunk.content) {
          generationModal.appendThinking(chunk.content);
        } else if (chunk.type === "text" && chunk.content) {
          response += chunk.content;
        } else if (chunk.type === "done") {
          totalUsage = mergeUsage(totalUsage, chunk.usage);
        } else if (chunk.type === "error") {
          throw new Error(chunk.error || "Unknown error");
        }
      }

      if (isCancelled()) {
        generationModal.close();
        tracing.traceEnd(traceId, { metadata: { status: "cancelled" } });
        this.resolvePromise(null);
        return;
      }

      // Parse the response — if the LLM emitted slightly-broken YAML, re-prompt
      // it up to 2 times with the specific parse error so it can self-correct.
      let parsed = parseWorkflowResponseWithError(response);
      let result = parsed.result;

      const maxRepairAttempts = 2;
      for (let attempt = 1; !result && attempt <= maxRepairAttempts; attempt++) {
        if (isCancelled()) break;
        const parseError = parsed.error ?? "unknown parse error";
        console.warn(`[gemini-helper] Parse failed (attempt ${attempt}/${maxRepairAttempts}): ${parseError}`);
        generationModal.appendThinkingSeparator(
          `${t("workflow.generation.phaseGenerate")} (auto-repair ${attempt}/${maxRepairAttempts})`
        );
        generationModal.setStatus(t("workflow.generation.reviewRefining"));

        const repairPrompt = `Your previous output could not be parsed into a valid workflow.

PARSE ERROR:
${parseError}

YOUR PREVIOUS OUTPUT:
${response}

Fix the problem and output ONLY the complete, valid YAML workflow starting with "name:". Do not include any prose, explanation, or commentary — just the YAML.`;

        let repaired = "";
        for await (const chunk of client.generateWorkflowStream(
          [{ role: "user", content: repairPrompt, timestamp: Date.now() }],
          systemPrompt,
          traceId
        )) {
          if (isCancelled()) break;
          if (chunk.type === "thinking" && chunk.content) {
            generationModal.appendThinking(chunk.content);
          } else if (chunk.type === "text" && chunk.content) {
            repaired += chunk.content;
          } else if (chunk.type === "done") {
            totalUsage = mergeUsage(totalUsage, chunk.usage);
          } else if (chunk.type === "error") {
            throw new Error(chunk.error || "Unknown error");
          }
        }

        if (isCancelled()) {
          generationModal.close();
          tracing.traceEnd(traceId, { metadata: { status: "cancelled" } });
          this.resolvePromise(null);
          return;
        }
        // Only replace the prior response if repair actually produced text —
        // otherwise an empty/thinking-only repair would wipe the original
        // output, degrading subsequent repair prompts and the parse-failure
        // panel.
        if (repaired.trim()) {
          response = repaired;
        }
        parsed = parseWorkflowResponseWithError(response);
        result = parsed.result;
      }

      if (!result) {
        console.error("[gemini-helper] Generation failed after auto-repair. Last error:", parsed.error);
        generationModal.showParseFailure(response, parsed.error);
        new Notice(t("workflow.generation.parseFailed"));
        this.resolvePromise(null);
        return;
      }

      // === PHASE 3: REVIEW (user-driven refine/accept loop) ===
      // Each iteration: run review → show OK/Refine/Cancel → if Refine, run
      // refinement → loop back to re-review. This way the user always sees a
      // review that matches the YAML they're about to accept.
      const workflowSpec = this.getWorkflowSpec();
      let critiqueResult: ReviewResult | undefined;
      let reviewIteration = 0;
      while (true) {
        if (reviewIteration === 0) {
          generationModal.appendThinkingSeparator(t("workflow.generation.phaseReview"));
          generationModal.setPhase("reviewing");
        } else {
          // Re-review after refinement — clear the previous review content and
          // restore loading UI before running again.
          generationModal.resetReviewForIteration();
          generationModal.appendThinkingSeparator(t("workflow.generation.phaseReview"));
        }
        reviewIteration++;

        const reviewResult = await this.runReviewPhase(
          client, currentRequest, plan || "", result.yaml, isSkill,
          workflowSpec, generationModal, traceId, isCancelled
        );
        critiqueResult = reviewResult.review;
        totalUsage = mergeUsage(totalUsage, reviewResult.usage);

        if (critiqueResult) {
          generationModal.renderReviewAsMarkdown(formatReviewAsMarkdown(critiqueResult));
        }

        if (isCancelled()) {
          generationModal.close();
          tracing.traceEnd(traceId, { metadata: { status: "cancelled" } });
          this.resolvePromise(null);
          return;
        }

        // No issues at all — skip the confirmation UI and proceed automatically.
        if (critiqueResult && critiqueResult.issues.length === 0) {
          generationModal.setStatus(t("workflow.generation.reviewApproved"));
          break;
        }

        // Issues present (or review couldn't be parsed) — let the user decide:
        // accept / refine / cancel. Inner loop so that if the user tries to
        // accept but then cancels the "are you sure?" confirm dialog, we re-show
        // the review confirmation without re-running the (expensive) review phase.
        let reviewAction: "ok" | "refine" | "cancel" | null = null;
        while (reviewAction === null) {
          const reviewConfirm = await generationModal.showReviewConfirmation();
          if (reviewConfirm.action === "cancel" || reviewConfirm.action === "refine") {
            reviewAction = reviewConfirm.action;
            break;
          }
          // action === "ok": require explicit confirmation when issues were flagged.
          const confirmed = await new ConfirmModal(
            this.app,
            t("workflow.generation.acceptWithIssuesConfirm"),
          ).openAndWait();
          if (confirmed) reviewAction = "ok";
          // else: loop — re-show the review confirmation UI
        }
        if (reviewAction === "cancel") {
          generationModal.close();
          tracing.traceEnd(traceId, { metadata: { status: "cancelled" } });
          this.resolvePromise(null);
          return;
        }
        if (reviewAction === "ok") break;

        // Refine: run another generation pass using the review issues as
        // feedback, then loop back to re-review the refined result.
        if (!critiqueResult) {
          // No critique to drive refinement — just break to avoid an infinite loop.
          break;
        }
        generationModal.beginRefining(t("workflow.generation.reviewRefining"));
        generationModal.appendThinkingSeparator(t("workflow.generation.reviewRefining"));
        const refinement = await this.runRefinementPass(
          client, currentRequest, plan || "", result.yaml, result.explanation,
          critiqueResult, systemPrompt, isSkill, generationModal, traceId, isCancelled
        );
        totalUsage = mergeUsage(totalUsage, refinement.usage);

        if (isCancelled()) {
          generationModal.close();
          tracing.traceEnd(traceId, { metadata: { status: "cancelled" } });
          this.resolvePromise(null);
          return;
        }

        if (refinement.response) {
          const refinedResult = this.parseResponse(refinement.response);
          if (refinedResult) result = refinedResult;
        }
        // Continue loop → next iteration re-reviews the refined result.
      }

      // The latest review always reflects the YAML the user accepted.
      const reviewDisplay = critiqueResult
        ? formatReviewAsMarkdown(critiqueResult)
        : generationModal.getReviewText() || undefined;

      const generationContext: GenerationContext = {
        plan: plan || undefined,
        thinking: generationModal.getThinkingText() || undefined,
        review: reviewDisplay || undefined,
      };

      const apiElapsedMs = Date.now() - apiStartTime;
      generationModal.setComplete();
      generationModal.close();

      // Show usage as Notice
      const apiNotice = WorkflowGenerationModal.formatUsageNotice(totalUsage, apiElapsedMs);
      if (apiNotice) {
        new Notice(apiNotice);
      }

      // Save the selected model for next time
      this.plugin.settings.lastAIWorkflowModel = selectedModel;
      void this.plugin.saveSettings();

      // Add metadata to result - only store current request as description
      result.description = currentRequest;
      result.mode = this.mode;
      result.resolvedMentions = resolvedMentions.length > 0 ? resolvedMentions : undefined;
      if (this.isSkill()) {
        result.createAsSkill = true;
        // Extract skill instructions from explanation (text before YAML, strip trailing ---)
        if (result.explanation) {
          result.skillInstructions = result.explanation.replace(/\n---\s*$/, "").trim();
        }
      }

      // Override name with user input for create mode
      if (this.mode === "create") {
        result.name = workflowName;
        if (outputPathTemplate) {
          result.outputPath = outputPathTemplate.replace(/\{\{name\}\}/g, workflowName);
        }
      }

      // For modify mode with confirmation enabled, use the diff view
      const needsDiffConfirmation =
        this.mode === "modify" &&
        this.confirmCheckbox?.checked &&
        this.existingYaml;

      if (needsDiffConfirmation) {
        const confirmResult = await showWorkflowConfirmation(
          this.app,
          this.existingYaml!,
          result.yaml,
          result.explanation,
          currentRequest,
          generationContext,
          this.isSkill(),
          this.isSkill() ? this.existingInstructions : undefined,
          this.isSkill() ? result.skillInstructions : undefined,
        );

        if (confirmResult.result === "ok") {
          tracing.traceEnd(traceId, { output: result.yaml });
          tracing.score(traceId, { name: "status", value: 1, comment: "approved" });
          this.resolvePromise(result);
        } else if (confirmResult.result === "no") {
          tracing.traceEnd(traceId, { output: result.yaml, metadata: { status: "revision-requested" } });
          tracing.score(traceId, { name: "status", value: 0.5, comment: "revision requested" });
          const updatedHistory = [...requestHistory, currentRequest];
          await this.runGenerationLoop(
            confirmResult.additionalRequest || "",
            workflowName, outputPathTemplate, selectedModel, resolvedMentions,
            workflowPath, modelDisplayName, result.yaml, updatedHistory,
            selectedExecutionSteps
          );
        } else {
          tracing.traceEnd(traceId, { metadata: { status: "cancelled" } });
          tracing.score(traceId, { name: "status", value: 0.5, comment: "cancelled by user" });
          this.resolvePromise(null);
        }
        return;
      }

      // Show preview modal for create mode and modify mode without diff confirmation
      const previewResult = await showWorkflowPreview(
        this.app,
        result.yaml,
        result.nodes,
        result.name,
        currentRequest,
        generationContext
      );

      if (previewResult.result === "ok") {
        tracing.traceEnd(traceId, { output: result.yaml });
        tracing.score(traceId, { name: "status", value: 1, comment: "approved" });
        this.resolvePromise(result);
      } else if (previewResult.result === "no") {
        tracing.traceEnd(traceId, { output: result.yaml, metadata: { status: "revision-requested" } });
        tracing.score(traceId, { name: "status", value: 0.5, comment: "revision requested" });
        const updatedHistory = [...requestHistory, currentRequest];
        await this.runGenerationLoop(
          previewResult.additionalRequest || "",
          workflowName, outputPathTemplate, selectedModel, resolvedMentions,
          workflowPath, modelDisplayName, result.yaml, updatedHistory,
          selectedExecutionSteps
        );
      } else {
        tracing.traceEnd(traceId, { metadata: { status: "cancelled" } });
        tracing.score(traceId, { name: "status", value: 0.5, comment: "cancelled by user" });
        this.resolvePromise(null);
      }
    } catch (error) {
      generationModal.close();
      const message = formatError(error);
      tracing.traceEnd(traceId, { metadata: { status: "error", error: message } });
      tracing.score(traceId, { name: "status", value: 0, comment: message });
      new Notice(`Error: ${message}`);
      this.resolvePromise(null);
    }
  }

  /**
   * Phase 1: Planning - produce a structured plan before generation.
   * Returns the plan text, or undefined if planning fails (non-fatal).
   */
  private async runPlanningPhase(
    client: GeminiClient,
    currentRequest: string,
    workflowName: string,
    isSkill: boolean,
    generationModal: WorkflowGenerationModal,
    traceId: string | null,
    isCancelled: () => boolean
  ): Promise<{ plan?: string; usage?: StreamChunkUsage }> {
    const localeNames: Record<string, string> = {
      en: "English", ja: "Japanese (日本語)", es: "Spanish (Español)",
      fr: "French (Français)", zh: "Chinese (中文)", ko: "Korean (한국어)",
      pt: "Portuguese (Português)", it: "Italian (Italiano)", de: "German (Deutsch)",
    };
    const locale = getLocale();
    const languageName = localeNames[locale] || "English";

    const skillGuidance = isSkill
      ? `

For skills (reusable tools the AI assistant can trigger), also cover:
- When this skill should activate (what the user might say or ask)
- What input the user provides
- What the skill produces as output`
      : "";

    const planSystemPrompt = `You help users plan what their Obsidian automation should do. Write the plan so anyone can understand it — NOT just engineers.

Describe the plan in plain language covering:
1. **What it does** — The goal in one or two sentences
2. **Steps** — What happens, in order, as numbered bullet points (e.g., "Ask the user for a topic", "Search the vault for related notes", "Show the results")
3. **Inputs** — What information is needed from the user or environment
4. **Outputs** — What the user gets when it finishes
5. **Things to watch out for** — Potential issues in plain language (e.g., "What if no notes are found?")
${skillGuidance}

IMPORTANT RULES:
- Write the ENTIRE plan in ${languageName}.
- Avoid technical jargon. Do NOT mention node types, YAML, variable names, or implementation details.
- Use simple sentences a non-engineer could follow.
- Keep it concise — roughly 10–20 short bullet points total.
- Do NOT generate any code or YAML.`;

    const entityType = isSkill ? "skill" : "workflow";
    const existingContext = this.existingYaml
      ? `\n\nEXISTING WORKFLOW TO MODIFY:\n${this.existingYaml}`
      : "";
    const planUserPrompt = `Plan a ${entityType} named "${workflowName}" that does the following:

${currentRequest}${existingContext}`;

    try {
      let plan = "";
      let usage: StreamChunkUsage | undefined;
      for await (const chunk of client.generateWorkflowStream(
        [{ role: "user", content: planUserPrompt, timestamp: Date.now() }],
        planSystemPrompt,
        traceId
      )) {
        if (isCancelled()) return {};

        if (chunk.type === "thinking" && chunk.content) {
          generationModal.appendThinking(chunk.content);
        } else if (chunk.type === "text" && chunk.content) {
          plan += chunk.content;
          generationModal.appendPlan(chunk.content);
        } else if (chunk.type === "done") {
          usage = chunk.usage;
        } else if (chunk.type === "error") {
          console.warn("Planning phase error:", chunk.error);
          return {}; // Non-fatal: proceed without plan
        }
      }
      return { plan: plan || undefined, usage };
    } catch (error) {
      console.warn("Planning phase failed, proceeding without plan:", formatError(error));
      return {};
    }
  }

  /**
   * Phase 3: Review - critique the generated workflow and return structured feedback.
   */
  private async runReviewPhase(
    client: GeminiClient,
    currentRequest: string,
    plan: string,
    generatedYaml: string,
    isSkill: boolean,
    workflowSpec: string,
    generationModal: WorkflowGenerationModal,
    traceId: string | null,
    isCancelled: () => boolean
  ): Promise<{ review?: ReviewResult; usage?: StreamChunkUsage }> {

    const localeNames: Record<string, string> = {
      en: "English", ja: "Japanese (日本語)", es: "Spanish (Español)",
      fr: "French (Français)", zh: "Chinese (中文)", ko: "Korean (한국어)",
      pt: "Portuguese (Português)", it: "Italian (Italiano)", de: "German (Deutsch)",
    };
    const locale = getLocale();
    const languageName = localeNames[locale] || "English";

    const skillReviewChecks = isSkill
      ? `
5. **Skill instructions quality**: Are instructions written in imperative form? Do they explain WHY behind each guideline (not just rigid rules)? Are they concise (under 500 lines)?
6. **Skill description**: Does the description specify both what the skill does AND when to use it? Is it specific enough to trigger reliably?
7. **Input/output design**: Does the workflow have clear input variables for the AI to provide? Are outputs meaningful for continuing the conversation?`
      : "";

    const reviewSystemPrompt = `You are a workflow quality reviewer for Obsidian. Evaluate the generated workflow YAML against the original request and plan.

Check for:
1. **Completeness**: Does the workflow fulfill all aspects of the request?
2. **Correctness**: Are node types valid? Are connections (next, trueNext, falseNext) properly set? Are variables initialized before use? NOTE: The \`value\` field on a variable node is OPTIONAL — omitting it defaults to "" for new variables and preserves the existing value for variables already set (input declaration). Do NOT flag missing \`value\` as an issue; only flag real problems (wrong type, broken references, undefined variables being read, etc.).
   IMPORTANT: Do NOT flag "workflow does not output variable X to chat" as an issue. When a skill workflow runs, ALL variables whose name does not start with \`_\` are automatically returned to the chat AI, which presents them to the user as guided by the SKILL.md instructions. A final \`command\` node just to "display" a value is UNNECESSARY — a \`command\` node runs an LLM call inside the workflow and saves to a variable; it does not write directly to the chat. If the concern is that the user should see a specific variable, the fix belongs in the SKILL.md instructions body (e.g., "output \`ogpMarkdown\` verbatim"), not in the workflow YAML.
3. **Data flow**: Do saveTo variables match where they're referenced? Are there dangling references?
4. **Best practices**: Descriptive node IDs? Comments on complex nodes? Proper error handling?
5. **Variable interpolation in script nodes**: \`{{var:json}}\` does NOT add quotes — it only escapes content. Flag any occurrence where \`{{var:json}}\` appears without surrounding quotes in a JavaScript string context (e.g., \`var x = {{var:json}}\`, \`JSON.parse({{var:json}})\`). The correct form is \`"{{var:json}}"\` when the value should be a string literal.
6. **json node source**: The \`source\` field must be a bare variable name (no \`{{...}}\`, no surrounding quotes, no wrapping like \`"[{{var}}]"\`). Flag any \`source\` that uses interpolation or wrapping.${skillReviewChecks}

WORKFLOW SPECIFICATION (for reference):
${workflowSpec}

Output your review as JSON (no markdown code fences):
{
  "verdict": "pass" or "fail",
  "summary": "Brief overall assessment",
  "issues": [
    {
      "severity": "high" or "medium" or "low",
      "description": "Description of the issue"
    }
  ]
}

IMPORTANT:
- Write the "summary" and every issue "description" in ${languageName}.
- Use plain, non-technical language a non-engineer can understand (avoid jargon like node types, YAML field names, or variable references unless absolutely necessary).
- The JSON keys themselves ("verdict", "summary", "issues", "severity", "description") must remain in English.
- "high" severity: The workflow will fail or produce wrong results (missing variables, invalid node types, broken connections).
- "medium"/"low" severity: Quality improvements, not critical.
- Set verdict to "fail" only if there are "high" severity issues.
- If the workflow looks correct, return verdict "pass" with an empty issues array.`;

    const entityType = isSkill ? "skill" : "workflow";
    const planSection = plan ? `\nPLAN:\n${plan}\n` : "";
    const reviewUserPrompt = `Review this generated ${entityType}:

ORIGINAL REQUEST:
${currentRequest}
${planSection}
GENERATED YAML:
${generatedYaml}`;

    try {
      let reviewText = "";
      let usage: StreamChunkUsage | undefined;
      for await (const chunk of client.generateWorkflowStream(
        [{ role: "user", content: reviewUserPrompt, timestamp: Date.now() }],
        reviewSystemPrompt,
        traceId
      )) {
        if (isCancelled()) return {};

        if (chunk.type === "thinking" && chunk.content) {
          generationModal.appendThinking(chunk.content);
        } else if (chunk.type === "text" && chunk.content) {
          reviewText += chunk.content;
          generationModal.appendReview(chunk.content);
        } else if (chunk.type === "done") {
          usage = chunk.usage;
        } else if (chunk.type === "error") {
          console.warn("Review phase error:", chunk.error);
          return {};
        }
      }
      return { review: parseReviewResponse(reviewText), usage };
    } catch (error) {
      console.warn("Review phase failed, proceeding without review:", formatError(error));
      return {};
    }
  }

  /**
   * Auto-refinement pass: regenerate the workflow using review feedback.
   * Returns the raw response text, or undefined if refinement fails.
   */
  private async runRefinementPass(
    client: GeminiClient,
    currentRequest: string,
    plan: string,
    previousYaml: string,
    previousExplanation: string | undefined,
    review: ReviewResult,
    systemPrompt: string,
    isSkill: boolean,
    generationModal: WorkflowGenerationModal,
    traceId: string | null,
    isCancelled: () => boolean
  ): Promise<{ response?: string; usage?: StreamChunkUsage }> {
    const issuesText = review.issues
      .map(i => `- [${i.severity}] ${i.description}`)
      .join("\n");

    const planSection = plan ? `\nPLAN:\n${plan}\n` : "";

    let generatedOutput: string;
    let outputInstruction: string;
    if (isSkill && previousExplanation) {
      generatedOutput = `GENERATED SKILL.md INSTRUCTIONS:\n${previousExplanation}\n\nGENERATED YAML:\n${previousYaml}`;
      outputInstruction = `Fix all high-severity issues. Output the corrected SKILL.md instructions body first, then a line containing only "---", then the corrected complete YAML starting with "name:".`;
    } else {
      generatedOutput = `GENERATED YAML:\n${previousYaml}`;
      outputInstruction = `Fix all high-severity issues and output the corrected complete YAML, starting with "name:".`;
    }

    // When the reviewer produced unparseable JSON, include the full raw text
    // so the refinement model gets all the context rather than a truncated summary.
    const feedbackSection = review.rawText
      ? `REVIEW FEEDBACK (raw):\n${review.rawText}`
      : `REVIEW FEEDBACK:\n${review.summary}\n${issuesText}`;

    const refinementPrompt = `The following ${isSkill ? "skill" : "workflow"} was generated but the reviewer found issues that must be fixed:

ORIGINAL REQUEST:
${currentRequest}
${planSection}
${generatedOutput}

${feedbackSection}

${outputInstruction}`;

    try {
      let response = "";
      let usage: StreamChunkUsage | undefined;
      for await (const chunk of client.generateWorkflowStream(
        [{ role: "user", content: refinementPrompt, timestamp: Date.now() }],
        systemPrompt,
        traceId
      )) {
        if (isCancelled()) return {};

        if (chunk.type === "thinking" && chunk.content) {
          generationModal.appendThinking(chunk.content);
        } else if (chunk.type === "text" && chunk.content) {
          response += chunk.content;
        } else if (chunk.type === "done") {
          usage = chunk.usage;
        } else if (chunk.type === "error") {
          console.warn("Refinement pass error:", chunk.error);
          return {};
        }
      }
      return { response: response || undefined, usage };
    } catch (error) {
      console.warn("Refinement pass failed, using original generation:", formatError(error));
      return {};
    }
  }

  private getWorkflowSpec(): string {
    return getWorkflowSpecification(buildWorkflowSpecContext(this.plugin));
  }

  private buildSystemPrompt(outputAsMarkdown = false, isSkill = false): string {
    const workflowSpec = this.getWorkflowSpec();

    const skillSpec = isSkill
      ? `

## Agent Skill Output Format

When creating a skill, generate TWO components:

### 1. SKILL.md Instructions
The body text that guides the AI assistant when this skill is activated in chat.

**Writing principles:**
- Use imperative form for instructions
- Explain the WHY behind each instruction rather than heavy-handed MUSTs — the AI is smart and responds better to understanding purpose than rigid rules
- Keep instructions concise (aim for under 500 lines)
- Include concrete examples with Input/Output format where helpful
- Define output formats explicitly when the skill produces structured results

**What to include:**
- Role description with clear persona (e.g., "You are a code review assistant specializing in...")
- Step-by-step behavioral guidelines explaining the reasoning behind each step
- When and how to invoke the workflow — reference each input variable by its **exact name** (as used in the workflow's \`{{var}}\` references) so the runtime's auto-derived \`inputVariables\` list matches what the body documents
- Edge cases and how to handle them

Example:
\`\`\`
You are a code review assistant. When reviewing code:

1. Check for common bugs and anti-patterns — these are the most impactful issues to catch early
2. Suggest improvements for readability, because code is read far more often than written
3. Verify error handling is adequate for production use
4. Use the workflow to run automated checks, passing the file path as the \`target\` variable

When the user shares code without explicit review requests, still offer brief observations about potential issues. This proactive approach helps catch problems before they grow.
\`\`\`

### 2. Workflow
An executable workflow in YAML format that the skill provides as a tool.
- Any variable you read via \`{{var}}\` without initializing (no preceding \`variable\` / \`set\` node and no \`saveTo\` target) becomes an **input variable**. The runtime extracts these automatically and writes them into SKILL.md's \`skill-capabilities\` fenced YAML block as \`workflows[0].inputVariables\`, so the chat LLM will see them when deciding what to pass to \`run_skill_workflow\`.
- Pick short, descriptive input variable names (e.g. \`filePath\`, \`query\`, \`mode\`). Avoid names starting with \`_\` — those are reserved for runtime-provided system variables.
- Save meaningful results to named variables that the chat LLM can consume after \`run_skill_workflow\` returns.

### SKILL.md layout (written for you)
You do NOT need to emit SKILL.md frontmatter or the capability block. The runtime constructs them from your output:
\`\`\`markdown
---
name: <skill name>
description: <skill description>
---

\`\`\`skill-capabilities
workflows:
  - path: workflows/workflow.md
    description: <skill name>
    inputVariables: [<derived from your workflow YAML>]
\`\`\`

<your SKILL.md instructions body goes here>
\`\`\`
- Frontmatter holds only user-facing metadata (name, description).
- Workflow IDs and their input variables live in the \`skill-capabilities\` fenced YAML block. The runtime fills this in; you just need the workflow YAML's \`{{var}}\` usage to be clean and unambiguous so the derived \`inputVariables\` list is correct.
- Your instructions prose should reference input variables by their exact name (so the LLM knows what to pass when invoking the workflow).
`
      : "";

    let outputRules: string;
    if (isSkill && outputAsMarkdown) {
      outputRules = `1. Output a Markdown document with two parts:
   a. SKILL.md instructions body (detailed AI behavioral guidelines) as plain text
   b. The workflow inside a \`\`\`workflow code block
2. The text before the \`\`\`workflow code block will be used as the SKILL.md instructions body
3. The YAML inside the code block must be valid and parseable
4. Include a descriptive "name" field
5. Use unique, descriptive node IDs (e.g., "read-input", "process-data", "save-result")
6. Ensure all variables are initialized before use
7. Use proper control flow (next, trueNext, falseNext)
8. Use the "comment" property on nodes to describe each step's purpose`;
    } else if (isSkill) {
      outputRules = `1. First, output the SKILL.md instructions body (detailed AI behavioral guidelines)
2. Then output a line containing only "---"
3. Then output the workflow YAML starting with "name:"
4. The YAML must be valid and parseable
5. Include a descriptive "name" field
6. Use unique, descriptive node IDs (e.g., "read-input", "process-data", "save-result")
7. Ensure all variables are initialized before use
8. Use proper control flow (next, trueNext, falseNext)`;
    } else if (outputAsMarkdown) {
      outputRules = `1. Output a Markdown document containing the workflow inside a \`\`\`workflow code block
2. The YAML inside the code block must be valid and parseable
3. Include a descriptive "name" field
4. Use unique, descriptive node IDs (e.g., "read-input", "process-data", "save-result")
5. Ensure all variables are initialized before use
6. Use proper control flow (next, trueNext, falseNext)
7. Include a processing overview and description BEFORE the workflow code block as Markdown text
8. Use the "comment" property on nodes to describe each step's purpose`;
    } else {
      outputRules = `1. Output ONLY the workflow YAML, no explanation or markdown code fences
2. The YAML must be valid and parseable
3. Include a descriptive "name" field
4. Use unique, descriptive node IDs (e.g., "read-input", "process-data", "save-result")
5. Ensure all variables are initialized before use
6. Use proper control flow (next, trueNext, falseNext)
7. Start output directly with "name:" - no code fences, no explanation`;
    }

    const generatorType = isSkill ? "skill" : "workflow";
    return `You are a ${generatorType} generator for Obsidian. You create and modify workflows in YAML format.

${workflowSpec}${skillSpec}

IMPORTANT RULES:
${outputRules}`;
  }

  private buildUserPrompt(
    currentRequest: string,
    workflowName?: string,
    previousYaml?: string,
    requestHistory: string[] = [],
    selectedExecutionSteps?: import("src/workflow/types").ExecutionStep[],
    isSkill = false,
    plan?: string
  ): string {
    // Build plan section if available. The plan is written in plain language
    // (possibly in a non-English language) and describes WHAT the workflow should
    // do from the user's perspective — translate it into concrete workflow nodes.
    const planSection = plan
      ? `\nUSER-APPROVED PLAN (plain-language description of the desired behavior):\n${plan}\n\nTranslate this plan into concrete workflow nodes. The plan describes WHAT the workflow should do; you decide HOW (which nodes, variables, and connections to use).\n`
      : "";

    if (this.mode === "create") {
      const entityType = isSkill ? "skill" : "workflow";

      // If we have previous request/YAML from regeneration, include as reference
      if (requestHistory.length > 0 && previousYaml) {
        // Build numbered history of all requests
        const historySection = requestHistory.map((req, idx) => `${idx + 1}. ${req}`).join("\n");

        // Build execution history section if steps are selected
        let executionSection = "";
        if (selectedExecutionSteps && selectedExecutionSteps.length > 0) {
          executionSection = this.formatExecutionSteps(selectedExecutionSteps);
        }

        const completeOutputInstruction = isSkill
          ? `Output the SKILL.md instructions body and the complete workflow YAML for the skill named "${workflowName}".`
          : `Output only the complete YAML for the workflow, starting with "name: ${workflowName}".`;

        return `Create or modify a ${entityType} based on the following request.

REFERENCE (previous attempts):
${historySection}

Previous output:
${previousYaml}
${executionSection}${planSection}
NEW REQUEST:
${currentRequest}

${completeOutputInstruction}`;
      }

      const outputInstruction = isSkill
        ? `Output the SKILL.md instructions body and the workflow YAML for the skill named "${workflowName}".`
        : `Output only the YAML for the workflow, starting with "name: ${workflowName}".`;

      return `Create a new ${entityType} named "${workflowName}" that does the following:

${currentRequest}
${planSection}
${outputInstruction}`;
    } else {
      // Build execution history section if steps are selected
      let executionSection = "";
      if (selectedExecutionSteps && selectedExecutionSteps.length > 0) {
        executionSection = this.formatExecutionSteps(selectedExecutionSteps);
      }

      if (isSkill) {
        const instructionsSection = this.existingInstructions
          ? `\nCURRENT SKILL.md INSTRUCTIONS:\n${this.existingInstructions}\n`
          : "";
        return `Modify the following skill according to these requirements. The skill consists of SKILL.md instructions (persona/behavioral guidelines for the AI) AND an executable workflow YAML.
${instructionsSection}
CURRENT WORKFLOW YAML:
${this.existingYaml}
${executionSection}${planSection}
MODIFICATIONS REQUESTED:
${currentRequest}

Output the modified SKILL.md instructions body first, then a line containing only "---", then the modified complete YAML starting with "name:".`;
      }

      return `Modify the following workflow according to these requirements:

CURRENT WORKFLOW:
${this.existingYaml}
${executionSection}${planSection}
MODIFICATIONS REQUESTED:
${currentRequest}

Output only the complete modified YAML, starting with "name:".`;
    }
  }

  /**
   * Format execution steps for LLM context
   */
  private formatExecutionSteps(steps: import("src/workflow/types").ExecutionStep[]): string {
    if (steps.length === 0) return "";

    const formattedSteps = steps.map((step, idx) => {
      const lines: string[] = [];
      lines.push(`Step ${idx + 1} [${step.nodeType}] ${step.nodeId}:`);

      if (step.input && Object.keys(step.input).length > 0) {
        const inputStr = JSON.stringify(step.input, null, 2)
          .split("\n")
          .map(line => "  " + line)
          .join("\n");
        lines.push(`  Input: ${inputStr}`);
      }

      if (step.status === "error" && step.error) {
        lines.push(`  Error: ${step.error}`);
      } else if (step.output !== undefined) {
        const outputStr = typeof step.output === "string"
          ? step.output.substring(0, 500) + (step.output.length > 500 ? "..." : "")
          : JSON.stringify(step.output, null, 2).substring(0, 500);
        lines.push(`  Output: ${outputStr}`);
      }

      lines.push(`  Status: ${step.status}`);

      return lines.join("\n");
    }).join("\n\n");

    return `
EXECUTION HISTORY (selected steps):
${formattedSteps}

`;
  }

  /**
   * Strip YAML frontmatter from file content
   */
  private stripFrontmatter(content: string): string {
    // Match YAML frontmatter: starts with ---, ends with ---
    const frontmatterRegex = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
    return content.replace(frontmatterRegex, "").trim();
  }

  private async resolveMentions(text: string): Promise<{ resolved: string; mentions: ResolvedMention[] }> {
    let resolved = text;
    const mentions: ResolvedMention[] = [];

    // Find all @ mentions: @{selection}, @{content}, @filepath
    const mentionRegex = /@(\{selection\}|\{content\}|[^\s@]+)/g;
    const matches = [...text.matchAll(mentionRegex)];

    for (const match of matches) {
      const mention = match[1];
      let replacement = match[0]; // Keep original if resolution fails
      let content: string | null = null;

      if (mention === "{selection}") {
        // Get selected text from editor
        const editor = this.app.workspace.activeEditor?.editor;
        if (editor && editor.somethingSelected()) {
          content = editor.getSelection();
          replacement = `[Selected text]\n${content}\n[/Selected text]`;
        }
      } else if (mention === "{content}") {
        // Get content of active note
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          const rawContent = await this.app.vault.read(activeFile);
          content = this.stripFrontmatter(rawContent);
          replacement = `[Content of ${activeFile.path}]\n${content}\n[/Content]`;
        }
      } else {
        // It's a file path - try to read the file
        const file = this.app.vault.getAbstractFileByPath(mention);
        if (file instanceof TFile) {
          try {
            const rawContent = await this.app.vault.read(file);
            content = this.stripFrontmatter(rawContent);
            replacement = `[Content of ${mention}]\n${content}\n[/Content]`;
          } catch {
            // Keep original mention if file can't be read
          }
        }
      }

      if (content !== null) {
        mentions.push({ original: match[0], content });
      }

      resolved = resolved.replace(match[0], replacement);
    }

    return { resolved, mentions };
  }

  private parseResponse(response: string): AIWorkflowResult | null {
    return parseWorkflowResponse(response);
  }

  private setupDrag(header: HTMLElement, modalEl: HTMLElement): void {
    const onMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName === "BUTTON") return;

      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;

      const rect = modalEl.getBoundingClientRect();
      this.modalStartX = rect.left;
      this.modalStartY = rect.top;

      modalEl.setCssStyles({
        position: "fixed",
        margin: "0",
        transform: "none",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
      });

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging) return;

      const deltaX = e.clientX - this.dragStartX;
      const deltaY = e.clientY - this.dragStartY;

      modalEl.setCssStyles({
        left: `${this.modalStartX + deltaX}px`,
        top: `${this.modalStartY + deltaY}px`,
      });
    };

    const onMouseUp = () => {
      this.isDragging = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    header.addEventListener("mousedown", onMouseDown);
  }

  private addResizeHandles(modalEl: HTMLElement): void {
    const directions = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];
    for (const dir of directions) {
      const handle = document.createElement("div");
      handle.className = `gemini-helper-resize-handle gemini-helper-resize-${dir}`;
      handle.dataset.direction = dir;
      modalEl.appendChild(handle);
      this.setupResize(handle, modalEl, dir);
    }
  }

  private setupResize(handle: HTMLElement, modalEl: HTMLElement, direction: string): void {
    const onMouseDown = (e: MouseEvent) => {
      this.isResizing = true;
      this.resizeDirection = direction;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;

      const rect = modalEl.getBoundingClientRect();
      this.resizeStartWidth = rect.width;
      this.resizeStartHeight = rect.height;
      this.modalStartX = rect.left;
      this.modalStartY = rect.top;

      modalEl.setCssStyles({
        position: "fixed",
        margin: "0",
        transform: "none",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
      e.stopPropagation();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isResizing) return;

      const deltaX = e.clientX - this.dragStartX;
      const deltaY = e.clientY - this.dragStartY;
      const dir = this.resizeDirection;

      let newWidth = this.resizeStartWidth;
      let newHeight = this.resizeStartHeight;
      let newLeft = this.modalStartX;
      let newTop = this.modalStartY;

      if (dir.includes("e")) {
        newWidth = Math.max(400, this.resizeStartWidth + deltaX);
      }
      if (dir.includes("w")) {
        newWidth = Math.max(400, this.resizeStartWidth - deltaX);
        newLeft = this.modalStartX + (this.resizeStartWidth - newWidth);
      }
      if (dir.includes("s")) {
        newHeight = Math.max(300, this.resizeStartHeight + deltaY);
      }
      if (dir.includes("n")) {
        newHeight = Math.max(300, this.resizeStartHeight - deltaY);
        newTop = this.modalStartY + (this.resizeStartHeight - newHeight);
      }

      modalEl.setCssStyles({
        width: `${newWidth}px`,
        height: `${newHeight}px`,
        left: `${newLeft}px`,
        top: `${newTop}px`,
      });
    };

    const onMouseUp = () => {
      this.isResizing = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    handle.addEventListener("mousedown", onMouseDown);
  }

  // File attachment methods
  private getAllAcceptedTypes(): string {
    return [...SUPPORTED_TYPES.image, ...SUPPORTED_TYPES.pdf, ...SUPPORTED_TYPES.text, ".md", ".txt"].join(",");
  }

  private async handleFileSelect(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const attachment = await this.processFile(file);
      if (attachment) {
        this.pendingAttachments.push(attachment);
        this.renderAttachments();
      }
    }
    input.value = "";
  }

  private async processFile(file: File): Promise<Attachment | null> {
    const mimeType = file.type;

    // Images
    if (SUPPORTED_TYPES.image.includes(mimeType)) {
      const data = await this.fileToBase64(file);
      return { name: file.name, type: "image", mimeType, data };
    }

    // PDF
    if (SUPPORTED_TYPES.pdf.includes(mimeType)) {
      const data = await this.fileToBase64(file);
      return { name: file.name, type: "pdf", mimeType, data };
    }

    // Text
    if (SUPPORTED_TYPES.text.includes(mimeType) || file.name.endsWith(".md") || file.name.endsWith(".txt")) {
      const data = await this.fileToBase64(file);
      return { name: file.name, type: "text", mimeType: mimeType || "text/plain", data };
    }

    return null;
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private renderAttachments(): void {
    if (!this.attachmentsContainerEl) return;
    this.attachmentsContainerEl.empty();

    this.pendingAttachments.forEach((attachment, index) => {
      const attachmentEl = this.attachmentsContainerEl!.createSpan({
        cls: "ai-workflow-attachment",
      });

      // Icon based on type
      const icon = attachment.type === "image" ? "🖼️" : attachment.type === "pdf" ? "📄" : "📃";
      attachmentEl.createSpan({ text: `${icon} ${attachment.name}` });

      // Remove button
      const removeBtn = attachmentEl.createSpan({
        cls: "ai-workflow-attachment-remove",
        text: "×",
      });
      removeBtn.addEventListener("click", () => {
        this.pendingAttachments.splice(index, 1);
        this.renderAttachments();
      });
    });
  }

  private setupMentionAutocomplete(): void {
    if (!this.descriptionEl || !this.mentionAutocompleteEl) return;

    const textarea = this.descriptionEl;
    const autocomplete = this.mentionAutocompleteEl;

    // Input handler for @ detection
    textarea.addEventListener("input", () => {
      const value = textarea.value;
      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = value.substring(0, cursorPos);
      const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);

      if (atMatch) {
        const query = atMatch[1];
        this.mentionStartPos = cursorPos - atMatch[0].length;
        this.mentionItems = this.buildMentionCandidates(query);
        this.mentionIndex = 0;

        if (this.mentionItems.length > 0) {
          this.showingMentionAutocomplete = true;
          this.renderMentionAutocomplete();
          this.positionAutocomplete(textarea, autocomplete);
          autocomplete.removeClass("is-hidden");
        } else {
          this.hideMentionAutocomplete();
        }
      } else {
        this.hideMentionAutocomplete();
      }
    });

    // Keyboard handler
    textarea.addEventListener("keydown", (e) => {
      if (!this.showingMentionAutocomplete) return;

      if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault();
        this.mentionIndex = Math.min(this.mentionIndex + 1, this.mentionItems.length - 1);
        this.renderMentionAutocomplete();
        return;
      }
      if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
        e.preventDefault();
        this.mentionIndex = Math.max(this.mentionIndex - 1, 0);
        this.renderMentionAutocomplete();
        return;
      }
      if (e.key === "Enter" && this.mentionItems.length > 0) {
        e.preventDefault();
        this.selectMention(this.mentionItems[this.mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        this.hideMentionAutocomplete();
        return;
      }
    });

    // Click outside to close (store handler for cleanup)
    this.clickOutsideHandler = (e: MouseEvent) => {
      if (this.showingMentionAutocomplete &&
          !autocomplete.contains(e.target as Node) &&
          e.target !== textarea) {
        this.hideMentionAutocomplete();
      }
    };
    document.addEventListener("click", this.clickOutsideHandler);
  }

  private buildMentionCandidates(query: string): MentionItem[] {
    const hasActiveNote = !!this.app.workspace.getActiveFile();
    const editor = this.app.workspace.activeEditor?.editor;
    const hasSelection = editor ? editor.somethingSelected() : false;

    const variables: MentionItem[] = [
      ...(hasSelection ? [{ value: "{selection}", description: "Selected text in editor" }] : []),
      ...(hasActiveNote ? [{ value: "{content}", description: "Content of active note" }] : []),
    ];

    // Get vault files
    const files = this.app.vault.getMarkdownFiles().map((f) => ({
      value: f.path,
      description: "Vault file",
    }));

    const all = [...variables, ...files];
    if (!query) return all.slice(0, 10);

    const lowerQuery = query.toLowerCase();
    return all.filter((item) => item.value.toLowerCase().includes(lowerQuery)).slice(0, 10);
  }

  private renderMentionAutocomplete(): void {
    if (!this.mentionAutocompleteEl) return;

    this.mentionAutocompleteEl.empty();
    this.mentionItems.forEach((item, index) => {
      const itemEl = this.mentionAutocompleteEl!.createDiv({
        cls: `gemini-helper-autocomplete-item ${index === this.mentionIndex ? "active" : ""}`,
      });
      itemEl.createSpan({
        cls: "gemini-helper-autocomplete-name",
        text: item.value,
      });
      itemEl.createSpan({
        cls: "gemini-helper-autocomplete-desc",
        text: item.description,
      });

      itemEl.addEventListener("click", () => this.selectMention(item));
      itemEl.addEventListener("mouseenter", () => {
        this.mentionIndex = index;
        this.renderMentionAutocomplete();
      });
    });
  }

  private selectMention(mention: MentionItem): void {
    if (!this.descriptionEl) return;

    const textarea = this.descriptionEl;
    const cursorPos = textarea.selectionStart;
    const before = textarea.value.substring(0, this.mentionStartPos);
    const after = textarea.value.substring(cursorPos);
    // Keep @ prefix for later processing (file content embedding)
    const newValue = before + "@" + mention.value + " " + after;

    textarea.value = newValue;
    this.hideMentionAutocomplete();

    // Set cursor position after inserted mention (includes @)
    const newPos = this.mentionStartPos + 1 + mention.value.length + 1;
    textarea.setSelectionRange(newPos, newPos);
    textarea.focus();
  }

  private hideMentionAutocomplete(): void {
    this.showingMentionAutocomplete = false;
    if (this.mentionAutocompleteEl) {
      this.mentionAutocompleteEl.addClass("is-hidden");
    }
  }

  private positionAutocomplete(textarea: HTMLTextAreaElement, autocomplete: HTMLElement): void {
    const rect = textarea.getBoundingClientRect();

    // Position above the textarea using fixed positioning
    autocomplete.setCssStyles({
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      bottom: `${window.innerHeight - rect.top + 4}px`,
      top: "auto",
    });
  }

  onClose(): void {
    // Clean up event listener
    if (this.clickOutsideHandler) {
      document.removeEventListener("click", this.clickOutsideHandler);
      this.clickOutsideHandler = null;
    }
    const { contentEl } = this;
    contentEl.empty();
  }
}

// Helper function to open the modal
export function promptForAIWorkflow(
  app: App,
  plugin: GeminiHelperPlugin,
  mode: AIWorkflowMode,
  existingYaml?: string,
  existingName?: string,
  defaultOutputPath?: string,
  options?: { isSkill?: boolean; existingInstructions?: string }
): Promise<AIWorkflowResult | null> {
  return new Promise((resolve) => {
    const modal = new AIWorkflowModal(
      app,
      plugin,
      mode,
      resolve,
      existingYaml,
      existingName,
      defaultOutputPath,
      options
    );
    modal.open();
  });
}

/**
 * Parse a workflow response (from LLM or pasted YAML) into AIWorkflowResult.
 * Handles code-fenced YAML, raw YAML, and mixed text+YAML responses.
 */
export function parseWorkflowResponse(response: string): AIWorkflowResult | null {
  return parseWorkflowResponseWithError(response).result;
}

/**
 * Same as parseWorkflowResponse but also returns a machine-readable error
 * message describing why parsing failed — used to drive auto-repair by
 * re-prompting the LLM with the specific reason.
 */
export function parseWorkflowResponseWithError(
  response: string
): { result: AIWorkflowResult | null; error?: string } {
  try {
    let yaml = "";
    let yamlStartIdx = -1;

    const codeBlockRegex = /```\w*\s*([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(response)) !== null) {
      const content = match[1].trim();
      if (content.includes("name:") && content.includes("nodes:")) {
        yaml = content;
        yamlStartIdx = match.index;
        break;
      }
    }

    if (!yaml) {
      const nameMatch = response.match(/(?:^|\n)(name:\s*\S+[\s\S]*?nodes:\s*[\s\S]*?)(?:\n```|$)/);
      if (nameMatch && nameMatch.index !== undefined) {
        yaml = nameMatch[1].trim();
        yamlStartIdx = nameMatch.index;
      }
    }

    if (!yaml) {
      const startIdx = response.indexOf("name:");
      if (startIdx >= 0) {
        yaml = response.substring(startIdx).trim();
        yaml = yaml.replace(/\n```\s*$/, "").trim();
        yamlStartIdx = startIdx;
      }
    }

    if (!yaml) {
      return {
        result: null,
        error: "No workflow YAML found. The response must contain a YAML block starting with 'name:' and including 'nodes:'.",
      };
    }

    let explanation = "";
    if (yamlStartIdx > 0) {
      explanation = response.substring(0, yamlStartIdx).trim();
      explanation = explanation.replace(/```\w*\s*$/gm, "").trim();
    }

    yaml = normalizeYamlText(yaml);
    let parsed: {
      name?: string;
      nodes?: Array<{
        id?: string;
        type?: string;
        next?: string;
        trueNext?: string;
        falseNext?: string;
        [key: string]: unknown;
      }>;
    };
    try {
      parsed = parseYaml(yaml);
    } catch (yamlErr) {
      return { result: null, error: `YAML syntax error: ${formatError(yamlErr)}` };
    }

    if (!parsed || typeof parsed !== "object") {
      return { result: null, error: "Parsed YAML is not an object." };
    }
    if (!Array.isArray(parsed.nodes)) {
      return { result: null, error: "Parsed YAML has no 'nodes' array at the top level." };
    }

    // Convert to SidebarNode format
    const nodes: SidebarNode[] = parsed.nodes.map((node, index) => {
      const { id, type, next, trueNext, falseNext, ...properties } = node;

      // Convert all properties to strings
      const stringProps: Record<string, string> = {};
      for (const [key, value] of Object.entries(properties)) {
        if (value === null || value === undefined) {
          stringProps[key] = "";
        } else if (typeof value === "object") {
          stringProps[key] = JSON.stringify(value);
        } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          stringProps[key] = String(value);
        } else {
          stringProps[key] = JSON.stringify(value);
        }
      }

      const sidebarNode: SidebarNode = {
        id: String(id || `node-${index + 1}`),
        type: (type || "variable") as WorkflowNodeType,
        properties: stringProps,
      };

      // Add connection properties
      if (next) {
        sidebarNode.next = String(next);
      }
      if (trueNext) {
        sidebarNode.trueNext = String(trueNext);
      }
      if (falseNext) {
        sidebarNode.falseNext = String(falseNext);
      }

      return sidebarNode;
    });

    return {
      result: {
        yaml,
        nodes,
        name: parsed.name || "AI Generated Workflow",
        explanation: explanation || undefined,
      },
    };
  } catch (error) {
    return { result: null, error: formatError(error) };
  }
}

/** Render generation context (plan/thinking/review) as collapsible details sections.
 *  The plan section is rendered as Markdown; thinking/review kept as preformatted text. */
export function renderGenerationContext(
  container: HTMLElement,
  ctx: GenerationContext,
  app: App,
  component: Component,
  options?: { defaultOpen?: boolean }
): void {
  const sections: { label: string; content: string; kind: "markdown" | "text" }[] = [];
  if (ctx.plan) sections.push({ label: t("workflow.generation.phasePlan"), content: ctx.plan, kind: "markdown" });
  if (ctx.review) sections.push({ label: t("workflow.generation.phaseReview"), content: ctx.review, kind: "markdown" });
  if (ctx.thinking) sections.push({ label: t("workflow.generation.thinking"), content: ctx.thinking, kind: "text" });

  if (sections.length === 0) return;

  const defaultOpen = options?.defaultOpen ?? true;
  const wrapper = container.createDiv({ cls: "workflow-generation-context" });
  for (const section of sections) {
    const details = wrapper.createEl("details", { cls: "workflow-generation-context-details" });
    // Open plan/review by default when they're the primary content (preview modal).
    // Keep them closed in contexts where the diff is primary (confirm modal).
    if (defaultOpen && section.kind === "markdown") details.setAttr("open", "");
    const summary = details.createEl("summary");
    summary.createSpan({ text: section.label });
    const copyBtn = summary.createEl("button", {
      cls: "workflow-generation-copy-btn",
      text: t("message.copy"),
    });
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      void navigator.clipboard.writeText(section.content).then(() => {
        const original = copyBtn.textContent;
        copyBtn.textContent = "✓";
        setTimeout(() => { copyBtn.textContent = original; }, 1200);
      });
    });
    if (section.kind === "markdown") {
      const mdContainer = details.createDiv({ cls: "workflow-generation-context-content workflow-generation-plan-rendered" });
      void MarkdownRenderer.render(app, section.content, mdContainer, "/", component);
      continue;
    }
    const pre = details.createEl("pre", { cls: "workflow-generation-context-content" });
    pre.textContent = section.content;
  }
}

/** Merge multiple StreamChunkUsage objects by summing their numeric fields */
function mergeUsage(a?: StreamChunkUsage, b?: StreamChunkUsage): StreamChunkUsage | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    inputTokens: (a.inputTokens ?? 0) + (b.inputTokens ?? 0),
    outputTokens: (a.outputTokens ?? 0) + (b.outputTokens ?? 0),
    thinkingTokens: (a.thinkingTokens ?? 0) + (b.thinkingTokens ?? 0),
    totalTokens: (a.totalTokens ?? 0) + (b.totalTokens ?? 0),
    totalCost: (a.totalCost ?? 0) + (b.totalCost ?? 0),
  };
}

/** Structured result from the review phase */
export interface ReviewResult {
  verdict: "pass" | "fail";
  summary: string;
  issues: Array<{
    severity: "high" | "medium" | "low";
    description: string;
  }>;
  /** Raw reviewer text preserved when JSON parsing fails, so refinement gets full context */
  rawText?: string;
}

/**
 * Format a ReviewResult as localized Markdown for human-readable display.
 * The `summary` and `description` fields are already in the user's language
 * (per the review prompt); this function adds localized labels and structure.
 */
export function formatReviewAsMarkdown(review: ReviewResult): string {
  const severityLabel: Record<string, string> = {
    high: t("workflow.generation.severityHigh"),
    medium: t("workflow.generation.severityMedium"),
    low: t("workflow.generation.severityLow"),
  };
  const severityIcon: Record<string, string> = {
    high: "🔴",
    medium: "🟡",
    low: "🔵",
  };

  const verdictIcon = review.verdict === "pass" ? "✅" : "⚠️";
  const verdictLabel = review.verdict === "pass"
    ? t("workflow.generation.reviewVerdictPass")
    : t("workflow.generation.reviewVerdictFail");

  const lines: string[] = [];
  lines.push(`## ${verdictIcon} ${verdictLabel}`);
  if (review.summary) {
    lines.push("");
    lines.push(review.summary);
  }

  if (review.issues.length > 0) {
    lines.push("");
    lines.push(`### ${t("workflow.generation.reviewIssues")} (${review.issues.length})`);
    lines.push("");
    for (const issue of review.issues) {
      const icon = severityIcon[issue.severity] || "";
      const label = severityLabel[issue.severity] || issue.severity;
      lines.push(`- ${icon} **[${label}]** ${issue.description}`);
    }
  } else if (review.verdict === "pass") {
    lines.push("");
    lines.push(`_${t("workflow.generation.reviewNoIssues")}_`);
  }

  return lines.join("\n");
}

/**
 * Parse the review phase response into a structured ReviewResult.
 * The model is instructed to output JSON, but we handle code fences.
 * On parse failure, returns a "fail" verdict so refinement can still run
 * with the raw reviewer text as context (LLMs often produce slightly invalid JSON).
 */
function parseReviewResponse(response: string): ReviewResult {
  try {
    // Strip markdown code fences if present
    let jsonStr = response.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const verdict = parsed.verdict === "fail" ? "fail" : "pass";
    const summary = typeof parsed.summary === "string" ? parsed.summary : "";
    const issues: ReviewResult["issues"] = [];

    if (Array.isArray(parsed.issues)) {
      for (const item of parsed.issues) {
        if (item && typeof item === "object" && "description" in item) {
          const severity = (item as { severity?: string }).severity;
          issues.push({
            severity: severity === "high" || severity === "medium" || severity === "low" ? severity : "medium",
            description: String((item as { description: unknown }).description),
          });
        }
      }
    }

    return { verdict, summary, issues };
  } catch {
    // JSON parse failed — the reviewer likely flagged real issues but
    // produced malformed output. Treat as "fail" so refinement runs
    // with the raw text, rather than silently accepting.
    console.warn("Failed to parse review response as JSON, treating as fail");
    return {
      verdict: "fail",
      summary: response.trim().substring(0, 500),
      issues: [{ severity: "high", description: "Review output could not be parsed; refinement triggered with raw reviewer feedback" }],
      rawText: response.trim(),
    };
  }
}
