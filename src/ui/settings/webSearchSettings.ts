import { addWebSearchUsageSetting } from "obsidian-llm-hub-common/settings";
import { Setting } from "obsidian";
import { t } from "src/i18n";
import type { SettingsContext } from "./settingsContext";

export function displayWebSearchSettings(containerEl: HTMLElement, { plugin }: SettingsContext): () => void {
  let disposeUsage: (() => void) | undefined;
  const selectedProvider = () => plugin.settings.webSearchMode === "external"
    ? plugin.settings.webSearch.provider : plugin.settings.webSearchMode;

  new Setting(containerEl).setName(t("settings.webSearch")).setHeading();
  const providerSetting = new Setting(containerEl).setName(t("settings.webSearch.provider"))
    .addDropdown(dropdown => {
      dropdown.addOption("google", "Gemini Google Search")
        .addOption("tavily", "Tavily")
        .addOption("brave", "Brave Search")
        .addOption("none", t("settings.webSearch.disabled"))
        .setValue(selectedProvider())
        .onChange(value => {
          if (value === "google" || value === "none") {
            plugin.settings.webSearchMode = value;
          } else if (value === "tavily" || value === "brave") {
            plugin.settings.webSearchMode = "external";
            plugin.settings.webSearch.provider = value;
          } else return;
          renderProviderSettings();
          void plugin.saveSettings();
        });
    });
  const providerContainer = containerEl.createDiv();

  function renderProviderSettings(): void {
    disposeUsage?.();
    disposeUsage = undefined;
    providerContainer.empty();
    const provider = selectedProvider();
    if (provider === "google") {
      providerSetting.setDesc(t("settings.webSearch.google.desc"));
      return;
    }
    if (provider === "none") {
      providerSetting.setDesc(t("settings.webSearch.disabled.desc"));
      return;
    }
    providerSetting.setDesc(t(provider === "tavily" ? "settings.webSearch.tavily.desc" : "settings.webSearch.brave.desc"));
    const key = provider === "tavily" ? "tavilyApiKey" : "braveApiKey";
    const name = provider === "tavily" ? "Tavily" : "Brave Search";
    const setting = new Setting(providerContainer).setName(t("settings.webSearch.apiKey", { name }))
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
    const usage = addWebSearchUsageSetting(providerContainer, {
      provider,
      getApiKey: () => plugin.settings.webSearch[key],
    });
    disposeUsage = usage.dispose;
  }

  renderProviderSettings();
  return () => { disposeUsage?.(); };
}
