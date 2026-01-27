import { App, Modal, Notice, Platform, parseYaml, TFile, setIcon } from "obsidian";
import type { GeminiHelperPlugin } from "src/plugin";
import { GeminiCliProvider, ClaudeCliProvider, CodexCliProvider } from "src/core/cliProvider";
import { GeminiClient } from "src/core/gemini";
import { CLI_MODEL, CLAUDE_CLI_MODEL, CODEX_CLI_MODEL, DEFAULT_CLI_CONFIG, getAvailableModels, type ModelType, type Attachment } from "src/types";
import { getWorkflowSpecification } from "src/workflow/workflowSpec";
import type { SidebarNode, WorkflowNodeType, ExecutionStep } from "src/workflow/types";
import { ExecutionHistoryManager } from "src/workflow/history";
import { computeLineDiff } from "./EditConfirmationModal";
import { WorkflowGenerationModal } from "./WorkflowGenerationModal";
import { showWorkflowPreview } from "./WorkflowPreviewModal";
import { showExecutionHistorySelect } from "./ExecutionHistorySelectModal";
import { formatError } from "src/utils/error";
import { t } from "src/i18n";

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
}

// Result type for confirmation modal
export type ConfirmResult = "ok" | "no" | "cancel";

export interface WorkflowConfirmResult {
  result: ConfirmResult;
  additionalRequest?: string;
}

// Confirmation modal for reviewing changes
class WorkflowConfirmModal extends Modal {
  private oldYaml: string;
  private newYaml: string;
  private explanation?: string;
  private previousRequest: string;
  private resolvePromise: (result: WorkflowConfirmResult) => void;
  private additionalRequestEl: HTMLTextAreaElement | null = null;
  private additionalRequestContainerEl: HTMLElement | null = null;
  private isShowingAdditionalRequest = false;

  constructor(
    app: App,
    oldYaml: string,
    newYaml: string,
    explanation: string | undefined,
    previousRequest: string,
    resolvePromise: (result: WorkflowConfirmResult) => void
  ) {
    super(app);
    this.oldYaml = oldYaml;
    this.newYaml = newYaml;
    this.explanation = explanation;
    this.previousRequest = previousRequest;
    this.resolvePromise = resolvePromise;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("ai-workflow-confirm-modal");
    modalEl.addClass("gemini-helper-modal-resizable");

    // Drag handle with title
    const dragHandle = contentEl.createDiv({ cls: "modal-drag-handle" });
    dragHandle.createEl("h2", { text: t("aiWorkflow.confirmChanges") });
    this.setupDragHandle(dragHandle, modalEl);

    // Explanation section (if available)
    if (this.explanation) {
      const explanationContainer = contentEl.createDiv({ cls: "ai-workflow-explanation" });
      explanationContainer.createEl("h3", { text: t("aiWorkflow.aiExplanation") });
      explanationContainer.createEl("p", { text: this.explanation });
    }

    // Create diff view
    const diffContainer = contentEl.createDiv({ cls: "gemini-helper-diff-view" });
    const diffLines = computeLineDiff(this.oldYaml, this.newYaml);

    for (const line of diffLines) {
      const lineEl = diffContainer.createDiv({
        cls: `gemini-helper-diff-line gemini-helper-diff-${line.type}`,
      });

      // Line number gutter
      const gutterEl = lineEl.createSpan({ cls: "gemini-helper-diff-gutter" });
      if (line.type === "removed") {
        gutterEl.textContent = "-";
      } else if (line.type === "added") {
        gutterEl.textContent = "+";
      } else {
        gutterEl.textContent = " ";
      }

      // Content
      const contentEl = lineEl.createSpan({ cls: "gemini-helper-diff-content" });
      contentEl.textContent = line.content;
    }

    // Additional request container (hidden initially)
    this.additionalRequestContainerEl = contentEl.createDiv({
      cls: "workflow-preview-additional is-hidden"
    });
    this.additionalRequestContainerEl.createEl("label", {
      text: t("workflow.preview.additionalRequest")
    });
    this.additionalRequestEl = this.additionalRequestContainerEl.createEl("textarea", {
      cls: "workflow-preview-additional-input",
      attr: {
        placeholder: t("workflow.preview.additionalPlaceholder"),
        rows: "3"
      },
    });

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "ai-workflow-buttons" });

    const cancelBtn = buttonContainer.createEl("button", { text: t("workflow.preview.cancel") });
    cancelBtn.addEventListener("click", () => {
      this.resolvePromise({ result: "cancel" });
      this.close();
    });

    const noBtn = buttonContainer.createEl("button", { text: t("workflow.preview.no") });
    noBtn.addEventListener("click", () => {
      if (!this.isShowingAdditionalRequest) {
        // First click: show additional request input with previous request pre-filled
        this.isShowingAdditionalRequest = true;
        this.additionalRequestContainerEl?.removeClass("is-hidden");
        if (this.additionalRequestEl && this.previousRequest) {
          this.additionalRequestEl.value = this.previousRequest;
        }
        this.additionalRequestEl?.focus();
        noBtn.textContent = t("workflow.preview.regenerate");
        noBtn.addClass("mod-cta");
        applyBtn.removeClass("mod-cta");
      } else {
        // Second click: submit with additional request
        const additionalRequest = this.additionalRequestEl?.value?.trim() || "";
        this.resolvePromise({
          result: "no",
          additionalRequest,
        });
        this.close();
      }
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
  previousRequest: string
): Promise<WorkflowConfirmResult> {
  return new Promise((resolve) => {
    const modal = new WorkflowConfirmModal(app, oldYaml, newYaml, explanation, previousRequest, resolve);
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
  private resolvePromise: (result: AIWorkflowResult | null) => void;

  private nameInputEl: HTMLInputElement | null = null;
  private outputPathEl: HTMLInputElement | null = null;
  private descriptionEl: HTMLTextAreaElement | null = null;
  private modelSelect: HTMLSelectElement | null = null;
  private confirmCheckbox: HTMLInputElement | null = null;
  private generateBtn: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private isGenerating = false;

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
    defaultOutputPath?: string
  ) {
    super(app);
    this.plugin = plugin;
    this.mode = mode;
    this.existingYaml = existingYaml;
    this.existingName = existingName;
    this.resolvePromise = resolvePromise;
    this.defaultOutputPath = defaultOutputPath;
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
        ? t("aiWorkflow.createTitle")
        : t("aiWorkflow.modifyTitle");
    dragHandle.createEl("h2", { text: title });
    this.setupDrag(dragHandle, modalEl);

    // Add resize handles
    this.addResizeHandles(modalEl);

    // Name and output path (only for create mode)
    if (this.mode === "create") {
      // Name input
      const nameContainer = contentEl.createDiv({ cls: "ai-workflow-input-row" });
      nameContainer.createEl("label", { text: t("aiWorkflow.workflowName") });
      this.nameInputEl = nameContainer.createEl("input", {
        type: "text",
        cls: "ai-workflow-name-input",
        attr: { placeholder: t("aiWorkflow.namePlaceholder") },
      });

      // Output path input
      const pathContainer = contentEl.createDiv({ cls: "ai-workflow-input-row" });
      pathContainer.createEl("label", { text: t("aiWorkflow.outputPath") });
      const defaultPath = this.defaultOutputPath || "workflows/{{name}}";
      this.outputPathEl = pathContainer.createEl("input", {
        type: "text",
        cls: "ai-workflow-path-input",
        value: defaultPath,
        attr: { placeholder: "workflows/{{name}}" },
      });
      pathContainer.createEl("div", {
        cls: "ai-workflow-hint",
        text: t("aiWorkflow.pathHint"),
      });
    }

    // Description label
    const descLabel =
      this.mode === "create"
        ? t("aiWorkflow.describeCreate")
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
            ? t("aiWorkflow.placeholderCreate")
            : t("aiWorkflow.placeholderModify"),
        rows: "6",
      },
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

    const cliConfig = this.plugin.settings.cliConfig || DEFAULT_CLI_CONFIG;
    const geminiCliVerified = !Platform.isMobile && cliConfig.cliVerified === true;
    const claudeCliVerified = !Platform.isMobile && cliConfig.claudeCliVerified === true;
    const codexCliVerified = !Platform.isMobile && cliConfig.codexCliVerified === true;
    const baseModels = getAvailableModels(this.plugin.settings.apiPlan);
    const cliModels = [
      ...(geminiCliVerified ? [CLI_MODEL] : []),
      ...(claudeCliVerified ? [CLAUDE_CLI_MODEL] : []),
      ...(codexCliVerified ? [CODEX_CLI_MODEL] : []),
    ];
    const availableModels = [...cliModels, ...baseModels];
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

    this.generateBtn = buttonContainer.createEl("button", {
      text: this.mode === "create" ? t("aiWorkflow.generate") : t("aiWorkflow.modify"),
      cls: "mod-cta",
    });
    this.generateBtn.addEventListener("click", () => {
      void this.generate();
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
        this.plugin.settings.workspaceFolder,
        encryptionConfig
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

    const isGeminiCli = selectedModel === "gemini-cli";
    const isClaudeCli = selectedModel === "claude-cli";
    const isCodexCli = selectedModel === "codex-cli";
    const isCliModel = isGeminiCli || isClaudeCli || isCodexCli;

    // Check API key (skip for CLI model)
    if (!isCliModel && !this.plugin.settings.googleApiKey) {
      new Notice(t("aiWorkflow.apiKeyNotConfigured"));
      return;
    }

    // Get name for create mode
    const workflowName = this.mode === "create"
      ? this.nameInputEl?.value?.trim() || "workflow"
      : this.existingName || "workflow";

    // Get output path template for create mode
    const outputPathTemplate = this.mode === "create"
      ? this.outputPathEl?.value?.trim() || "workflows/{{name}}/main"
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
      isCliModel,
      resolvedMentions,
      workflowPath,
      modelDisplayName,
      undefined,  // previousYaml
      [],         // requestHistory
      this.selectedExecutionSteps.length > 0 ? this.selectedExecutionSteps : undefined
    );
  }

  /**
   * Run the generation loop with progress display and preview confirmation
   */
  private async runGenerationLoop(
    currentRequest: string,
    workflowName: string,
    outputPathTemplate: string | undefined,
    selectedModel: ModelType,
    isCliModel: boolean,
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

    // Open the generation modal
    const generationModal = new WorkflowGenerationModal(
      this.app,
      currentRequest,
      abortController,
      () => { generationCancelled = true; },
      selectedExecutionSteps?.length ?? 0,
      modelDisplayName
    );
    generationModal.open();

    try {
      // Build prompts
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(currentRequest, workflowName, previousYaml, requestHistory, selectedExecutionSteps);

      let response = "";

      if (isCliModel) {
        // CLI models don't support streaming thinking
        const cliConfig = this.plugin.settings.cliConfig || DEFAULT_CLI_CONFIG;
        const isClaudeCli = selectedModel === "claude-cli";
        const isCodexCli = selectedModel === "codex-cli";

        // Get CLI provider name for status
        const cliName = isClaudeCli ? "Claude CLI" : isCodexCli ? "Codex CLI" : "Gemini CLI";
        generationModal.setStatus(t("workflow.generation.generatingWithCli", { cli: cliName }));

        let provider: GeminiCliProvider | ClaudeCliProvider | CodexCliProvider;
        if (isClaudeCli) {
          if (!cliConfig.claudeCliVerified) {
            throw new Error("Claude CLI is not available. Please verify it in settings.");
          }
          provider = new ClaudeCliProvider();
        } else if (isCodexCli) {
          if (!cliConfig.codexCliVerified) {
            throw new Error("Codex CLI is not available. Please verify it in settings.");
          }
          provider = new CodexCliProvider();
        } else {
          if (!cliConfig.cliVerified) {
            throw new Error("Gemini CLI is not available. Please verify it in settings.");
          }
          provider = new GeminiCliProvider();
        }

        const vaultBasePath =
          (this.plugin.app.vault.adapter as unknown as { basePath?: string }).basePath || ".";
        const cliSystemPrompt = `${systemPrompt}\n\nNote: You are running in CLI mode with limited capabilities. You can read and search vault files, but cannot modify them.`;

        for await (const chunk of provider.chatStream(
          [{ role: "user", content: userPrompt, timestamp: Date.now() }],
          cliSystemPrompt,
          vaultBasePath
        )) {
          if (generationCancelled || abortController.signal.aborted) {
            break;
          }
          if (chunk.type === "text") {
            response += chunk.content || "";
          } else if (chunk.type === "error") {
            throw new Error(chunk.error || "Unknown error");
          }
        }
      } else {
        // API model with streaming thinking support
        const client = new GeminiClient(
          this.plugin.settings.googleApiKey,
          selectedModel
        );

        // Use the streaming workflow generation method
        for await (const chunk of client.generateWorkflowStream(
          [{
            role: "user",
            content: userPrompt,
            timestamp: Date.now(),
            attachments: this.pendingAttachments.length > 0 ? this.pendingAttachments : undefined,
          }],
          systemPrompt
        )) {
          if (generationCancelled || abortController.signal.aborted) {
            break;
          }

          if (chunk.type === "thinking" && chunk.content) {
            // Display thinking content in the modal
            generationModal.appendThinking(chunk.content);
          } else if (chunk.type === "text" && chunk.content) {
            response += chunk.content;
          } else if (chunk.type === "error") {
            throw new Error(chunk.error || "Unknown error");
          }
        }
      }

      // Close generation modal
      generationModal.close();

      // Check if cancelled
      if (generationCancelled) {
        this.resolvePromise(null);
        return;
      }

      // Parse the response
      const result = this.parseResponse(response);

      if (!result) {
        new Notice(t("workflow.generation.parseFailed"));
        this.resolvePromise(null);
        return;
      }

      // Save the selected model for next time
      this.plugin.settings.lastAIWorkflowModel = selectedModel;
      void this.plugin.saveSettings();

      // Add metadata to result - only store current request as description
      result.description = currentRequest;
      result.mode = this.mode;
      result.resolvedMentions = resolvedMentions.length > 0 ? resolvedMentions : undefined;

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
          currentRequest
        );

        if (confirmResult.result === "ok") {
          this.resolvePromise(result);
        } else if (confirmResult.result === "no") {
          // User wants modifications - accumulate request history
          const updatedHistory = [...requestHistory, currentRequest];
          await this.runGenerationLoop(
            confirmResult.additionalRequest || "",  // New request from user
            workflowName,
            outputPathTemplate,
            selectedModel,
            isCliModel,
            resolvedMentions,
            workflowPath,     // Workflow path for execution history
            modelDisplayName,
            result.yaml,      // Previous YAML for reference
            updatedHistory,   // Accumulated request history
            selectedExecutionSteps  // Keep original execution steps for context
          );
        } else {
          // User cancelled
          this.resolvePromise(null);
        }
        return;
      }

      // Show preview modal for create mode and modify mode without diff confirmation
      // Pass the current request so user can edit it for the next iteration
      const previewResult = await showWorkflowPreview(
        this.app,
        result.yaml,
        result.nodes,
        result.name,
        currentRequest
      );

      if (previewResult.result === "ok") {
        // User approved - return the result
        this.resolvePromise(result);
      } else if (previewResult.result === "no") {
        // User wants modifications - accumulate request history
        const updatedHistory = [...requestHistory, currentRequest];
        await this.runGenerationLoop(
          previewResult.additionalRequest || "",  // New request from user
          workflowName,
          outputPathTemplate,
          selectedModel,
          isCliModel,
          resolvedMentions,
          workflowPath,     // Workflow path for execution history
          modelDisplayName,
          result.yaml,      // Previous YAML for reference
          updatedHistory,   // Accumulated request history
          selectedExecutionSteps  // Keep original execution steps for context
        );
      } else {
        // User cancelled
        this.resolvePromise(null);
      }
    } catch (error) {
      generationModal.close();
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Error: ${message}`);
      this.resolvePromise(null);
    }
  }

  private buildSystemPrompt(): string {
    // Build dynamic workflow specification with current settings
    const workflowSpec = getWorkflowSpecification({
      apiPlan: this.plugin.settings.apiPlan,
      cliConfig: this.plugin.settings.cliConfig,
      mcpServers: this.plugin.settings.mcpServers || [],
      ragSettingNames: Object.keys(this.plugin.workspaceState.ragSettings || {}),
    });

    return `You are a workflow generator for Obsidian. You create and modify workflows in YAML format.

${workflowSpec}

IMPORTANT RULES:
1. Output ONLY the workflow YAML, no explanation or markdown code fences
2. The YAML must be valid and parseable
3. Include a descriptive "name" field
4. Use unique, descriptive node IDs (e.g., "read-input", "process-data", "save-result")
5. Ensure all variables are initialized before use
6. Use proper control flow (next, trueNext, falseNext)
7. Start output directly with "name:" - no code fences, no explanation`;
  }

  private buildUserPrompt(
    currentRequest: string,
    workflowName?: string,
    previousYaml?: string,
    requestHistory: string[] = [],
    selectedExecutionSteps?: import("src/workflow/types").ExecutionStep[]
  ): string {
    if (this.mode === "create") {
      // If we have previous request/YAML from regeneration, include as reference
      if (requestHistory.length > 0 && previousYaml) {
        // Build numbered history of all requests
        const historySection = requestHistory.map((req, idx) => `${idx + 1}. ${req}`).join("\n");

        // Build execution history section if steps are selected
        let executionSection = "";
        if (selectedExecutionSteps && selectedExecutionSteps.length > 0) {
          executionSection = this.formatExecutionSteps(selectedExecutionSteps);
        }

        return `Create or modify a workflow based on the following request.

REFERENCE (previous attempts):
${historySection}

Previous output:
${previousYaml}
${executionSection}
NEW REQUEST:
${currentRequest}

Output only the complete YAML for the workflow, starting with "name: ${workflowName}".`;
      }
      return `Create a new workflow named "${workflowName}" that does the following:

${currentRequest}

Output only the YAML for the workflow, starting with "name: ${workflowName}".`;
    } else {
      // Build execution history section if steps are selected
      let executionSection = "";
      if (selectedExecutionSteps && selectedExecutionSteps.length > 0) {
        executionSection = this.formatExecutionSteps(selectedExecutionSteps);
      }

      return `Modify the following workflow according to these requirements:

CURRENT WORKFLOW:
${this.existingYaml}
${executionSection}
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
    try {
      let yaml = "";
      let yamlStartIdx = -1;

      // Try to find a code block containing "name:" and "nodes:"
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

      // If no valid code block found, try to find YAML directly in response
      if (!yaml) {
        const nameMatch = response.match(/(?:^|\n)(name:\s*\S+[\s\S]*?nodes:\s*[\s\S]*?)(?:\n```|$)/);
        if (nameMatch && nameMatch.index !== undefined) {
          yaml = nameMatch[1].trim();
          yamlStartIdx = nameMatch.index;
        }
      }

      // Final fallback: find "name:" and take everything from there
      if (!yaml) {
        const startIdx = response.indexOf("name:");
        if (startIdx >= 0) {
          yaml = response.substring(startIdx).trim();
          // Remove trailing code fence if present
          yaml = yaml.replace(/\n```\s*$/, "").trim();
          yamlStartIdx = startIdx;
        }
      }

      if (!yaml) {
        console.error("Could not find valid workflow YAML in response:", response);
        return null;
      }

      // Extract explanation (text before YAML)
      let explanation = "";
      if (yamlStartIdx > 0) {
        explanation = response.substring(0, yamlStartIdx).trim();
        // Remove code fence markers from explanation
        explanation = explanation.replace(/```\w*\s*$/gm, "").trim();
      }

      // Parse YAML
      const parsed = parseYaml(yaml) as {
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

      if (!parsed || !Array.isArray(parsed.nodes)) {
        console.error("Invalid workflow structure:", parsed);
        return null;
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
        yaml,
        nodes,
        name: parsed.name || "AI Generated Workflow",
        explanation: explanation || undefined,
      };
    } catch (error) {
      console.error("Failed to parse AI workflow response:", formatError(error), response);
      return null;
    }
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
  defaultOutputPath?: string
): Promise<AIWorkflowResult | null> {
  return new Promise((resolve) => {
    const modal = new AIWorkflowModal(
      app,
      plugin,
      mode,
      resolve,
      existingYaml,
      existingName,
      defaultOutputPath
    );
    modal.open();
  });
}
