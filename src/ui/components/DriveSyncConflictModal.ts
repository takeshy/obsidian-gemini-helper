// Conflict resolution modal for Google Drive sync.
// Shows conflicts and lets user choose local or remote for each file.

import { Modal, App, Setting, Notice, TFile } from "obsidian";
import { createTwoFilesPatch } from "diff";
import type { ConflictInfo } from "src/core/syncDiff";
import type { DriveSyncManager } from "src/core/driveSync";
import { isBinaryExtension } from "src/core/driveSyncUtils";
import { t } from "src/i18n";
import { formatError } from "src/utils/error";

interface DiffState {
  loading: boolean;
  diff: string | null;
  error: boolean;
  expanded: boolean;
}

export class DriveSyncConflictModal extends Modal {
  private syncManager: DriveSyncManager;
  private conflicts: ConflictInfo[];
  private onAllResolved: () => void;
  private resolving = false;
  private diffStates: Record<string, DiffState> = {};

  constructor(
    app: App,
    syncManager: DriveSyncManager,
    conflicts: ConflictInfo[],
    onAllResolved: () => void
  ) {
    super(app);
    this.syncManager = syncManager;
    this.conflicts = [...conflicts];
    this.onAllResolved = onAllResolved;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.diffStates = {};
    contentEl.addClass("gemini-helper-conflict-modal");

    // Prevent closing by clicking outside
    this.containerEl.setCssProps({ "pointer-events": "none" });
    this.modalEl.setCssProps({ "pointer-events": "auto" });

    contentEl.createEl("h2", { text: t("driveSync.conflictTitle") });
    contentEl.createEl("p", {
      text: t("driveSync.conflictDesc", { count: this.conflicts.length }),
      cls: "setting-item-description",
    });

    const listEl = contentEl.createDiv({ cls: "gemini-helper-conflict-list" });

    for (const conflict of this.conflicts) {
      this.renderConflictItem(listEl, conflict);
    }

    // Bulk actions
    const bulkContainer = contentEl.createDiv({ cls: "gemini-helper-button-container" });

    const keepAllLocalBtn = bulkContainer.createEl("button", {
      text: t("driveSync.keepAllLocal"),
    });
    keepAllLocalBtn.disabled = this.resolving;
    keepAllLocalBtn.addEventListener("click", () => {
      void this.resolveAll("local");
    });

    const keepAllRemoteBtn = bulkContainer.createEl("button", {
      text: t("driveSync.keepAllRemote"),
      cls: "mod-cta",
    });
    keepAllRemoteBtn.disabled = this.resolving;
    keepAllRemoteBtn.addEventListener("click", () => {
      void this.resolveAll("remote");
    });

    const resolveLaterBtn = bulkContainer.createEl("button", {
      text: t("driveSync.resolveLater"),
    });
    resolveLaterBtn.disabled = this.resolving;
    resolveLaterBtn.addEventListener("click", () => {
      this.close();
    });

    if (this.resolving) {
      const statusEl = contentEl.createDiv({ cls: "gemini-helper-conflict-resolving-status" });
      statusEl.setText(t("driveSync.resolving"));
    }
  }

  private renderConflictItem(container: HTMLElement, conflict: ConflictInfo): void {
    const isEditDelete = conflict.isEditDelete;
    const desc = isEditDelete
      ? t("driveSync.localEditRemoteDelete")
      : `Local: ${conflict.localChecksum.slice(0, 8)}... | Remote: ${conflict.remoteChecksum.slice(0, 8)}...`;

    const itemEl = container.createDiv({ cls: "gemini-helper-conflict-item" });

    const setting = new Setting(itemEl)
      .setName(conflict.fileName)
      .setDesc(desc);

    // Diff toggle for non-binary, non-editDelete conflicts
    const canDiff = !isEditDelete && !isBinaryExtension(conflict.fileName);
    if (canDiff) {
      setting.addButton((btn) =>
        btn
          .setButtonText(t("driveSync.diff"))
          .onClick(() => {
            void this.handleDiffToggle(conflict, diffPanel, btn.buttonEl);
          })
      );
    }

    if (isEditDelete) {
      setting.addButton((btn) =>
        btn
          .setButtonText(t("driveSync.restorePush"))
          .setTooltip(t("driveSync.restorePushTooltip"))
          .setDisabled(this.resolving)
          .onClick(() => {
            void this.resolveOne(conflict.fileId, "local");
          })
      );
      setting.addButton((btn) =>
        btn
          .setButtonText(t("driveSync.acceptDelete"))
          .setTooltip(t("driveSync.acceptDeleteTooltip"))
          .setDisabled(this.resolving)
          .onClick(() => {
            void this.resolveOne(conflict.fileId, "remote");
          })
      );
    } else {
      setting.addButton((btn) =>
        btn
          .setButtonText(t("driveSync.keepLocal"))
          .setDisabled(this.resolving)
          .onClick(() => {
            void this.resolveOne(conflict.fileId, "local");
          })
      );
      setting.addButton((btn) =>
        btn
          .setButtonText(t("driveSync.keepRemote"))
          .setCta()
          .setDisabled(this.resolving)
          .onClick(() => {
            void this.resolveOne(conflict.fileId, "remote");
          })
      );
    }

    // Diff panel placed outside Setting, spans full width
    const diffPanel = itemEl.createDiv({ cls: "gemini-helper-sync-diff-panel gemini-helper-hidden" });
  }

  private async handleDiffToggle(
    conflict: ConflictInfo,
    panel: HTMLElement,
    toggleBtn: HTMLButtonElement,
  ): Promise<void> {
    const state = this.diffStates[conflict.fileId];

    // If already loaded, toggle visibility
    if (state?.diff !== null && state?.diff !== undefined && !state.error) {
      state.expanded = !state.expanded;
      panel.toggleClass("gemini-helper-hidden", !state.expanded);
      toggleBtn.setText(state.expanded ? t("driveSync.hide") : t("driveSync.diff"));
      return;
    }

    // Prevent duplicate requests while loading
    if (state?.loading) {
      state.expanded = !state.expanded;
      panel.toggleClass("gemini-helper-hidden", !state.expanded);
      toggleBtn.setText(state.expanded ? t("driveSync.hide") : t("driveSync.diff"));
      return;
    }

    // Show loading
    this.diffStates[conflict.fileId] = { loading: true, diff: null, error: false, expanded: true };
    panel.toggleClass("gemini-helper-hidden", false);
    panel.empty();
    panel.createDiv({ cls: "gemini-helper-sync-diff-loading", text: t("driveSync.loading") });
    toggleBtn.setText(t("driveSync.hide"));

    try {
      // Get local content
      let localContent = "";
      try {
        const tfile = this.app.vault.getAbstractFileByPath(conflict.fileName);
        if (tfile instanceof TFile) {
          localContent = await this.app.vault.read(tfile);
        }
      } catch {
        // File may not exist locally
      }

      // Get remote content
      let remoteContent = "";
      try {
        remoteContent = await this.syncManager.readRemoteFile(conflict.fileId);
      } catch {
        // File may not exist remotely
      }

      // old=local, new=remote (show what remote changes look like vs local)
      const patch = createTwoFilesPatch(
        conflict.fileName,
        conflict.fileName,
        localContent,
        remoteContent,
        "Local",
        "Drive",
        { context: 3 },
      );

      this.diffStates[conflict.fileId] = { loading: false, diff: patch, error: false, expanded: true };
      panel.empty();
      this.renderDiffView(panel, patch);
    } catch {
      this.diffStates[conflict.fileId] = { loading: false, diff: null, error: true, expanded: true };
      panel.empty();
      panel.createDiv({ cls: "gemini-helper-sync-diff-error", text: t("driveSync.failedToLoadDiff") });
    }
  }

  private renderDiffView(container: HTMLElement, patch: string): void {
    const pre = container.createEl("pre", { cls: "gemini-helper-sync-diff-content" });
    const lines = patch.split("\n");

    for (const line of lines) {
      const div = pre.createDiv();

      if (line.startsWith("+") && !line.startsWith("+++")) {
        div.addClass("gemini-helper-diff-add");
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        div.addClass("gemini-helper-diff-remove");
      } else if (line.startsWith("@@")) {
        div.addClass("gemini-helper-diff-hunk");
      } else if (line.startsWith("+++") || line.startsWith("---")) {
        div.addClass("gemini-helper-diff-header");
      }

      // Separate prefix from content (prefix is non-selectable)
      if ((line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---")) {
        const prefix = div.createSpan({ cls: "gemini-helper-diff-prefix" });
        prefix.setText(line[0]);
        div.appendText(line.slice(1));
      } else {
        div.setText(line);
      }
    }
  }

  private async resolveOne(fileId: string, choice: "local" | "remote"): Promise<void> {
    if (this.resolving) return;
    this.resolving = true;
    this.onOpen();

    try {
      await this.syncManager.resolveConflict(fileId, choice);
      this.conflicts = this.conflicts.filter(c => c.fileId !== fileId);

      if (this.conflicts.length === 0) {
        this.close();
        this.onAllResolved();
        return;
      }
    } catch (err) {
      new Notice(`Conflict resolution failed: ${formatError(err)}`);
    } finally {
      this.resolving = false;
    }
    // Re-render
    this.onOpen();
  }

  private async resolveAll(choice: "local" | "remote"): Promise<void> {
    if (this.resolving) return;
    this.resolving = true;
    this.onOpen();

    let failCount = 0;
    for (const conflict of [...this.conflicts]) {
      try {
        await this.syncManager.resolveConflict(conflict.fileId, choice);
        this.conflicts = this.conflicts.filter(c => c.fileId !== conflict.fileId);
      } catch {
        failCount++;
      }
    }

    this.resolving = false;
    if (failCount > 0) {
      new Notice(`${failCount} conflict(s) failed to resolve`);
      this.onOpen();
    } else {
      this.close();
      this.onAllResolved();
    }
  }

  onClose(): void {
    this.diffStates = {};
    this.contentEl.empty();
  }
}
