import { Setting, TFolder, TFile, Notice } from "obsidian";
import type { DropdownComponent } from "obsidian";
import { t } from "src/i18n";
import { DEFAULT_SETTINGS } from "src/types";
import { ConfirmModal } from "src/ui/components/ConfirmModal";
import type { SettingsContext } from "./settingsContext";

export function displayWorkspaceSettings(containerEl: HTMLElement, ctx: SettingsContext): void {
  const { plugin, display } = ctx;
  const app = plugin.app;

  new Setting(containerEl).setName(t("settings.workspace")).setHeading();

  // Workspace Folder
  new Setting(containerEl)
    .setName(t("settings.workspaceFolder"))
    .setDesc(t("settings.workspaceFolder.desc"))
    .addDropdown((dropdown: DropdownComponent) => {
      dropdown.addOption("", t("settings.workspaceFolder.vaultRoot"));

      const folders = app.vault
        .getAllLoadedFiles()
        .filter((file) => file instanceof TFolder && !file.isRoot());

      const currentFolder = plugin.settings.workspaceFolder;
      const folderPaths = new Set(folders.map((f) => f.path));

      if (currentFolder && !folderPaths.has(currentFolder)) {
        dropdown.addOption(currentFolder, t("settings.workspaceFolder.willBeCreated", { folder: currentFolder }));
      }

      folders.forEach((folder) => {
        dropdown.addOption(folder.path, folder.name);
      });

      dropdown
        .setValue(currentFolder)
        .onChange((value) => {
          void (async () => {
            await plugin.changeWorkspaceFolder(value);
            display();
          })();
        });
    });

  // Hide Workspace Folder
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

  // Tool limits
  new Setting(containerEl).setName(t("settings.toolLimits")).setHeading();

  new Setting(containerEl)
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

  new Setting(containerEl)
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

  new Setting(containerEl)
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

  new Setting(containerEl)
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
  const workspaceFolder = plugin.settings.workspaceFolder || "GeminiHelper";
  const folder = app.vault.getAbstractFileByPath(workspaceFolder);

  if (!(folder instanceof TFolder)) return;

  const chatFiles = folder.children.filter(
    (file) => file instanceof TFile && file.name.startsWith("chat_") && file.name.endsWith(".md")
  );

  let deletedCount = 0;
  for (const file of chatFiles) {
    if (file instanceof TFile) {
      try {
        await app.fileManager.trashFile(file);
        deletedCount++;
      } catch {
        // Ignore errors for individual files
      }
    }
  }

  if (deletedCount > 0) {
    new Notice(t("settings.chatHistoryDeleted", { count: String(deletedCount) }));
  }
}
