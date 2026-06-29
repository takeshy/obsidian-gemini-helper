import { Setting } from "obsidian";
import { t } from "src/i18n";
import type { KnowledgeSource } from "src/types";
import type { SettingsContext } from "./settingsContext";

function createKnowledgeSource(): KnowledgeSource {
  return {
    id: `okf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: "OKF",
    path: "",
    type: "okf",
    enabled: true,
  };
}

export function displayKnowledgeSettings(containerEl: HTMLElement, ctx: SettingsContext): void {
  const { plugin, display } = ctx;

  new Setting(containerEl).setName(t("settings.knowledge")).setHeading();

  new Setting(containerEl)
    .setName(t("settings.okfSources"))
    .setDesc(t("settings.okfSources.desc"))
    .addButton((button) =>
      button
        .setButtonText(t("settings.addOkfSource"))
        .onClick(() => {
          void (async () => {
            plugin.settings.knowledgeSources = [
              ...(plugin.settings.knowledgeSources || []),
              createKnowledgeSource(),
            ];
            await plugin.saveSettings();
            display();
          })();
        })
    );

  for (const source of plugin.settings.knowledgeSources || []) {
    const sourceEl = containerEl.createDiv({ cls: "gemini-helper-settings-nested" });

    new Setting(sourceEl)
      .setName(source.name || t("settings.okfSource"))
      .setDesc(source.path || t("settings.okfSource.noPath"))
      .addToggle((toggle) =>
        toggle.setValue(source.enabled).onChange((value) => {
          void (async () => {
            source.enabled = value;
            await plugin.saveSettings();
          })();
        })
      )
      .addExtraButton((button) =>
        button
          .setIcon("trash")
          .setTooltip(t("settings.deleteSetting"))
          .onClick(() => {
            void (async () => {
              plugin.settings.knowledgeSources = (plugin.settings.knowledgeSources || []).filter(s => s.id !== source.id);
              await plugin.saveSettings();
              display();
            })();
          })
      );

    new Setting(sourceEl)
      .setName(t("settings.okfSourceName"))
      .addText((text) =>
        text
          .setValue(source.name)
          .setPlaceholder("OKF")
          .onChange((value) => {
            void (async () => {
              source.name = value.trim() || "OKF";
              await plugin.saveSettings();
            })();
          })
      );

    new Setting(sourceEl)
      .setName(t("settings.okfSourcePath"))
      .setDesc(t("settings.okfSourcePath.desc"))
      .addText((text) =>
        text
          .setValue(source.path)
          .onChange((value) => {
            void (async () => {
              source.path = value.trim();
              await plugin.saveSettings();
            })();
          })
      );
  }

}
