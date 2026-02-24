// Temporary files management modal for Google Drive sync.
// Lists files in the __TEMP__/ folder and allows applying or deleting.

import { Modal, App, Setting, Notice } from "obsidian";
import type { DriveSyncManager, TempFilePayload } from "src/core/driveSync";
import type { DriveFile } from "src/core/googleDrive";
import { t } from "src/i18n";
import { formatError } from "src/utils/error";
import { ConfirmModal } from "./ConfirmModal";

interface TempFileEntry {
  file: DriveFile;
  payload: TempFilePayload;
}

export class DriveTempFilesModal extends Modal {
  private syncManager: DriveSyncManager;
  private entries: TempFileEntry[] = [];
  private selected = new Set<string>();
  private loading = true;
  private processing = false;
  private expandedPreview: string | null = null;
  private onDone: () => void;

  constructor(app: App, syncManager: DriveSyncManager, onDone: () => void) {
    super(app);
    this.syncManager = syncManager;
    this.onDone = onDone;
  }

  onOpen(): void {
    this.render();
    void this.loadFiles();
  }

  private async loadFiles(): Promise<void> {
    try {
      this.entries = await this.syncManager.listTempFiles();
    } catch (err) {
      new Notice(formatError(err));
    }
    this.loading = false;
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("gemini-helper-drive-manage-modal");

    contentEl.createEl("h2", {
      text: `${t("driveSync.tempFilesTitle")} (${this.entries.length})`,
    });

    if (this.loading || this.processing) {
      const el = contentEl.createDiv({ cls: "gemini-helper-drive-modal-processing" });
      el.createEl("div", { cls: "spinner" });
      el.createEl("div", { text: this.processing ? t("driveSync.processing") : t("driveSync.loading") });
      return;
    }

    if (this.entries.length === 0) {
      contentEl.createEl("p", { text: t("driveSync.tempFilesNoFiles"), cls: "setting-item-description" });
      return;
    }

    // Select all toggle
    new Setting(contentEl)
      .setName(t("driveSync.selectAll"))
      .addToggle((toggle) =>
        toggle.setValue(this.selected.size === this.entries.length).onChange((val) => {
          if (val) { this.entries.forEach((e) => this.selected.add(e.file.id)); }
          else { this.selected.clear(); }
          this.render();
        })
      );

    // File list
    const listEl = contentEl.createDiv({ cls: "gemini-helper-drive-file-list" });
    for (const entry of this.entries) {
      const savedAt = entry.payload.savedAt
        ? t("driveSync.tempFilesSavedAt", { date: new Date(entry.payload.savedAt).toLocaleString() })
        : "";
      new Setting(listEl)
        .setName(entry.file.name)
        .setDesc(savedAt)
        .addButton((btn) =>
          btn.setButtonText(t("driveSync.preview")).onClick(() => {
            this.expandedPreview = this.expandedPreview === entry.file.id ? null : entry.file.id;
            this.render();
          })
        )
        .addToggle((toggle) =>
          toggle.setValue(this.selected.has(entry.file.id)).onChange((val) => {
            if (val) { this.selected.add(entry.file.id); }
            else { this.selected.delete(entry.file.id); }
            this.render();
          })
        );

      // Preview panel (content already available in payload)
      if (this.expandedPreview === entry.file.id) {
        const panel = listEl.createDiv({ cls: "gemini-helper-drive-preview-panel" });
        panel.createEl("pre", { text: entry.payload.content || "" });
      }
    }

    // Footer
    const footer = contentEl.createDiv({ cls: "gemini-helper-drive-modal-footer" });
    const applyBtn = footer.createEl("button", { text: t("driveSync.tempFilesApply"), cls: "mod-cta" });
    applyBtn.disabled = this.selected.size === 0;
    applyBtn.addEventListener("click", () => { if (this.selected.size > 0) void this.confirmAndApply(); });

    const deleteBtn = footer.createEl("button", { text: t("driveSync.tempFilesDelete"), cls: "mod-warning" });
    deleteBtn.disabled = this.selected.size === 0;
    deleteBtn.addEventListener("click", () => { if (this.selected.size > 0) void this.confirmAndDelete(); });
  }

  private async confirmAndApply(): Promise<void> {
    const confirmed = await new ConfirmModal(this.app, t("driveSync.tempFilesApplyConfirm")).openAndWait();
    if (!confirmed) return;
    this.processing = true;
    this.render();
    let count = 0;
    let failCount = 0;
    for (const fileId of this.selected) {
      const entry = this.entries.find((e) => e.file.id === fileId);
      if (!entry) continue;
      try {
        await this.syncManager.downloadTempToVault(fileId, entry.payload);
        count++;
      } catch { failCount++; }
    }
    if (count > 0) {
      new Notice(t("driveSync.applied", { count: String(count) }));
      this.onDone();
    }
    if (failCount > 0) new Notice(`${failCount} file(s) failed to apply`);
    this.selected.clear();
    this.expandedPreview = null;
    this.processing = false;
    this.loading = true;
    this.render();
    await this.loadFiles();
  }

  private async confirmAndDelete(): Promise<void> {
    const confirmed = await new ConfirmModal(this.app, t("driveSync.tempFilesDeleteConfirm")).openAndWait();
    if (!confirmed) return;
    this.processing = true;
    this.render();
    try {
      const count = await this.syncManager.deleteTempFiles([...this.selected]);
      new Notice(t("driveSync.deleted", { count: String(count) }));
      this.selected.clear();
      this.expandedPreview = null;
      this.onDone();
    } catch (err) { new Notice(formatError(err)); }
    this.processing = false;
    this.loading = true;
    this.render();
    await this.loadFiles();
  }

  onClose(): void { this.contentEl.empty(); }
}
