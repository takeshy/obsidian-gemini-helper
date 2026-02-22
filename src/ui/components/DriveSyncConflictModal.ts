// Conflict resolution modal for Google Drive sync.
// Shows conflicts and lets user choose local or remote for each file.

import { Modal, App, Setting, Notice } from "obsidian";
import type { ConflictInfo } from "src/core/syncDiff";
import type { DriveSyncManager } from "src/core/driveSync";
import { t } from "src/i18n";
import { formatError } from "src/utils/error";

export class DriveSyncConflictModal extends Modal {
  private syncManager: DriveSyncManager;
  private conflicts: ConflictInfo[];
  private onAllResolved: () => void;

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
    contentEl.addClass("gemini-helper-conflict-modal");

    // Prevent closing by clicking outside
    this.containerEl.setCssProps({ "pointer-events": "auto" });

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
    keepAllLocalBtn.addEventListener("click", () => {
      void this.resolveAll("local");
    });

    const keepAllRemoteBtn = bulkContainer.createEl("button", {
      text: t("driveSync.keepAllRemote"),
      cls: "mod-cta",
    });
    keepAllRemoteBtn.addEventListener("click", () => {
      void this.resolveAll("remote");
    });
  }

  private renderConflictItem(container: HTMLElement, conflict: ConflictInfo): void {
    const isEditDelete = conflict.isEditDelete;
    const desc = isEditDelete
      ? t("driveSync.localEditRemoteDelete")
      : `Local: ${conflict.localChecksum.slice(0, 8)}... | Remote: ${conflict.remoteChecksum.slice(0, 8)}...`;

    const setting = new Setting(container)
      .setName(conflict.fileName)
      .setDesc(desc);

    if (isEditDelete) {
      setting.addButton((btn) =>
        btn
          .setButtonText(t("driveSync.restorePush"))
          .setTooltip(t("driveSync.restorePushTooltip"))
          .onClick(() => {
            void this.resolveOne(conflict.fileId, "local");
          })
      );
      setting.addButton((btn) =>
        btn
          .setButtonText(t("driveSync.acceptDelete"))
          .setTooltip(t("driveSync.acceptDeleteTooltip"))
          .onClick(() => {
            void this.resolveOne(conflict.fileId, "remote");
          })
      );
    } else {
      setting.addButton((btn) =>
        btn
          .setButtonText(t("driveSync.keepLocal"))
          .onClick(() => {
            void this.resolveOne(conflict.fileId, "local");
          })
      );
      setting.addButton((btn) =>
        btn
          .setButtonText(t("driveSync.keepRemote"))
          .setCta()
          .onClick(() => {
            void this.resolveOne(conflict.fileId, "remote");
          })
      );
    }
  }

  private async resolveOne(fileId: string, choice: "local" | "remote"): Promise<void> {
    try {
      await this.syncManager.resolveConflict(fileId, choice);
      this.conflicts = this.conflicts.filter(c => c.fileId !== fileId);

      if (this.conflicts.length === 0) {
        this.close();
        this.onAllResolved();
      } else {
        // Re-render
        this.onOpen();
      }
    } catch (err) {
      new Notice(`Conflict resolution failed: ${formatError(err)}`);
    }
  }

  private async resolveAll(choice: "local" | "remote"): Promise<void> {
    let failCount = 0;
    for (const conflict of [...this.conflicts]) {
      try {
        await this.syncManager.resolveConflict(conflict.fileId, choice);
        this.conflicts = this.conflicts.filter(c => c.fileId !== conflict.fileId);
      } catch {
        failCount++;
      }
    }
    if (failCount > 0) {
      new Notice(`${failCount} conflict(s) failed to resolve`);
      this.onOpen();
    } else {
      this.close();
      this.onAllResolved();
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
