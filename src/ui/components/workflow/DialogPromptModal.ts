import { App, Component, MarkdownRenderer, Modal, Setting } from "obsidian";
import type { DialogResult } from "src/workflow/types";
import { extractHtmlFromCodeBlock } from "../HTMLPreviewModal";

export class DialogPromptModal extends Modal {
  private title: string;
  private message: string;
  private options: string[];
  private multiSelect: boolean;
  private button1: string;
  private button2?: string;
  private markdown: boolean;
  private inputTitle?: string;
  private defaults?: { input?: string; selected?: string[] };
  private multiline: boolean;
  private resolve: (result: DialogResult | null) => void;
  private selectedOptions: Set<string> = new Set();
  private inputValue: string = "";
  private component: Component;

  constructor(
    app: App,
    title: string,
    message: string,
    options: string[],
    multiSelect: boolean,
    button1: string,
    button2?: string,
    markdown: boolean = false,
    inputTitle?: string,
    defaults?: { input?: string; selected?: string[] },
    multiline: boolean = false
  ) {
    super(app);
    this.title = title;
    this.message = message;
    this.options = options;
    this.multiSelect = multiSelect;
    this.button1 = button1;
    this.button2 = button2;
    this.markdown = markdown;
    this.inputTitle = inputTitle;
    this.defaults = defaults;
    this.multiline = multiline;
    // Initialize with defaults
    if (defaults?.selected) {
      for (const opt of defaults.selected) {
        this.selectedOptions.add(opt);
      }
    }
    if (defaults?.input) {
      this.inputValue = defaults.input;
    }
    this.resolve = () => {};
    this.component = new Component();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("gemini-helper-dialog-modal");

    // Title
    contentEl.createEl("h2", { text: this.title });

    // Message
    if (this.message) {
      // Check for HTML code block first
      const htmlContent = extractHtmlFromCodeBlock(this.message);

      if (htmlContent) {
        // Render HTML in iframe
        const iframeContainer = contentEl.createDiv({
          cls: "gemini-helper-dialog-html-container"
        });
        iframeContainer.createEl("iframe", {
          attr: {
            sandbox: "", // No scripts allowed for security
            srcdoc: htmlContent,
          },
          cls: "gemini-helper-dialog-html-iframe"
        });
      } else if (this.markdown) {
        const messageEl = contentEl.createDiv({ cls: "gemini-helper-dialog-message gemini-helper-dialog-markdown" });
        this.component.load();
        MarkdownRenderer.render(
          this.app,
          this.message,
          messageEl,
          "",
          this.component
        );
      } else {
        contentEl.createEl("p", {
          text: this.message,
          cls: "gemini-helper-dialog-message"
        });
      }
    }

    // Options (checkboxes)
    if (this.options.length > 0) {
      const optionsContainer = contentEl.createDiv({ cls: "gemini-helper-dialog-options" });

      for (const option of this.options) {
        const isDefaultSelected = this.defaults?.selected?.includes(option) ?? false;
        new Setting(optionsContainer)
          .setName(option)
          .addToggle((toggle) => {
            toggle.setValue(isDefaultSelected);
            toggle.onChange((value) => {
              if (value) {
                if (!this.multiSelect) {
                  // Single select: clear other selections
                  this.selectedOptions.clear();
                  // Update all other toggles
                  const toggles = optionsContainer.querySelectorAll(".checkbox-container input");
                  toggles.forEach((t) => {
                    const input = t as HTMLInputElement;
                    if (input !== toggle.toggleEl) {
                      input.checked = false;
                    }
                  });
                }
                this.selectedOptions.add(option);
              } else {
                this.selectedOptions.delete(option);
              }
            });
          });
      }
    }

    // Input field (if inputTitle is set)
    if (this.inputTitle) {
      if (this.multiline) {
        new Setting(contentEl)
          .setName(this.inputTitle)
          .addTextArea((textArea) => {
            if (this.defaults?.input) {
              textArea.setValue(this.defaults.input);
            }
            textArea.inputEl.rows = 6;
            textArea.inputEl.setCssStyles({ width: "100%" });
            textArea.onChange((value) => {
              this.inputValue = value;
            });
          });
      } else {
        new Setting(contentEl)
          .setName(this.inputTitle)
          .addText((text) => {
            if (this.defaults?.input) {
              text.setValue(this.defaults.input);
            }
            text.onChange((value) => {
              this.inputValue = value;
            });
          });
      }
    }

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "gemini-helper-dialog-buttons" });

    // Button 2 (if exists) - shown on left
    if (this.button2) {
      const btn2 = buttonContainer.createEl("button", { text: this.button2 });
      btn2.addEventListener("click", () => {
        this.resolve({
          button: this.button2!,
          selected: Array.from(this.selectedOptions),
          input: this.inputTitle ? this.inputValue : undefined,
        });
        this.close();
      });
    }

    // Button 1 - shown on right (primary)
    const btn1 = buttonContainer.createEl("button", {
      text: this.button1,
      cls: "mod-cta"
    });
    btn1.addEventListener("click", () => {
      this.resolve({
        button: this.button1,
        selected: Array.from(this.selectedOptions),
        input: this.inputTitle ? this.inputValue : undefined,
      });
      this.close();
    });
  }

  onClose() {
    this.component.unload();
    const { contentEl } = this;
    contentEl.empty();
  }

  async waitForResult(): Promise<DialogResult | null> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }
}

export function promptForDialog(
  app: App,
  title: string,
  message: string,
  options: string[],
  multiSelect: boolean,
  button1: string,
  button2?: string,
  markdown: boolean = false,
  inputTitle?: string,
  defaults?: { input?: string; selected?: string[] },
  multiline: boolean = false
): Promise<DialogResult | null> {
  const modal = new DialogPromptModal(
    app,
    title,
    message,
    options,
    multiSelect,
    button1,
    button2,
    markdown,
    inputTitle,
    defaults,
    multiline
  );
  return modal.waitForResult();
}
