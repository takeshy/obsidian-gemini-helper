import { PluginSettingTab, App } from "obsidian";
import type { GeminiHelperPlugin } from "src/plugin";
import type { SettingsContext } from "src/ui/settings/settingsContext";
import { displayApiSettings } from "src/ui/settings/apiSettings";
import { displayWorkspaceSettings } from "src/ui/settings/workspaceSettings";
import { displayChatSettings } from "src/ui/settings/chatSettings";
import { displayEditHistorySettings } from "src/ui/settings/editHistorySettings";
import { displayEncryptionSettings } from "src/ui/settings/encryptionSettings";
import { displayLangfuseSettings } from "src/ui/settings/langfuseSettings";
import { displaySlashCommandSettings } from "src/ui/settings/slashCommandSettings";
import { displayRagSettings } from "src/ui/settings/ragSettings";
import { displayExternalSkillSettings } from "src/ui/settings/externalSkillSettings";
import { displayKnowledgeSettings } from "src/ui/settings/knowledgeSettings";

import { displayMcpServersSettings } from "src/ui/settings/mcpServersSettings";
import { displayAgentPluginSettings } from "src/ui/settings/agentPluginSettings";

// Sections rendered under the main tab heading (edit history has no UI of its own).
const SETTINGS_SECTIONS: Array<(containerEl: HTMLElement, ctx: SettingsContext) => void> = [
  displayApiSettings,
  displayWorkspaceSettings,
  displayChatSettings,
  displayEncryptionSettings,
  displayLangfuseSettings,
  displaySlashCommandSettings,
  displayExternalSkillSettings,
  displayAgentPluginSettings,
  displayKnowledgeSettings,
  displayRagSettings,
  displayMcpServersSettings,
];

export class SettingsTab extends PluginSettingTab {
  plugin: GeminiHelperPlugin;
  private syncCancelRef = { value: false };

  constructor(app: App, plugin: GeminiHelperPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /** Render settings using the API available at the declared minimum version. */
  display(): void {
    this.containerEl.empty();
    const ctx: SettingsContext = {
      plugin: this.plugin,
      display: () => this.display(),
      syncCancelRef: this.syncCancelRef,
    };
    displayEditHistorySettings(this.containerEl, ctx);
    for (const renderSection of SETTINGS_SECTIONS) renderSection(this.containerEl, ctx);
  }
}
