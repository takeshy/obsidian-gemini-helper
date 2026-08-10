import { Modal, Notice, Setting } from "obsidian";
import { McpClient } from "src/core/mcpClient";
import type { AgentPluginPreview } from "src/core/agentPlugins";
import type { McpServerConfig } from "src/types";
import { formatError } from "src/utils/error";

export class AgentPluginInstallModal extends Modal {
  constructor(
    app: import("obsidian").App,
    private preview: AgentPluginPreview,
    private servers: McpServerConfig[],
    private onInstall: (testedServers: McpServerConfig[]) => Promise<void>,
  ) { super(app); }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: `Install ${this.preview.manifest.name}` });
    contentEl.createEl("p", { text: this.preview.manifest.description ?? "" });
    new Setting(contentEl).setName("Version").setDesc(`${this.preview.version} · ${this.preview.sourceType}: ${this.preview.sourceRef} · ${this.preview.commitSha.slice(0, 7)}`);
    new Setting(contentEl).setName("Repository").setDesc(this.preview.repo);
    new Setting(contentEl).setName("Agent skills").setDesc(this.preview.skills.map(skill => skill.name).join(", ") || "None");
    new Setting(contentEl).setName("MCP servers").setDesc(this.servers.map(server => server.name).join(", ") || "None");
    if (this.preview.warnings.length) contentEl.createEl("p", { cls: "setting-item-description", text: this.preview.warnings.join(" ") });
    const statusEl = contentEl.createDiv();
    const actions = new Setting(contentEl);
    actions.addButton(button => button.setButtonText("Cancel").onClick(() => this.close()));
    actions.addButton(button => button.setButtonText(this.servers.length ? "Test MCP and install" : "Install").setCta().onClick(() => { void (async () => {
      button.setDisabled(true); statusEl.empty();
      try {
        const tested: McpServerConfig[] = [];
        for (const server of this.servers) {
          const row = statusEl.createDiv({ cls: "setting-item-description", text: `Testing ${server.name}...` });
          const client = new McpClient({ ...server, enabled: true });
          try { await client.initialize(); const names = (await client.listTools()).map(tool => tool.name); row.setText(`${server.name}: connected · ${names.length} tool(s)`); tested.push({ ...server, enabled: false, toolHints: names }); }
          catch (error) { row.setText(`${server.name}: connection failed · ${formatError(error)}`); tested.push({ ...server, enabled: false, toolHints: undefined }); }
          finally { await client.close().catch(() => {}); }
        }
        await this.onInstall(tested);
        const connected = tested.filter(server => Array.isArray(server.toolHints)).length;
        new Notice(`Installed ${this.preview.manifest.name}.${this.servers.length ? ` MCP: ${connected}/${this.servers.length} connected.` : ""}`);
        this.close();
      } catch (error) { new Notice(error instanceof Error ? error.message : String(error)); button.setDisabled(false); }
    })(); }));
  }

  onClose(): void { this.contentEl.empty(); }
}
