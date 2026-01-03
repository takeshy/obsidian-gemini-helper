import { App, Modal } from "obsidian";

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
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("workflow-value-prompt-modal");

    // Title
    contentEl.createEl("h2", { text: this.title || "Enter value" });

    // Input field
    const inputContainer = contentEl.createDiv({ cls: "workflow-value-input-container" });

    if (this.multiline) {
      this.inputEl = inputContainer.createEl("textarea", {
        cls: "workflow-value-textarea",
        attr: {
          placeholder: "Enter value...",
          rows: "8",
        },
      });
      this.inputEl.value = this.defaultValue;
    } else {
      this.inputEl = inputContainer.createEl("input", {
        type: "text",
        cls: "workflow-value-input",
        attr: {
          placeholder: "Enter value...",
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
