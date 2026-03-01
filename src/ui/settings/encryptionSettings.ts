import { Setting, Notice } from "obsidian";
import { t } from "src/i18n";
import { DEFAULT_ENCRYPTION_SETTINGS } from "src/types";
import { generateKeyPair, encryptPrivateKey } from "src/core/crypto";
import { ConfirmModal } from "src/ui/components/ConfirmModal";
import { formatError } from "src/utils/error";
import type { SettingsContext } from "./settingsContext";

export function displayEncryptionSettings(containerEl: HTMLElement, ctx: SettingsContext): void {
  const { plugin, display } = ctx;
  const app = plugin.app;

  new Setting(containerEl).setName(t("settings.encryption")).setHeading();

  // Ensure encryption settings exist
  if (!plugin.settings.encryption) {
    plugin.settings.encryption = { ...DEFAULT_ENCRYPTION_SETTINGS };
  }

  const encryption = plugin.settings.encryption;
  const hasKeys = !!encryption.publicKey && !!encryption.encryptedPrivateKey;

  if (hasKeys) {
    // Show configured status
    new Setting(containerEl)
      .setName(t("settings.encryptionConfigured"))
      .setDesc(t("settings.encryptionConfigured.desc"));

    // Encrypt chat history toggle
    new Setting(containerEl)
      .setName(t("settings.encryptChatHistory"))
      .setDesc(t("settings.encryptChatHistory.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(encryption.encryptChatHistory ?? false)
          .onChange((value) => {
            void (async () => {
              plugin.settings.encryption.encryptChatHistory = value;
              plugin.settings.encryption.enabled = value || encryption.encryptWorkflowHistory;
              await plugin.saveSettings();
            })();
          })
      );

    // Encrypt workflow history toggle
    new Setting(containerEl)
      .setName(t("settings.encryptWorkflowHistory"))
      .setDesc(t("settings.encryptWorkflowHistory.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(encryption.encryptWorkflowHistory ?? false)
          .onChange((value) => {
            void (async () => {
              plugin.settings.encryption.encryptWorkflowHistory = value;
              plugin.settings.encryption.enabled = value || encryption.encryptChatHistory;
              await plugin.saveSettings();
            })();
          })
      );

    // Reset keys button
    new Setting(containerEl)
      .setName(t("settings.encryptionResetKeys"))
      .setDesc(t("settings.encryptionResetKeys.desc"))
      .addButton((btn) =>
        btn
          .setButtonText(t("settings.encryptionResetKeys"))
          .setWarning()
          .onClick(() => {
            void (async () => {
              const confirmed = await new ConfirmModal(
                app,
                t("settings.encryptionResetKeysConfirm"),
                t("common.confirm"),
                t("common.cancel")
              ).openAndWait();
              if (!confirmed) return;

              plugin.settings.encryption = { ...DEFAULT_ENCRYPTION_SETTINGS };
              await plugin.saveSettings();
              display();
              new Notice(t("settings.encryptionKeysReset"));
            })();
          })
      );
  } else {
    // Setup encryption keys
    new Setting(containerEl)
      .setName(t("settings.encryptionSetup"))
      .setDesc(t("settings.encryptionSetup.desc"));

    let password = "";
    let confirmPassword = "";

    new Setting(containerEl)
      .setName(t("settings.encryptionPassword"))
      .setDesc(t("settings.encryptionPassword.desc"))
      .addText((text) => {
        text
          .setPlaceholder(t("settings.encryptionPassword.placeholder"))
          .onChange((value) => {
            password = value;
          });
        text.inputEl.type = "password";
      });

    new Setting(containerEl)
      .setName(t("settings.encryptionConfirmPassword"))
      .addText((text) => {
        text
          .setPlaceholder(t("settings.encryptionConfirmPassword.placeholder"))
          .onChange((value) => {
            confirmPassword = value;
          });
        text.inputEl.type = "password";
      });

    new Setting(containerEl)
      .addButton((btn) =>
        btn
          .setButtonText(t("settings.encryptionSetupBtn"))
          .setCta()
          .onClick(() => {
            void (async () => {
              if (!password) {
                new Notice(t("settings.encryptionPassword.placeholder"));
                return;
              }
              if (password !== confirmPassword) {
                new Notice(t("settings.encryptionPasswordMismatch"));
                return;
              }

              try {
                const { publicKey, privateKey } = await generateKeyPair();
                const { encryptedPrivateKey, salt } = await encryptPrivateKey(privateKey, password);

                plugin.settings.encryption = {
                  enabled: true,
                  encryptChatHistory: true,
                  encryptWorkflowHistory: true,
                  publicKey,
                  encryptedPrivateKey,
                  salt,
                };
                await plugin.saveSettings();
                display();
                new Notice(t("settings.encryptionSetupSuccess"));
              } catch (error) {
                new Notice(t("settings.encryptionSetupFailed", { error: formatError(error) }));
              }
            })();
          })
      );
  }
}
