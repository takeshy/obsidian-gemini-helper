import { Modal, App, Setting, Notice } from "obsidian";
import { isWindows, validateCliPath } from "src/core/cliProvider";
import { t } from "src/i18n";

export type CliType = "gemini" | "claude" | "codex";

export class CliPathModal extends Modal {
  private cliType: CliType;
  private currentPath: string;
  private onSave: (path: string | undefined) => void | Promise<void>;

  constructor(
    app: App,
    cliType: CliType,
    currentPath: string | undefined,
    onSave: (path: string | undefined) => void | Promise<void>
  ) {
    super(app);
    this.cliType = cliType;
    this.currentPath = currentPath || "";
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("gemini-helper-cli-path-modal");
    contentEl.createEl("h2", { text: t("settings.cliPathModal.title") });

    // Description
    const descEl = contentEl.createDiv({ cls: "gemini-helper-cli-path-desc" });
    descEl.textContent = t("settings.cliPathModal.desc");

    const cliName = this.cliType === "gemini" ? "Gemini" : this.cliType === "claude" ? "Claude" : "Codex";

    new Setting(contentEl)
      .setName(cliName + " CLI")
      .addText((text) => {
        text
          .setPlaceholder(t("settings.cliPathModal.placeholder"))
          .setValue(this.currentPath)
          .onChange((value) => {
            this.currentPath = value;
          });
        text.inputEl.addClass("gemini-helper-cli-path-input");
        text.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            this.save();
          }
        });
      });

    // Show OS-specific help note
    const noteEl = contentEl.createDiv({ cls: "gemini-helper-cli-path-note" });
    noteEl.textContent = isWindows()
      ? t("settings.cliPathModal.windowsNote")
      : t("settings.cliPathModal.unixNote");

    // Version manager note (non-Windows only)
    if (!isWindows()) {
      const vmNoteEl = contentEl.createDiv({ cls: "gemini-helper-cli-path-note" });
      vmNoteEl.textContent = t("settings.cliPathModal.versionManagerNote");
    }

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText(t("settings.cliPathModal.clear")).onClick(() => {
          void this.clear();
        })
      )
      .addButton((btn) =>
        btn.setButtonText(t("common.cancel")).onClick(() => {
          this.close();
        })
      )
      .addButton((btn) =>
        btn
          .setButtonText(t("common.save"))
          .setCta()
          .onClick(() => {
            this.save();
          })
      );
  }

  private save() {
    const path = this.currentPath.trim();
    if (path) {
      const result = validateCliPath(path);
      if (!result.valid) {
        if (result.reason === "file_not_found") {
          new Notice(t("settings.cliPathModal.fileNotFound"));
        } else {
          new Notice(t("settings.cliPathModal.invalidChars"));
        }
        return;
      }
    }
    void this.onSave(path || undefined);
    this.close();
  }

  private async clear() {
    await this.onSave(undefined);
    this.close();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
