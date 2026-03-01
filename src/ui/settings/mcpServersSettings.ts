import { Setting, Notice } from "obsidian";
import { clearMcpToolsCache } from "src/core/mcpTools";
import { t } from "src/i18n";
import { McpServerModal } from "./McpServerModal";
import type { SettingsContext } from "./settingsContext";

export function displayMcpServersSettings(containerEl: HTMLElement, ctx: SettingsContext): void {
  const { plugin, display } = ctx;
  const app = plugin.app;

  new Setting(containerEl).setName(t("settings.mcpServers")).setHeading();

  // Introduction
  const introEl = containerEl.createDiv({ cls: "setting-item-description gemini-helper-mcp-intro" });
  introEl.textContent = t("settings.mcpServersIntro");

  // Add new server button
  new Setting(containerEl)
    .setName(t("settings.mcpServers.desc"))
    .addButton((btn) =>
      btn
        .setButtonText(t("settings.addMcpServer"))
        .setCta()
        .onClick(() => {
          new McpServerModal(
            app,
            null,
            async (server) => {
              plugin.settings.mcpServers.push(server);
              await plugin.saveSettings();
              clearMcpToolsCache();
              display();
              new Notice(t("settings.mcpServerCreated", { name: server.name }));
            }
          ).open();
        })
    );

  // List existing servers
  const servers = plugin.settings.mcpServers;
  if (servers.length === 0) {
    const emptyEl = containerEl.createDiv({ cls: "setting-item-description gemini-helper-mcp-empty" });
    emptyEl.textContent = t("settings.mcpNoServers");
  } else {
    for (const server of servers) {
      let desc = server.url;
      if (server.toolHints && server.toolHints.length > 0) {
        desc += `\n${t("settings.mcpToolHints", { tools: server.toolHints.join(", ") })}`;
      }

      const serverSetting = new Setting(containerEl)
        .setName(server.name)
        .setDesc(desc);

      // Edit button
      serverSetting.addExtraButton((btn) => {
        btn
          .setIcon("pencil")
          .setTooltip(t("common.edit"))
          .onClick(() => {
            new McpServerModal(
              app,
              server,
              async (updated) => {
                const index = plugin.settings.mcpServers.findIndex(
                  (s) => s.name === server.name && s.url === server.url
                );
                if (index >= 0) {
                  plugin.settings.mcpServers[index] = updated;
                  await plugin.saveSettings();
                  clearMcpToolsCache();
                  display();
                  new Notice(t("settings.mcpServerUpdated", { name: updated.name }));
                }
              }
            ).open();
          });
      });

      // Delete button
      serverSetting.addExtraButton((btn) => {
        btn
          .setIcon("trash")
          .setTooltip(t("common.delete"))
          .onClick(() => {
            void (async () => {
              plugin.settings.mcpServers = plugin.settings.mcpServers.filter(
                (s) => !(s.name === server.name && s.url === server.url)
              );
              await plugin.saveSettings();
              clearMcpToolsCache();
              display();
              new Notice(t("settings.mcpServerDeleted", { name: server.name }));
            })();
          });
      });
    }
  }
}
