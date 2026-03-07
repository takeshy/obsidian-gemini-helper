import { Setting } from "obsidian";
import { t } from "src/i18n";
import type { SettingsContext } from "./settingsContext";

export function displaySkillsSettings(containerEl: HTMLElement, ctx: SettingsContext): void {
  const { plugin } = ctx;

  new Setting(containerEl).setName(t("settings.skills")).setHeading();

  new Setting(containerEl)
    .setName(t("settings.skillsFolder"))
    .setDesc(t("settings.skillsFolder.desc"))
    .addText((text) => {
      text
        .setPlaceholder(t("settings.skillsFolder.placeholder"))
        .setValue(plugin.settings.skillsFolderPath)
        .onChange((value) => {
          void (async () => {
            plugin.settings.skillsFolderPath = value;
            await plugin.saveSettings();
          })();
        });
    });
}
