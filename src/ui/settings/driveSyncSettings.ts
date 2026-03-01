import { Setting, Notice } from "obsidian";
import type { DriveSyncManager } from "src/core/driveSync";
import { t } from "src/i18n";
import { ConfirmModal } from "src/ui/components/ConfirmModal";
import { DriveSyncConflictModal } from "src/ui/components/DriveSyncConflictModal";
import { DriveAuthPasswordModal } from "src/ui/components/DriveAuthPasswordModal";
import { DriveTrashModal } from "src/ui/components/DriveTrashModal";
import { DriveConflictBackupModal } from "src/ui/components/DriveConflictBackupModal";
import { DriveTempFilesModal } from "src/ui/components/DriveTempFilesModal";
import { formatError } from "src/utils/error";
import type { SettingsContext } from "./settingsContext";

export function displayDriveSyncSettings(containerEl: HTMLElement, ctx: SettingsContext): void {
  const { plugin, display } = ctx;
  const app = plugin.app;
  const driveSync = plugin.settings.driveSync;
  const syncManager = plugin.driveSyncManager;

  new Setting(containerEl).setName(t("driveSync.heading")).setHeading();

  // Enable toggle
  new Setting(containerEl)
    .setName(t("driveSync.enable"))
    .setDesc(t("driveSync.enableDesc"))
    .addToggle((toggle) =>
      toggle.setValue(driveSync.enabled).onChange((value) => {
        void (async () => {
          plugin.settings.driveSync.enabled = value;
          await plugin.saveSettings();
          plugin.setupDriveSyncUI();
          display();
        })();
      })
    );

  if (!driveSync.enabled) return;

  // Setup / Connection status
  if (!driveSync.encryptedAuth) {
    // Not configured: show Migration Tool token input
    new Setting(containerEl)
      .setName(t("driveSync.backupToken"))
      .setDesc(t("driveSync.backupTokenDesc"))
      .addText((text) => {
        text.setPlaceholder(t("driveSync.backupTokenPlaceholder"));
        text.inputEl.type = "password";
        text.inputEl.addClass("gemini-helper-backup-token-input");
        const inputEl = text.inputEl;

        new Setting(containerEl)
          .setName(t("driveSync.setupConnection"))
          .setDesc(t("driveSync.setupConnectionDesc"))
          .addButton((btn) =>
            btn
              .setButtonText(t("driveSync.setup"))
              .setCta()
              .onClick(() => {
                const token = inputEl.value.trim();
                if (!token) {
                  new Notice(t("driveSync.pasteTokenFirst"));
                  return;
                }
                void (async () => {
                  try {
                    btn.setButtonText(t("driveSync.settingUp"));
                    btn.setDisabled(true);
                    if (!syncManager) throw new Error("Drive sync not initialized");
                    await syncManager.setupWithBackupToken(token);
                    new Notice(t("driveSync.configured"));
                    display();
                    void plugin.promptDriveSyncUnlock();
                  } catch (err) {
                    new Notice(t("driveSync.setupFailed", { error: formatError(err) }));
                    btn.setButtonText(t("driveSync.setup"));
                    btn.setDisabled(false);
                  }
                })();
              })
          );
      });
  } else {
    // Configured: show unlock status
    const isUnlocked = syncManager?.isUnlocked ?? false;

    if (isUnlocked) {
      new Setting(containerEl)
        .setName(t("driveSync.connectionStatus"))
        .setDesc(t("driveSync.connectedDesc"))
        .addButton((btn) =>
          btn.setButtonText(t("driveSync.resetAuth")).setWarning().onClick(() => {
            void (async () => {
              const confirmed = await new ConfirmModal(
                app,
                t("driveSync.resetAuthConfirm"),
                t("common.reset"),
                t("common.cancel")
              ).openAndWait();
              if (!confirmed) return;
              plugin.settings.driveSync.encryptedAuth = null;
              await plugin.saveSettings();
              syncManager?.stopAutoSync();
              display();
              new Notice(t("driveSync.authReset"));
            })();
          })
        );
    } else {
      new Setting(containerEl)
        .setName(t("driveSync.connectionStatus"))
        .setDesc(t("driveSync.lockedDesc"))
        .addButton((btn) =>
          btn
            .setButtonText(t("driveSync.unlock"))
            .setCta()
            .onClick(() => {
              void (async () => {
                const modal = new DriveAuthPasswordModal(app);
                const password = await modal.openAndWait();
                if (!password) return;
                try {
                  if (!syncManager) throw new Error("Drive sync not initialized");
                  await syncManager.unlockWithPassword(password);
                  new Notice(t("driveSync.unlocked"));
                  display();
                } catch (err) {
                  new Notice(t("driveSync.unlockFailed", { error: formatError(err) }));
                }
              })();
            })
        )
        .addButton((btn) =>
          btn.setButtonText(t("driveSync.resetAuth")).onClick(() => {
            void (async () => {
              const confirmed = await new ConfirmModal(
                app,
                t("driveSync.resetAuthConfirm"),
                t("common.reset"),
                t("common.cancel")
              ).openAndWait();
              if (!confirmed) return;
              plugin.settings.driveSync.encryptedAuth = null;
              await plugin.saveSettings();
              display();
              new Notice(t("driveSync.authReset"));
            })();
          })
        );
    }
  }

  // Only show rest of settings if configured
  if (!driveSync.encryptedAuth) return;

  // Auto sync check toggle
  new Setting(containerEl)
    .setName(t("driveSync.autoSyncCheck"))
    .setDesc(t("driveSync.autoSyncCheckDesc"))
    .addToggle((toggle) =>
      toggle.setValue(driveSync.autoSync).onChange((value) => {
        void (async () => {
          plugin.settings.driveSync.autoSync = value;
          await plugin.saveSettings();
          if (value) {
            syncManager?.startAutoSync();
          } else {
            syncManager?.stopAutoSync();
          }
          display();
        })();
      })
    );

  // Sync check interval
  if (driveSync.autoSync) {
    new Setting(containerEl)
      .setName(t("driveSync.syncInterval"))
      .setDesc(t("driveSync.syncIntervalDesc"))
      .addSlider((slider) =>
        slider
          .setLimits(3, 60, 1)
          .setValue(Math.max(3, driveSync.syncIntervalMinutes))
          .setDynamicTooltip()
          .onChange((value) => {
            void (async () => {
              plugin.settings.driveSync.syncIntervalMinutes = value;
              await plugin.saveSettings();
              syncManager?.startAutoSync();
            })();
          })
      );
  }

  // Exclude patterns
  new Setting(containerEl)
    .setName(t("driveSync.excludePatterns"))
    .setDesc(t("driveSync.excludePatternsDesc"))
    .addTextArea((text) => {
      text
        .setPlaceholder("node_modules/\n*.tmp")
        .setValue(driveSync.excludePatterns.join("\n"))
        .onChange((value) => {
          void (async () => {
            plugin.settings.driveSync.excludePatterns = value
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);
            await plugin.saveSettings();
          })();
        });
      text.inputEl.rows = 4;
      text.inputEl.cols = 30;
    });

  // Only show sync actions if unlocked
  if (!syncManager?.isUnlocked) return;

  // Push / Pull / Full Pull buttons
  const isSyncing = syncManager.syncStatus !== "idle";
  const statusText = `Status: ${syncManager.syncStatus} | Local changes: ${syncManager.localModifiedCount} | Remote changes: ${syncManager.remoteModifiedCount}`;

  const refreshBtnEl: HTMLButtonElement[] = [];

  const syncActionSetting = new Setting(containerEl)
    .setName(t("driveSync.syncActions"))
    .setDesc(statusText);

  const disableAllSyncButtons = () => {
    syncActionSetting.controlEl.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      b.disabled = true;
    });
    refreshBtnEl.forEach((b) => { b.disabled = true; });
  };

  syncActionSetting
    .addButton((btn) =>
      btn.setButtonText(t("driveSync.push")).setDisabled(isSyncing).onClick(() => {
        void (async () => {
          disableAllSyncButtons();
          await syncManager.push();
          if (syncManager.syncStatus === "conflict") {
            openConflictModal(app, syncManager, display);
          }
          display();
        })();
      })
    )
    .addButton((btn) =>
      btn
        .setButtonText(t("driveSync.pull"))
        .setCta()
        .setDisabled(isSyncing)
        .onClick(() => {
          void (async () => {
            disableAllSyncButtons();
            await syncManager.pull();
            if (syncManager.syncStatus === "conflict") {
              openConflictModal(app, syncManager, display);
            }
            display();
          })();
        })
    )
    .addButton((btn) =>
      btn.setButtonText(t("driveSync.fullPull")).setWarning().setDisabled(isSyncing).onClick(() => {
        void (async () => {
          const confirmed = await new ConfirmModal(
            app,
            t("driveSync.fullPullConfirm"),
            t("driveSync.fullPull"),
            t("common.cancel")
          ).openAndWait();
          if (!confirmed) return;
          disableAllSyncButtons();
          await syncManager.fullPull();
          display();
        })();
      })
    );

  // Refresh counts button
  new Setting(containerEl)
    .setName(t("driveSync.refreshStatus"))
    .setDesc(t("driveSync.refreshStatusDesc"))
    .addButton((btn) => {
      btn.setButtonText(t("driveSync.refresh")).setDisabled(isSyncing).onClick(() => {
        void (async () => {
          disableAllSyncButtons();
          await syncManager.refreshSyncCounts();
          display();
        })();
      });
      refreshBtnEl.push(btn.buttonEl);
    });

  new Setting(containerEl)
    .setName(t("driveSync.tempFiles"))
    .setDesc(t("driveSync.tempFilesDesc"))
    .addButton((btn) =>
      btn.setButtonText(t("driveSync.manage")).onClick(() => {
        new DriveTempFilesModal(app, syncManager, () => display()).open();
      })
    );

  new Setting(containerEl)
    .setName(t("driveSync.conflictBackups"))
    .setDesc(t("driveSync.conflictBackupsDesc"))
    .addButton((btn) =>
      btn.setButtonText(t("driveSync.manage")).onClick(() => {
        new DriveConflictBackupModal(app, syncManager, () => display()).open();
      })
    );

  new Setting(containerEl)
    .setName(t("driveSync.trash"))
    .setDesc(t("driveSync.trashDesc"))
    .addButton((btn) =>
      btn.setButtonText(t("driveSync.manage")).onClick(() => {
        new DriveTrashModal(app, syncManager, () => display()).open();
      })
    );
}

function openConflictModal(
  app: import("obsidian").App,
  syncManager: DriveSyncManager,
  display: () => void
): void {
  new DriveSyncConflictModal(
    app,
    syncManager,
    syncManager.conflicts,
    () => {
      if (syncManager.syncStatus === "conflict") {
        openConflictModal(app, syncManager, display);
      }
      display();
    }
  ).open();
}
