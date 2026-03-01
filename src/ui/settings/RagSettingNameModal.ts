import { Modal, App, Setting, Notice } from "obsidian";
import { t } from "src/i18n";

export class RagSettingNameModal extends Modal {
  private name = "";
  private onSubmit: (name: string) => void | Promise<void>;
  private title: string;
  private initialValue: string;

  constructor(
    app: App,
    title: string,
    initialValue: string,
    onSubmit: (name: string) => void | Promise<void>
  ) {
    super(app);
    this.title = title;
    this.initialValue = initialValue;
    this.name = initialValue;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: this.title });

    new Setting(contentEl).setName(t("modal.name")).addText((text) => {
      text
        .setPlaceholder(t("modal.enterName"))
        .setValue(this.initialValue)
        .onChange((value) => {
          this.name = value;
        });
      text.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.submit();
        }
      });
      text.inputEl.focus();
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText(t("common.cancel")).onClick(() => {
          this.close();
        })
      )
      .addButton((btn) =>
        btn
          .setButtonText(t("common.ok"))
          .setCta()
          .onClick(() => {
            this.submit();
          })
      );
  }

  private submit() {
    if (this.name.trim()) {
      void this.onSubmit(this.name.trim());
      this.close();
    } else {
      new Notice(t("modal.nameCannotBeEmpty"));
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
