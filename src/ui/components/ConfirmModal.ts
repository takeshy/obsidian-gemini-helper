import { Modal, App } from "obsidian";
import { t } from "src/i18n";

export class ConfirmModal extends Modal {
  private message: string;
  private confirmText: string;
  private cancelText: string;
  private resolver: ((value: boolean) => void) | null = null;

  constructor(app: App, message: string, confirmText = t("common.confirm"), cancelText = t("common.cancel")) {
    super(app);
    this.message = message;
    this.confirmText = confirmText;
    this.cancelText = cancelText;
  }

  private resolve(value: boolean): void {
    if (this.resolver) {
      this.resolver(value);
      this.resolver = null;
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("p", { text: this.message });

    const actions = contentEl.createDiv({ cls: "gemini-helper-modal-actions" });

    const confirmBtn = actions.createEl("button", {
      text: this.confirmText,
      cls: "mod-warning",
    });
    confirmBtn.addEventListener("click", () => {
      this.resolve(true);
      this.close();
    });

    const cancelBtn = actions.createEl("button", { text: this.cancelText });
    cancelBtn.addEventListener("click", () => {
      this.resolve(false);
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
    this.resolve(false);
  }

  openAndWait(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolver = resolve;
      this.open();
    });
  }
}
