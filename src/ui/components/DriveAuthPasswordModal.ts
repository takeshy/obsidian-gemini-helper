// Password prompt modal for Google Drive sync session unlock.

import { Modal, App, Setting } from "obsidian";
import { t } from "src/i18n";

export class DriveAuthPasswordModal extends Modal {
  private password = "";
  private resolve: ((password: string | null) => void) | null = null;

  constructor(app: App) {
    super(app);
  }

  /**
   * Open the modal and return the entered password, or null if cancelled.
   */
  openAndWait(): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: t("driveSync.unlockTitle") });
    contentEl.createEl("p", {
      text: t("driveSync.unlockDesc"),
      cls: "setting-item-description",
    });

    new Setting(contentEl)
      .setName(t("driveSync.password"))
      .addText((text) => {
        text.inputEl.type = "password";
        text.inputEl.placeholder = t("driveSync.passwordPlaceholder");
        text.onChange((value) => {
          this.password = value;
        });
        // Submit on Enter
        text.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && this.password) {
            const resolve = this.resolve;
            this.resolve = null; // Prevent onClose from resolving with null
            this.close();
            resolve?.(this.password);
          }
        });
        // Focus the input
        setTimeout(() => text.inputEl.focus(), 50);
      });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText(t("driveSync.unlock"))
          .setCta()
          .onClick(() => {
            if (this.password) {
              const resolve = this.resolve;
              this.resolve = null; // Prevent onClose from resolving with null
              this.close();
              resolve?.(this.password);
            }
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText(t("driveSync.skip"))
          .onClick(() => {
            const resolve = this.resolve;
            this.resolve = null;
            this.close();
            resolve?.(null);
          })
      );
  }

  onClose(): void {
    // If closed without resolving (e.g., clicking X), treat as skip
    if (this.resolve) {
      this.resolve(null);
      this.resolve = null;
    }
    this.contentEl.empty();
  }
}
