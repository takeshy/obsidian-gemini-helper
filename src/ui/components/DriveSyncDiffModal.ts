// Sync diff modal for Google Drive sync.
// Shows file list with expandable diff view, similar to GemiHub's SyncDiffDialog.

import { Modal, App, Setting, setIcon, TFile } from "obsidian";
import { createTwoFilesPatch } from "diff";
import type { SyncFileListItem, DriveSyncManager } from "src/core/driveSync";
import { isBinaryExtension } from "src/core/driveSyncUtils";
import { t } from "src/i18n";

interface DiffState {
  loading: boolean;
  diff: string | null;
  error: boolean;
  expanded: boolean;
}

export class DriveSyncDiffModal extends Modal {
  private files: SyncFileListItem[];
  private direction: "push" | "pull";
  private syncManager: DriveSyncManager;
  private resolve: ((confirmed: boolean) => void) | null = null;
  private diffStates: Record<string, DiffState> = {};

  constructor(
    app: App,
    files: SyncFileListItem[],
    direction: "push" | "pull",
    syncManager: DriveSyncManager,
  ) {
    super(app);
    this.files = files;
    this.direction = direction;
    this.syncManager = syncManager;
  }

  openAndWait(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("gemini-helper-sync-diff-modal");

    const title = this.direction === "push" ? t("driveSync.pushChanges") : t("driveSync.pullChanges");
    contentEl.createEl("h2", { text: `${title} (${this.files.length})` });

    if (this.files.length === 0) {
      contentEl.createEl("p", {
        text: t("driveSync.noFilesToSync"),
        cls: "setting-item-description",
      });
    } else {
      const listEl = contentEl.createDiv({ cls: "gemini-helper-sync-diff-list" });

      for (const file of this.files) {
        this.renderFileItem(listEl, file);
      }
    }

    const footer = new Setting(contentEl);
    footer.addButton((btn) =>
      btn.setButtonText(t("common.cancel")).onClick(() => {
        const resolve = this.resolve;
        this.resolve = null;
        this.close();
        resolve?.(false);
      })
    );

    if (this.files.length > 0) {
      footer.addButton((btn) =>
        btn
          .setButtonText(this.direction === "push" ? t("driveSync.push") : t("driveSync.pull"))
          .setCta()
          .onClick(() => {
            const resolve = this.resolve;
            this.resolve = null;
            this.close();
            resolve?.(true);
          })
      );
    }
  }

  private renderFileItem(listEl: HTMLElement, file: SyncFileListItem): void {
    const itemEl = listEl.createDiv({ cls: "gemini-helper-sync-diff-file" });
    const headerEl = itemEl.createDiv({ cls: "gemini-helper-sync-diff-file-header" });

    // Type icon
    let iconName: string;
    let iconCls: string;
    switch (file.type) {
      case "new":
        iconName = "plus";
        iconCls = "gemini-helper-sync-diff-new";
        break;
      case "modified":
        iconName = "pencil";
        iconCls = "gemini-helper-sync-diff-modified";
        break;
      case "deleted":
        iconName = "trash-2";
        iconCls = "gemini-helper-sync-diff-deleted";
        break;
      case "renamed":
        iconName = "arrow-right";
        iconCls = "gemini-helper-sync-diff-modified";
        break;
      case "editDeleted":
        iconName = "alert-triangle";
        iconCls = "gemini-helper-sync-diff-edit-deleted";
        break;
    }

    const iconEl = headerEl.createSpan({ cls: `gemini-helper-sync-diff-icon ${iconCls}` });
    setIcon(iconEl, iconName);

    // File name
    const nameEl = headerEl.createSpan({ cls: "gemini-helper-sync-diff-name" });
    if (file.type === "renamed" && file.oldName) {
      nameEl.setText(`${file.oldName} → ${file.name}`);
    } else {
      nameEl.setText(file.name);
    }

    if (file.type === "editDeleted") {
      const tagEl = headerEl.createSpan({ cls: "gemini-helper-sync-diff-tag" });
      tagEl.setText(t("driveSync.deletedOnRemote"));
    }

    // Open button (only when file exists locally)
    const hasLocal = !(file.type === "new" && this.direction === "pull");
    if (hasLocal) {
      const openBtn = headerEl.createEl("button", { cls: "gemini-helper-sync-diff-toggle" });
      const openIconEl = openBtn.createSpan();
      setIcon(openIconEl, "external-link");
      const openLabel = openBtn.createSpan();
      openLabel.setText(t("driveSync.open"));
      openBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const resolve = this.resolve;
        this.resolve = null;
        this.close();
        resolve?.(false);
        void this.app.workspace.openLinkText(file.name, "", false);
      });
    }

    // Diff toggle button (for non-binary, non-editDeleted files)
    const canDiff = !isBinaryExtension(file.name) && file.type !== "editDeleted";
    if (canDiff) {
      const diffBtn = headerEl.createEl("button", { cls: "gemini-helper-sync-diff-toggle" });
      const chevronEl = diffBtn.createSpan();
      setIcon(chevronEl, "chevron-right");
      const diffLabel = diffBtn.createSpan();
      diffLabel.setText(t("driveSync.diff"));

      const diffPanel = itemEl.createDiv({ cls: "gemini-helper-sync-diff-panel gemini-helper-hidden" });

      diffBtn.addEventListener("click", () => {
        void this.handleDiffToggle(file, diffPanel, chevronEl, diffLabel);
      });
    } else if (!canDiff && file.type !== "editDeleted") {
      const noDiffEl = headerEl.createSpan({ cls: "gemini-helper-sync-diff-no-diff" });
      noDiffEl.setText(t("driveSync.binary"));
    }
  }

  private async handleDiffToggle(
    file: SyncFileListItem,
    panel: HTMLElement,
    chevronEl: HTMLElement,
    diffLabel: HTMLElement,
  ): Promise<void> {
    const state = this.diffStates[file.id];

    // If already loaded, toggle visibility
    if (state?.diff !== null && state?.diff !== undefined && !state.error) {
      state.expanded = !state.expanded;
      panel.toggleClass("gemini-helper-hidden", !state.expanded);
      setIcon(chevronEl, state.expanded ? "chevron-down" : "chevron-right");
      diffLabel.setText(state.expanded ? t("driveSync.hide") : t("driveSync.diff"));
      return;
    }

    // Prevent duplicate requests while loading
    if (state?.loading) {
      state.expanded = !state.expanded;
      panel.toggleClass("gemini-helper-hidden", !state.expanded);
      setIcon(chevronEl, state.expanded ? "chevron-down" : "chevron-right");
      diffLabel.setText(state.expanded ? t("driveSync.hide") : t("driveSync.diff"));
      return;
    }

    // Show loading
    this.diffStates[file.id] = { loading: true, diff: null, error: false, expanded: true };
    panel.toggleClass("gemini-helper-hidden", false);
    panel.empty();
    panel.createDiv({ cls: "gemini-helper-sync-diff-loading", text: t("driveSync.loading") });
    setIcon(chevronEl, "chevron-down");
    diffLabel.setText(t("driveSync.hide"));

    try {
      // Get local content
      let localContent = "";
      try {
        const tfile = this.app.vault.getAbstractFileByPath(file.name);
        if (tfile instanceof TFile) {
          localContent = await this.app.vault.read(tfile);
        }
      } catch {
        // File may not exist locally (new remote file)
      }

      // Get remote content (skip when file doesn't exist on Drive)
      let remoteContent = "";
      if ((file.type !== "new" && file.type !== "deleted") || (file.type === "new" && this.direction === "pull")) {
        try {
          remoteContent = await this.syncManager.readRemoteFile(file.id);
        } catch {
          // File may not exist remotely
        }
      }

      // Determine old/new based on direction
      // Push: old=Drive(remote), new=Local
      // Pull: old=Local, new=Drive(remote)
      let oldContent: string;
      let newContent: string;
      const oldLabel = this.direction === "push" ? "Drive" : "Local";
      const newLabel = this.direction === "push" ? "Local" : "Drive";

      if (file.type === "new") {
        oldContent = "";
        newContent = this.direction === "push" ? localContent : remoteContent;
      } else if (file.type === "deleted") {
        oldContent = this.direction === "push" ? remoteContent : localContent;
        newContent = "";
      } else {
        oldContent = this.direction === "push" ? remoteContent : localContent;
        newContent = this.direction === "push" ? localContent : remoteContent;
      }

      const patch = createTwoFilesPatch(
        file.name,
        file.name,
        oldContent,
        newContent,
        oldLabel,
        newLabel,
        { context: 3 },
      );

      this.diffStates[file.id] = { loading: false, diff: patch, error: false, expanded: true };
      panel.empty();
      this.renderDiffView(panel, patch);
    } catch {
      this.diffStates[file.id] = { loading: false, diff: null, error: true, expanded: true };
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

  onClose(): void {
    if (this.resolve) {
      this.resolve(false);
      this.resolve = null;
    }
    this.diffStates = {};
    this.contentEl.empty();
  }
}
