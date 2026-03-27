import { Setting, Notice } from "obsidian";
import { t } from "src/i18n";
import { DEFAULT_SETTINGS, DEFAULT_WORKSPACE_FOLDER } from "src/types";
import { ConfirmModal } from "src/ui/components/ConfirmModal";
import type { SettingsContext } from "./settingsContext";

export function displayWorkspaceSettings(containerEl: HTMLElement, ctx: SettingsContext): void {
  const { plugin, display } = ctx;
  const app = plugin.app;

  new Setting(containerEl).setName(t("settings.workspace")).setHeading();

  new Setting(containerEl)
    .setName(t("settings.workspaceFolder"))
    .setDesc(t("settings.workspaceFolder.desc"))
    .addText((text) => {
      text
        .setPlaceholder(DEFAULT_WORKSPACE_FOLDER)
        .setValue(plugin.settings.workspaceFolder);

      // Commit on blur instead of on every keystroke to avoid intermediate renames
      text.inputEl.addEventListener("blur", () => {
        void (async () => {
          const trimmed = text.inputEl.value.trim().replace(/^\/+|\/+$/g, "");
          const newFolder = trimmed || DEFAULT_WORKSPACE_FOLDER;
          const oldFolder = plugin.settings.workspaceFolder || DEFAULT_WORKSPACE_FOLDER;

          if (newFolder === oldFolder) {
            // Reset display in case user typed then cleared
            text.inputEl.value = oldFolder;
            return;
          }

          // Block absolute paths and directory traversal
          if (newFolder.startsWith("/") || newFolder.includes("..")) {
            new Notice(t("settings.workspaceFolder.invalidPath"));
            text.inputEl.value = oldFolder;
            return;
          }

          // Check if old folder exists and ask to move
          const oldExists = await app.vault.adapter.exists(oldFolder);
          if (oldExists) {
            const confirmed = await new ConfirmModal(
              app,
              t("settings.moveWorkspaceFolder", { from: oldFolder, to: newFolder }),
              t("settings.moveWorkspaceFolder.move"),
              t("settings.moveWorkspaceFolder.skip")
            ).openAndWait();

            if (confirmed) {
              try {
                await app.vault.adapter.rename(oldFolder, newFolder);
              } catch (e) {
                new Notice(t("settings.moveWorkspaceFolder.error", { error: String(e) }));
                text.inputEl.value = oldFolder;
                return;
              }
            }
          }

          plugin.settings.workspaceFolder = newFolder;
          await plugin.saveSettings();
          plugin.updateWorkspaceFolderVisibility();

          // Reload workspace state from new folder
          await plugin.loadWorkspaceState();

          display();
        })();
      });
    });

  // Hide Workspace Folder (only for default folder name)
  if ((plugin.settings.workspaceFolder || DEFAULT_WORKSPACE_FOLDER) === DEFAULT_WORKSPACE_FOLDER) {
    new Setting(containerEl)
      .setName(t("settings.hideWorkspaceFolder"))
      .setDesc(t("settings.hideWorkspaceFolder.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(plugin.settings.hideWorkspaceFolder)
          .onChange((value) => {
            void (async () => {
              plugin.settings.hideWorkspaceFolder = value;
              await plugin.saveSettings();
              plugin.updateWorkspaceFolderVisibility();
            })();
          })
      );
  }

  // Save Chat History
  new Setting(containerEl)
    .setName(t("settings.saveChatHistory"))
    .setDesc(t("settings.saveChatHistory.desc"))
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.saveChatHistory)
        .onChange((value) => {
          void (async () => {
            if (!value) {
              const confirmed = await new ConfirmModal(
                app,
                t("settings.deleteChatHistoryConfirm"),
                t("common.delete"),
                t("common.cancel")
              ).openAndWait();

              if (confirmed) {
                await deleteChatHistoryFiles(plugin);
              }
            }
            plugin.settings.saveChatHistory = value;
            await plugin.saveSettings();
          })();
        })
    );

  // System Prompt
  const systemPromptSetting = new Setting(containerEl)
    .setName(t("settings.systemPrompt"))
    .setDesc(t("settings.systemPrompt.desc"));

  systemPromptSetting.settingEl.addClass("gemini-helper-settings-textarea-container");

  systemPromptSetting.addTextArea((text) => {
    text
      .setPlaceholder(t("settings.systemPrompt.placeholder"))
      .setValue(plugin.settings.systemPrompt)
      .onChange((value) => {
        void (async () => {
          plugin.settings.systemPrompt = value;
          await plugin.saveSettings();
        })();
      });
    text.inputEl.rows = 4;
    text.inputEl.addClass("gemini-helper-settings-textarea");
  });

  // Tool limits (collapsible)
  const detailsEl = containerEl.createEl("details", { cls: "gemini-helper-settings-details" });
  detailsEl.createEl("summary", { text: t("settings.toolLimits"), cls: "gemini-helper-settings-summary" });

  new Setting(detailsEl)
    .setName(t("settings.maxToolCalls"))
    .setDesc(t("settings.maxToolCalls.desc"))
    .addSlider((slider) =>
      slider
        .setLimits(1, 50, 1)
        .setValue(plugin.settings.maxFunctionCalls)
        .setDynamicTooltip()
        .onChange((value) => {
          void (async () => {
            plugin.settings.maxFunctionCalls = value;
            const needsRefresh = plugin.settings.functionCallWarningThreshold > value;
            if (needsRefresh) {
              plugin.settings.functionCallWarningThreshold = value;
            }
            await plugin.saveSettings();
            if (needsRefresh) {
              display();
            }
          })();
        })
    )
    .addExtraButton((button) =>
      button
        .setIcon("reset")
        .setTooltip(t("settings.resetToDefault", { value: String(DEFAULT_SETTINGS.maxFunctionCalls) }))
        .onClick(() => {
          void (async () => {
            plugin.settings.maxFunctionCalls = DEFAULT_SETTINGS.maxFunctionCalls;
            if (plugin.settings.functionCallWarningThreshold > DEFAULT_SETTINGS.maxFunctionCalls) {
              plugin.settings.functionCallWarningThreshold = DEFAULT_SETTINGS.maxFunctionCalls;
            }
            await plugin.saveSettings();
            display();
          })();
        })
    );

  new Setting(detailsEl)
    .setName(t("settings.toolCallWarning"))
    .setDesc(t("settings.toolCallWarning.desc"))
    .addSlider((slider) =>
      slider
        .setLimits(1, 50, 1)
        .setValue(plugin.settings.functionCallWarningThreshold)
        .setDynamicTooltip()
        .onChange((value) => {
          void (async () => {
            const maxAllowed = plugin.settings.maxFunctionCalls;
            const nextValue = Math.min(value, maxAllowed);
            plugin.settings.functionCallWarningThreshold = nextValue;
            await plugin.saveSettings();
            if (nextValue !== value) {
              display();
            }
          })();
        })
    )
    .addExtraButton((button) =>
      button
        .setIcon("reset")
        .setTooltip(t("settings.resetToDefault", { value: String(DEFAULT_SETTINGS.functionCallWarningThreshold) }))
        .onClick(() => {
          void (async () => {
            plugin.settings.functionCallWarningThreshold = DEFAULT_SETTINGS.functionCallWarningThreshold;
            await plugin.saveSettings();
            display();
          })();
        })
    );

  new Setting(detailsEl)
    .setName(t("settings.listNotesLimit"))
    .setDesc(t("settings.listNotesLimit.desc"))
    .addSlider((slider) =>
      slider
        .setLimits(10, 200, 10)
        .setValue(plugin.settings.listNotesLimit)
        .setDynamicTooltip()
        .onChange((value) => {
          void (async () => {
            plugin.settings.listNotesLimit = value;
            await plugin.saveSettings();
          })();
        })
    )
    .addExtraButton((button) =>
      button
        .setIcon("reset")
        .setTooltip(t("settings.resetToDefault", { value: String(DEFAULT_SETTINGS.listNotesLimit) }))
        .onClick(() => {
          void (async () => {
            plugin.settings.listNotesLimit = DEFAULT_SETTINGS.listNotesLimit;
            await plugin.saveSettings();
            display();
          })();
        })
    );

  new Setting(detailsEl)
    .setName(t("settings.maxNoteChars"))
    .setDesc(t("settings.maxNoteChars.desc"))
    .addSlider((slider) =>
      slider
        .setLimits(1000, 100000, 1000)
        .setValue(plugin.settings.maxNoteChars)
        .setDynamicTooltip()
        .onChange((value) => {
          void (async () => {
            plugin.settings.maxNoteChars = value;
            await plugin.saveSettings();
          })();
        })
    )
    .addExtraButton((button) =>
      button
        .setIcon("reset")
        .setTooltip(t("settings.resetToDefault", { value: String(DEFAULT_SETTINGS.maxNoteChars) }))
        .onClick(() => {
          void (async () => {
            plugin.settings.maxNoteChars = DEFAULT_SETTINGS.maxNoteChars;
            await plugin.saveSettings();
            display();
          })();
        })
    );
}

async function deleteChatHistoryFiles(plugin: import("src/plugin").GeminiHelperPlugin): Promise<void> {
  const app = plugin.app;
  const folderPath = plugin.settings.workspaceFolder || DEFAULT_WORKSPACE_FOLDER;
  const folderExists = await app.vault.adapter.exists(folderPath);
  if (!folderExists) return;

  const listed = await app.vault.adapter.list(folderPath);
  const chatFiles = listed.files.filter((f) => {
    const name = f.split("/").pop() || "";
    return name.startsWith("chat_") && (name.endsWith(".md") || name.endsWith(".md.encrypted"));
  });

  let deletedCount = 0;
  for (const file of chatFiles) {
    try {
      await app.vault.adapter.remove(file);
      deletedCount++;
    } catch {
      // Ignore errors for individual files
    }
  }

  if (deletedCount > 0) {
    new Notice(t("settings.chatHistoryDeleted", { count: String(deletedCount) }));
  }
}
