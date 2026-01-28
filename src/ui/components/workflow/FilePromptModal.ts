import { App, Modal, TFile, FuzzySuggestModal, MarkdownRenderer, Component } from "obsidian";
import { t } from "src/i18n";

class FileSuggestModal extends FuzzySuggestModal<TFile> {
  private onSelect: (file: TFile | null) => void;
  private files: TFile[];
  private selected = false;

  constructor(app: App, onSelect: (file: TFile | null) => void) {
    super(app);
    this.onSelect = onSelect;
    this.files = this.app.vault.getMarkdownFiles();
    this.setPlaceholder(t("workflowModal.selectFilePlaceholder"));
  }

  getItems(): TFile[] {
    return this.files;
  }

  getItemText(item: TFile): string {
    return item.path;
  }

  onChooseItem(item: TFile): void {
    this.selected = true;
    this.onSelect(item);
  }

  onClose(): void {
    if (!this.selected) {
      this.onSelect(null);
    }
  }
}

export class FilePromptModal extends Modal {
  private title: string;
  private resolve: (result: string | null) => void;
  private selectedFile: TFile | null = null;
  private previewEl: HTMLElement | null = null;
  private component: Component;

  constructor(
    app: App,
    title: string,
    resolve: (result: string | null) => void
  ) {
    super(app);
    this.title = title;
    this.resolve = resolve;
    this.component = new Component();
  }

  onOpen(): void {
    const { contentEl, containerEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("workflow-file-prompt-modal");
    this.component.load();

    // Prevent closing on outside click
    containerEl.setCssProps({ 'pointer-events': 'none' });
    modalEl.setCssProps({ 'pointer-events': 'auto' });

    // Title
    contentEl.createEl("h2", { text: this.title || t("workflowModal.selectFile") });

    // File selector button
    const selectorContainer = contentEl.createDiv({ cls: "workflow-file-selector" });

    const selectBtn = selectorContainer.createEl("button", {
      text: t("workflowModal.selectFileBtn"),
      cls: "workflow-select-file-btn",
    });

    const selectedLabel = selectorContainer.createEl("span", {
      text: t("workflowModal.noFileSelected"),
      cls: "workflow-selected-file-label",
    });

    selectBtn.addEventListener("click", () => {
      new FileSuggestModal(this.app, (file) => {
        if (file) {
          this.selectedFile = file;
          selectedLabel.setText(file.path);
          void this.showPreview(file);
        }
      }).open();
    });

    // Preview container
    const previewContainer = contentEl.createDiv({ cls: "workflow-file-preview-container" });
    previewContainer.createEl("h4", { text: t("workflowModal.preview") });
    this.previewEl = previewContainer.createDiv({ cls: "workflow-file-preview" });
    this.previewEl.setText(t("workflowModal.selectFileToPreview"));

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "workflow-prompt-buttons" });

    const cancelBtn = buttonContainer.createEl("button", { text: t("workflowModal.cancel") });
    cancelBtn.addEventListener("click", () => {
      this.resolve(null);
      this.close();
    });

    const confirmBtn = buttonContainer.createEl("button", {
      text: t("workflowModal.confirm"),
      cls: "mod-cta",
    });
    confirmBtn.addEventListener("click", () => {
      if (this.selectedFile) {
        this.resolve(this.selectedFile.path);
        this.close();
      }
    });
  }

  private async showPreview(file: TFile): Promise<void> {
    if (!this.previewEl) return;

    this.previewEl.empty();

    try {
      const content = await this.app.vault.read(file);
      await MarkdownRenderer.render(
        this.app,
        content.substring(0, 3000) + (content.length > 3000 ? "\n\n" + t("workflowModal.truncated") : ""),
        this.previewEl,
        file.path,
        this.component
      );
    } catch {
      this.previewEl.setText(t("workflowModal.failedToLoadPreview"));
    }
  }

  onClose(): void {
    this.component.unload();
    const { contentEl } = this;
    contentEl.empty();
  }
}

export function promptForFile(app: App, title: string): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = new FilePromptModal(app, title, resolve);
    modal.open();
  });
}

// Modal for selecting any file type (not just markdown)
class AnyFileSuggestModal extends FuzzySuggestModal<TFile> {
  private onSelect: (file: TFile | null) => void;
  private files: TFile[];
  private selected = false;
  private extensions?: string[];

  constructor(app: App, onSelect: (file: TFile | null) => void, extensions?: string[]) {
    super(app);
    this.onSelect = onSelect;
    this.extensions = extensions;
    // Get all files, optionally filtered by extension
    this.files = this.app.vault.getFiles().filter((f) => {
      if (!this.extensions || this.extensions.length === 0) return true;
      return this.extensions.includes(f.extension.toLowerCase());
    });
    this.setPlaceholder(t("workflowModal.selectFilePlaceholder"));
  }

  getItems(): TFile[] {
    return this.files;
  }

  getItemText(item: TFile): string {
    return item.path;
  }

  onChooseItem(item: TFile): void {
    this.selected = true;
    this.onSelect(item);
  }

  onClose(): void {
    if (!this.selected) {
      this.onSelect(null);
    }
  }
}

// Modal for any file selection with preview
class AnyFilePromptModal extends Modal {
  private title: string;
  private resolve: (result: string | null) => void;
  private selectedFile: TFile | null = null;
  private previewEl: HTMLElement | null = null;
  private component: Component;
  private extensions?: string[];
  private resolved = false;

  constructor(
    app: App,
    title: string,
    resolve: (result: string | null) => void,
    extensions?: string[]
  ) {
    super(app);
    this.title = title;
    this.resolve = resolve;
    this.extensions = extensions;
    this.component = new Component();
  }

  onOpen(): void {
    const { contentEl, containerEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("workflow-file-prompt-modal");
    this.component.load();

    // Prevent closing on outside click
    containerEl.setCssProps({ 'pointer-events': 'none' });
    modalEl.setCssProps({ 'pointer-events': 'auto' });

    // Title
    contentEl.createEl("h2", { text: this.title || t("workflowModal.selectFile") });

    // File selector button
    const selectorContainer = contentEl.createDiv({ cls: "workflow-file-selector" });

    const selectBtn = selectorContainer.createEl("button", {
      text: t("workflowModal.selectFileBtn"),
      cls: "workflow-select-file-btn",
    });

    const selectedLabel = selectorContainer.createEl("span", {
      text: t("workflowModal.noFileSelected"),
      cls: "workflow-selected-file-label",
    });

    selectBtn.addEventListener("click", () => {
      new AnyFileSuggestModal(this.app, (file) => {
        if (file) {
          this.selectedFile = file;
          selectedLabel.setText(file.path);
          void this.showPreview(file);
        }
      }, this.extensions).open();
    });

    // Preview container
    const previewContainer = contentEl.createDiv({ cls: "workflow-file-preview-container" });
    previewContainer.createEl("h4", { text: t("workflowModal.preview") });
    this.previewEl = previewContainer.createDiv({ cls: "workflow-file-preview" });
    this.previewEl.setText(t("workflowModal.selectFileToPreview"));

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "workflow-prompt-buttons" });

    const cancelBtn = buttonContainer.createEl("button", { text: t("workflowModal.cancel") });
    cancelBtn.addEventListener("click", () => {
      this.resolved = true;
      this.resolve(null);
      this.close();
    });

    const confirmBtn = buttonContainer.createEl("button", {
      text: t("workflowModal.confirm"),
      cls: "mod-cta",
    });
    confirmBtn.addEventListener("click", () => {
      if (this.selectedFile) {
        this.resolved = true;
        this.resolve(this.selectedFile.path);
        this.close();
      }
    });
  }

  private async showPreview(file: TFile): Promise<void> {
    if (!this.previewEl) return;

    this.previewEl.empty();

    const ext = file.extension.toLowerCase();

    // Handle different file types
    if (ext === "md" || ext === "txt" || ext === "json" || ext === "csv") {
      // Text files: show content
      try {
        const content = await this.app.vault.read(file);
        if (ext === "md") {
          await MarkdownRenderer.render(
            this.app,
            content.substring(0, 3000) + (content.length > 3000 ? "\n\n" + t("workflowModal.truncated") : ""),
            this.previewEl,
            file.path,
            this.component
          );
        } else {
          const pre = this.previewEl.createEl("pre");
          pre.setText(content.substring(0, 3000) + (content.length > 3000 ? "\n\n" + t("workflowModal.truncated") : ""));
        }
      } catch {
        this.previewEl.setText(t("workflowModal.failedToLoadPreview"));
      }
    } else if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext)) {
      // Image files: show thumbnail
      const img = this.previewEl.createEl("img", {
        cls: "workflow-file-preview-image",
      });
      img.src = this.app.vault.getResourcePath(file);
    } else if (ext === "pdf") {
      // PDF files: show info
      this.previewEl.createEl("div", {
        text: `PDF: ${file.basename}.${file.extension}`,
        cls: "workflow-file-preview-pdf",
      });
      this.previewEl.createEl("div", {
        text: `Size: ${this.formatFileSize(file.stat.size)}`,
      });
    } else {
      // Other files: show basic info
      this.previewEl.createEl("div", { text: `File: ${file.path}` });
      this.previewEl.createEl("div", { text: `Size: ${this.formatFileSize(file.stat.size)}` });
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  onClose(): void {
    this.component.unload();
    const { contentEl } = this;
    contentEl.empty();
    // Ensure resolve is called if modal is closed without explicit action
    if (!this.resolved) {
      this.resolve(null);
    }
  }
}

export function promptForAnyFile(
  app: App,
  extensions?: string[],
  title?: string
): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = new AnyFilePromptModal(app, title || t("workflowModal.selectFile"), resolve, extensions);
    modal.open();
  });
}

// Modal for entering a new file path
class NewFilePathModal extends Modal {
  private title: string;
  private resolve: (result: string | null) => void;
  private extensions?: string[];
  private defaultPath: string;

  constructor(
    app: App,
    title: string,
    resolve: (result: string | null) => void,
    extensions?: string[],
    defaultPath?: string
  ) {
    super(app);
    this.title = title;
    this.resolve = resolve;
    this.extensions = extensions;
    this.defaultPath = defaultPath || "";
  }

  onOpen(): void {
    const { contentEl, containerEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("workflow-file-prompt-modal");

    // Prevent closing on outside click
    containerEl.setCssProps({ 'pointer-events': 'none' });
    modalEl.setCssProps({ 'pointer-events': 'auto' });

    // Title
    contentEl.createEl("h2", { text: this.title || t("workflowModal.enterFilePath") });

    // Input container
    const inputContainer = contentEl.createDiv({ cls: "workflow-file-path-input" });

    const input = inputContainer.createEl("input", {
      type: "text",
      placeholder: t("workflowModal.filePathPlaceholder"),
      value: this.defaultPath,
    });

    // Extension hint
    if (this.extensions && this.extensions.length > 0) {
      contentEl.createEl("div", {
        text: t("workflowModal.allowedExtensions", { extensions: this.extensions.join(", ") }),
        cls: "workflow-file-path-hint",
      });
    }

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "workflow-prompt-buttons" });

    const cancelBtn = buttonContainer.createEl("button", { text: t("workflowModal.cancel") });
    cancelBtn.addEventListener("click", () => {
      this.resolve(null);
      this.close();
    });

    const confirmBtn = buttonContainer.createEl("button", {
      text: t("workflowModal.confirm"),
      cls: "mod-cta",
    });
    confirmBtn.addEventListener("click", () => {
      const path = input.value.trim();
      if (path) {
        this.resolve(path);
        this.close();
      }
    });

    // Focus input
    input.focus();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export function promptForNewFilePath(
  app: App,
  extensions?: string[],
  defaultPath?: string
): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = new NewFilePathModal(app, t("workflowModal.enterFilePath"), resolve, extensions, defaultPath);
    modal.open();
  });
}
