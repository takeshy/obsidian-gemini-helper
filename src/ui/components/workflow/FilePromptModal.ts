import { App, Modal, TFile, FuzzySuggestModal, MarkdownRenderer, Component } from "obsidian";

class FileSuggestModal extends FuzzySuggestModal<TFile> {
  private onSelect: (file: TFile | null) => void;
  private files: TFile[];
  private selected = false;

  constructor(app: App, onSelect: (file: TFile | null) => void) {
    super(app);
    this.onSelect = onSelect;
    this.files = this.app.vault.getMarkdownFiles();
    this.setPlaceholder("Select a file...");
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
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("workflow-file-prompt-modal");
    this.component.load();

    // Title
    contentEl.createEl("h2", { text: this.title || "Select a file" });

    // File selector button
    const selectorContainer = contentEl.createDiv({ cls: "workflow-file-selector" });

    const selectBtn = selectorContainer.createEl("button", {
      text: "Select file...",
      cls: "workflow-select-file-btn",
    });

    const selectedLabel = selectorContainer.createEl("span", {
      text: "No file selected",
      cls: "workflow-selected-file-label",
    });

    selectBtn.addEventListener("click", () => {
      new FileSuggestModal(this.app, (file) => {
        if (file) {
          this.selectedFile = file;
          selectedLabel.setText(file.path);
          this.showPreview(file);
        }
      }).open();
    });

    // Preview container
    const previewContainer = contentEl.createDiv({ cls: "workflow-file-preview-container" });
    previewContainer.createEl("h4", { text: "Preview" });
    this.previewEl = previewContainer.createDiv({ cls: "workflow-file-preview" });
    this.previewEl.setText("Select a file to preview");

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "workflow-prompt-buttons" });

    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => {
      this.resolve(null);
      this.close();
    });

    const confirmBtn = buttonContainer.createEl("button", {
      text: "Confirm",
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
        content.substring(0, 3000) + (content.length > 3000 ? "\n\n...(truncated)" : ""),
        this.previewEl,
        file.path,
        this.component
      );
    } catch {
      this.previewEl.setText("Failed to load file preview");
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
