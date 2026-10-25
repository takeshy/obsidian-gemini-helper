import { addWebSearchUsageSetting } from "obsidian-llm-hub-common/settings";
import { Setting } from "obsidian";
import { t } from "src/i18n";
import type { SettingsContext } from "./settingsContext";

export function displayWebSearchSettings(containerEl: HTMLElement, { plugin }: SettingsContext): () => void {
  const cleanup: Array<() => void> = [];
  new Setting(containerEl).setName(t("settings.webSearch")).setHeading();
  new Setting(containerEl).setName(t("settings.webSearch.provider"))
    .setDesc(t("settings.webSearch.desc"))
    .addDropdown(dropdown => {
      dropdown.addOption("none", t("common.none")).addOption("tavily", "Tavily").addOption("brave", "Brave Search")
        .setValue(plugin.settings.webSearch.provider)
        .onChange(value => {
          if (value === "none" || value === "tavily" || value === "brave") {
            plugin.settings.webSearch.provider = value;
            void plugin.saveSettings();
          }
        });
    });
  for (const [key, name] of [["tavilyApiKey", "Tavily"], ["braveApiKey", "Brave Search"]] as const) {
    const setting = new Setting(containerEl).setName(t("settings.webSearch.apiKey", { name }))
      .setDesc(t("settings.webSearch.apiKey.desc"));
    setting.addText(text => {
      text.setValue(plugin.settings.webSearch[key]).onChange(value => {
        plugin.settings.webSearch[key] = value.trim();
        usage.render();
        void plugin.saveSettings();
      });
      text.inputEl.type = "password";
    });
    setting.addExtraButton(button => button.setIcon("eye").setTooltip(t("settings.showOrHideApiKey"))
      .onClick(() => {
        const input = setting.controlEl.querySelector("input");
        if (input) {
          input.type = input.type === "password" ? "text" : "password";
          button.setIcon(input.type === "password" ? "eye" : "eye-off");
        }
      }));
    const usage = addWebSearchUsageSetting(containerEl, {
      provider: key === "tavilyApiKey" ? "tavily" : "brave",
      getApiKey: () => plugin.settings.webSearch[key],
    });
    cleanup.push(usage.dispose);
  }
  return () => { for (const dispose of cleanup) dispose(); };
}
