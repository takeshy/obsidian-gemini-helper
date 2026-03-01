import { Setting } from "obsidian";
import { t } from "src/i18n";
import {
  isModelAllowedForPlan,
  getDefaultModelForPlan,
  type ApiPlan,
} from "src/types";
import type { SettingsContext } from "./settingsContext";

export function displayApiSettings(containerEl: HTMLElement, ctx: SettingsContext): void {
  const { plugin, display } = ctx;
  const apiPlan = plugin.settings.apiPlan;

  new Setting(containerEl).setName(t("settings.api")).setHeading();

  // Google API Key
  const apiKeySetting = new Setting(containerEl)
    .setName(t("settings.googleApiKey"))
    .setDesc(t("settings.googleApiKey.desc"));

  let apiKeyRevealed = false;
  apiKeySetting.addText((text) => {
    text
      .setPlaceholder(t("settings.googleApiKey.placeholder"))
      .setValue(plugin.settings.googleApiKey)
      .onChange((value) => {
        void (async () => {
          plugin.settings.googleApiKey = value;
          await plugin.saveSettings();
        })();
      });
    text.inputEl.type = "password";
  });

  apiKeySetting.addExtraButton((btn) => {
    btn
      .setIcon("eye")
      .setTooltip(t("settings.showOrHideApiKey"))
      .onClick(() => {
        apiKeyRevealed = !apiKeyRevealed;
        const input = apiKeySetting.controlEl.querySelector("input");
        if (input) input.type = apiKeyRevealed ? "text" : "password";
        btn.setIcon(apiKeyRevealed ? "eye-off" : "eye");
      });
  });

  new Setting(containerEl)
    .setName(t("settings.apiPlan"))
    .setDesc(t("settings.apiPlan.desc"))
    .addDropdown((dropdown) => {
      dropdown.addOption("paid", t("settings.apiPlan.paid"));
      dropdown.addOption("free", t("settings.apiPlan.free"));
      dropdown.setValue(apiPlan);
      dropdown.onChange((value) => {
        void (async () => {
          plugin.settings.apiPlan = value as ApiPlan;
          await plugin.saveSettings();
          const plan = plugin.settings.apiPlan;
          const selectedModel = plugin.getSelectedModel();
          if (!isModelAllowedForPlan(plan, selectedModel)) {
            await plugin.selectModel(getDefaultModelForPlan(plan));
          }
          display();
        })();
      });
    });
}
