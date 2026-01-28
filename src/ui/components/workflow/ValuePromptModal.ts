import { App, Modal } from "obsidian";
import { t } from "src/i18n";

export class ValuePromptModal extends Modal {
  private title: string;
  private defaultValue: string;
  private multiline: boolean;
  private resolve: (result: string | null) => void;
  private inputEl: HTMLInputElement | HTMLTextAreaElement | null = null;

  constructor(
    app: App,
    title: string,
    defaultValue: string,
    multiline: boolean,
    resolve: (result: string | null) => void
  ) {
    super(app);
    this.title = title;
    this.defaultValue = defaultValue;
    this.multiline = multiline;
    this.resolve = resolve;
  }

  onOpen(): void {
    const { contentEl, containerEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("workflow-value-prompt-modal");

    // Prevent closing on outside click
    containerEl.setCssProps({ 'pointer-events': 'none' });
    modalEl.setCssProps({ 'pointer-events': 'auto' });

    // Title
    contentEl.createEl("h2", { text: this.title || t("workflowModal.enterValue") });

    // Input field
    const inputContainer = contentEl.createDiv({ cls: "workflow-value-input-container" });

    if (this.multiline) {
      this.inputEl = inputContainer.createEl("textarea", {
        cls: "workflow-value-textarea",
        attr: {
          placeholder: t("workflowModal.enterValuePlaceholder"),
          rows: "8",
        },
      });
      this.inputEl.value = this.defaultValue;
    } else {
      this.inputEl = inputContainer.createEl("input", {
        type: "text",
        cls: "workflow-value-input",
        attr: {
          placeholder: t("workflowModal.enterValuePlaceholder"),
        },
      });
      this.inputEl.value = this.defaultValue;
    }

    // Handle Enter key for single-line input
    if (!this.multiline) {
      this.inputEl.addEventListener("keydown", (e) => {
        if ((e as KeyboardEvent).key === "Enter") {
          e.preventDefault();
          this.confirmValue();
        }
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
      this.confirmValue();
    });

    // Focus input
    setTimeout(() => this.inputEl?.focus(), 50);
  }

  private confirmValue(): void {
    const value = this.inputEl?.value || "";
    this.resolve(value);
    this.close();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export function promptForValue(
  app: App,
  title: string,
  defaultValue: string = "",
  multiline: boolean = false
): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = new ValuePromptModal(app, title, defaultValue, multiline, resolve);
    modal.open();
  });
}
