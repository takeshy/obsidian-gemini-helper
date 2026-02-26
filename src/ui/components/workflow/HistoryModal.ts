import { App, Modal, Notice } from "obsidian";
import { ExecutionRecord } from "src/workflow/types";
import { ExecutionHistoryManager, formatDuration, EncryptionConfig } from "src/workflow/history";
import { openHistoryCanvas } from "src/workflow/historyCanvas";
import { cryptoCache } from "src/core/cryptoCache";
import { decryptPrivateKey } from "src/core/crypto";
import { showMcpApp } from "./McpAppModal";
import { t } from "src/i18n";
import { globalEventEmitter } from "src/utils/EventEmitter";

export class HistoryModal extends Modal {
  private workflowPath: string;
  private workspaceFolder: string;
  private encryptionConfig: EncryptionConfig | undefined;
  private onRetryFromError?: (workflowPath: string, workflowName: string | undefined, errorNodeId: string, variablesSnapshot: Record<string, string | number>) => void;
  private records: ExecutionRecord[] = [];
  private selectedRecord: ExecutionRecord | null = null;
  private selectedRecordEncrypted: boolean = false;
  private listEl: HTMLElement | null = null;
  private detailEl: HTMLElement | null = null;
  private historySavedHandler: ((path: string) => void) | null = null;
  private checkedRecordIds: Set<string> = new Set();
  private listHeaderEl: HTMLElement | null = null;

  constructor(
    app: App,
    workflowPath: string,
    workspaceFolder: string,
    encryptionConfig?: EncryptionConfig,
    onRetryFromError?: (workflowPath: string, workflowName: string | undefined, errorNodeId: string, variablesSnapshot: Record<string, string | number>) => void,
  ) {
    super(app);
    this.workflowPath = workflowPath;
    this.workspaceFolder = workspaceFolder;
    this.encryptionConfig = encryptionConfig;
    this.onRetryFromError = onRetryFromError;
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

    // Listen for history saved events to refresh the list
    this.historySavedHandler = (path: string) => {
      if (path === this.workflowPath) {
        void this.refreshHistory();
      }
    };
    globalEventEmitter.on("execution-history-saved", this.historySavedHandler);

    // Check if encryption is enabled but password not cached
    const needsPassword = this.encryptionConfig?.enabled && !cryptoCache.hasPassword();

    if (needsPassword) {
      this.renderPasswordPrompt(contentEl);
      return;
    }

    this.renderHistoryUI(contentEl);
    await this.loadHistory();
    this.renderList();
    this.renderDetail();
  }

  private async refreshHistory(): Promise<void> {
    await this.loadHistory();
    this.renderList();
  }

  private renderPasswordPrompt(contentEl: HTMLElement): void {
    const container = contentEl.createDiv({ cls: "workflow-history-password-prompt" });

    container.createEl("p", {
      text: t("workflowModal.encryptedHistoryNeedsPassword"),
      cls: "workflow-history-password-message"
    });

    const inputContainer = container.createDiv({ cls: "workflow-history-password-input" });
    const input = inputContainer.createEl("input", {
      type: "password",
      placeholder: t("crypt.passwordPlaceholder"),
    });

    const unlockBtn = inputContainer.createEl("button", {
      text: t("crypt.unlock"),
      cls: "mod-cta",
    });

    const handleUnlock = async () => {
      const password = input.value;
      if (!password) return;

      try {
        // Verify password by trying to decrypt the private key
        if (this.encryptionConfig) {
          await decryptPrivateKey(
            this.encryptionConfig.encryptedPrivateKey,
            this.encryptionConfig.salt,
            password
          );
          // Cache the password
          cryptoCache.setPassword(password);
          // Re-render with history
          contentEl.empty();
          const dragHandle = contentEl.createDiv({ cls: "modal-drag-handle" });
          dragHandle.createEl("h2", { text: t("workflowModal.executionHistory") });
          this.setupDragHandle(dragHandle, this.modalEl);
          this.renderHistoryUI(contentEl);
          await this.loadHistory();
          this.renderList();
          this.renderDetail();
        }
      } catch {
        new Notice(t("crypt.wrongPassword"));
      }
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        void handleUnlock();
      }
    });
    unlockBtn.addEventListener("click", () => void handleUnlock());

    // Focus input
    setTimeout(() => input.focus(), 50);
  }

  private renderHistoryUI(contentEl: HTMLElement): void {
    const container = contentEl.createDiv({ cls: "workflow-history-container" });

    // List panel
    const listPanel = container.createDiv({ cls: "workflow-history-list-panel" });

    // List header with title and controls
    this.listHeaderEl = listPanel.createDiv({ cls: "workflow-history-list-header" });
    this.renderListHeader();

    this.listEl = listPanel.createDiv({ cls: "workflow-history-list" });

    // Detail panel
    const detailPanel = container.createDiv({ cls: "workflow-history-detail-panel" });
    detailPanel.createEl("h3", { text: t("workflowModal.details") });
    this.detailEl = detailPanel.createDiv({ cls: "workflow-history-detail" });
  }

  private renderListHeader(): void {
    if (!this.listHeaderEl) return;
    this.listHeaderEl.empty();

    const titleRow = this.listHeaderEl.createDiv({ cls: "workflow-history-title-row" });
    titleRow.createEl("h3", { text: t("workflowModal.runs") });

    // Only show controls if there are records
    if (this.records.length > 0) {
      const controls = this.listHeaderEl.createDiv({ cls: "workflow-history-controls" });

      // Select all checkbox
      const selectAllLabel = controls.createEl("label", { cls: "workflow-history-select-all" });
      const selectAllCheckbox = selectAllLabel.createEl("input", { type: "checkbox" });
      selectAllCheckbox.checked = this.checkedRecordIds.size === this.records.length && this.records.length > 0;
      selectAllCheckbox.indeterminate = this.checkedRecordIds.size > 0 && this.checkedRecordIds.size < this.records.length;
      selectAllLabel.createSpan({ text: t("workflowModal.selectAll") });

      selectAllCheckbox.addEventListener("change", () => {
        if (selectAllCheckbox.checked) {
          // Select all
          this.records.forEach(r => this.checkedRecordIds.add(r.id));
        } else {
          // Deselect all
          this.checkedRecordIds.clear();
        }
        this.renderListHeader();
        this.renderList();
      });

      // Delete selected button
      if (this.checkedRecordIds.size > 0) {
        const deleteBtn = controls.createEl("button", {
          text: t("workflowModal.deleteSelected", { count: this.checkedRecordIds.size }),
          cls: "workflow-history-delete-selected-btn",
        });
        deleteBtn.addEventListener("click", () => {
          void this.deleteSelectedRecords();
        });
      }
    }
  }

  private async deleteSelectedRecords(): Promise<void> {
    if (this.checkedRecordIds.size === 0) return;

    const historyManager = this.getHistoryManager();

    // Delete all checked records
    for (const id of this.checkedRecordIds) {
      await historyManager.deleteRecord(id);
    }

    // Update records list
    this.records = this.records.filter(r => !this.checkedRecordIds.has(r.id));

    // Clear selection if selected record was deleted
    if (this.selectedRecord && this.checkedRecordIds.has(this.selectedRecord.id)) {
      this.selectedRecord = null;
      this.selectedRecordEncrypted = false;
    }

    // Clear checked IDs
    this.checkedRecordIds.clear();

    // Re-render
    this.renderListHeader();
    this.renderList();
    this.renderDetail();

    new Notice(t("workflowModal.deletedRecords"));
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

      // Checkbox for selection
      const checkbox = item.createEl("input", { type: "checkbox", cls: "workflow-history-checkbox" });
      checkbox.checked = this.checkedRecordIds.has(record.id);
      checkbox.addEventListener("click", (e) => {
        e.stopPropagation();
      });
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          this.checkedRecordIds.add(record.id);
        } else {
          this.checkedRecordIds.delete(record.id);
        }
        this.renderListHeader();
      });

      // Content wrapper
      const content = item.createDiv({ cls: "workflow-history-item-content" });

      const statusDot = content.createSpan({ cls: "workflow-history-status" });
      statusDot.addClass(`workflow-status-${record.status}`);

      const textContent = content.createDiv({ cls: "workflow-history-item-text" });

      const timeEl = textContent.createDiv({ cls: "workflow-history-time" });
      timeEl.textContent = new Date(record.startTime).toLocaleString();

      const metaRow = textContent.createDiv({ cls: "workflow-history-meta" });

      const durationEl = metaRow.createSpan({ cls: "workflow-history-duration" });
      durationEl.textContent = formatDuration(record.startTime, record.endTime);

      const statusEl = metaRow.createSpan({ cls: "workflow-history-status-text" });
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

      // Usage info
      if (step.usage || step.elapsedMs) {
        const usageEl = stepEl.createDiv({ cls: "gemini-helper-usage-info" });
        if (step.elapsedMs !== undefined) {
          usageEl.createSpan({ text: step.elapsedMs < 1000 ? `${step.elapsedMs}ms` : `${(step.elapsedMs / 1000).toFixed(1)}s` });
        }
        if (step.usage?.inputTokens !== undefined && step.usage?.outputTokens !== undefined) {
          const tokensText = `${step.usage.inputTokens.toLocaleString()} → ${step.usage.outputTokens.toLocaleString()} ${t("message.tokens")}` +
            (step.usage.thinkingTokens ? ` (${t("message.thinkingTokens")} ${step.usage.thinkingTokens.toLocaleString()})` : "");
          usageEl.createSpan({ text: tokensText });
        }
        if (step.usage?.totalCost !== undefined) {
          usageEl.createSpan({ text: `$${step.usage.totalCost.toFixed(4)}` });
        }
      }

      // MCP App button if available
      if (step.mcpAppInfo) {
        const mcpAppSection = stepEl.createDiv({ cls: "workflow-step-section" });
        mcpAppSection.createEl("strong", { text: t("mcpApp.title") });
        const mcpAppBtn = mcpAppSection.createEl("button", {
          text: `🖥️ ${t("mcpApp.openUI")}`,
          cls: "workflow-step-mcp-app-btn",
        });
        mcpAppBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (step.mcpAppInfo) {
            void showMcpApp(this.app, step.mcpAppInfo);
          }
        });
      }

      // Retry from here button
      if (step.variablesSnapshot && this.onRetryFromError) {
        const retryStepBtn = stepEl.createEl("button", {
          text: t("workflowModal.retryFromStep"),
          cls: "workflow-step-retry-btn",
        });
        retryStepBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.close();
          this.onRetryFromError!(record.workflowPath, record.workflowName, step.nodeId, step.variablesSnapshot!);
        });
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

    // Retry from error button
    if (record.status === "error" && record.errorNodeId && record.variablesSnapshot && this.onRetryFromError) {
      const retryBtn = actions.createEl("button", {
        text: t("workflowModal.retryFromError"),
        cls: "mod-cta",
      });
      retryBtn.addEventListener("click", () => {
        this.close();
        this.onRetryFromError!(record.workflowPath, record.workflowName, record.errorNodeId!, record.variablesSnapshot!);
      });
    }

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

    // Clean up event listener
    if (this.historySavedHandler) {
      globalEventEmitter.off("execution-history-saved", this.historySavedHandler);
      this.historySavedHandler = null;
    }
  }
}
