import { PluginSettingTab, App } from "obsidian";
import type { GeminiHelperPlugin } from "src/plugin";
import type { SettingsContext } from "src/ui/settings/settingsContext";
import { displayApiSettings } from "src/ui/settings/apiSettings";
import { displayCliSettings } from "src/ui/settings/cliSettings";
import { displayWorkspaceSettings } from "src/ui/settings/workspaceSettings";
import { displayEditHistorySettings } from "src/ui/settings/editHistorySettings";
import { displayEncryptionSettings } from "src/ui/settings/encryptionSettings";
import { displayLangfuseSettings } from "src/ui/settings/langfuseSettings";
import { displaySlashCommandSettings } from "src/ui/settings/slashCommandSettings";
import { displayRagSettings } from "src/ui/settings/ragSettings";
import { displayDriveSyncSettings } from "src/ui/settings/driveSyncSettings";
import { displayMcpServersSettings } from "src/ui/settings/mcpServersSettings";

export class SettingsTab extends PluginSettingTab {
  plugin: GeminiHelperPlugin;
  private syncCancelRef = { value: false };

  constructor(app: App, plugin: GeminiHelperPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const ctx: SettingsContext = {
      plugin: this.plugin,
      display: () => this.display(),
      syncCancelRef: this.syncCancelRef,
    };

    displayApiSettings(containerEl, ctx);
    displayCliSettings(containerEl, ctx);
    displayWorkspaceSettings(containerEl, ctx);
    displayEditHistorySettings(containerEl, ctx);
    displayEncryptionSettings(containerEl, ctx);
    displayLangfuseSettings(containerEl, ctx);
    displaySlashCommandSettings(containerEl, ctx);
    displayRagSettings(containerEl, ctx);
    displayDriveSyncSettings(containerEl, ctx);
    displayMcpServersSettings(containerEl, ctx);
  }
}
