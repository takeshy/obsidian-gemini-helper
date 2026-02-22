// Trash management modal for Google Drive sync.
// Lists files in the trash/ folder and allows restore or permanent deletion.

import { Modal, App, Setting, Notice } from "obsidian";
import type { DriveSyncManager } from "src/core/driveSync";
import type { DriveFile } from "src/core/googleDrive";
import { isBinaryExtension } from "src/core/driveSyncUtils";
import { t } from "src/i18n";
import { formatError } from "src/utils/error";
import { ConfirmModal } from "./ConfirmModal";

export class DriveTrashModal extends Modal {
  private syncManager: DriveSyncManager;
  private files: DriveFile[] = [];
  private selected = new Set<string>();
  private loading = true;
  private processing = false;
  private previewCache = new Map<string, string | null>();
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
      this.files = await this.syncManager.listTrashFiles();
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

    contentEl.createEl("h2", { text: `${t("driveSync.trashTitle")} (${this.files.length})` });

    if (this.loading || this.processing) {
      const el = contentEl.createDiv({ cls: "gemini-helper-drive-modal-processing" });
      el.createEl("div", { cls: "spinner" });
      el.createEl("div", { text: this.processing ? t("driveSync.processing") : t("driveSync.loading") });
      return;
    }

    if (this.files.length === 0) {
      contentEl.createEl("p", { text: t("driveSync.trashNoFiles"), cls: "setting-item-description" });
      return;
    }

    // Select all
    new Setting(contentEl)
      .setName(t("driveSync.selectAll"))
      .addToggle((toggle) =>
        toggle.setValue(this.selected.size === this.files.length).onChange((val) => {
          if (val) { this.files.forEach((f) => this.selected.add(f.id)); }
          else { this.selected.clear(); }
          this.render();
        })
      );

    // File list
    const listEl = contentEl.createDiv({ cls: "gemini-helper-drive-file-list" });
    for (const file of this.files) {
      const desc = file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : "";
      new Setting(listEl)
        .setName(file.name)
        .setDesc(desc)
        .addButton((btn) =>
          btn.setButtonText(t("driveSync.preview")).onClick(() => {
            this.togglePreview(file);
          })
        )
        .addToggle((toggle) =>
          toggle.setValue(this.selected.has(file.id)).onChange((val) => {
            if (val) { this.selected.add(file.id); }
            else { this.selected.delete(file.id); }
          })
        );

      if (this.expandedPreview === file.id) {
        this.renderPreviewPanel(listEl, file);
      }
    }

    // Footer
    const footer = contentEl.createDiv({ cls: "gemini-helper-drive-modal-footer" });
    const restoreBtn = footer.createEl("button", { text: t("driveSync.trashRestore"), cls: "mod-cta" });
    restoreBtn.disabled = this.selected.size === 0;
    restoreBtn.addEventListener("click", () => { if (this.selected.size > 0) void this.doRestore(); });

    const deleteBtn = footer.createEl("button", { text: t("driveSync.trashDeletePermanently"), cls: "mod-warning" });
    deleteBtn.disabled = this.selected.size === 0;
    deleteBtn.addEventListener("click", () => { if (this.selected.size > 0) void this.confirmAndDelete(); });
  }

  private togglePreview(file: DriveFile): void {
    if (this.expandedPreview === file.id) {
      this.expandedPreview = null;
      this.render();
      return;
    }
    this.expandedPreview = file.id;
    if (!this.previewCache.has(file.id)) {
      this.render(); // show loading
      void this.fetchPreview(file);
    } else {
      this.render();
    }
  }

  private async fetchPreview(file: DriveFile): Promise<void> {
    if (isBinaryExtension(file.name)) {
      this.previewCache.set(file.id, null);
      this.render();
      return;
    }
    try {
      const content = await this.syncManager.readRemoteFile(file.id);
      this.previewCache.set(file.id, content);
    } catch {
      this.previewCache.set(file.id, null);
    }
    this.render();
  }

  private renderPreviewPanel(container: HTMLElement, file: DriveFile): void {
    const panel = container.createDiv({ cls: "gemini-helper-drive-preview-panel" });
    if (isBinaryExtension(file.name)) {
      panel.createDiv({ cls: "gemini-helper-drive-preview-loading", text: t("driveSync.previewBinary") });
      return;
    }
    const cached = this.previewCache.get(file.id);
    if (cached === undefined) {
      panel.createDiv({ cls: "gemini-helper-drive-preview-loading", text: t("driveSync.loading") });
    } else if (cached === null) {
      panel.createDiv({ cls: "gemini-helper-drive-preview-loading", text: t("driveSync.previewFailed") });
    } else {
      panel.createEl("pre", { text: cached });
    }
  }

  private async doRestore(): Promise<void> {
    this.processing = true;
    this.render();
    try {
      const count = await this.syncManager.restoreFromTrash([...this.selected]);
      if (count > 0) {
        new Notice(t("driveSync.restored", { count: String(count) }));
        this.onDone();
      }
    } catch (err) { new Notice(formatError(err)); }
    this.selected.clear();
    this.expandedPreview = null;
    this.processing = false;
    this.loading = true;
    this.render();
    await this.loadFiles();
  }

  private async confirmAndDelete(): Promise<void> {
    const confirmed = await new ConfirmModal(this.app, t("driveSync.trashDeleteConfirm")).openAndWait();
    if (!confirmed) return;
    this.processing = true;
    this.render();
    try {
      const count = await this.syncManager.permanentDeleteFiles([...this.selected]);
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

  onClose(): void {
    this.previewCache.clear();
    this.contentEl.empty();
  }
}
