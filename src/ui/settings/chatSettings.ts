import { Notice, Setting } from "obsidian";
import { t } from "src/i18n";
import { normalizeVaultScopePath } from "src/vault/aiVaultScope";
import type { SettingsContext } from "./settingsContext";

export function displayChatSettings(containerEl: HTMLElement, ctx: SettingsContext): void {
  const { plugin } = ctx;

  new Setting(containerEl).setName(t("settings.chat")).setHeading();

  new Setting(containerEl)
    .setName(t("settings.manualChatSaveFolder"))
    .setDesc(t("settings.manualChatSaveFolder.desc"))
    .addText((text) => {
      text
        .setPlaceholder(t("settings.manualChatSaveFolder.placeholder"))
        .setValue(plugin.settings.manualChatSaveFolder);

      text.inputEl.addEventListener("blur", () => {
        void (async () => {
          const rawValue = text.inputEl.value.trim();
          const normalized = rawValue ? normalizeVaultScopePath(rawValue) : "";
          if (normalized === null) {
            new Notice(t("settings.manualChatSaveFolder.invalidPath"));
            text.inputEl.value = plugin.settings.manualChatSaveFolder;
            return;
          }
          plugin.settings.manualChatSaveFolder = normalized;
          text.inputEl.value = normalized;
          await plugin.saveSettings();
        })();
      });
    });
}
