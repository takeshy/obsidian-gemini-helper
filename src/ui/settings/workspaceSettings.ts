import { Setting } from "obsidian";
import {
  addAllowedVaultFoldersSetting,
  addHideWorkspaceFolderSetting,
  addMaxSavedChatHistoriesSetting,
  addSaveChatHistorySetting,
  addSystemPromptSetting,
  addToolLimitsSection,
  addWorkspaceFolderSetting,
} from "obsidian-llm-hub-common/settings";
import { t } from "src/i18n";
import { DEFAULT_SETTINGS, DEFAULT_WORKSPACE_FOLDER } from "src/types";
import type { SettingsContext } from "./settingsContext";

export function displayWorkspaceSettings(containerEl: HTMLElement, ctx: SettingsContext): void {
  const { plugin } = ctx;

  new Setting(containerEl).setName(t("settings.workspace")).setHeading();

  // Nothing outside the folder is keyed by its name here, so the move needs no hooks.
  addWorkspaceFolderSetting(containerEl, ctx, DEFAULT_WORKSPACE_FOLDER);
  addHideWorkspaceFolderSetting(containerEl, ctx, DEFAULT_WORKSPACE_FOLDER);

  addAllowedVaultFoldersSetting(
    containerEl,
    ctx,
    {
      name: t("settings.aiVaultToolAllowedFolders"),
      desc: t("settings.aiVaultToolAllowedFolders.desc"),
      placeholder: t("settings.aiVaultToolAllowedFolders.placeholder"),
    },
    {
      get: () => plugin.settings.aiVaultToolAllowedFolders || [],
      set: (folders) => { plugin.settings.aiVaultToolAllowedFolders = folders; },
    },
  );

  // Chats are written straight into the workspace folder here.
  addSaveChatHistorySetting(containerEl, ctx, () => plugin.settings.workspaceFolder || DEFAULT_WORKSPACE_FOLDER);
  addMaxSavedChatHistoriesSetting(containerEl, ctx, DEFAULT_SETTINGS.maxSavedChatHistories);
  addSystemPromptSetting(containerEl, ctx);
  addToolLimitsSection(containerEl, ctx, DEFAULT_SETTINGS);
}
