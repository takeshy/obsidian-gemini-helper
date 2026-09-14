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
      display: () => this.update(),
      syncCancelRef: this.syncCancelRef,
    };
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    // Normalizes edit history defaults; it renders no UI, so run it once per rebuild.
    displayEditHistorySettings(this.containerEl, this.createContext());
    return SETTINGS_SECTIONS.map(({ name, aliases, render }) => ({
      name,
      aliases,
      render: setting => {
        // Each existing renderer owns a whole section, including its heading.
        setting.settingEl.empty();
        setting.settingEl.removeClass("setting-item");
        render(setting.settingEl, this.createContext());
      },
    }));
  }
}
