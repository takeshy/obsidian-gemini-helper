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

  private buildCtx(refresh: () => void): SettingsContext {
    return {
      plugin: this.plugin,
      display: refresh,
      syncCancelRef: this.syncCancelRef,
    };
  }

  /**
   * @deprecated Fallback for Obsidian < 1.13.0; superseded by getSettingDefinitions().
   */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const ctx = this.buildCtx(() => this.display());
    displayEditHistorySettings(containerEl, ctx);
    for (const render of SECTION_RENDERERS) {
      render(containerEl, ctx);
    }
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const ctx = this.buildCtx(() => this.update());
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
