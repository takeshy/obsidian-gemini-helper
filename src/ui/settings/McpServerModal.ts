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
  private busy = false;
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
      ? { ...server, allowedTools: [...(server.allowedTools ?? [])] }
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

    new Setting(contentEl)
      .setName(t("settings.mcpAutoApprove"))
      .setDesc(t("settings.mcpAutoApprove.desc"))
      .addToggle(toggle => toggle.setValue(this.server.autoApprove ?? false)
        .onChange(value => { this.server.autoApprove = value; }));

    const allowedEl = contentEl.createDiv();
    const renderAllowedTools = () => {
      allowedEl.empty();
      new Setting(allowedEl).setName(t("settings.mcpAllowedTools")).setDesc(t("settings.mcpAllowedTools.desc"));
      for (const tool of this.server.allowedTools ?? []) {
        new Setting(allowedEl).setName(tool).addExtraButton(btn => btn
          .setIcon("trash").setTooltip(t("common.delete"))
          .onClick(() => {
            this.server.allowedTools = this.server.allowedTools?.filter(name => name !== tool);
            renderAllowedTools();
          }));
      }
    };
    renderAllowedTools();

    // Server URL
    new Setting(contentEl)
      .setName(t("settings.mcpServerUrl"))
      .addText((text) => {
        text
          .setPlaceholder(t("settings.mcpServerUrl.placeholder"))
          .setValue(this.server.url)
          .onChange((value) => {
            this.server.url = value;
            this.invalidateConnectionTest();
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
          this.invalidateConnectionTest();
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
              this.server.headers = JSON.parse(this.headersText) as Record<string, string>;
            } catch {
              new Notice(t("settings.mcpServerInvalidHeaders"));
              return;
            }
          } else {
            this.server.headers = undefined;
          }

          if (!this.busy) void this.saveServer(testStatusEl);
        });
      // Disable save button if connection not tested
      btn.setDisabled(!this.connectionTested);
    });
  }

  private invalidateConnectionTest(): void {
    this.connectionTested = false;
    this.server.toolHints = undefined;
    this.saveBtn?.setDisabled(true);
    this.testRequiredEl?.removeClass("gemini-helper-hidden");
  }

  private lockControls(): () => void {
    this.busy = true;
    const controls = Array.from(this.contentEl.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>("input, button, select, textarea"));
    const disabled = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    return () => {
      controls.forEach((control, i) => { control.disabled = disabled[i]; });
      this.busy = false;
      this.saveBtn?.setDisabled(!this.connectionTested);
    };
  }

  private async saveServer(statusEl: HTMLElement): Promise<void> {
    const unlock = this.lockControls();
    try {
      await this.onSubmit(this.server);
      this.close();
    } catch (error) {
      statusEl.removeClass("gemini-helper-mcp-status--success");
      statusEl.addClass("gemini-helper-mcp-status--error");
      statusEl.setText(t("settings.mcpSaveFailed", { error: formatError(error) }));
    } finally {
      unlock();
    }
  }

  private async testConnection(statusEl: HTMLElement, btnEl: HTMLButtonElement): Promise<void> {
    if (this.busy) return;
    const unlock = this.lockControls();
    this.invalidateConnectionTest();
    let client: McpClient | null = null;
    statusEl.empty();
    statusEl.removeClass("gemini-helper-mcp-status--success", "gemini-helper-mcp-status--error");
    statusEl.setText(t("settings.mcpChecking"));
    btnEl.textContent = t("settings.mcpChecking");
    btnEl.disabled = true;

    try {
      // Parse headers for test
      let headers: Record<string, string> | undefined;
      if (this.headersText.trim()) {
        try {
          headers = JSON.parse(this.headersText) as Record<string, string>;
        } catch {
          statusEl.addClass("gemini-helper-mcp-status--error");
          statusEl.setText(t("settings.mcpServerInvalidHeaders"));
          btnEl.disabled = false;
          return;
        }
      }

      client = new McpClient({
        name: this.server.name || "test",
        url: this.server.url,
        headers,
        enabled: true,
      });

      await client.initialize();
      const tools = await client.listTools();


      // Save tool hints
      const toolNames = tools.map(tool => tool.name);
      this.server.toolHints = toolNames;

      // Mark connection as tested and enable save button
      this.connectionTested = true;

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
      await client?.close().catch(() => {});
      btnEl.textContent = t("settings.testMcpConnection");
      unlock();
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
