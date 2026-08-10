import { Notice, Setting } from "obsidian";
import { clearMcpToolsCache } from "src/core/mcpTools";
import { AGENT_PLUGIN_ROOT, installAgentPlugin, previewAgentPlugin, uninstallAgentPlugin } from "src/core/agentPlugins";
import type { AgentPluginInstall, McpServerConfig } from "src/types";
import type { SettingsContext } from "./settingsContext";
import { AgentPluginInstallModal } from "./AgentPluginInstallModal";

function mergeServer(next: McpServerConfig, previous?: McpServerConfig): McpServerConfig {
  if (!previous) return next;
  const same = next.url === previous.url && JSON.stringify(next.headers ?? {}) === JSON.stringify(previous.headers ?? {});
  return same ? { ...next, enabled: previous.enabled, toolHints: previous.toolHints } : next;
}

export function displayAgentPluginSettings(containerEl: HTMLElement, ctx: SettingsContext): void {
  const { plugin, display } = ctx;
  new Setting(containerEl).setName("Agent plugins").setHeading();
  containerEl.createDiv({ cls: "setting-item-description", text: `Install Agent Plugins v1.0.0 from a public GitHub repository. Packages are pinned to a commit and stored in ${AGENT_PLUGIN_ROOT}. Gemini Helper supports plugin skills and streamable HTTP MCP servers.` });
  let repository = "";
  new Setting(containerEl).setName("GitHub repository").setDesc("Owner/repository or a GitHub URL")
    .addText(text => text.setPlaceholder("Owner/repository").onChange(value => { repository = value; }))
    .addButton(button => button.setButtonText("Preview and install").setCta().onClick(() => { void (async () => {
      button.setDisabled(true);
      try {
        const preview = await previewAgentPlugin(repository);
        const prior = new Map(plugin.settings.mcpServers.filter(v => v.agentPlugin?.pluginName === preview.manifest.name).map(v => [v.agentPlugin!.serverName, v]));
        const managed = preview.mcpServers.map(v => mergeServer(v, prior.get(v.agentPlugin!.serverName)));
        new AgentPluginInstallModal(plugin.app, preview, managed, async testedServers => {
          const installed = await installAgentPlugin(plugin.app, preview);
          plugin.settings.agentPlugins = [...plugin.settings.agentPlugins.filter(v => v.name !== installed.name), installed];
          plugin.settings.mcpServers = [...plugin.settings.mcpServers.filter(v => v.agentPlugin?.pluginName !== installed.name), ...testedServers];
          await plugin.saveSettings(); clearMcpToolsCache(); plugin.settingsEmitter.emit("skills-changed"); display();
        }).open();
      } catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
      finally { button.setDisabled(false); }
    })(); }));

  for (const item of plugin.settings.agentPlugins) {
    const setting = new Setting(containerEl).setName(item.name).setDesc(`${item.version} · ${item.repo}@${item.commitSha.slice(0, 7)} · Skills: ${item.skillNames.join(", ") || "none"}`);
    setting.addToggle(toggle => toggle.setValue(item.enabled).setTooltip(item.enabled ? "Disable" : "Enable").onChange(value => { void (async () => {
      item.enabled = value;
      await plugin.app.vault.adapter.write(`${AGENT_PLUGIN_ROOT}/${item.name}/install.json`, JSON.stringify(item, null, 2));
      for (const server of plugin.settings.mcpServers) if (server.agentPlugin?.pluginName === item.name && !value) server.enabled = false;
      await plugin.saveSettings(); clearMcpToolsCache(); plugin.settingsEmitter.emit("skills-changed"); display();
    })(); }));
    setting.addExtraButton(button => button.setIcon("refresh-cw").setTooltip("Check for update").onClick(() => { void (async () => {
      try { const next = await previewAgentPlugin(item.repo); new Notice(next.commitSha === item.commitSha ? `${item.name} is up to date.` : `Update available for ${item.name}: ${next.version}. Use Preview and install above to review it.`); } catch (error) { new Notice(String(error)); }
    })(); }));
    setting.addExtraButton(button => button.setIcon("trash").setTooltip("Uninstall").onClick(() => { void (async () => {
      if (!window.confirm(`Uninstall ${item.name}?`)) return;
      await uninstallAgentPlugin(plugin.app, item.name);
      plugin.settings.agentPlugins = plugin.settings.agentPlugins.filter((v: AgentPluginInstall) => v.name !== item.name);
      plugin.settings.mcpServers = plugin.settings.mcpServers.filter(v => v.agentPlugin?.pluginName !== item.name);
      await plugin.saveSettings(); clearMcpToolsCache(); plugin.settingsEmitter.emit("skills-changed"); new Notice(`Uninstalled ${item.name}. Plugin data was preserved.`); display();
    })(); }));
  }
}
