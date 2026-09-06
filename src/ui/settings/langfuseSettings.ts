import { Setting, Notice } from "obsidian";
import { t } from "src/i18n";
import { DEFAULT_LANGFUSE_SETTINGS } from "src/types";
import { sendTestTrace, isLangfuseAvailable } from "src/tracing/langfuse";
import { formatError } from "obsidian-llm-hub-common/core";
import type { SettingsContext } from "./settingsContext";

export function displayLangfuseSettings(containerEl: HTMLElement, ctx: SettingsContext): void {
  const { plugin } = ctx;
  const langfuse = plugin.settings.langfuse ?? { ...DEFAULT_LANGFUSE_SETTINGS };

  if (!isLangfuseAvailable()) {
    return;
  }

  new Setting(containerEl).setName(t("settings.langfuse")).setHeading();

  // Public key
  const publicKeySetting = new Setting(containerEl)
    .setName(t("settings.langfusePublicKey"))
    .setDesc(t("settings.langfusePublicKey.desc"));

  // Detail settings container — only shown when public key is set
  const detailContainer = containerEl.createDiv();
  const isConfigured = !!langfuse.publicKey;
  detailContainer.style.display = isConfigured ? "" : "none";

  publicKeySetting.addText((text) =>
    text
      .setPlaceholder(t("settings.langfusePublicKey.placeholder"))
      .setValue(langfuse.publicKey)
      .onChange((value) => {
        void (async () => {
          plugin.settings.langfuse = { ...plugin.settings.langfuse, publicKey: value };
          await plugin.saveSettings();
          detailContainer.style.display = value ? "" : "none";
        })();
      })
  );

  // Secret key (with visibility toggle)
  const secretKeySetting = new Setting(detailContainer)
    .setName(t("settings.langfuseSecretKey"))
    .setDesc(t("settings.langfuseSecretKey.desc"));

  let secretKeyInput: HTMLInputElement;
  secretKeySetting.addText((text) => {
    secretKeyInput = text.inputEl;
    text.inputEl.type = "password";
    text
      .setPlaceholder(t("settings.langfuseSecretKey.placeholder"))
      .setValue(langfuse.secretKey)
      .onChange((value) => {
        void (async () => {
          plugin.settings.langfuse = { ...plugin.settings.langfuse, secretKey: value };
          await plugin.saveSettings();
        })();
      });
  });

  secretKeySetting.addExtraButton((button) =>
    button
      .setIcon("eye")
      .setTooltip(t("settings.showOrHideApiKey"))
      .onClick(() => {
        if (secretKeyInput) {
          secretKeyInput.type = secretKeyInput.type === "password" ? "text" : "password";
        }
      })
  );

  // Base URL
  new Setting(detailContainer)
    .setName(t("settings.langfuseBaseUrl"))
    .setDesc(t("settings.langfuseBaseUrl.desc"))
    .addText((text) =>
      text
        .setPlaceholder("https://cloud.langfuse.com")
        .setValue(langfuse.baseUrl !== DEFAULT_LANGFUSE_SETTINGS.baseUrl ? langfuse.baseUrl : "")
        .onChange((value) => {
          void (async () => {
            plugin.settings.langfuse = {
              ...plugin.settings.langfuse,
              baseUrl: value || DEFAULT_LANGFUSE_SETTINGS.baseUrl,
            };
            await plugin.saveSettings();
          })();
        })
    );

  // Log prompts toggle
  new Setting(detailContainer)
    .setName(t("settings.langfuseLogPrompts"))
    .setDesc(t("settings.langfuseLogPrompts.desc"))
    .addToggle((toggle) =>
      toggle.setValue(langfuse.logPrompts).onChange((value) => {
        void (async () => {
          plugin.settings.langfuse = { ...plugin.settings.langfuse, logPrompts: value };
          await plugin.saveSettings();
        })();
      })
    );

  // Log responses toggle
  new Setting(detailContainer)
    .setName(t("settings.langfuseLogResponses"))
    .setDesc(t("settings.langfuseLogResponses.desc"))
    .addToggle((toggle) =>
      toggle.setValue(langfuse.logResponses).onChange((value) => {
        void (async () => {
          plugin.settings.langfuse = { ...plugin.settings.langfuse, logResponses: value };
          await plugin.saveSettings();
        })();
      })
    );

  // Test connection button
  new Setting(detailContainer)
    .setName(t("settings.langfuseTestConnection"))
    .setDesc(t("settings.langfuseTestConnection.desc"))
    .addButton((button) =>
      button
        .setButtonText(t("settings.langfuseTestBtn"))
        .onClick(() => {
          void (async () => {
            const currentLangfuse = plugin.settings.langfuse;
            if (!currentLangfuse.publicKey || !currentLangfuse.secretKey) {
              new Notice(t("settings.langfuseTestMissingKeys"));
              return;
            }
            button.setButtonText(t("settings.langfuseTesting"));
            button.setDisabled(true);
            try {
              await sendTestTrace(currentLangfuse);
              new Notice(t("settings.langfuseTestSuccess"));
            } catch (error) {
              new Notice(t("settings.langfuseTestFailed", { error: formatError(error) }));
            } finally {
              button.setButtonText(t("settings.langfuseTestBtn"));
              button.setDisabled(false);
            }
          })();
        })
    );
}
