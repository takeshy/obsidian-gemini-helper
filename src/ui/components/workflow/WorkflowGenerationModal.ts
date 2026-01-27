import { App, Modal } from "obsidian";
import { t } from "src/i18n";

export interface WorkflowGenerationResult {
  response: string;
  cancelled: boolean;
}

/**
 * Modal that displays workflow generation progress with thinking streaming
 */
export class WorkflowGenerationModal extends Modal {
  private request: string;
  private modelDisplayName: string;
  private thinkingContainerEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private cancelBtn: HTMLButtonElement | null = null;
  private abortController: AbortController;
  private onCancel: () => void;
  private isCancelled = false;
  private executionStepsCount: number;

  constructor(
    app: App,
    request: string,
    abortController: AbortController,
    onCancel: () => void,
    executionStepsCount = 0,
    modelDisplayName = ""
  ) {
    super(app);
    this.request = request;
    this.abortController = abortController;
    this.onCancel = onCancel;
    this.executionStepsCount = executionStepsCount;
    this.modelDisplayName = modelDisplayName;
  }

  onOpen(): void {
    const { contentEl, modalEl, containerEl } = this;
    contentEl.empty();
    contentEl.addClass("workflow-generation-modal-content");
    modalEl.addClass("workflow-generation-modal");
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
    const titleEl = dragHandle.createEl("h2", { text: t("workflow.generation.title") });
    // Show model name in title if available
    if (this.modelDisplayName) {
      titleEl.createSpan({
        cls: "workflow-generation-model-badge",
        text: this.modelDisplayName,
      });
    }
    this.setupDragHandle(dragHandle, modalEl);

    // User's request section
    const requestSection = contentEl.createDiv({ cls: "workflow-generation-request" });
    requestSection.createEl("h3", { text: t("workflow.generation.yourRequest") });
    const requestContent = requestSection.createDiv({ cls: "workflow-generation-request-content" });
    requestContent.textContent = this.request;

    // Execution history info (if steps are selected)
    if (this.executionStepsCount > 0) {
      const historySection = contentEl.createDiv({ cls: "workflow-generation-history-info" });
      historySection.createEl("span", {
        cls: "workflow-generation-history-badge",
        text: t("workflow.generation.executionHistoryIncluded", { count: this.executionStepsCount }),
      });
    }

    // Thinking section
    const thinkingSection = contentEl.createDiv({ cls: "workflow-generation-thinking-section" });
    thinkingSection.createEl("h3", { text: t("workflow.generation.thinking") });
    this.thinkingContainerEl = thinkingSection.createDiv({ cls: "workflow-generation-thinking" });

    // Status indicator
    this.statusEl = contentEl.createDiv({ cls: "workflow-generation-status" });
    this.statusEl.textContent = t("workflow.generation.generating");

    // Add loading animation
    const loadingDotsEl = this.statusEl.createSpan({ cls: "workflow-generation-loading-dots" });
    loadingDotsEl.createSpan({ cls: "dot" });
    loadingDotsEl.createSpan({ cls: "dot" });
    loadingDotsEl.createSpan({ cls: "dot" });

    // Cancel button
    const buttonContainer = contentEl.createDiv({ cls: "workflow-generation-buttons" });
    this.cancelBtn = buttonContainer.createEl("button", {
      text: t("common.cancel"),
      cls: "mod-warning",
    });
    this.cancelBtn.addEventListener("click", () => {
      this.cancel();
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

  /**
   * Append thinking content to the thinking container
   */
  appendThinking(content: string): void {
    if (this.thinkingContainerEl) {
      const span = document.createElement("span");
      span.textContent = content;
      this.thinkingContainerEl.appendChild(span);
      // Auto-scroll to bottom
      this.thinkingContainerEl.scrollTop = this.thinkingContainerEl.scrollHeight;
    }
  }

  /**
   * Update status text
   */
  setStatus(status: string): void {
    if (this.statusEl) {
      // Clear existing content but keep the first text node
      const loadingDots = this.statusEl.querySelector(".workflow-generation-loading-dots");
      this.statusEl.textContent = status;
      if (loadingDots) {
        this.statusEl.appendChild(loadingDots);
      }
    }
  }

  /**
   * Mark generation as complete (hides loading dots)
   */
  setComplete(): void {
    if (this.statusEl) {
      const loadingDots = this.statusEl.querySelector(".workflow-generation-loading-dots");
      if (loadingDots) {
        loadingDots.remove();
      }
    }
  }

  /**
   * Check if generation was cancelled
   */
  wasCancelled(): boolean {
    return this.isCancelled;
  }

  private cancel(): void {
    this.isCancelled = true;
    this.abortController.abort();
    this.onCancel();
    this.close();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
