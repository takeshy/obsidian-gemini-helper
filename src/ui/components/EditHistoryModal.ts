import { App, Modal, Notice, Setting } from "obsidian";
import { t } from "src/i18n";
import { formatError } from "src/utils/error";
import { getEditHistoryManager, type EditHistoryEntry } from "src/core/editHistory";
import { globalEventEmitter } from "src/utils/EventEmitter";

/**
 * Generate default copy filename with datetime
 * e.g., "notes/daily/2025-01-10.md" -> "notes/daily/2025-01-10_20250124_153045.md"
 */
function generateCopyFilename(originalPath: string): string {
  const now = new Date();
  const datetime = now.toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "_")
    .slice(0, 15); // YYYYMMDD_HHMMSS

  const ext = originalPath.lastIndexOf(".");
  if (ext === -1) {
    return `${originalPath}_${datetime}`;
  }
  return `${originalPath.slice(0, ext)}_${datetime}${originalPath.slice(ext)}`;
}

/**
 * Modal to input copy destination path
 */
class CopyInputModal extends Modal {
  private defaultPath: string;
  private onSubmit: (destPath: string) => void | Promise<void>;
  private inputEl: HTMLInputElement | null = null;

  constructor(app: App, defaultPath: string, onSubmit: (destPath: string) => void | Promise<void>) {
    super(app);
    this.defaultPath = defaultPath;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: t("editHistoryModal.copyTo") });

    const inputContainer = contentEl.createDiv({ cls: "gemini-helper-copy-input-container" });
    this.inputEl = inputContainer.createEl("input", {
      type: "text",
      value: this.defaultPath,
      cls: "gemini-helper-copy-input",
    });

    // Select all on focus
    this.inputEl.addEventListener("focus", () => {
      this.inputEl?.select();
    });

    // Handle enter key
    this.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && this.inputEl?.value) {
        this.close();
        void this.onSubmit(this.inputEl.value);
      }
    });

    const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });

    buttonContainer.createEl("button", {
      text: t("common.cancel"),
    }).addEventListener("click", () => {
      this.close();
    });

    const submitBtn = buttonContainer.createEl("button", {
      text: t("editHistoryModal.copy"),
      cls: "mod-cta",
    });
    submitBtn.addEventListener("click", () => {
      if (this.inputEl?.value) {
        this.close();
        void this.onSubmit(this.inputEl.value);
      }
    });

    // Focus input after modal opens
    setTimeout(() => {
      this.inputEl?.focus();
    }, 50);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * Confirmation modal to replace native confirm()
 */
class ConfirmModal extends Modal {
  private message: string;
  private onConfirm: () => void | Promise<void>;

  constructor(app: App, message: string, onConfirm: () => void | Promise<void>) {
    super(app);
    this.message = message;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("p", { text: this.message });

    const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });

    buttonContainer.createEl("button", {
      text: t("common.cancel"),
    }).addEventListener("click", () => {
      this.close();
    });

    const confirmBtn = buttonContainer.createEl("button", {
      text: t("common.confirm"),
      cls: "mod-warning",
    });
    confirmBtn.addEventListener("click", () => {
      this.close();
      void this.onConfirm();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * Setup drag handle for modal movement
 */
function setupDragHandle(dragHandle: HTMLElement, modalEl: HTMLElement): void {
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
 * Modal to show edit history for a file
 */
export class EditHistoryModal extends Modal {
  private filePath: string;
  private onRestore?: (entryId: string) => Promise<void>;

  constructor(app: App, filePath: string, onRestore?: (entryId: string) => Promise<void>) {
    super(app);
    this.filePath = filePath;
    this.onRestore = onRestore;
  }

  async onOpen() {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("gemini-helper-edit-history-modal");
    modalEl.addClass("gemini-helper-modal-resizable");

    // Drag handle with title
    const fileName = this.filePath.split("/").pop() || this.filePath;
    const dragHandle = contentEl.createDiv({ cls: "modal-drag-handle" });
    dragHandle.createEl("h2", { text: t("editHistoryModal.title", { file: fileName }) });
    setupDragHandle(dragHandle, modalEl);

    const historyManager = getEditHistoryManager();
    if (!historyManager) {
      contentEl.createEl("p", { text: t("editHistoryModal.notInitialized") });
      return;
    }

    const history = historyManager.getHistory(this.filePath);
    const currentDiff = await historyManager.getDiffFromLastSaved(this.filePath);
    const hasUnsavedChanges = currentDiff && currentDiff.stats.additions + currentDiff.stats.deletions > 0;

    // Show "no history" only if both history is empty AND no unsaved changes
    if (history.length === 0 && !hasUnsavedChanges) {
      contentEl.createEl("p", { text: t("editHistoryModal.noHistory") });
      return;
    }

    // Scrollable content area
    const scrollArea = contentEl.createDiv({ cls: "gemini-helper-edit-history-scroll" });

    // Current changes section (diff from last saved)
    if (hasUnsavedChanges) {
      const currentChangesEl = scrollArea.createDiv({ cls: "gemini-helper-edit-history-current-changes" });
      currentChangesEl.createEl("h3", { text: t("editHistoryModal.unsavedChanges") });

      const statsEl = currentChangesEl.createDiv({ cls: "gemini-helper-edit-history-stats" });
      statsEl.createSpan({
        cls: "gemini-helper-edit-history-additions",
        text: t("diffModal.additions", { count: String(currentDiff.stats.additions) }),
      });
      statsEl.createSpan({
        cls: "gemini-helper-edit-history-deletions",
        text: ` ${t("diffModal.deletions", { count: String(currentDiff.stats.deletions) })}`,
      });

      // Buttons container
      const btnsEl = currentChangesEl.createDiv({ cls: "gemini-helper-edit-history-btns" });

      // Show diff button
      const diffBtn = btnsEl.createEl("button", {
        cls: "gemini-helper-edit-history-btn",
        text: t("editHistoryModal.diff"),
      });
      diffBtn.addEventListener("click", () => {
        new CurrentDiffModal(this.app, this.filePath, currentDiff).open();
      });

      // Reset button
      const resetBtn = btnsEl.createEl("button", {
        cls: "gemini-helper-edit-history-btn-reset",
        text: t("editHistoryModal.revertToBase"),
      });
      resetBtn.addEventListener("click", () => {
        new ConfirmModal(this.app, t("editHistoryModal.confirmRevertToBase"), () => {
          void historyManager.revertToBase(this.filePath).then(() => {
            globalEventEmitter.emit("file-restored", this.filePath);
            new Notice(t("editHistoryModal.revertedToBase"));
            this.close();
          });
        }).open();
      });
    }

    // Timeline container
    const timelineEl = scrollArea.createDiv({ cls: "gemini-helper-edit-history-timeline" });

    // Current version
    const currentEl = timelineEl.createDiv({ cls: "gemini-helper-edit-history-current" });
    currentEl.createSpan({ cls: "gemini-helper-edit-history-marker", text: "\u25CF" });
    currentEl.createSpan({ text: ` ${t("editHistoryModal.current")}` });

    // History entries (newest first)
    for (let i = history.length - 1; i >= 0; i--) {
      const entry = history[i];
      this.renderHistoryEntry(timelineEl, entry);
    }

    // Footer
    const footerEl = contentEl.createDiv({ cls: "gemini-helper-edit-history-footer" });
    footerEl.createSpan({ text: t("editHistoryModal.entriesCount", { count: String(history.length) }) });

    new Setting(footerEl)
      .addButton((btn) =>
        btn
          .setButtonText(t("editHistoryModal.clearAll"))
          .setWarning()
          .onClick(() => {
            new ConfirmModal(this.app, t("editHistoryModal.confirmClear"), () => {
              historyManager.clearHistory(this.filePath);
              this.close();
            }).open();
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText(t("editHistoryModal.close"))
          .onClick(() => {
            this.close();
          })
      );
  }

  private renderHistoryEntry(container: HTMLElement, entry: EditHistoryEntry) {
    const entryEl = container.createDiv({ cls: "gemini-helper-edit-history-entry" });

    // Line connector
    entryEl.createDiv({ cls: "gemini-helper-edit-history-connector" });

    // Entry content
    const contentEl = entryEl.createDiv({ cls: "gemini-helper-edit-history-entry-content" });

    // Timestamp and source
    const date = new Date(entry.timestamp);
    const timeStr = date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const headerEl = contentEl.createDiv({ cls: "gemini-helper-edit-history-entry-header" });
    headerEl.createSpan({ cls: "gemini-helper-edit-history-time", text: timeStr });

    // Source label
    const sourceLabel = this.getSourceLabel(entry);
    headerEl.createSpan({ cls: "gemini-helper-edit-history-source", text: ` ${sourceLabel}` });

    // Stats
    const statsEl = contentEl.createDiv({ cls: "gemini-helper-edit-history-stats" });
    statsEl.createSpan({
      cls: "gemini-helper-edit-history-additions",
      text: t("diffModal.additions", { count: String(entry.stats.additions) }),
    });
    statsEl.createSpan({
      cls: "gemini-helper-edit-history-deletions",
      text: ` ${t("diffModal.deletions", { count: String(entry.stats.deletions) })}`,
    });

    // Model (if available)
    if (entry.model) {
      contentEl.createDiv({
        cls: "gemini-helper-edit-history-model",
        text: entry.model,
      });
    }

    // Action buttons
    const actionsEl = contentEl.createDiv({ cls: "gemini-helper-edit-history-actions" });

    // Diff button
    const diffBtn = actionsEl.createEl("button", {
      cls: "gemini-helper-edit-history-btn",
      text: t("editHistoryModal.diff"),
    });
    diffBtn.addEventListener("click", () => {
      new DiffModal(this.app, entry, this.filePath, this.onRestore).open();
    });

    // Restore button
    const restoreBtn = actionsEl.createEl("button", {
      cls: "gemini-helper-edit-history-btn",
      text: t("editHistoryModal.restore"),
    });
    restoreBtn.addEventListener("click", () => {
      new ConfirmModal(this.app, t("editHistoryModal.confirmRestore"), () => {
        void this.handleRestore(entry.id, entry.timestamp);
      }).open();
    });

    // Copy button
    const copyBtn = actionsEl.createEl("button", {
      cls: "gemini-helper-edit-history-btn",
      text: t("editHistoryModal.copy"),
    });
    copyBtn.addEventListener("click", () => {
      const defaultPath = generateCopyFilename(this.filePath);
      new CopyInputModal(this.app, defaultPath, async (destPath: string) => {
        await this.handleCopy(entry.id, destPath);
      }).open();
    });
  }

  private getSourceLabel(entry: EditHistoryEntry): string {
    if (entry.source === "workflow" && entry.workflowName) {
      return `${t("editHistoryModal.workflow")} "${entry.workflowName}"`;
    }
    switch (entry.source) {
      case "workflow":
        return t("editHistoryModal.workflow");
      case "propose_edit":
        return t("editHistoryModal.proposeEdit");
      case "manual":
        return t("editHistoryModal.manual");
      case "auto":
        return t("editHistoryModal.auto");
      default:
        return entry.source;
    }
  }

  private async handleRestore(entryId: string, timestamp: string) {
    try {
      if (this.onRestore) {
        await this.onRestore(entryId);
      } else {
        const historyManager = getEditHistoryManager();
        if (historyManager) {
          await historyManager.restoreTo(this.filePath, entryId);
        }
      }

      // Notify listeners that file was restored
      globalEventEmitter.emit("file-restored", this.filePath);

      const date = new Date(timestamp);
      const timeStr = date.toLocaleString();
      new Notice(t("editHistoryModal.restored", { timestamp: timeStr }));
    } catch (e) {
      console.error("Failed to restore:", formatError(e));
      new Notice("Failed to restore");
    } finally {
      this.close();
    }
  }

  private async handleCopy(entryId: string, destPath: string) {
    try {
      const historyManager = getEditHistoryManager();
      if (!historyManager) {
        new Notice(t("editHistoryModal.copyFailed"));
        return;
      }

      const result = await historyManager.copyTo(this.filePath, entryId, destPath);
      if (result.success) {
        new Notice(t("editHistoryModal.copied", { path: destPath }));
      } else if (result.error === "File already exists") {
        new Notice(t("editHistoryModal.fileExists"));
      } else {
        new Notice(t("editHistoryModal.copyFailed"));
      }
    } catch (e) {
      console.error("Failed to copy:", formatError(e));
      new Notice(t("editHistoryModal.copyFailed"));
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Modal to show current unsaved changes diff
 */
class CurrentDiffModal extends Modal {
  private filePath: string;
  private diffData: { diff: string; stats: { additions: number; deletions: number } };

  constructor(
    app: App,
    filePath: string,
    diffData: { diff: string; stats: { additions: number; deletions: number } }
  ) {
    super(app);
    this.filePath = filePath;
    this.diffData = diffData;
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("gemini-helper-diff-modal");
    modalEl.addClass("gemini-helper-modal-resizable");

    // Drag handle with title
    const fileName = this.filePath.split("/").pop() || this.filePath;
    const dragHandle = contentEl.createDiv({ cls: "modal-drag-handle" });
    dragHandle.createEl("h2", { text: t("editHistoryModal.unsavedChanges") + ": " + fileName });
    setupDragHandle(dragHandle, modalEl);

    // Stats
    const statsEl = contentEl.createDiv({ cls: "gemini-helper-diff-stats" });
    statsEl.createSpan({
      cls: "gemini-helper-diff-additions",
      text: t("diffModal.additions", { count: String(this.diffData.stats.additions) }),
    });
    statsEl.createSpan({
      cls: "gemini-helper-diff-deletions",
      text: ` ${t("diffModal.deletions", { count: String(this.diffData.stats.deletions) })}`,
    });

    // Diff content (scrollable)
    const diffEl = contentEl.createDiv({ cls: "gemini-helper-diff-content" });
    this.renderDiff(diffEl);

    // Close button
    const actionsEl = contentEl.createDiv({ cls: "gemini-helper-diff-actions" });
    new Setting(actionsEl)
      .addButton((btn) =>
        btn.setButtonText(t("diffModal.close")).onClick(() => {
          this.close();
        })
      );
  }

  private renderDiff(container: HTMLElement) {
    const preEl = container.createEl("pre", { cls: "gemini-helper-diff-pre" });

    const lines = this.diffData.diff.split("\n");
    for (const line of lines) {
      const lineEl = preEl.createDiv({ cls: "gemini-helper-diff-line" });

      if (line.startsWith("@@")) {
        lineEl.addClass("gemini-helper-diff-hunk");
      } else if (line.startsWith("+")) {
        lineEl.addClass("gemini-helper-diff-add");
      } else if (line.startsWith("-")) {
        lineEl.addClass("gemini-helper-diff-remove");
      } else {
        lineEl.addClass("gemini-helper-diff-context");
      }

      lineEl.textContent = line;
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Modal to show diff for a specific history entry
 */
export class DiffModal extends Modal {
  private entry: EditHistoryEntry;
  private filePath: string;
  private onRestore?: (entryId: string) => Promise<void>;

  constructor(
    app: App,
    entry: EditHistoryEntry,
    filePath: string,
    onRestore?: (entryId: string) => Promise<void>
  ) {
    super(app);
    this.entry = entry;
    this.filePath = filePath;
    this.onRestore = onRestore;
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("gemini-helper-diff-modal");
    modalEl.addClass("gemini-helper-modal-resizable");

    // Drag handle with title
    const date = new Date(this.entry.timestamp);
    const timeStr = date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const sourceLabel = this.getSourceLabel();
    const dragHandle = contentEl.createDiv({ cls: "modal-drag-handle" });
    dragHandle.createEl("h2", {
      text: t("diffModal.title", { timestamp: timeStr, source: sourceLabel }),
    });
    setupDragHandle(dragHandle, modalEl);

    // Stats
    const statsEl = contentEl.createDiv({ cls: "gemini-helper-diff-stats" });
    statsEl.createSpan({
      cls: "gemini-helper-diff-additions",
      text: t("diffModal.additions", { count: String(this.entry.stats.additions) }),
    });
    statsEl.createSpan({
      cls: "gemini-helper-diff-deletions",
      text: ` ${t("diffModal.deletions", { count: String(this.entry.stats.deletions) })}`,
    });

    // Diff content (scrollable)
    const diffEl = contentEl.createDiv({ cls: "gemini-helper-diff-content" });
    this.renderDiff(diffEl);

    // Actions
    const actionsEl = contentEl.createDiv({ cls: "gemini-helper-diff-actions" });

    new Setting(actionsEl)
      .addButton((btn) =>
        btn
          .setButtonText(t("diffModal.restoreVersion"))
          .setCta()
          .onClick(() => {
            new ConfirmModal(this.app, t("editHistoryModal.confirmRestore"), async () => {
              await this.handleRestore();
            }).open();
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText(t("editHistoryModal.copy"))
          .onClick(() => {
            const defaultPath = generateCopyFilename(this.filePath);
            new CopyInputModal(this.app, defaultPath, async (destPath: string) => {
              await this.handleCopy(destPath);
            }).open();
          })
      )
      .addButton((btn) =>
        btn.setButtonText(t("diffModal.close")).onClick(() => {
          this.close();
        })
      );
  }

  private getSourceLabel(): string {
    if (this.entry.source === "workflow" && this.entry.workflowName) {
      return this.entry.workflowName;
    }
    switch (this.entry.source) {
      case "workflow":
        return t("editHistoryModal.workflow");
      case "propose_edit":
        return t("editHistoryModal.proposeEdit");
      case "manual":
        return t("editHistoryModal.manual");
      case "auto":
        return t("editHistoryModal.auto");
      default:
        return this.entry.source;
    }
  }

  private renderDiff(container: HTMLElement) {
    const preEl = container.createEl("pre", { cls: "gemini-helper-diff-pre" });

    const lines = this.entry.diff.split("\n");
    for (const line of lines) {
      const lineEl = preEl.createDiv({ cls: "gemini-helper-diff-line" });

      if (line.startsWith("@@")) {
        lineEl.addClass("gemini-helper-diff-hunk");
      } else if (line.startsWith("+")) {
        lineEl.addClass("gemini-helper-diff-add");
      } else if (line.startsWith("-")) {
        lineEl.addClass("gemini-helper-diff-remove");
      } else {
        lineEl.addClass("gemini-helper-diff-context");
      }

      lineEl.textContent = line;
    }
  }

  private async handleRestore() {
    try {
      if (this.onRestore) {
        await this.onRestore(this.entry.id);
      } else {
        const historyManager = getEditHistoryManager();
        if (historyManager) {
          await historyManager.restoreTo(this.filePath, this.entry.id);
        }
      }

      // Notify listeners that file was restored
      globalEventEmitter.emit("file-restored", this.filePath);

      const date = new Date(this.entry.timestamp);
      const timeStr = date.toLocaleString();
      new Notice(t("editHistoryModal.restored", { timestamp: timeStr }));
    } catch (e) {
      console.error("Failed to restore:", formatError(e));
      new Notice("Failed to restore");
    } finally {
      this.close();
    }
  }

  private async handleCopy(destPath: string) {
    try {
      const historyManager = getEditHistoryManager();
      if (!historyManager) {
        new Notice(t("editHistoryModal.copyFailed"));
        return;
      }

      const result = await historyManager.copyTo(this.filePath, this.entry.id, destPath);
      if (result.success) {
        new Notice(t("editHistoryModal.copied", { path: destPath }));
      } else if (result.error === "File already exists") {
        new Notice(t("editHistoryModal.fileExists"));
      } else {
        new Notice(t("editHistoryModal.copyFailed"));
      }
    } catch (e) {
      console.error("Failed to copy:", formatError(e));
      new Notice(t("editHistoryModal.copyFailed"));
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
