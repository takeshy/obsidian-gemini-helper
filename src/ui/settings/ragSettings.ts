import { Setting, Notice } from "obsidian";
import { getFileSearchManager } from "src/core/fileSearch";
import { t } from "src/i18n";
import { DEFAULT_SETTINGS } from "src/types";
import type { RagSetting } from "src/types";
import { ConfirmModal } from "src/ui/components/ConfirmModal";
import { formatError } from "src/utils/error";
import { RagSettingNameModal } from "./RagSettingNameModal";
import { RagFilesModal } from "./RagFilesModal";
import type { SettingsContext } from "./settingsContext";

export function displayRagSettings(containerEl: HTMLElement, ctx: SettingsContext): void {
  const { plugin, display } = ctx;
  const app = plugin.app;

  new Setting(containerEl).setName(t("settings.rag")).setHeading();

  // RAG enable toggle
  new Setting(containerEl)
    .setName(t("settings.enableRag"))
    .setDesc(t("settings.enableRag.desc"))
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.ragEnabled)
        .onChange((value) => {
          void (async () => {
            plugin.settings.ragEnabled = value;
            await plugin.saveSettings();
            display();
          })();
        })
    );

  if (!plugin.settings.ragEnabled) return;

  const ragSettingNames = plugin.getRagSettingNames();
  const selectedName = plugin.workspaceState.selectedRagSetting;

  // Top K setting
  new Setting(containerEl)
    .setName(t("settings.retrievedChunksLimit"))
    .setDesc(t("settings.retrievedChunksLimit.desc"))
    .addSlider((slider) =>
      slider
        .setLimits(1, 20, 1)
        .setValue(plugin.settings.ragTopK)
        .setDynamicTooltip()
        .onChange((value) => {
          void (async () => {
            plugin.settings.ragTopK = value;
            await plugin.saveSettings();
          })();
        })
    )
    .addExtraButton((button) =>
      button
        .setIcon("reset")
        .setTooltip(t("settings.resetToDefault", { value: String(DEFAULT_SETTINGS.ragTopK) }))
        .onClick(() => {
          void (async () => {
            plugin.settings.ragTopK = DEFAULT_SETTINGS.ragTopK;
            await plugin.saveSettings();
            display();
          })();
        })
    );

  // RAG setting selection
  const ragSelectSetting = new Setting(containerEl)
    .setName(t("settings.ragSetting"))
    .setDesc(t("settings.ragSetting.desc"));

  ragSelectSetting.addDropdown((dropdown) => {
    ragSettingNames.forEach((name) => {
      dropdown.addOption(name, name);
    });

    dropdown.setValue(selectedName || "").onChange((value) => {
      void (async () => {
        await plugin.selectRagSetting(value || null);
        display();
      })();
    });
  });

  // Add new RAG setting button
  ragSelectSetting.addExtraButton((btn) => {
    btn
      .setIcon("plus")
      .setTooltip(t("settings.createRagSetting"))
      .onClick(() => {
        new RagSettingNameModal(
          app,
          t("settings.createRagSetting"),
          "",
          async (name) => {
            try {
              await plugin.createRagSetting(name);
              await plugin.selectRagSetting(name);
              display();
              new Notice(t("settings.ragSettingCreated", { name }));
            } catch (error) {
              new Notice(t("error.failedToCreate", { error: formatError(error) }));
            }
          }
        ).open();
      });
  });

  // Show selected RAG setting details
  if (selectedName) {
    const ragSetting = plugin.getRagSetting(selectedName);
    if (ragSetting) {
      displaySelectedRagSetting(containerEl, ctx, selectedName, ragSetting);
    }
  }
}

function displaySelectedRagSetting(
  containerEl: HTMLElement,
  ctx: SettingsContext,
  name: string,
  ragSetting: RagSetting
): void {
  const { plugin, display } = ctx;
  const app = plugin.app;

  // Setting header with rename/delete buttons
  const headerSetting = new Setting(containerEl)
    .setName(t("settings.settingsFor", { name }))
    .setDesc(t("settings.configureThisSetting"));

  headerSetting.addExtraButton((btn) => {
    btn
      .setIcon("pencil")
      .setTooltip(t("settings.renameSetting"))
      .onClick(() => {
        new RagSettingNameModal(
          app,
          t("settings.renameRagSetting"),
          name,
          async (newName) => {
            try {
              await plugin.renameRagSetting(name, newName);
              display();
              new Notice(t("settings.renamedTo", { name: newName }));
            } catch (error) {
              new Notice(t("error.failedToRename", { error: formatError(error) }));
            }
          }
        ).open();
      });
  });

  headerSetting.addExtraButton((btn) => {
    btn
      .setIcon("trash")
      .setTooltip(t("settings.deleteSetting"))
      .onClick(() => {
        void (async () => {
          const confirmed = await new ConfirmModal(
            app,
            t("settings.deleteSettingConfirm", { name }),
            t("common.delete"),
            t("common.cancel")
          ).openAndWait();
          if (!confirmed) return;

          try {
            await plugin.deleteRagSetting(name);
            display();
            new Notice(t("settings.ragSettingDeleted", { name }));
          } catch (error) {
            new Notice(t("error.failedToDelete", { error: formatError(error) }));
          }
        })();
      });
  });

  // Store Mode Toggle
  new Setting(containerEl)
    .setName(t("settings.storeMode"))
    .setDesc(t("settings.storeMode.desc"))
    .addDropdown((dropdown) =>
      dropdown
        .addOption("internal", t("settings.storeModeInternal"))
        .addOption("external", t("settings.storeModeExternal"))
        .setValue(ragSetting.isExternal ? "external" : "internal")
        .onChange((value) => {
          void (async () => {
            if (value === "external") {
              await plugin.updateRagSetting(name, { isExternal: true, storeId: null, storeName: null });
            } else {
              await plugin.updateRagSetting(name, { isExternal: false, storeId: null, storeName: null });
            }
            const fileSearchManager = getFileSearchManager();
            if (fileSearchManager) {
              fileSearchManager.setStoreName(null);
            }
            display();
          })();
        })
    );

  if (ragSetting.isExternal) {
    displayExternalStoreSettings(containerEl, plugin, name, ragSetting);
  } else {
    displayInternalStoreSettings(containerEl, ctx, name, ragSetting);
  }
}

function displayExternalStoreSettings(
  containerEl: HTMLElement,
  plugin: import("src/plugin").GeminiHelperPlugin,
  name: string,
  ragSetting: RagSetting
): void {
  const storeIdsSetting = new Setting(containerEl)
    .setName(t("settings.storeIds"))
    .setDesc(t("settings.storeIds.desc"));

  storeIdsSetting.settingEl.addClass("gemini-helper-settings-textarea-container");

  storeIdsSetting.addTextArea((text) => {
    text
      .setPlaceholder(t("settings.storeIds.placeholder"))
      .setValue(ragSetting.storeIds.join("\n"))
      .onChange((value) => {
        void (async () => {
          const storeIds = value
            .split("\n")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          await plugin.updateRagSetting(name, { storeIds });

          const fileSearchManager = getFileSearchManager();
          if (fileSearchManager) {
            fileSearchManager.setStoreName(storeIds[0] || null);
          }
        })();
      });
    text.inputEl.rows = 4;
    text.inputEl.addClass("gemini-helper-settings-textarea");
  });

  const storeCount = ragSetting.storeIds.length;
  new Setting(containerEl)
    .setName(t("settings.storeCount"))
    .setDesc(t("settings.storeCountDesc", { count: String(storeCount) }));
}

function displayInternalStoreSettings(
  containerEl: HTMLElement,
  ctx: SettingsContext,
  name: string,
  ragSetting: RagSetting
): void {
  const { plugin, display, syncCancelRef } = ctx;
  const app = plugin.app;

  // Show current store ID if exists
  if (ragSetting.storeId) {
    const storeId = ragSetting.storeId;
    new Setting(containerEl)
      .setName(t("settings.currentStoreId"))
      .setDesc(storeId)
      .addExtraButton((btn) => {
        btn
          .setIcon("copy")
          .setTooltip(t("settings.copyStoreId"))
          .onClick(() => {
            void navigator.clipboard.writeText(storeId);
            new Notice(t("settings.storeIdCopied"));
          });
      });
  }

  // Target Folders
  new Setting(containerEl)
    .setName(t("settings.targetFolders"))
    .setDesc(t("settings.targetFolders.desc"))
    .addText((text) =>
      text
        .setPlaceholder(t("settings.targetFolders.placeholder"))
        .setValue(ragSetting.targetFolders.join(", "))
        .onChange((value) => {
          void (async () => {
            const folders = value
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await plugin.updateRagSetting(name, { targetFolders: folders });
          })();
        })
    );

  // Excluded Patterns
  const excludePatternsSetting = new Setting(containerEl)
    .setName(t("settings.excludedPatterns"))
    .setDesc(t("settings.excludedPatterns.desc"));

  excludePatternsSetting.settingEl.addClass("gemini-helper-settings-textarea-container");

  excludePatternsSetting.addTextArea((text) => {
    text
      .setPlaceholder(t("settings.excludedPatterns.placeholder"))
      .setValue(ragSetting.excludePatterns.join("\n"))
      .onChange((value) => {
        void (async () => {
          const patterns = value
            .split("\n")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          await plugin.updateRagSetting(name, { excludePatterns: patterns });
        })();
      });
    text.inputEl.rows = 4;
    text.inputEl.addClass("gemini-helper-settings-textarea");
  });

  // Sync Status
  const syncedCount = Object.keys(ragSetting.files).length;
  const lastSync = ragSetting.lastFullSync
    ? new Date(ragSetting.lastFullSync).toLocaleString()
    : t("settings.syncStatusNever");

  const syncStatusSetting = new Setting(containerEl)
    .setName(t("settings.syncVault"))
    .setDesc(t("settings.syncStatus", { count: String(syncedCount), lastSync }));

  if (syncedCount > 0) {
    syncStatusSetting.addExtraButton((btn) => {
      btn
        .setIcon("list")
        .setTooltip(t("settings.viewFiles"))
        .onClick(() => {
          new RagFilesModal(app, name, ragSetting.files).open();
        });
    });
  }

  // Progress container
  const progressContainer = containerEl.createDiv({
    cls: "gemini-helper-sync-progress",
  });
  progressContainer.addClass("gemini-helper-hidden");

  const progressText = progressContainer.createDiv();
  const progressBar = progressContainer.createEl("progress");
  progressBar.addClass("gemini-helper-progress-bar");

  let cancelBtn: HTMLButtonElement | null = null;

  syncStatusSetting
    .addButton((btn) => {
      cancelBtn = btn.buttonEl;
      btn
        .setButtonText(t("settings.cancelSync"))
        .setWarning()
        .onClick(() => {
          syncCancelRef.value = true;
          new Notice(t("settings.cancellingSync"));
        });
      btn.buttonEl.addClass("gemini-helper-hidden");
    })
    .addButton((btn) =>
      btn
        .setButtonText(t("settings.syncVault"))
        .setCta()
        .onClick(() => {
          void (async () => {
            syncCancelRef.value = false;
            btn.setDisabled(true);
            btn.setButtonText(t("settings.syncing"));
            if (cancelBtn) cancelBtn.removeClass("gemini-helper-hidden");
            progressContainer.removeClass("gemini-helper-hidden");
            progressText.removeClass("gemini-helper-progress-error");
            progressText.textContent = t("settings.syncPreparing");
            progressBar.value = 0;
            progressBar.max = 100;

            try {
              const result = await plugin.syncVaultForRAG(
                name,
                (current, total, fileName, action) => {
                  if (syncCancelRef.value) {
                    throw new Error("Cancelled by user");
                  }
                  const percent = Math.round((current / total) * 100);
                  progressBar.value = percent;
                  progressBar.max = 100;

                  const actionText =
                    action === "upload"
                      ? t("settings.syncUploading")
                      : action === "skip"
                        ? t("settings.syncSkipping")
                        : t("settings.syncDeleting");
                  progressText.textContent = `${actionText}: ${fileName} (${current}/${total})`;
                }
              );
              if (result) {
                new Notice(
                  t("settings.syncResult", {
                    uploaded: String(result.uploaded.length),
                    skipped: String(result.skipped.length),
                    deleted: String(result.deleted.length),
                  })
                );
              }
            } catch (error) {
              const msg = formatError(error);
              if (msg === "Cancelled by user") {
                new Notice(t("settings.syncCancelled"));
                progressText.textContent = t("settings.syncCancelled");
              } else {
                new Notice(t("settings.syncFailed", { error: msg }));
                progressText.textContent = `${t("common.error")}${msg}`;
                progressText.addClass("gemini-helper-progress-error");
              }
            } finally {
              btn.setDisabled(false);
              btn.setButtonText(t("settings.syncVault"));
              if (cancelBtn) cancelBtn.addClass("gemini-helper-hidden");
              syncCancelRef.value = false;
              setTimeout(() => {
                progressContainer.addClass("gemini-helper-hidden");
                display();
              }, 2000);
            }
          })();
        })
    );

  // Advanced semantic search settings
  new Setting(containerEl).setName(t("settings.advancedSemanticSearch")).setHeading();

  // Reset Sync State
  new Setting(containerEl)
    .setName(t("settings.resetSyncState"))
    .setDesc(t("settings.resetSyncState.desc"))
    .addButton((btn) =>
      btn.setButtonText(t("common.reset")).onClick(() => {
        void (async () => {
          const confirmed = await new ConfirmModal(
            app,
            t("settings.resetSyncStateConfirm"),
            t("common.reset"),
            t("common.cancel")
          ).openAndWait();
          if (!confirmed) return;

          await plugin.resetRagSettingSyncState(name);
          display();
        })();
      })
    );

  // Delete Store
  if (ragSetting.storeId && !ragSetting.isExternal) {
    new Setting(containerEl)
      .setName(t("settings.deleteStore"))
      .setDesc(t("settings.deleteStore.desc"))
      .addButton((btn) =>
        btn
          .setButtonText(t("settings.deleteStore"))
          .setWarning()
          .onClick(() => {
            void (async () => {
              const confirmed = await new ConfirmModal(
                app,
                t("settings.deleteStoreConfirm"),
                t("common.delete"),
                t("common.cancel")
              ).openAndWait();
              if (!confirmed) return;

              try {
                await plugin.deleteRagStore(name);
                new Notice(t("settings.storeDeleted"));
                display();
              } catch (error) {
                new Notice(t("settings.deleteStoreFailed", { error: formatError(error) }));
              }
            })();
          })
      );
  }
}
