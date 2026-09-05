import { Modal, Setting, type App } from "obsidian";
import type { McpServerConfig } from "src/types";
import type { McpApprovalDecision } from "src/core/mcpApproval";
import { t } from "src/i18n";

export class McpApprovalModal extends Modal {
  private resolver?: (decision: McpApprovalDecision) => void;

  constructor(app: App, private server: McpServerConfig, private tool: string,
    private args: Record<string, unknown>, private canRemember: boolean) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.createEl("h2", { text: t("mcp.approval.title") });
    new Setting(this.contentEl).setName(t("settings.mcpServerName")).setDesc(this.server.name);
    new Setting(this.contentEl).setName(t("mcp.approval.tool")).setDesc(this.tool);
    this.contentEl.createEl("h3", { text: t("mcp.approval.arguments") });
    this.contentEl.createEl("pre", { cls: "gemini-helper-mcp-approval-args", text: JSON.stringify(this.args, null, 2) });
    const actions = new Setting(this.contentEl);
    actions.addButton(btn => btn.setButtonText(t("mcp.approval.deny")).onClick(() => this.finish("deny")));
    actions.addButton(btn => btn.setButtonText(t("mcp.approval.once")).onClick(() => this.finish("once")));
    if (this.canRemember) {
      actions.addButton(btn => btn.setButtonText(t("mcp.approval.always")).onClick(() => this.finish("always")));
    }
  }

  private finish(decision: McpApprovalDecision): void {
    this.resolver?.(decision);
    this.resolver = undefined;
    this.close();
  }

  onClose(): void {
    this.resolver?.("deny");
    this.resolver = undefined;
    this.contentEl.empty();
  }

  openAndWait(): Promise<McpApprovalDecision> {
    return new Promise(resolve => {
      this.resolver = resolve;
      this.open();
    });
  }
}
