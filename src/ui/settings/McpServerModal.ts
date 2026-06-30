import { Modal, App, Setting, Notice } from "obsidian";
import type { McpServerConfig } from "src/types";
import { McpClient } from "src/core/mcpClient";
import { formatError } from "src/utils/error";
import { t } from "src/i18n";

export class McpServerModal extends Modal {
  private server: McpServerConfig;
  private isNew: boolean;
  private onSubmit: (server: McpServerConfig) => void | Promise<void>;
  private headersText = "";
  private connectionTested = false;
  private saveBtn: import("obsidian").ButtonComponent | null = null;
  private testRequiredEl: HTMLElement | null = null;

  constructor(
    app: App,
    server: McpServerConfig | null,
    onSubmit: (server: McpServerConfig) => void | Promise<void>
  ) {
    super(app);
    this.isNew = server === null;
    // For existing servers with toolHints, consider connection already tested
    this.connectionTested = server !== null && Array.isArray(server.toolHints) && server.toolHints.length > 0;
    this.server = server
      ? { ...server }
      : {
          name: "",
          url: "",
          headers: undefined,
          enabled: true,
          toolHints: undefined,
        };
    this.headersText = this.server.headers ? JSON.stringify(this.server.headers, null, 2) : "";
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", {
      text: this.isNew ? t("settings.createMcpServer") : t("settings.editMcpServer"),
    });

    // Server name
    new Setting(contentEl)
      .setName(t("settings.mcpServerName"))
      .addText((text) => {
        text
          .setPlaceholder(t("settings.mcpServerName.placeholder"))
          .setValue(this.server.name)
          .onChange((value) => {
            this.server.name = value;
          });
        text.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
          }
        });
      });

    // Server URL
    new Setting(contentEl)
      .setName(t("settings.mcpServerUrl"))
      .addText((text) => {
        text
          .setPlaceholder(t("settings.mcpServerUrl.placeholder"))
          .setValue(this.server.url)
          .onChange((value) => {
            this.server.url = value;
          });
      });

    // Headers (JSON)
    const headersSetting = new Setting(contentEl)
      .setName(t("settings.mcpServerHeaders"))
      .setDesc(t("settings.mcpServerHeaders.desc"));

    headersSetting.settingEl.addClass("gemini-helper-settings-textarea-container");

    headersSetting.addTextArea((text) => {
      text
        .setPlaceholder(t("settings.mcpServerHeaders.placeholder"))
        .setValue(this.headersText)
        .onChange((value) => {
          this.headersText = value;
        });
      text.inputEl.rows = 3;
      text.inputEl.addClass("gemini-helper-settings-textarea");
    });

    // Test connection button
    const testSetting = new Setting(contentEl);
    const testStatusEl = testSetting.controlEl.createDiv({ cls: "gemini-helper-mcp-test-status" });

    testSetting.addButton((btn) =>
      btn
        .setButtonText(t("settings.testMcpConnection"))
        .onClick(() => {
          void this.testConnection(testStatusEl, btn.buttonEl);
        })
    );

    // Test required message
    this.testRequiredEl = contentEl.createDiv({ cls: "gemini-helper-mcp-test-required" });
    this.testRequiredEl.setText(t("settings.testConnectionRequired"));
    if (this.connectionTested) {
      this.testRequiredEl.addClass("gemini-helper-hidden");
    }

    // Action buttons
    const actionSetting = new Setting(contentEl);
    actionSetting.addButton((btn) =>
      btn.setButtonText(t("common.cancel")).onClick(() => this.close())
    );
    actionSetting.addButton((btn) => {
      this.saveBtn = btn;
      btn
        .setButtonText(this.isNew ? t("common.create") : t("common.save"))
        .setCta()
        .onClick(() => {
          if (!this.server.name.trim()) {
            new Notice(t("settings.mcpServerNameRequired"));
            return;
          }
          if (!this.server.url.trim()) {
            new Notice(t("settings.mcpServerUrlRequired"));
            return;
          }
          if (!this.connectionTested) {
            new Notice(t("settings.testConnectionRequired"));
            return;
          }

          // Parse headers
          if (this.headersText.trim()) {
            try {
              this.server.headers = JSON.parse(this.headersText);
            } catch {
              new Notice(t("settings.mcpServerInvalidHeaders"));
              return;
            }
          } else {
            this.server.headers = undefined;
          }

          void this.onSubmit(this.server);
          this.close();
        });
      // Disable save button if connection not tested
      btn.setDisabled(!this.connectionTested);
    });
  }

  private async testConnection(statusEl: HTMLElement, btnEl: HTMLButtonElement): Promise<void> {
    statusEl.empty();
    statusEl.removeClass("gemini-helper-mcp-status--success", "gemini-helper-mcp-status--error");
    statusEl.setText("Testing...");
    btnEl.disabled = true;

    try {
      // Parse headers for test
      let headers: Record<string, string> | undefined;
      if (this.headersText.trim()) {
        try {
          headers = JSON.parse(this.headersText);
        } catch {
          statusEl.addClass("gemini-helper-mcp-status--error");
          statusEl.setText(t("settings.mcpServerInvalidHeaders"));
          btnEl.disabled = false;
          return;
        }
      }

      const client = new McpClient({
        name: this.server.name || "test",
        url: this.server.url,
        headers,
        enabled: true,
      });

      await client.initialize();
      const tools = await client.listTools();
      await client.close();

      // Save tool hints
      const toolNames = tools.map(tool => tool.name);
      this.server.toolHints = toolNames;

      // Mark connection as tested and enable save button
      this.connectionTested = true;
      if (this.saveBtn) {
        this.saveBtn.setDisabled(false);
      }
      if (this.testRequiredEl) {
        this.testRequiredEl.addClass("gemini-helper-hidden");
      }

      statusEl.addClass("gemini-helper-mcp-status--success");
      statusEl.empty();

      // Show tool count
      const countEl = statusEl.createDiv({ cls: "gemini-helper-mcp-tools-count" });
      countEl.setText(t("settings.mcpConnectionSuccess", { count: String(tools.length) }));

      // Show tool names if any
      if (tools.length > 0) {
        const toolsEl = statusEl.createDiv({ cls: "gemini-helper-mcp-tools-list" });
        toolsEl.setText(toolNames.join(", "));
      }
    } catch (error) {
      // Reset connection tested flag on error
      this.connectionTested = false;
      this.server.toolHints = undefined;
      if (this.saveBtn) {
        this.saveBtn.setDisabled(true);
      }
      if (this.testRequiredEl) {
        this.testRequiredEl.removeClass("gemini-helper-hidden");
      }

      statusEl.addClass("gemini-helper-mcp-status--error");
      statusEl.setText(t("settings.mcpConnectionFailed", { error: formatError(error) }));
    } finally {
      btnEl.disabled = false;
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
