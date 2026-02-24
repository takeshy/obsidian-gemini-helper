import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { t } from "src/i18n";
import { formatError } from "src/utils/error";
import { getEditHistoryManager, type EditHistoryEntry } from "src/core/editHistory";
import { globalEventEmitter } from "src/utils/EventEmitter";
import type { DriveSyncManager } from "src/core/driveSync";
import type { DriveEditHistoryEntry } from "src/core/driveEditHistory";
import { reverseApplyDiff, reconstructContent } from "src/core/diffUtils";

/** Display entry wrapping local or remote origin */
type DisplayEntry = EditHistoryEntry & { origin: "local" | "remote" };

// ========================================
// Helper modals
// ========================================

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

// ========================================
// Main modal
// ========================================

/**
 * Modal to show edit history for a file
 */
export class EditHistoryModal extends Modal {
  private filePath: string;
  private driveSyncManager: DriveSyncManager | null;
  private remoteEntries: DisplayEntry[] = [];
  private showRemote = false;
  private loadingRemote = false;
  /** Merged timeline (newest first), set during render() */
  private allEntries: DisplayEntry[] = [];

  constructor(
    app: App,
    filePath: string,
    driveSyncManager?: DriveSyncManager | null,
  ) {
    super(app);
    this.filePath = filePath;
    this.driveSyncManager = driveSyncManager ?? null;
  }

  async onOpen() {
    await this.render();
  }

  private async render() {
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

    const localHistory = historyManager.getHistory(this.filePath);
    const currentDiff = await historyManager.getDiffFromLastSaved(this.filePath);
    const hasUnsavedChanges = currentDiff && currentDiff.stats.additions + currentDiff.stats.deletions > 0;

    // Merge local + remote entries, sorted newest first (filter empty diffs / commit boundaries)
    const localDisplayEntries: DisplayEntry[] = localHistory
      .filter(e => e.diff !== "")
      .map(e => ({ ...e, origin: "local" as const }));
    const remoteDisplayEntries = this.showRemote
      ? this.remoteEntries.filter(e => e.diff !== "")
      : [];
    this.allEntries = [...localDisplayEntries, ...remoteDisplayEntries];
    this.allEntries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const totalCount = this.allEntries.length;
    const hasDriveSync = this.driveSyncManager?.isUnlocked;

    // Show "no history" only if both history is empty AND no unsaved changes
    if (totalCount === 0 && !hasUnsavedChanges) {
      const noHistoryEl = contentEl.createDiv({ cls: "gemini-helper-edit-history-scroll" });
      noHistoryEl.createEl("p", { text: t("editHistoryModal.noHistory") });

      // Still show footer with "Show remote" if Drive is available
      if (hasDriveSync && !this.showRemote) {
        this.renderFooter(contentEl, 0, historyManager);
      }
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

    // All entries (newest first, merged)
    for (let i = 0; i < this.allEntries.length; i++) {
      this.renderHistoryEntry(timelineEl, this.allEntries[i]);
    }

    // Footer
    this.renderFooter(contentEl, totalCount, historyManager);
  }

  private renderFooter(
    container: HTMLElement,
    totalCount: number,
    historyManager: NonNullable<ReturnType<typeof getEditHistoryManager>>,
  ) {
    const footerEl = container.createDiv({ cls: "gemini-helper-edit-history-footer" });

    // Left side: entry count + show remote
    const leftEl = footerEl.createDiv({ cls: "gemini-helper-edit-history-footer-left" });
    leftEl.createSpan({ text: t("editHistoryModal.entriesCount", { count: String(totalCount) }) });

    const hasDriveSync = this.driveSyncManager?.isUnlocked;

    if (hasDriveSync && !this.showRemote) {
      if (this.loadingRemote) {
        leftEl.createSpan({
          cls: "gemini-helper-edit-history-show-remote-btn",
          text: t("editHistoryModal.loadingRemote"),
        });
      } else {
        const showRemoteBtn = leftEl.createEl("button", {
          cls: "gemini-helper-edit-history-show-remote-btn",
          text: t("editHistoryModal.showRemote"),
        });
        showRemoteBtn.addEventListener("click", () => {
          void this.loadRemoteHistory();
        });
      }
    }

    // Right side: clear all + close
    new Setting(footerEl)
      .addButton((btn) =>
        btn
          .setButtonText(t("editHistoryModal.clearAll"))
          .setWarning()
          .onClick(() => {
            const confirmMsg = this.driveSyncManager?.isUnlocked
              ? t("editHistoryModal.confirmClearWithRemote")
              : t("editHistoryModal.confirmClear");
            new ConfirmModal(this.app, confirmMsg, async () => {
              let restoredContent: string | null = null;

              if (this.driveSyncManager?.isUnlocked) {
                // Drive sync available: fetch remote file, then reverse-apply all remote diffs
                // to reconstruct content before the first remote edit
                try {
                  const remoteContent = await this.driveSyncManager.readRemoteFileByPath(this.filePath);
                  if (remoteContent !== null) {
                    const remoteEntries = await this.driveSyncManager.loadRemoteEditHistory(this.filePath);
                    if (remoteEntries.length > 0) {
                      // Reverse-apply all diffs from newest to oldest
                      // Remote diffs are forward (old→new), so reverseApplyDiff undoes each change
                      let content = remoteContent;
                      for (let i = remoteEntries.length - 1; i >= 0; i--) {
                        content = reverseApplyDiff(content, remoteEntries[i].diff, { strict: true });
                      }
                      restoredContent = content;
                    } else {
                      restoredContent = remoteContent;
                    }
                  }
                } catch (e) {
                  console.error("Failed to restore from remote history:", formatError(e));
                  new Notice(formatError(e));
                }
              } else {
                // Drive sync unavailable: restore to the earliest point in local history
                const localHistory = historyManager.getHistory(this.filePath);
                if (localHistory.length > 0) {
                  restoredContent = historyManager.getContentAt(this.filePath, localHistory[0].id);
                }
              }

              if (restoredContent !== null) {
                const file = this.app.vault.getAbstractFileByPath(this.filePath);
                if (file instanceof TFile) {
                  await this.app.vault.modify(file, restoredContent);
                  historyManager.setSnapshot(this.filePath, restoredContent);
                  globalEventEmitter.emit("file-restored", this.filePath);
                }
              }

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

  private async loadRemoteHistory() {
    if (!this.driveSyncManager) return;

    this.loadingRemote = true;
    await this.render();

    try {
      const entries = await this.driveSyncManager.loadRemoteEditHistory(this.filePath);
      this.remoteEntries = entries.map((e: DriveEditHistoryEntry) => ({ ...e, origin: "remote" as const }));
      this.showRemote = true;
    } catch (e) {
      console.error("Failed to load remote history:", formatError(e));
      new Notice(formatError(e));
    } finally {
      this.loadingRemote = false;
      await this.render();
    }
  }

  private renderHistoryEntry(container: HTMLElement, entry: DisplayEntry) {
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

    // Origin badge (only when remote entries are loaded)
    if (this.showRemote) {
      const badgeCls = entry.origin === "remote"
        ? "gemini-helper-edit-history-origin-badge gemini-helper-edit-history-origin-remote"
        : "gemini-helper-edit-history-origin-badge gemini-helper-edit-history-origin-local";
      const badgeText = entry.origin === "remote"
        ? t("editHistoryModal.originRemote")
        : t("editHistoryModal.originLocal");
      headerEl.createSpan({ cls: badgeCls, text: badgeText });
    }

    // Source label
    const sourceLabel = this.getSourceLabel(entry);
    headerEl.createSpan({ cls: "gemini-helper-edit-history-source", text: ` ${sourceLabel}` });

    // Stats — local diffs are stored in reverse direction, so swap for display
    const additions = entry.origin === "local" ? entry.stats.deletions : entry.stats.additions;
    const deletions = entry.origin === "local" ? entry.stats.additions : entry.stats.deletions;
    const statsEl = contentEl.createDiv({ cls: "gemini-helper-edit-history-stats" });
    statsEl.createSpan({
      cls: "gemini-helper-edit-history-additions",
      text: t("diffModal.additions", { count: String(additions) }),
    });
    statsEl.createSpan({
      cls: "gemini-helper-edit-history-deletions",
      text: ` ${t("diffModal.deletions", { count: String(deletions) })}`,
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
      new DiffModal(
        this.app,
        entry,
        this.filePath,
        entry.origin,
        () => this.handleRestore(entry),
        (destPath: string) => this.handleCopy(entry, destPath),
      ).open();
    });

    // Restore button
    const restoreBtn = actionsEl.createEl("button", {
      cls: "gemini-helper-edit-history-btn",
      text: t("editHistoryModal.restore"),
    });
    restoreBtn.addEventListener("click", () => {
      new ConfirmModal(this.app, t("editHistoryModal.confirmRestore"), () => {
        void this.handleRestore(entry);
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
        await this.handleCopy(entry, destPath);
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

  /**
   * Get content at a specific entry in the merged timeline.
   *
   * Returns the content BEFORE the target entry's change was applied.
   * This means restoring undoes the target change and all newer changes,
   * allowing the oldest entry to restore to the initial (basefile) state.
   *
   * For remote entries: fetch current remote file from Drive, then
   * reverse-apply diffs from newest to target (inclusive).
   *
   * For local entries: read current vault content and reverse-apply
   * all diffs from newest to target (inclusive).
   */
  private async getContentAtEntry(targetEntry: DisplayEntry): Promise<string | null> {
    const targetIdx = this.allEntries.indexOf(targetEntry);
    if (targetIdx < 0) {
      return null;
    }

    if (targetEntry.origin === "remote") {
      if (!this.driveSyncManager?.isUnlocked) return null;

      // Fetch current remote file content as base
      const remoteContent = await this.driveSyncManager.readRemoteFileByPath(this.filePath);
      if (remoteContent === null) return null;

      // allEntries is newest-first; filter remote only (also newest-first)
      const remoteOnly = this.allEntries.filter(e => e.origin === "remote");
      const targetRemoteIdx = remoteOnly.indexOf(targetEntry);
      if (targetRemoteIdx < 0) return null;

      // Reverse-apply diffs from newest to target (inclusive)
      // to get the state BEFORE the target entry's change
      let content = remoteContent;
      for (let i = 0; i <= targetRemoteIdx; i++) {
        content = reverseApplyDiff(content, remoteOnly[i].diff);
      }
      return content;
    }

    // Local entry: read current vault content, reverse-apply all diffs
    const file = this.app.vault.getAbstractFileByPath(this.filePath);
    if (!(file instanceof TFile)) return null;
    const currentContent = await this.app.vault.read(file);

    // Entries from newest up to and including the target (newest first)
    // Including the target reverses its diff, giving content BEFORE that change
    const entriesToReverse = this.allEntries.slice(0, targetIdx + 1);
    return reconstructContent(currentContent, entriesToReverse);
  }

  private async handleRestore(entry: DisplayEntry) {
    try {
      const content = await this.getContentAtEntry(entry);
      if (content === null) {
        new Notice(t("editHistoryModal.restoreFailed"));
        return;
      }

      const file = this.app.vault.getAbstractFileByPath(this.filePath);
      if (!(file instanceof TFile)) {
        new Notice(t("editHistoryModal.restoreFailed"));
        return;
      }

      await this.app.vault.modify(file, content);

      // Record the restore as a new history entry (preserves audit trail)
      const historyManager = getEditHistoryManager();
      if (historyManager) {
        historyManager.saveEdit({
          path: this.filePath,
          modifiedContent: content,
          source: "manual",
        });
      }

      globalEventEmitter.emit("file-restored", this.filePath);

      const date = new Date(entry.timestamp);
      const timeStr = date.toLocaleString();
      new Notice(t("editHistoryModal.restored", { timestamp: timeStr }));
    } catch (e) {
      console.error("Failed to restore:", formatError(e));
      new Notice(t("editHistoryModal.restoreFailed"));
    } finally {
      this.close();
    }
  }

  private async handleCopy(entry: DisplayEntry, destPath: string) {
    try {
      const content = await this.getContentAtEntry(entry);
      if (content === null) {
        new Notice(t("editHistoryModal.copyFailed"));
        return;
      }

      // Check if destination file already exists
      if (await this.app.vault.adapter.exists(destPath)) {
        new Notice(t("editHistoryModal.fileExists"));
        return;
      }

      // Ensure parent folder exists
      const parentPath = destPath.substring(0, destPath.lastIndexOf("/"));
      if (parentPath && !(await this.app.vault.adapter.exists(parentPath))) {
        await this.app.vault.createFolder(parentPath);
      }

      await this.app.vault.create(destPath, content);
      new Notice(t("editHistoryModal.copied", { path: destPath }));
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

// ========================================
// Diff modals
// ========================================

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
  private origin: "local" | "remote";
  private onRestore: (() => Promise<void>) | null;
  private onCopy: ((destPath: string) => Promise<void>) | null;

  constructor(
    app: App,
    entry: EditHistoryEntry,
    filePath: string,
    origin: "local" | "remote",
    onRestore: (() => Promise<void>) | null,
    onCopy: ((destPath: string) => Promise<void>) | null,
  ) {
    super(app);
    this.entry = entry;
    this.filePath = filePath;
    this.origin = origin;
    this.onRestore = onRestore;
    this.onCopy = onCopy;
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

    // Stats — local diffs are stored in reverse direction, so swap for display
    const additions = this.origin === "local" ? this.entry.stats.deletions : this.entry.stats.additions;
    const deletions = this.origin === "local" ? this.entry.stats.additions : this.entry.stats.deletions;
    const statsEl = contentEl.createDiv({ cls: "gemini-helper-diff-stats" });
    statsEl.createSpan({
      cls: "gemini-helper-diff-additions",
      text: t("diffModal.additions", { count: String(additions) }),
    });
    statsEl.createSpan({
      cls: "gemini-helper-diff-deletions",
      text: ` ${t("diffModal.deletions", { count: String(deletions) })}`,
    });

    // Diff content (scrollable)
    const diffEl = contentEl.createDiv({ cls: "gemini-helper-diff-content" });
    this.renderDiff(diffEl);

    // Actions
    const actionsEl = contentEl.createDiv({ cls: "gemini-helper-diff-actions" });

    const setting = new Setting(actionsEl);
    if (this.onRestore) {
      const restoreFn = this.onRestore;
      setting.addButton((btn) =>
        btn
          .setButtonText(t("diffModal.restoreVersion"))
          .setCta()
          .onClick(() => {
            new ConfirmModal(this.app, t("editHistoryModal.confirmRestore"), async () => {
              await restoreFn();
              this.close();
            }).open();
          })
      );
    }
    if (this.onCopy) {
      const copyFn = this.onCopy;
      setting.addButton((btn) =>
        btn
          .setButtonText(t("editHistoryModal.copy"))
          .onClick(() => {
            const defaultPath = generateCopyFilename(this.filePath);
            new CopyInputModal(this.app, defaultPath, async (destPath: string) => {
              await copyFn(destPath);
            }).open();
          })
      );
    }
    setting.addButton((btn) =>
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
    // Legend: always show as forward diff (- = before, + = after)
    const legendEl = container.createDiv({ cls: "gemini-helper-diff-legend" });
    const removedLabel = legendEl.createSpan({ cls: "gemini-helper-diff-legend-removed" });
    removedLabel.textContent = `\u2212 ${t("diffModal.before")}`;
    const addedLabel = legendEl.createSpan({ cls: "gemini-helper-diff-legend-added" });
    addedLabel.textContent = `+ ${t("diffModal.after")}`;

    const preEl = container.createEl("pre", { cls: "gemini-helper-diff-pre" });

    // Local diffs are stored in reverse direction (new→old),
    // so swap +/- to normalize display to forward direction (old→new)
    const swapSigns = this.origin === "local";

    const lines = this.entry.diff.split("\n");
    for (const line of lines) {
      const lineEl = preEl.createDiv({ cls: "gemini-helper-diff-line" });

      if (line.startsWith("@@")) {
        lineEl.addClass("gemini-helper-diff-hunk");
        lineEl.textContent = line;
      } else if (line.startsWith("+")) {
        lineEl.addClass(swapSigns ? "gemini-helper-diff-remove" : "gemini-helper-diff-add");
        lineEl.textContent = (swapSigns ? "-" : "+") + line.slice(1);
      } else if (line.startsWith("-")) {
        lineEl.addClass(swapSigns ? "gemini-helper-diff-add" : "gemini-helper-diff-remove");
        lineEl.textContent = (swapSigns ? "+" : "-") + line.slice(1);
      } else {
        lineEl.addClass("gemini-helper-diff-context");
        lineEl.textContent = line;
      }
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
