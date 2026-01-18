import { App, Modal } from "obsidian";
import type { ExecutionRecord, ExecutionStep, StepStatus, WorkflowNodeType } from "src/workflow/types";
import { t } from "src/i18n";

export interface ExecutionHistorySelectResult {
  selectedSteps: ExecutionStep[];
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
});

function formatStatus(status: StepStatus): string {
  switch (status) {
    case "success":
      return t("workflow.execution.completed");
    case "error":
      return t("workflow.execution.failed");
    case "skipped":
      return t("workflow.historySelect.skipped");
    default:
      return status;
  }
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString();
}

function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

/**
 * Modal for selecting execution history steps to include in AI context
 */
export class ExecutionHistorySelectModal extends Modal {
  private records: ExecutionRecord[];
  private selectedRecord: ExecutionRecord | null = null;
  private selectedStepIndices: Set<number> = new Set();
  private resolvePromise: (result: ExecutionHistorySelectResult | null) => void;

  private runsListEl: HTMLElement | null = null;
  private stepsListEl: HTMLElement | null = null;

  constructor(
    app: App,
    records: ExecutionRecord[],
    resolvePromise: (result: ExecutionHistorySelectResult | null) => void
  ) {
    super(app);
    this.records = records;
    this.resolvePromise = resolvePromise;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("execution-history-select-modal");
    modalEl.addClass("gemini-helper-modal-resizable");

    // Title
    const header = contentEl.createDiv({ cls: "modal-drag-handle" });
    header.createEl("h2", { text: t("workflow.historySelect.title") });
    this.setupDragHandle(header, modalEl);

    // Main content area with two columns
    const mainContent = contentEl.createDiv({ cls: "execution-history-select-content" });

    // Left column: Execution runs list
    const runsColumn = mainContent.createDiv({ cls: "execution-history-runs-column" });
    runsColumn.createEl("h3", { text: t("workflow.historySelect.recentExecutions") });
    this.runsListEl = runsColumn.createDiv({ cls: "execution-history-runs-list" });
    this.renderRunsList();

    // Right column: Steps for selected run
    const stepsColumn = mainContent.createDiv({ cls: "execution-history-steps-column" });
    stepsColumn.createEl("h3", { text: t("workflow.historySelect.steps") });
    this.stepsListEl = stepsColumn.createDiv({ cls: "execution-history-steps-list" });
    this.renderStepsList();

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "execution-history-select-buttons" });

    const cancelBtn = buttonContainer.createEl("button", {
      text: t("common.cancel"),
    });
    cancelBtn.addEventListener("click", () => {
      this.resolvePromise(null);
      this.close();
    });

    const includeAllBtn = buttonContainer.createEl("button", {
      text: t("workflow.historySelect.includeAll"),
    });
    includeAllBtn.addEventListener("click", () => {
      if (this.selectedRecord) {
        this.selectedStepIndices.clear();
        this.selectedRecord.steps.forEach((_, idx) => {
          this.selectedStepIndices.add(idx);
        });
        this.renderStepsList();
      }
    });

    const includeSelectedBtn = buttonContainer.createEl("button", {
      text: t("workflow.historySelect.includeSelected"),
      cls: "mod-cta",
    });
    includeSelectedBtn.addEventListener("click", () => {
      if (this.selectedRecord && this.selectedStepIndices.size > 0) {
        const selectedSteps = Array.from(this.selectedStepIndices)
          .sort((a, b) => a - b)
          .map(idx => this.selectedRecord!.steps[idx]);
        this.resolvePromise({ selectedSteps });
        this.close();
      } else {
        // No selection - close without steps
        this.resolvePromise(null);
        this.close();
      }
    });
  }

  private renderRunsList(): void {
    if (!this.runsListEl) return;
    this.runsListEl.empty();

    if (this.records.length === 0) {
      this.runsListEl.createDiv({
        cls: "execution-history-empty",
        text: t("workflowModal.noExecutionHistory"),
      });
      return;
    }

    for (const record of this.records) {
      const runItem = this.runsListEl.createDiv({
        cls: `execution-history-run-item ${this.selectedRecord?.id === record.id ? "is-selected" : ""}`,
      });

      // Status indicator
      runItem.createSpan({
        cls: `execution-history-status-indicator status-${record.status}`,
      });

      // Time and status
      const infoEl = runItem.createDiv({ cls: "execution-history-run-info" });
      infoEl.createDiv({
        cls: "execution-history-run-time",
        text: formatTime(record.startTime),
      });
      infoEl.createDiv({
        cls: `execution-history-run-status status-${record.status}`,
        text: this.formatRecordStatus(record.status),
      });

      runItem.addEventListener("click", () => {
        this.selectedRecord = record;
        this.selectedStepIndices.clear();
        // Pre-select error steps by default
        record.steps.forEach((step, idx) => {
          if (step.status === "error") {
            this.selectedStepIndices.add(idx);
          }
        });
        this.renderRunsList();
        this.renderStepsList();
      });
    }
  }

  private formatRecordStatus(status: string): string {
    switch (status) {
      case "running":
        return t("workflow.execution.running");
      case "completed":
        return t("workflow.execution.completed");
      case "error":
        return t("workflow.execution.failed");
      case "cancelled":
        return t("workflow.execution.stopped");
      default:
        return status;
    }
  }

  private renderStepsList(): void {
    if (!this.stepsListEl) return;
    this.stepsListEl.empty();

    if (!this.selectedRecord) {
      this.stepsListEl.createDiv({
        cls: "execution-history-empty",
        text: t("workflow.historySelect.selectRunToView"),
      });
      return;
    }

    const nodeTypeLabels = getNodeTypeLabels();

    for (let idx = 0; idx < this.selectedRecord.steps.length; idx++) {
      const step = this.selectedRecord.steps[idx];
      const stepItem = this.stepsListEl.createDiv({
        cls: `execution-history-step-item ${this.selectedStepIndices.has(idx) ? "is-selected" : ""}`,
      });

      // Checkbox
      const checkbox = stepItem.createEl("input", {
        type: "checkbox",
        cls: "execution-history-step-checkbox",
      });
      checkbox.checked = this.selectedStepIndices.has(idx);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          this.selectedStepIndices.add(idx);
        } else {
          this.selectedStepIndices.delete(idx);
        }
        this.renderStepsList();
      });

      // Step info
      const stepInfo = stepItem.createDiv({ cls: "execution-history-step-info" });

      // Header: type and id
      const headerEl = stepInfo.createDiv({ cls: "execution-history-step-header" });
      headerEl.createSpan({
        cls: "execution-history-step-type",
        text: `[${nodeTypeLabels[step.nodeType] || step.nodeType}]`,
      });
      headerEl.createSpan({
        cls: "execution-history-step-id",
        text: step.nodeId,
      });
      headerEl.createSpan({
        cls: `execution-history-step-status status-${step.status}`,
        text: formatStatus(step.status),
      });

      // Input preview (if available)
      if (step.input && Object.keys(step.input).length > 0) {
        const inputEl = stepInfo.createDiv({ cls: "execution-history-step-preview" });
        inputEl.createSpan({ cls: "label", text: t("workflowModal.input") + " " });
        inputEl.createSpan({
          text: truncateText(JSON.stringify(step.input)),
        });
      }

      // Output or error preview
      if (step.status === "error" && step.error) {
        const errorEl = stepInfo.createDiv({ cls: "execution-history-step-preview error" });
        errorEl.createSpan({ cls: "label", text: t("workflow.historySelect.error") + " " });
        errorEl.createSpan({ text: truncateText(step.error) });
      } else if (step.output !== undefined) {
        const outputEl = stepInfo.createDiv({ cls: "execution-history-step-preview" });
        outputEl.createSpan({ cls: "label", text: t("workflowModal.output") + " " });
        const outputText = typeof step.output === "string"
          ? step.output
          : JSON.stringify(step.output);
        outputEl.createSpan({ text: truncateText(outputText) });
      }

      // Make the whole row clickable for toggling
      stepItem.addEventListener("click", (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
          if (checkbox.checked) {
            this.selectedStepIndices.add(idx);
          } else {
            this.selectedStepIndices.delete(idx);
          }
          this.renderStepsList();
        }
      });
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
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Helper function to show the execution history selection modal
 */
export function showExecutionHistorySelect(
  app: App,
  records: ExecutionRecord[]
): Promise<ExecutionHistorySelectResult | null> {
  return new Promise((resolve) => {
    const modal = new ExecutionHistorySelectModal(app, records, resolve);
    modal.open();
  });
}
