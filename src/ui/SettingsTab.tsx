import { PluginSettingTab, App } from "obsidian";
import type { Setting, SettingDefinitionItem } from "obsidian";
import type { GeminiHelperPlugin } from "src/plugin";
import { t, type TranslationKey } from "src/i18n";
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

interface SettingsSection {
  name: TranslationKey;
  aliases: TranslationKey[];
  render: (containerEl: HTMLElement, ctx: SettingsContext) => void;
}

// Sections rendered under the main tab heading (edit history has no UI of its own).
const SETTINGS_SECTIONS: SettingsSection[] = [
  { name: "settings.api", aliases: ["settings.googleApiKey", "settings.apiPlan"], render: displayApiSettings },
  {
    name: "settings.workspace",
    aliases: ["settings.workspaceFolder", "settings.saveChatHistory", "settings.systemPrompt"],
    render: displayWorkspaceSettings,
  },
  {
    name: "settings.encryption",
    aliases: ["settings.encryptionPassword", "settings.encryptChatHistory", "settings.encryptWorkflowHistory"],
    render: displayEncryptionSettings,
  },
  {
    name: "settings.langfuse",
    aliases: ["settings.langfuseBaseUrl", "settings.langfusePublicKey", "settings.langfuseSecretKey"],
    render: displayLangfuseSettings,
  },
  { name: "settings.slashCommands", aliases: ["settings.manageCommands"], render: displaySlashCommandSettings },
  {
    name: "settings.externalSkills",
    aliases: ["settings.externalSkillsRepository", "settings.externalSkills.install", "settings.externalSkills.installed"],
    render: displayExternalSkillSettings,
  },
  {
    name: "settings.knowledge",
    aliases: ["settings.okfSource", "settings.okfSourcePath"],
    render: displayKnowledgeSettings,
  },
  {
    name: "settings.rag",
    aliases: ["settings.ragSetting", "settings.targetFolders", "settings.excludedPatterns", "settings.metadataFilter"],
    render: displayRagSettings,
  },
  {
    name: "settings.mcpServers",
    aliases: ["settings.mcpServers.desc"],
    render: displayMcpServersSettings,
  },
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
    for (const section of SETTINGS_SECTIONS) section.render(this.containerEl, ctx);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const ctx: SettingsContext = {
      plugin: this.plugin,
      display: () => this.update(),
      syncCancelRef: this.syncCancelRef,
    };
    displayEditHistorySettings(this.containerEl, ctx);

    return SETTINGS_SECTIONS.map(
      (section): SettingDefinitionItem => ({
        name: t(section.name),
        aliases: section.aliases.map((key) => t(key)),
        render: (setting: Setting) => {
          setting.settingEl.addClass("gemini-helper-settings-section");
          setting.settingEl.empty();
          section.render(setting.settingEl, ctx);
        },
      }),
    );
  }
}
