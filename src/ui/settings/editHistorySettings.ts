import { Setting, Notice } from "obsidian";
import { t } from "src/i18n";
import { DEFAULT_EDIT_HISTORY_SETTINGS } from "src/types";
import { getEditHistoryManager } from "src/core/editHistory";
import type { SettingsContext } from "./settingsContext";

export function displayEditHistorySettings(containerEl: HTMLElement, ctx: SettingsContext): void {
  const { plugin, display } = ctx;

  new Setting(containerEl).setName(t("settings.editHistory")).setHeading();

  // Ensure editHistory settings exist
  if (!plugin.settings.editHistory) {
    plugin.settings.editHistory = { ...DEFAULT_EDIT_HISTORY_SETTINGS };
  }

  const editHistory = plugin.settings.editHistory;

  // Enable/Disable toggle
  new Setting(containerEl)
    .setName(t("settings.editHistoryEnabled"))
    .setDesc(t("settings.editHistoryEnabled.desc"))
    .addToggle((toggle) =>
      toggle
        .setValue(editHistory.enabled)
        .onChange((value) => {
          void (async () => {
            if (!value) {
              const manager = getEditHistoryManager();
              if (manager) {
                const deletedCount = manager.clearAllHistory();
                if (deletedCount > 0) {
                  new Notice(t("settings.editHistoryCleared", { count: String(deletedCount) }));
                }
              }
            }
            plugin.settings.editHistory.enabled = value;
            await plugin.saveSettings();
            display();
          })();
        })
    );

  if (!editHistory.enabled) return;

  new Setting(containerEl)
    .setName(t("settings.editHistoryContextLines"))
    .setDesc(t("settings.editHistoryContextLines.desc"))
    .addSlider((slider) =>
      slider
        .setLimits(0, 10, 1)
        .setValue(editHistory.diff.contextLines)
        .setDynamicTooltip()
        .onChange((value) => {
          void (async () => {
            plugin.settings.editHistory.diff.contextLines = value;
            await plugin.saveSettings();
          })();
        })
    )
    .addExtraButton((btn) =>
      btn
        .setIcon("reset")
        .setTooltip(t("settings.resetToDefault", { value: String(DEFAULT_EDIT_HISTORY_SETTINGS.diff.contextLines) }))
        .onClick(() => {
          void (async () => {
            plugin.settings.editHistory.diff.contextLines = DEFAULT_EDIT_HISTORY_SETTINGS.diff.contextLines;
            await plugin.saveSettings();
            display();
          })();
        })
    );

  // Stats button
  new Setting(containerEl)
    .addButton((btn) =>
      btn
        .setButtonText(t("settings.editHistoryViewStats"))
        .onClick(() => {
          const manager = getEditHistoryManager();
          if (!manager) {
            new Notice("Edit history manager not initialized");
            return;
          }
          const stats = manager.getStats();
          new Notice(t("settings.editHistoryStats", {
            files: String(stats.totalFiles),
            entries: String(stats.totalEntries),
          }));
        })
    );
}
