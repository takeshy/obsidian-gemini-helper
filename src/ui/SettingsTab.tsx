import { PluginSettingTab, App, type SettingDefinitionItem } from "obsidian";
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

// Keep the imperative section renderers for compatibility with older Obsidian.
const SETTINGS_SECTIONS = [
  { name: "Gemini API", aliases: ["API key", "plan"], render: displayApiSettings },
  { name: "Workspace", aliases: ["folder", "chat history"], render: displayWorkspaceSettings },
  { name: "Chat", aliases: ["model", "tools", "thinking"], render: displayChatSettings },
  { name: "Encryption", aliases: ["password"], render: displayEncryptionSettings },
  { name: "Langfuse", aliases: ["tracing"], render: displayLangfuseSettings },
  { name: "Slash commands", render: displaySlashCommandSettings },
  { name: "External skills", render: displayExternalSkillSettings },
  { name: "Agent plugins", aliases: ["GitHub", "install"], render: displayAgentPluginSettings },
  { name: "Knowledge", aliases: ["wiki", "OKF"], render: displayKnowledgeSettings },
  { name: "Semantic search (RAG)", aliases: ["stores", "sync"], render: displayRagSettings },
  { name: "MCP servers", aliases: ["tools"], render: displayMcpServersSettings },
];

export class SettingsTab extends PluginSettingTab {
  plugin: GeminiHelperPlugin;
  private syncCancelRef = { value: false };

  constructor(app: App, plugin: GeminiHelperPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private createContext(): SettingsContext {
    return {
      plugin: this.plugin,
      display: () => {
        if (typeof this.update === "function") this.update();
        else this.renderLegacySettings();
      },
      syncCancelRef: this.syncCancelRef,
    };
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return SETTINGS_SECTIONS.map(({ name, aliases, render }) => ({
      name,
      aliases,
      render: setting => {
        // Each existing renderer owns a whole section, including its heading.
        setting.settingEl.empty();
        setting.settingEl.removeClass("setting-item");
        const ctx = this.createContext();
        displayEditHistorySettings(setting.settingEl, ctx);
        render(setting.settingEl, ctx);
      },
    }));
  }

  /** Compatibility fallback for Obsidian versions before 1.13.0. */
  display(): void {
    this.renderLegacySettings();
  }

  private renderLegacySettings(): void {
    this.containerEl.empty();
    const ctx = this.createContext();
    displayEditHistorySettings(this.containerEl, ctx);
    for (const section of SETTINGS_SECTIONS) section.render(this.containerEl, ctx);
  }
}
