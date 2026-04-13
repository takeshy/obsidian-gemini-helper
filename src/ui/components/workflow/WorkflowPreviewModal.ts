import { App, Modal, Platform, MarkdownRenderer, Component } from "obsidian";
import type { SidebarNode, WorkflowNodeType } from "src/workflow/types";
import type { GenerationContext } from "./AIWorkflowModal";
import { t } from "src/i18n";

export type PreviewResult = "ok" | "no" | "cancel";

export interface WorkflowPreviewResult {
  result: PreviewResult;
  additionalRequest?: string;
}

const getNodeTypeLabels = (): Record<WorkflowNodeType, string> => ({
  variable: t("workflow.nodeType.variable"),
  set: t("workflow.nodeType.set"),
  if: t("workflow.nodeType.if"),
  while: t("workflow.nodeType.while"),
  command: t("workflow.nodeType.command"),
  http: t("workflow.nodeType.http"),
  json: t("workflow.nodeType.json"),
  note: t("workflow.nodeType.note"),
  "note-read": t("workflow.nodeType.noteRead"),
  "note-search": t("workflow.nodeType.noteSearch"),
  "note-list": t("workflow.nodeType.noteList"),
  "folder-list": t("workflow.nodeType.folderList"),
  open: t("workflow.nodeType.open"),
  dialog: t("workflow.nodeType.dialog"),
  "prompt-file": t("workflow.nodeType.promptFile"),
  "prompt-selection": t("workflow.nodeType.promptSelection"),
  "file-explorer": t("workflow.nodeType.fileExplorer"),
  "file-save": t("workflow.nodeType.fileSave"),
  workflow: t("workflow.nodeType.workflow"),
  "rag-sync": t("workflow.nodeType.ragSync"),
  mcp: t("workflow.nodeType.mcp"),
  "obsidian-command": t("workflow.nodeType.obsidianCommand"),
  sleep: t("workflow.nodeType.sleep"),
  script: t("workflow.nodeType.script"),
});

/**
 * Get a short summary of a node's properties
 */
function getNodeSummary(node: SidebarNode): string {
  const { properties } = node;
  switch (node.type) {
    case "variable":
      return properties.name ? `${properties.name} = ${properties.value || '""'}` : "";
    case "set":
      return properties.name ? `${properties.name} = ${properties.expression || ""}` : "";
    case "if":
    case "while":
      return properties.condition || "";
    case "command":
      return properties.model
        ? `${properties.model}: ${properties.prompt?.substring(0, 50) || ""}...`
        : properties.prompt?.substring(0, 60) || "";
    case "http":
      return properties.url || "";
    case "json":
      return properties.path || "";
    case "note":
    case "note-read":
      return properties.path || "";
    case "note-search":
      return properties.query || "";
    case "note-list":
    case "folder-list":
      return properties.folder || "/";
    case "open":
      return properties.path || "";
    case "dialog":
      return properties.title || "";
    case "prompt-file":
    case "prompt-selection":
      return properties.resultVariable || "";
    case "file-explorer":
      return properties.extensions || "*.*";
    case "file-save":
      return properties.path || "";
    case "workflow":
      return properties.path || "";
    case "rag-sync":
      return properties.storeName || "";
    case "mcp":
      return properties.tool || "";
    case "obsidian-command":
      return properties.commandId || "";
    default:
      return "";
  }
}

/**
 * Modal for previewing generated workflow before applying
 */
export class WorkflowPreviewModal extends Modal {
  private yaml: string;
  private nodes: SidebarNode[];
  private workflowName: string;
  private previousRequest: string;
  private generationContext: GenerationContext;
  private resolvePromise: (result: WorkflowPreviewResult) => void;
  private additionalRequestEl: HTMLTextAreaElement | null = null;
  private markdownComponent: Component | null = null;

  constructor(
    app: App,
    yaml: string,
    nodes: SidebarNode[],
    workflowName: string,
    previousRequest: string,
    generationContext: GenerationContext,
    resolvePromise: (result: WorkflowPreviewResult) => void
  ) {
    super(app);
    this.yaml = yaml;
    this.nodes = nodes;
    this.workflowName = workflowName;
    this.previousRequest = previousRequest;
    this.generationContext = generationContext;
    this.resolvePromise = resolvePromise;
  }

  onOpen(): void {
    const { contentEl, modalEl, containerEl } = this;
    contentEl.empty();
    contentEl.addClass("workflow-preview-modal-content");
    modalEl.addClass("workflow-preview-modal");
    modalEl.addClass("gemini-helper-modal-resizable");

    // Prevent closing on outside click
    containerEl.addEventListener("click", (e) => {
      if (e.target === containerEl) {
        e.stopPropagation();
        e.preventDefault();
      }
    });

    // Drag handle with title
    const dragHandle = contentEl.createDiv({ cls: "modal-drag-handle" });
    dragHandle.createEl("h2", { text: t("workflow.preview.title") });
    this.setupDragHandle(dragHandle, modalEl);

    // Workflow name
    const nameEl = contentEl.createDiv({ cls: "workflow-preview-name" });
    nameEl.textContent = this.workflowName;

    // Visual workflow preview
    const nodesContainer = contentEl.createDiv({ cls: "workflow-preview-nodes" });
    this.renderNodes(nodesContainer);

    // Collapsible YAML section
    const yamlDetails = contentEl.createEl("details", { cls: "workflow-preview-yaml-section" });
    yamlDetails.createEl("summary", { text: t("workflow.preview.showYaml") });
    const yamlPre = yamlDetails.createEl("pre", { cls: "workflow-preview-yaml" });
    yamlPre.textContent = this.yaml;

    // Generation context (plan/thinking/review)
    this.renderGenerationContext(contentEl);

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
    if (this.previousRequest) {
      this.additionalRequestEl.value = this.previousRequest;
    }

    // On mobile, hide upper content when textarea is focused to make room for keyboard
    if (Platform.isMobile) {
      this.additionalRequestEl.addEventListener("focus", () => {
        contentEl.addClass("textarea-focused");
      });
      this.additionalRequestEl.addEventListener("blur", () => {
        contentEl.removeClass("textarea-focused");
      });
    }

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "workflow-preview-buttons" });

    const cancelBtn = buttonContainer.createEl("button", {
      text: t("workflow.preview.cancel"),
    });
    cancelBtn.addEventListener("click", () => {
      this.resolvePromise({ result: "cancel" });
      this.close();
    });

    const requestChangesBtn = buttonContainer.createEl("button", {
      text: t("message.requestChanges"),
      cls: "mod-warning",
    });
    requestChangesBtn.disabled = !(this.previousRequest?.trim());
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

    const okBtn = buttonContainer.createEl("button", {
      text: t("workflow.preview.ok"),
      cls: "mod-cta",
    });
    okBtn.addEventListener("click", () => {
      this.resolvePromise({ result: "ok" });
      this.close();
    });
  }

  private renderNodes(container: HTMLElement): void {
    const nodeTypeLabels = getNodeTypeLabels();

    for (const node of this.nodes) {
      const nodeCard = container.createDiv({ cls: "workflow-preview-node-card" });

      // Node header
      const header = nodeCard.createDiv({ cls: "workflow-preview-node-header" });
      const typeLabel = header.createSpan({ cls: "workflow-preview-node-type" });
      typeLabel.textContent = nodeTypeLabels[node.type] || node.type;
      const idLabel = header.createSpan({ cls: "workflow-preview-node-id" });
      idLabel.textContent = node.id;

      // Node comment (human-readable description of purpose)
      const comment = node.properties.comment?.trim();
      if (comment) {
        const commentEl = nodeCard.createDiv({ cls: "workflow-preview-node-comment" });
        commentEl.textContent = comment;
      }

      // Node summary
      const summary = getNodeSummary(node);
      if (summary) {
        const summaryEl = nodeCard.createDiv({ cls: "workflow-preview-node-summary" });
        summaryEl.textContent = summary;
      }

      // Connection info
      const connections: string[] = [];
      if (node.type === "if" || node.type === "while") {
        if (node.trueNext) connections.push(`→ ${t("workflow.branchTrue")}: ${node.trueNext}`);
        if (node.falseNext) connections.push(`→ ${t("workflow.branchFalse")}: ${node.falseNext}`);
      } else if (node.next) {
        connections.push(`→ ${node.next}`);
      }

      if (connections.length > 0) {
        const connEl = nodeCard.createDiv({ cls: "workflow-preview-node-connections" });
        connEl.textContent = connections.join(" | ");
      }
    }
  }

  private renderGenerationContext(container: HTMLElement): void {
    const sections: { label: string; content: string; kind: "markdown" | "text" }[] = [];
    if (this.generationContext.plan) sections.push({ label: t("workflow.generation.phasePlan"), content: this.generationContext.plan, kind: "markdown" });
    if (this.generationContext.review) sections.push({ label: t("workflow.generation.phaseReview"), content: this.generationContext.review, kind: "markdown" });
    if (this.generationContext.thinking) sections.push({ label: t("workflow.generation.thinking"), content: this.generationContext.thinking, kind: "text" });

    if (sections.length === 0) return;

    this.markdownComponent = new Component();
    this.markdownComponent.load();

    // Keep plan/thinking/review collapsed by default — the workflow node list
    // below is the primary content in the preview modal.
    const wrapper = container.createDiv({ cls: "workflow-generation-context" });
    for (const section of sections) {
      const details = wrapper.createEl("details", { cls: "workflow-generation-context-details" });
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
        void MarkdownRenderer.render(this.app, section.content, mdContainer, "/", this.markdownComponent);
      } else {
        const pre = details.createEl("pre", { cls: "workflow-generation-context-content" });
        pre.textContent = section.content;
      }
    }
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

/**
 * Helper function to show the preview modal and get user decision
 */
export function showWorkflowPreview(
  app: App,
  yaml: string,
  nodes: SidebarNode[],
  workflowName: string,
  previousRequest: string,
  generationContext: GenerationContext = {}
): Promise<WorkflowPreviewResult> {
  return new Promise((resolve) => {
    const modal = new WorkflowPreviewModal(app, yaml, nodes, workflowName, previousRequest, generationContext, resolve);
    modal.open();
  });
}
