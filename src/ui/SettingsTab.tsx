import { PluginSettingTab, App } from "obsidian";
import type { Setting, SettingDefinitionItem } from "obsidian";
import type { GeminiHelperPlugin } from "src/plugin";
import type { SettingsContext } from "src/ui/settings/settingsContext";
import { displayApiSettings } from "src/ui/settings/apiSettings";
import { displayWorkspaceSettings } from "src/ui/settings/workspaceSettings";
import { displayEditHistorySettings } from "src/ui/settings/editHistorySettings";
import { displayEncryptionSettings } from "src/ui/settings/encryptionSettings";
import { displayLangfuseSettings } from "src/ui/settings/langfuseSettings";
import { displaySlashCommandSettings } from "src/ui/settings/slashCommandSettings";
import { displayRagSettings } from "src/ui/settings/ragSettings";
import { displayExternalSkillSettings } from "src/ui/settings/externalSkillSettings";
import { displayKnowledgeSettings } from "src/ui/settings/knowledgeSettings";

import { displayMcpServersSettings } from "src/ui/settings/mcpServersSettings";

// Sections rendered under the main tab heading (edit history has no UI of its own).
const SECTION_RENDERERS: Array<(containerEl: HTMLElement, ctx: SettingsContext) => void> = [
  displayApiSettings,
  displayWorkspaceSettings,
  displayEncryptionSettings,
  displayLangfuseSettings,
  displaySlashCommandSettings,
  displayExternalSkillSettings,
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

  /** Obsidian versions before searchable setting definitions call display() directly. */
  display(): void {
    this.containerEl.empty();
    const ctx: SettingsContext = {
      plugin: this.plugin,
      display: () => this.display(),
      syncCancelRef: this.syncCancelRef,
    };
    displayEditHistorySettings(this.containerEl, ctx);
    for (const renderSection of SECTION_RENDERERS) renderSection(this.containerEl, ctx);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const ctx: SettingsContext = {
      plugin: this.plugin,
      display: () => this.update(),
      syncCancelRef: this.syncCancelRef,
    };
    displayEditHistorySettings(this.containerEl, ctx);

    return SECTION_RENDERERS.map(
      (renderSection): SettingDefinitionItem => ({
        name: "",
        searchable: false,
        render: (setting: Setting) => {
          setting.settingEl.addClass("gemini-helper-settings-section");
          setting.settingEl.empty();
          renderSection(setting.settingEl, ctx);
        },
      }),
    );
  }
}
