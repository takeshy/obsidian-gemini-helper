import { App, Modal } from "obsidian";
import { ExecutionRecord } from "src/workflow/types";
import { ExecutionHistoryManager, formatDuration, EncryptionConfig } from "src/workflow/history";
import { openHistoryCanvas } from "src/workflow/historyCanvas";
import { cryptoCache } from "src/core/cryptoCache";
import { t } from "src/i18n";

export class HistoryModal extends Modal {
  private workflowPath: string;
  private workspaceFolder: string;
  private encryptionConfig: EncryptionConfig | undefined;
  private records: ExecutionRecord[] = [];
  private selectedRecord: ExecutionRecord | null = null;
  private selectedRecordEncrypted: boolean = false;
  private listEl: HTMLElement | null = null;
  private detailEl: HTMLElement | null = null;

  constructor(app: App, workflowPath: string, workspaceFolder: string, encryptionConfig?: EncryptionConfig) {
    super(app);
    this.workflowPath = workflowPath;
    this.workspaceFolder = workspaceFolder;
    this.encryptionConfig = encryptionConfig;
  }

  async onOpen(): Promise<void> {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("workflow-history-modal");
    modalEl.addClass("gemini-helper-modal-resizable");

    // Drag handle with title
    const dragHandle = contentEl.createDiv({ cls: "modal-drag-handle" });
    dragHandle.createEl("h2", { text: t("workflowModal.executionHistory") });
    this.setupDragHandle(dragHandle, modalEl);

    const container = contentEl.createDiv({ cls: "workflow-history-container" });

    // List panel
    const listPanel = container.createDiv({ cls: "workflow-history-list-panel" });
    listPanel.createEl("h3", { text: t("workflowModal.runs") });
    this.listEl = listPanel.createDiv({ cls: "workflow-history-list" });

    // Detail panel
    const detailPanel = container.createDiv({ cls: "workflow-history-detail-panel" });
    detailPanel.createEl("h3", { text: t("workflowModal.details") });
    this.detailEl = detailPanel.createDiv({ cls: "workflow-history-detail" });

    await this.loadHistory();
    this.renderList();
    this.renderDetail();
  }

  private async loadHistory(): Promise<void> {
    const historyManager = new ExecutionHistoryManager(this.app, this.workspaceFolder, this.encryptionConfig);
    this.records = await historyManager.loadRecords(this.workflowPath);
  }

  private getHistoryManager(): ExecutionHistoryManager {
    return new ExecutionHistoryManager(this.app, this.workspaceFolder, this.encryptionConfig);
  }

  private renderList(): void {
    if (!this.listEl) return;
    this.listEl.empty();

    if (this.records.length === 0) {
      this.listEl.createDiv({
        cls: "workflow-history-empty",
        text: t("workflowModal.noExecutionHistory"),
      });
      return;
    }

    for (const record of this.records) {
      const item = this.listEl.createDiv({ cls: "workflow-history-item" });
      if (this.selectedRecord?.id === record.id) {
        item.addClass("is-selected");
      }

      const statusDot = item.createSpan({ cls: "workflow-history-status" });
      statusDot.addClass(`workflow-status-${record.status}`);

      const timeEl = item.createDiv({ cls: "workflow-history-time" });
      timeEl.textContent = new Date(record.startTime).toLocaleString();

      const durationEl = item.createDiv({ cls: "workflow-history-duration" });
      durationEl.textContent = formatDuration(record.startTime, record.endTime);

      const statusEl = item.createDiv({ cls: "workflow-history-status-text" });
      statusEl.textContent = record.status;

      item.addEventListener("click", () => {
        this.selectedRecord = record;
        // Check if this record is encrypted
        void (async () => {
          const historyManager = this.getHistoryManager();
          this.selectedRecordEncrypted = await historyManager.isRecordEncrypted(record.id);
          this.renderList();
          this.renderDetail();
        })();
      });
    }
  }

  private renderDetail(): void {
    if (!this.detailEl) return;
    this.detailEl.empty();

    if (!this.selectedRecord) {
      this.detailEl.createDiv({
        cls: "workflow-history-empty",
        text: t("workflowModal.selectRunToView"),
      });
      return;
    }

    const record = this.selectedRecord;

    // Header info
    const header = this.detailEl.createDiv({ cls: "workflow-detail-header" });
    header.createDiv({ cls: "workflow-detail-row", text: t("workflowModal.status", { status: record.status }) });
    header.createDiv({ cls: "workflow-detail-row", text: t("workflowModal.started", { time: new Date(record.startTime).toLocaleString() }) });
    if (record.endTime) {
      header.createDiv({ cls: "workflow-detail-row", text: t("workflowModal.duration", { duration: formatDuration(record.startTime, record.endTime) }) });
    }

    // Steps
    const stepsContainer = this.detailEl.createDiv({ cls: "workflow-detail-steps" });

    for (const step of record.steps) {
      const stepEl = stepsContainer.createDiv({ cls: "workflow-detail-step" });
      stepEl.addClass(`workflow-step-${step.status}`);

      const stepHeader = stepEl.createDiv({ cls: "workflow-step-header" });
      stepHeader.createSpan({ cls: "workflow-step-type", text: `[${step.nodeType}] ${step.nodeId}` });

      const statusBadge = stepHeader.createSpan({ cls: "workflow-step-status" });
      statusBadge.addClass(`workflow-step-status-${step.status}`);
      statusBadge.textContent = step.status;

      if (step.timestamp) {
        const timeEl = stepHeader.createSpan({ cls: "workflow-step-time" });
        timeEl.textContent = new Date(step.timestamp).toLocaleTimeString();
      }

      if (step.input !== undefined) {
        const inputSection = stepEl.createDiv({ cls: "workflow-step-section" });
        inputSection.createEl("strong", { text: t("workflowModal.input") });
        const inputPre = inputSection.createEl("pre", { cls: "workflow-step-pre-scrollable" });
        inputPre.textContent = this.formatValue(step.input);
      }

      if (step.output !== undefined) {
        const outputSection = stepEl.createDiv({ cls: "workflow-step-section" });
        outputSection.createEl("strong", { text: t("workflowModal.output") });
        const outputPre = outputSection.createEl("pre", { cls: "workflow-step-pre-scrollable" });
        outputPre.textContent = this.formatValue(step.output);
      }

      if (step.error) {
        const errorEl = stepEl.createDiv({ cls: "workflow-step-error" });
        errorEl.textContent = t("workflowModal.error", { error: step.error });
      }
    }

    // Actions
    const actions = this.detailEl.createDiv({ cls: "workflow-detail-actions" });

    // Canvas button - disabled if record is encrypted and not decrypted
    const canDecrypt = cryptoCache.hasPassword();
    const canOpenCanvas = !this.selectedRecordEncrypted || canDecrypt;

    const canvasBtn = actions.createEl("button", { text: t("workflowModal.openCanvasView") });
    if (!canOpenCanvas) {
      canvasBtn.addClass("workflow-btn-disabled");
      canvasBtn.setAttribute("disabled", "true");
      canvasBtn.setAttribute("title", t("workflowModal.canvasNeedsDecrypt"));
    }
    canvasBtn.addEventListener("click", () => {
      if (!canOpenCanvas) return;
      void (async () => {
        await openHistoryCanvas(this.app, record, this.workspaceFolder);
        this.close();
      })();
    });

    const deleteBtn = actions.createEl("button", {
      cls: "workflow-detail-delete-btn",
      text: t("workflowModal.delete"),
    });
    deleteBtn.addEventListener("click", () => {
      void (async () => {
        const historyManager = this.getHistoryManager();
        await historyManager.deleteRecord(record.id);
        this.records = this.records.filter((r) => r.id !== record.id);
        this.selectedRecord = null;
        this.selectedRecordEncrypted = false;
        this.renderList();
        this.renderDetail();
      })();
    });
  }

  private formatValue(value: unknown): string {
    if (value === undefined || value === null) {
      return t("workflowModal.empty");
    }
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return t("workflowModal.circularReference");
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
