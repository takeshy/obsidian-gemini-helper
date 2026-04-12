import { App, Modal, MarkdownRenderer, Component } from "obsidian";
import type { StreamChunkUsage } from "src/types";
import { t } from "src/i18n";

export interface WorkflowGenerationResult {
  response: string;
  cancelled: boolean;
}

/** Phase identifiers for the generation process */
export type GenerationPhase = "planning" | "generating" | "reviewing";

/** Result from the plan confirmation step */
export interface PlanConfirmResult {
  action: "ok" | "replan" | "cancel";
  feedback?: string;
}

/** Result from the review confirmation step */
export interface ReviewConfirmResult {
  action: "ok" | "refine" | "cancel";
}

/**
 * Modal that displays workflow generation progress with thinking streaming
 */
export class WorkflowGenerationModal extends Modal {
  private request: string;
  private modelDisplayName: string;
  private currentPhase: GenerationPhase = "generating";
  private planningEnabled: boolean;
  private phaseIndicatorEl: HTMLElement | null = null;
  private planSectionEl: HTMLElement | null = null;
  private planContainerEl: HTMLElement | null = null;
  private thinkingSectionEl: HTMLElement | null = null;
  private thinkingContainerEl: HTMLElement | null = null;
  private reviewSectionEl: HTMLElement | null = null;
  private reviewContainerEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private cancelBtn: HTMLButtonElement | null = null;
  private abortController: AbortController;
  private onCancel: () => void;
  private isCancelled = false;
  private executionStepsCount: number;
  private thinkingText = "";
  private reviewText = "";
  private planText = "";
  private markdownComponent: Component | null = null;

  constructor(
    app: App,
    request: string,
    abortController: AbortController,
    onCancel: () => void,
    executionStepsCount = 0,
    modelDisplayName = "",
    planningEnabled = true
  ) {
    super(app);
    this.request = request;
    this.abortController = abortController;
    this.onCancel = onCancel;
    this.executionStepsCount = executionStepsCount;
    this.modelDisplayName = modelDisplayName;
    this.planningEnabled = planningEnabled;
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

    // Phase indicator
    this.phaseIndicatorEl = contentEl.createDiv({ cls: "workflow-generation-phase-indicator" });
    this.renderPhaseIndicator();

    // Plan section (hidden when planning is skipped)
    this.planSectionEl = contentEl.createDiv({
      cls: `workflow-generation-plan-section${this.planningEnabled ? "" : " is-hidden"}`,
    });
    const planHeader = this.planSectionEl.createDiv({ cls: "workflow-generation-section-header" });
    planHeader.createEl("h3", { text: t("workflow.generation.planning") });
    this.planContainerEl = this.planSectionEl.createDiv({ cls: "workflow-generation-plan" });
    this.addCopyButton(planHeader, () => this.planContainerEl?.textContent || "");

    // Thinking section (collapsible details, like chat bubble thinking)
    this.thinkingSectionEl = contentEl.createEl("details", { cls: "gemini-helper-thinking workflow-generation-thinking-details" });
    const thinkingSummary = this.thinkingSectionEl.createEl("summary", {
      cls: "gemini-helper-thinking-summary",
    });
    thinkingSummary.createSpan({ text: `💭 ${t("workflow.generation.thinking")}` });
    this.thinkingContainerEl = this.thinkingSectionEl.createDiv({ cls: "gemini-helper-thinking-content" });
    this.addCopyButton(thinkingSummary, () => this.thinkingText);

    // Review section (hidden by default, shown after generation)
    this.reviewSectionEl = contentEl.createDiv({ cls: "workflow-generation-review-section is-hidden" });
    const reviewHeader = this.reviewSectionEl.createDiv({ cls: "workflow-generation-section-header" });
    reviewHeader.createEl("h3", { text: t("workflow.generation.reviewing") });
    this.reviewContainerEl = this.reviewSectionEl.createDiv({ cls: "workflow-generation-review" });
    this.addCopyButton(reviewHeader, () => this.reviewText);

    // Status indicator
    this.statusEl = contentEl.createDiv({ cls: "workflow-generation-status" });
    this.updateStatusText();

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

  private renderPhaseIndicator(): void {
    if (!this.phaseIndicatorEl) return;
    this.phaseIndicatorEl.empty();

    const phases: { key: GenerationPhase; label: string }[] = [
      ...(this.planningEnabled ? [{ key: "planning" as GenerationPhase, label: t("workflow.generation.phasePlan") }] : []),
      { key: "generating", label: t("workflow.generation.phaseGenerate") },
      { key: "reviewing", label: t("workflow.generation.phaseReview") },
    ];

    for (const phase of phases) {
      const stepEl = this.phaseIndicatorEl.createSpan({ cls: "workflow-generation-phase-step" });
      if (phase.key === this.currentPhase) {
        stepEl.addClass("is-active");
      } else if (this.getPhaseOrder(phase.key) < this.getPhaseOrder(this.currentPhase)) {
        stepEl.addClass("is-completed");
      }
      stepEl.textContent = phase.label;
    }
  }

  private getPhaseOrder(phase: GenerationPhase): number {
    const order: Record<GenerationPhase, number> = { planning: 0, generating: 1, reviewing: 2 };
    return order[phase];
  }

  /**
   * Set the current generation phase and update UI
   */
  setPhase(phase: GenerationPhase): void {
    this.currentPhase = phase;
    this.renderPhaseIndicator();
    this.updateStatusText();
    // Record phase on contentEl so CSS can style sections based on active phase
    this.contentEl.dataset.phase = phase;

    // Show/hide sections based on phase
    if (phase === "planning") {
      // Thinking is a <details> — keep closed during planning
      if (this.thinkingSectionEl) {
        (this.thinkingSectionEl as HTMLDetailsElement).open = false;
      }
      // Expand plan section
      if (this.planSectionEl) {
        this.planSectionEl.removeClass("is-collapsed");
      }
    } else if (phase === "generating") {
      // Collapse plan section, open thinking
      if (this.planSectionEl) {
        this.planSectionEl.addClass("is-collapsed");
      }
      if (this.thinkingSectionEl) {
        (this.thinkingSectionEl as HTMLDetailsElement).open = true;
      }
    } else if (phase === "reviewing") {
      // Show review section, close thinking
      if (this.reviewSectionEl) {
        this.reviewSectionEl.removeClass("is-hidden");
      }
      if (this.thinkingSectionEl) {
        (this.thinkingSectionEl as HTMLDetailsElement).open = false;
      }
    }
  }

  private updateStatusText(): void {
    if (!this.statusEl) return;
    const loadingDots = this.statusEl.querySelector(".workflow-generation-loading-dots");
    const statusKey = `workflow.generation.${this.currentPhase}` as const;
    this.statusEl.textContent = t(statusKey);
    if (loadingDots) {
      this.statusEl.appendChild(loadingDots);
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

  /**
   * Append thinking content to the thinking container
   */
  appendThinking(content: string): void {
    this.thinkingText += content;
    if (this.thinkingContainerEl) {
      const span = document.createElement("span");
      span.textContent = content;
      this.thinkingContainerEl.appendChild(span);
      // Auto-scroll to bottom
      this.thinkingContainerEl.scrollTop = this.thinkingContainerEl.scrollHeight;
    }
  }

  /**
   * Add a visual separator in the thinking container to mark a phase boundary
   */
  appendThinkingSeparator(phaseLabel: string): void {
    if (this.thinkingContainerEl) {
      const sep = document.createElement("div");
      sep.className = "workflow-generation-thinking-separator";
      sep.textContent = `── ${phaseLabel} ──`;
      this.thinkingContainerEl.appendChild(sep);
      this.thinkingContainerEl.scrollTop = this.thinkingContainerEl.scrollHeight;
    }
  }

  /**
   * Append plan content to the plan container
   */
  appendPlan(content: string): void {
    this.planText += content;
    if (this.planContainerEl) {
      const span = document.createElement("span");
      span.textContent = content;
      this.planContainerEl.appendChild(span);
      this.planContainerEl.scrollTop = this.planContainerEl.scrollHeight;
    }
  }

  /**
   * Append review content to the review container
   */
  appendReview(content: string): void {
    this.reviewText += content;
    if (this.reviewContainerEl) {
      const span = document.createElement("span");
      span.textContent = content;
      this.reviewContainerEl.appendChild(span);
      this.reviewContainerEl.scrollTop = this.reviewContainerEl.scrollHeight;
    }
  }

  getThinkingText(): string {
    return this.thinkingText;
  }

  private addCopyButton(container: HTMLElement, getText: () => string): void {
    const btn = container.createEl("button", {
      cls: "workflow-generation-copy-btn",
      text: t("message.copy"),
    });
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // Don't toggle <details> when copying from summary
      e.preventDefault();
      const text = getText();
      if (!text) return;
      void navigator.clipboard.writeText(text).then(() => {
        const original = btn.textContent;
        btn.textContent = "✓";
        setTimeout(() => { btn.textContent = original; }, 1200);
      });
    });
  }

  getReviewText(): string {
    return this.reviewText;
  }

  /**
   * Put the modal into a "refining" visual state: open the thinking details,
   * show loading dots, and update the status message. Used when review finds
   * issues and auto-refinement kicks in, so the user can see that work is
   * still in progress (not just a dead-end with a Cancel button).
   */
  beginRefining(label: string): void {
    // Open the thinking details so the user can see streaming output
    if (this.thinkingSectionEl) {
      (this.thinkingSectionEl as HTMLDetailsElement).open = true;
    }
    // Ensure the status element has loading dots again (setComplete may have removed them earlier)
    if (this.statusEl) {
      this.statusEl.empty();
      this.statusEl.appendText(label);
      const loadingDotsEl = this.statusEl.createSpan({ cls: "workflow-generation-loading-dots" });
      loadingDotsEl.createSpan({ cls: "dot" });
      loadingDotsEl.createSpan({ cls: "dot" });
      loadingDotsEl.createSpan({ cls: "dot" });
      this.statusEl.addClass("workflow-generation-status-active");
    }
  }

  /**
   * Replace review container contents with rendered Markdown (formatted review).
   * Called after review parsing completes.
   */
  renderReviewAsMarkdown(markdown: string): void {
    if (!this.reviewContainerEl) return;

    if (!this.markdownComponent) {
      this.markdownComponent = new Component();
      this.markdownComponent.load();
    }

    this.reviewContainerEl.empty();
    this.reviewContainerEl.addClass("workflow-generation-plan-rendered");
    void MarkdownRenderer.render(
      this.app,
      markdown,
      this.reviewContainerEl,
      "/",
      this.markdownComponent
    );
  }

  /**
   * Re-render the accumulated plan text as Markdown for readability.
   * Called when streaming is complete.
   */
  private renderPlanAsMarkdown(): void {
    if (!this.planContainerEl || !this.planText) return;

    // Dispose previous markdown component if any
    if (this.markdownComponent) {
      this.markdownComponent.unload();
    }
    this.markdownComponent = new Component();
    this.markdownComponent.load();

    this.planContainerEl.empty();
    this.planContainerEl.addClass("workflow-generation-plan-rendered");
    void MarkdownRenderer.render(
      this.app,
      this.planText,
      this.planContainerEl,
      "/",
      this.markdownComponent
    );
  }

  /**
   * Show plan confirmation UI: hide loading, show OK / Re-plan / Cancel buttons.
   * Returns a Promise that resolves when the user makes a choice.
   */
  showPlanConfirmation(): Promise<PlanConfirmResult> {
    return new Promise((resolve) => {
      // Re-render plan as markdown now that streaming is complete
      this.renderPlanAsMarkdown();

      // Hide loading dots and cancel button
      const loadingDots = this.statusEl?.querySelector(".workflow-generation-loading-dots");
      if (loadingDots) loadingDots.remove();
      if (this.statusEl) {
        this.statusEl.textContent = t("workflow.generation.planComplete");
      }
      if (this.cancelBtn) {
        this.cancelBtn.addClass("is-hidden");
      }

      // Insert confirmation UI after the plan section
      const { contentEl } = this;
      const confirmContainer = contentEl.createDiv({ cls: "workflow-generation-plan-confirm" });

      // Feedback textarea (hidden by default, shown on Re-plan)
      const feedbackContainer = confirmContainer.createDiv({ cls: "workflow-generation-plan-feedback is-hidden" });
      const feedbackEl = feedbackContainer.createEl("textarea", {
        cls: "workflow-generation-plan-feedback-input",
        attr: {
          placeholder: t("workflow.generation.replanPlaceholder"),
          rows: "3",
        },
      });

      // Buttons
      const btnContainer = confirmContainer.createDiv({ cls: "workflow-generation-plan-confirm-buttons" });

      const cancelBtn = btnContainer.createEl("button", {
        text: t("common.cancel"),
      });

      const replanBtn = btnContainer.createEl("button", {
        text: t("workflow.generation.replan"),
        cls: "mod-warning",
      });

      const okBtn = btnContainer.createEl("button", {
        text: "OK",
        cls: "mod-cta",
      });

      const cleanup = () => {
        confirmContainer.remove();
      };

      cancelBtn.addEventListener("click", () => {
        cleanup();
        resolve({ action: "cancel" });
      });

      replanBtn.addEventListener("click", () => {
        if (feedbackContainer.hasClass("is-hidden")) {
          // First click: show the feedback textarea, change button to submit label
          feedbackContainer.removeClass("is-hidden");
          replanBtn.textContent = t("message.requestChanges");
          feedbackEl.focus();
        } else {
          // Second click: submit the feedback
          const feedback = feedbackEl.value.trim();
          if (!feedback) {
            feedbackEl.focus();
            return;
          }
          cleanup();
          resolve({ action: "replan", feedback });
        }
      });

      okBtn.addEventListener("click", () => {
        cleanup();
        resolve({ action: "ok" });
      });
    });
  }

  /**
   * Reset the modal for a new planning round (after re-plan).
   */
  resetForReplan(): void {
    // Dispose markdown component and reset plan text
    if (this.markdownComponent) {
      this.markdownComponent.unload();
      this.markdownComponent = null;
    }
    this.planText = "";
    // Clear plan content
    if (this.planContainerEl) {
      this.planContainerEl.empty();
      this.planContainerEl.removeClass("workflow-generation-plan-rendered");
    }
    // Restore loading dots
    if (this.statusEl) {
      this.updateStatusText();
      const loadingDotsEl = this.statusEl.createSpan({ cls: "workflow-generation-loading-dots" });
      loadingDotsEl.createSpan({ cls: "dot" });
      loadingDotsEl.createSpan({ cls: "dot" });
      loadingDotsEl.createSpan({ cls: "dot" });
    }
    // Restore cancel button
    if (this.cancelBtn) {
      this.cancelBtn.removeClass("is-hidden");
    }
    // Un-collapse plan section
    if (this.planSectionEl) {
      this.planSectionEl.removeClass("is-collapsed");
    }
  }

  /**
   * Show review confirmation UI: three buttons (Cancel / Refine / OK) so the user
   * can decide whether to accept the generated output as-is or trigger another
   * refinement pass. Returns a Promise resolved by the clicked button.
   */
  showReviewConfirmation(): Promise<ReviewConfirmResult> {
    return new Promise((resolve) => {
      // Remove loading dots, clear active-status emphasis, set completion label
      const loadingDots = this.statusEl?.querySelector(".workflow-generation-loading-dots");
      if (loadingDots) loadingDots.remove();
      if (this.statusEl) {
        this.statusEl.textContent = t("workflow.generation.reviewComplete");
        this.statusEl.removeClass("workflow-generation-status-active");
      }
      if (this.cancelBtn) {
        this.cancelBtn.addClass("is-hidden");
      }

      const { contentEl } = this;
      const confirmContainer = contentEl.createDiv({
        cls: "workflow-generation-plan-confirm workflow-generation-review-confirm",
      });
      const btnContainer = confirmContainer.createDiv({ cls: "workflow-generation-plan-confirm-buttons" });

      const cancelBtn = btnContainer.createEl("button", { text: t("common.cancel") });
      const refineBtn = btnContainer.createEl("button", {
        text: t("workflow.generation.refineBtn"),
        cls: "mod-warning",
      });
      const okBtn = btnContainer.createEl("button", {
        text: "OK",
        cls: "mod-cta",
      });

      const cleanup = () => {
        confirmContainer.remove();
      };

      cancelBtn.addEventListener("click", () => { cleanup(); resolve({ action: "cancel" }); });
      refineBtn.addEventListener("click", () => { cleanup(); resolve({ action: "refine" }); });
      okBtn.addEventListener("click", () => { cleanup(); resolve({ action: "ok" }); });
    });
  }

  /**
   * Reset the review container for a fresh review iteration (when a refinement
   * round re-runs the review). Clears prior content, restores loading dots and
   * cancel button so the streaming UI is consistent with the first review.
   */
  resetReviewForIteration(): void {
    this.reviewText = "";
    if (this.reviewContainerEl) {
      this.reviewContainerEl.empty();
      this.reviewContainerEl.removeClass("workflow-generation-plan-rendered");
    }
    // Remove any lingering review-confirm UI (belt-and-braces — should already be cleaned up)
    this.contentEl.querySelectorAll(".workflow-generation-review-confirm").forEach(el => el.remove());
    // Restore loading dots and label
    if (this.statusEl) {
      this.statusEl.empty();
      this.statusEl.appendText(t("workflow.generation.reviewing"));
      const loadingDotsEl = this.statusEl.createSpan({ cls: "workflow-generation-loading-dots" });
      loadingDotsEl.createSpan({ cls: "dot" });
      loadingDotsEl.createSpan({ cls: "dot" });
      loadingDotsEl.createSpan({ cls: "dot" });
      this.statusEl.removeClass("workflow-generation-status-active");
    }
    // Restore main Cancel button
    if (this.cancelBtn) {
      this.cancelBtn.removeClass("is-hidden");
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
   * Get usage info formatted as a string for Notice display.
   * Returns null if no usage data is available.
   */
  static formatUsageNotice(usage?: StreamChunkUsage, elapsedMs?: number): string | null {
    if (!usage && elapsedMs === undefined) return null;
    const parts: string[] = [];
    if (elapsedMs !== undefined) {
      parts.push(elapsedMs < 1000 ? `${elapsedMs}ms` : `${(elapsedMs / 1000).toFixed(1)}s`);
    }
    if (usage?.inputTokens !== undefined && usage?.outputTokens !== undefined) {
      let tokens = `${usage.inputTokens.toLocaleString()} → ${usage.outputTokens.toLocaleString()} ${t("message.tokens")}`;
      if (usage.thinkingTokens) {
        tokens += ` (${t("message.thinkingTokens")} ${usage.thinkingTokens.toLocaleString()})`;
      }
      parts.push(tokens);
    }
    if (usage?.totalCost !== undefined) {
      parts.push(`$${usage.totalCost.toFixed(4)}`);
    }
    return parts.length > 0 ? parts.join(" | ") : null;
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
    if (this.markdownComponent) {
      this.markdownComponent.unload();
      this.markdownComponent = null;
    }
    const { contentEl } = this;
    contentEl.empty();
  }
}
