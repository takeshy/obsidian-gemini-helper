import { App, Modal, TFile, FuzzySuggestModal } from "obsidian";
import { SelectionInfo, EditorPosition } from "src/workflow/types";
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

export class SelectionPromptModal extends Modal {
  private title: string;
  private resolve: (result: SelectionInfo | null) => void;
  private selectedFile: TFile | null = null;
  private textareaEl: HTMLTextAreaElement | null = null;
  private fileContent = "";
  private selectionInfoEl: HTMLElement | null = null;

  constructor(
    app: App,
    title: string,
    resolve: (result: SelectionInfo | null) => void
  ) {
    super(app);
    this.title = title;
    this.resolve = resolve;
  }

  onOpen(): void {
    const { contentEl, containerEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("workflow-selection-prompt-modal");

    // Prevent closing on outside click
    containerEl.setCssProps({ 'pointer-events': 'none' });
    modalEl.setCssProps({ 'pointer-events': 'auto' });

    // Title
    contentEl.createEl("h2", { text: this.title || t("workflowModal.selectText") });

    // File selector
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
          void this.loadFileContent(file);
        }
      }).open();
    });

    // Instructions
    contentEl.createEl("p", {
      text: t("workflowModal.selectTextInstruction"),
      cls: "workflow-selection-instruction",
    });

    // Textarea for content with selection capability
    const textareaContainer = contentEl.createDiv({ cls: "workflow-selection-textarea-container" });
    this.textareaEl = textareaContainer.createEl("textarea", {
      cls: "workflow-selection-textarea",
      attr: {
        readonly: "true",
        placeholder: t("workflowModal.selectFileToLoad"),
      },
    });

    // Selection info
    this.selectionInfoEl = contentEl.createDiv({ cls: "workflow-selection-info" });
    this.selectionInfoEl.setText(t("workflowModal.noTextSelected"));

    // Update selection info on text selection
    this.textareaEl.addEventListener("select", () => this.updateSelectionInfo());
    this.textareaEl.addEventListener("mouseup", () => this.updateSelectionInfo());
    this.textareaEl.addEventListener("keyup", () => this.updateSelectionInfo());

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "workflow-prompt-buttons" });

    const cancelBtn = buttonContainer.createEl("button", { text: t("workflowModal.cancel") });
    cancelBtn.addEventListener("click", () => {
      this.resolve(null);
      this.close();
    });

    const confirmBtn = buttonContainer.createEl("button", {
      text: t("workflowModal.confirmSelection"),
      cls: "mod-cta",
    });
    confirmBtn.addEventListener("click", () => {
      this.confirmSelection();
    });
  }

  private async loadFileContent(file: TFile): Promise<void> {
    if (!this.textareaEl) return;

    try {
      this.fileContent = await this.app.vault.read(file);
      this.textareaEl.value = this.fileContent;
      this.textareaEl.setSelectionRange(0, 0);
      this.updateSelectionInfo();
    } catch {
      this.textareaEl.value = t("workflowModal.failedToLoadContent");
      this.fileContent = "";
    }
  }

  private getPositionFromOffset(text: string, offset: number): EditorPosition {
    const lines = text.substring(0, offset).split("\n");
    const line = lines.length - 1;
    const ch = lines[lines.length - 1].length;
    return { line, ch };
  }

  private updateSelectionInfo(): void {
    if (!this.textareaEl || !this.selectionInfoEl) return;

    const start = this.textareaEl.selectionStart;
    const end = this.textareaEl.selectionEnd;

    if (start === end) {
      this.selectionInfoEl.setText(t("workflowModal.noTextSelected"));
      return;
    }

    const selectedText = this.textareaEl.value.substring(start, end);
    const startPos = this.getPositionFromOffset(this.textareaEl.value, start);
    const endPos = this.getPositionFromOffset(this.textareaEl.value, end);

    const charCount = selectedText.length;
    const lineCount = endPos.line - startPos.line + 1;

    this.selectionInfoEl.setText(
      t("workflowModal.selectedInfo", {
        chars: String(charCount),
        startLine: String(startPos.line + 1),
        startCh: String(startPos.ch),
        endLine: String(endPos.line + 1),
        endCh: String(endPos.ch),
        lines: String(lineCount),
      })
    );
  }

  private confirmSelection(): void {
    if (!this.textareaEl || !this.selectedFile) {
      this.resolve(null);
      this.close();
      return;
    }

    const startOffset = this.textareaEl.selectionStart;
    const endOffset = this.textareaEl.selectionEnd;

    const startPos = this.getPositionFromOffset(this.textareaEl.value, startOffset);
    const endPos = this.getPositionFromOffset(this.textareaEl.value, endOffset);

    this.resolve({
      path: this.selectedFile.path,
      start: startPos,
      end: endPos,
    });
    this.close();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export function promptForSelection(app: App, title: string): Promise<SelectionInfo | null> {
  return new Promise((resolve) => {
    const modal = new SelectionPromptModal(app, title, resolve);
    modal.open();
  });
}
