import {
  PluginSettingTab,
  App,
  Setting,
  DropdownComponent,
  TFolder,
  TFile,
  Notice,
  Modal,
} from "obsidian";
import type { GeminiHelperPlugin } from "src/plugin";
import { getFileSearchManager } from "src/core/fileSearch";
import { verifyCli, verifyClaudeCli, verifyCodexCli, isWindows, validateCliPath } from "src/core/cliProvider";
import { McpClient } from "src/core/mcpClient";
import { clearMcpToolsCache } from "src/core/mcpTools";
import { formatError } from "src/utils/error";
import { t } from "src/i18n";
import {
  DEFAULT_SETTINGS,
  DEFAULT_CLI_CONFIG,
  DEFAULT_EDIT_HISTORY_SETTINGS,
  DEFAULT_ENCRYPTION_SETTINGS,
  getAvailableModels,
  isModelAllowedForPlan,
  getDefaultModelForPlan,
  type ApiPlan,
  type ModelInfo,
  type SlashCommand,
  type ModelType,
  type McpServerConfig,
  type VaultToolMode,
} from "src/types";
import { getEditHistoryManager } from "src/core/editHistory";
import { Platform } from "obsidian";
import {
  generateKeyPair,
  encryptPrivateKey,
} from "src/core/crypto";

// Modal for creating/renaming RAG settings
class RagSettingNameModal extends Modal {
  private name = "";
  private onSubmit: (name: string) => void | Promise<void>;
  private title: string;
  private initialValue: string;

  constructor(
    app: App,
    title: string,
    initialValue: string,
    onSubmit: (name: string) => void | Promise<void>
  ) {
    super(app);
    this.title = title;
    this.initialValue = initialValue;
    this.name = initialValue;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: this.title });

    new Setting(contentEl).setName(t("modal.name")).addText((text) => {
      text
        .setPlaceholder(t("modal.enterName"))
        .setValue(this.initialValue)
        .onChange((value) => {
          this.name = value;
        });
      text.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.submit();
        }
      });
      text.inputEl.focus();
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText(t("common.cancel")).onClick(() => {
          this.close();
        })
      )
      .addButton((btn) =>
        btn
          .setButtonText(t("common.ok"))
          .setCta()
          .onClick(() => {
            this.submit();
          })
      );
  }

  private submit() {
    if (this.name.trim()) {
      void this.onSubmit(this.name.trim());
      this.close();
    } else {
      new Notice(t("modal.nameCannotBeEmpty"));
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class ConfirmModal extends Modal {
  private message: string;
  private confirmText: string;
  private cancelText: string;
  private resolver: (value: boolean) => void = () => {};

  constructor(app: App, message: string, confirmText = t("common.confirm"), cancelText = t("common.cancel")) {
    super(app);
    this.message = message;
    this.confirmText = confirmText;
    this.cancelText = cancelText;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("p", { text: this.message });

    const actions = contentEl.createDiv({ cls: "gemini-helper-modal-actions" });

    const confirmBtn = actions.createEl("button", {
      text: this.confirmText,
      cls: "mod-warning",
    });
    confirmBtn.addEventListener("click", () => {
      this.resolver(true);
      this.close();
    });

    const cancelBtn = actions.createEl("button", { text: this.cancelText });
    cancelBtn.addEventListener("click", () => {
      this.resolver(false);
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }

  openAndWait(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolver = resolve;
      this.open();
    });
  }
}

// Modal for viewing RAG store files
type RagFilesFilter = "all" | "registered" | "pending";

class RagFilesModal extends Modal {
  private settingName: string;
  private files: Record<string, import("src/types").RagFileInfo>;
  private searchQuery = "";
  private filter: RagFilesFilter = "all";
  private listEl: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;

  constructor(
    app: App,
    settingName: string,
    files: Record<string, import("src/types").RagFileInfo>
  ) {
    super(app);
    this.settingName = settingName;
    this.files = files;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("gemini-helper-rag-files-modal");
    contentEl.createEl("h2", { text: t("settings.ragFiles.title", { name: this.settingName }) });

    // Search and filter row
    const filterRow = contentEl.createDiv({ cls: "gemini-helper-rag-files-filter" });

    const searchInput = filterRow.createEl("input", {
      type: "text",
      placeholder: t("settings.ragFiles.searchPlaceholder"),
      cls: "gemini-helper-rag-files-search",
    });
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      this.renderList();
    });

    const filterBtns = filterRow.createDiv({ cls: "gemini-helper-rag-files-filter-buttons" });

    const filters: { key: RagFilesFilter; label: string }[] = [
      { key: "all", label: t("settings.ragFiles.filterAll") },
      { key: "registered", label: t("settings.ragFiles.filterRegistered") },
      { key: "pending", label: t("settings.ragFiles.filterPending") },
    ];

    for (const f of filters) {
      const btn = filterBtns.createEl("button", {
        text: f.label,
        cls: `gemini-helper-rag-files-filter-btn${f.key === this.filter ? " is-active" : ""}`,
      });
      btn.addEventListener("click", () => {
        this.filter = f.key;
        filterBtns.querySelectorAll<HTMLElement>(".gemini-helper-rag-files-filter-btn").forEach((el) =>
          el.removeClass("is-active")
        );
        btn.addClass("is-active");
        this.renderList();
      });
    }

    // File list container
    this.listEl = contentEl.createDiv({ cls: "gemini-helper-rag-files-list" });

    // File count
    this.countEl = contentEl.createDiv({ cls: "gemini-helper-rag-files-count" });

    this.renderList();

    // Focus search input
    searchInput.focus();
  }

  private renderList() {
    if (!this.listEl || !this.countEl) return;
    this.listEl.empty();

    const entries = Object.entries(this.files)
      .filter(([path, info]) => {
        // Search filter
        if (this.searchQuery && !path.toLowerCase().includes(this.searchQuery.toLowerCase())) {
          return false;
        }
        // Status filter
        if (this.filter === "registered" && !info.fileId) return false;
        if (this.filter === "pending" && info.fileId) return false;
        return true;
      })
      .sort((a, b) => a[0].localeCompare(b[0]));

    this.countEl.textContent = t("settings.ragFiles.fileCount", { count: String(entries.length) });

    if (entries.length === 0) {
      this.listEl.createDiv({
        cls: "gemini-helper-rag-files-empty",
        text: t("settings.ragFiles.noFiles"),
      });
      return;
    }

    for (const [path, info] of entries) {
      const item = this.listEl.createDiv({ cls: "gemini-helper-rag-files-item" });

      const nameEl = item.createDiv({ cls: "gemini-helper-rag-files-item-name" });
      nameEl.textContent = path;

      const metaEl = item.createDiv({ cls: "gemini-helper-rag-files-item-meta" });

      if (info.uploadedAt) {
        const dateEl = metaEl.createSpan({ cls: "gemini-helper-rag-files-item-date" });
        dateEl.textContent = new Date(info.uploadedAt).toLocaleString();
      }

      const isRegistered = !!info.fileId;
      metaEl.createSpan({
        cls: `gemini-helper-rag-files-status ${isRegistered ? "gemini-helper-rag-files-status--registered" : "gemini-helper-rag-files-status--pending"}`,
        text: isRegistered ? t("settings.ragFiles.registered") : t("settings.ragFiles.pending"),
      });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

// Modal for CLI path configuration
type CliType = "gemini" | "claude" | "codex";

class CliPathModal extends Modal {
  private cliType: CliType;
  private currentPath: string;
  private onSave: (path: string | undefined) => void | Promise<void>;

  constructor(
    app: App,
    cliType: CliType,
    currentPath: string | undefined,
    onSave: (path: string | undefined) => void | Promise<void>
  ) {
    super(app);
    this.cliType = cliType;
    this.currentPath = currentPath || "";
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("gemini-helper-cli-path-modal");
    contentEl.createEl("h2", { text: t("settings.cliPathModal.title") });

    const cliName = this.cliType === "gemini" ? "Gemini" : this.cliType === "claude" ? "Claude" : "Codex";

    new Setting(contentEl)
      .setName(cliName + " CLI")
      .addText((text) => {
        text
          .setPlaceholder(t("settings.cliPathModal.placeholder"))
          .setValue(this.currentPath)
          .onChange((value) => {
            this.currentPath = value;
          });
        text.inputEl.addClass("gemini-helper-cli-path-input");
        text.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            this.save();
          }
        });
      });

    // Show OS-specific help note
    const noteEl = contentEl.createDiv({ cls: "gemini-helper-cli-path-note" });
    noteEl.textContent = isWindows()
      ? t("settings.cliPathModal.windowsNote")
      : t("settings.cliPathModal.unixNote");

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText(t("settings.cliPathModal.clear")).onClick(() => {
          void this.clear();
        })
      )
      .addButton((btn) =>
        btn.setButtonText(t("common.cancel")).onClick(() => {
          this.close();
        })
      )
      .addButton((btn) =>
        btn
          .setButtonText(t("common.save"))
          .setCta()
          .onClick(() => {
            this.save();
          })
      );
  }

  private save() {
    const path = this.currentPath.trim();
    if (path) {
      const result = validateCliPath(path);
      if (!result.valid) {
        if (result.reason === "file_not_found") {
          new Notice(t("settings.cliPathModal.fileNotFound"));
        } else {
          new Notice(t("settings.cliPathModal.invalidChars"));
        }
        return;
      }
    }
    void this.onSave(path || undefined);
    this.close();
  }

  private async clear() {
    await this.onSave(undefined);
    this.close();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// Modal for creating/editing slash commands
class SlashCommandModal extends Modal {
  private command: SlashCommand;
  private isNew: boolean;
  private onSubmit: (command: SlashCommand) => void | Promise<void>;
  private ragEnabled: boolean;
  private ragSettings: string[];
  private availableModels: ModelInfo[];
  private allowWebSearch: boolean;
  private mcpServers: McpServerConfig[];

  constructor(
    app: App,
    command: SlashCommand | null,
    ragEnabled: boolean,
    ragSettings: string[],
    availableModels: ModelInfo[],
    allowWebSearch: boolean,
    mcpServers: McpServerConfig[],
    onSubmit: (command: SlashCommand) => void | Promise<void>
  ) {
    super(app);
    this.isNew = command === null;
    this.ragEnabled = ragEnabled;
    this.ragSettings = ragSettings;
    this.availableModels = availableModels;
    this.allowWebSearch = allowWebSearch;
    this.mcpServers = mcpServers;
    this.command = command
      ? { ...command }
      : {
          id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          name: "",
          promptTemplate: "",
          model: null,
          description: "",
          searchSetting: null,
          vaultToolMode: null,
          enabledMcpServers: null,
        };
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", {
      text: this.isNew ? t("settings.createSlashCommand") : t("settings.editSlashCommand"),
    });

    // Command name
    new Setting(contentEl)
      .setName(t("settings.commandName"))
      .setDesc(t("settings.commandName.desc"))
      .addText((text) => {
        text
          .setPlaceholder(t("settings.commandName.placeholder"))
          .setValue(this.command.name)
          .onChange((value) => {
            // Remove spaces and special characters, lowercase
            this.command.name = value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
          });
        text.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
          }
        });
      });

    // Description
    new Setting(contentEl)
      .setName(t("settings.description"))
      .setDesc(t("settings.description.desc"))
      .addText((text) => {
        text
          .setPlaceholder(t("settings.description.placeholder"))
          .setValue(this.command.description || "")
          .onChange((value) => {
            this.command.description = value;
          });
      });

    // Prompt template
    const promptSetting = new Setting(contentEl)
      .setName(t("settings.promptTemplate"))
      .setDesc(t("settings.promptTemplate.desc"));

    promptSetting.settingEl.addClass("gemini-helper-settings-textarea-container");

    promptSetting.addTextArea((text) => {
      text
        .setPlaceholder(t("settings.promptTemplate.placeholder"))
        .setValue(this.command.promptTemplate)
        .onChange((value) => {
          this.command.promptTemplate = value;
        });
      text.inputEl.rows = 6;
      text.inputEl.addClass("gemini-helper-settings-textarea");
    });

    // Model selection (optional)
    new Setting(contentEl)
      .setName(t("settings.modelOptional"))
      .setDesc(t("settings.modelOptional.desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("", t("settings.useCurrentModel"));
        const isAllowedModel = this.command.model
          ? this.availableModels.some((m) => m.name === this.command.model)
          : false;
        if (!isAllowedModel) {
          this.command.model = null;
        }
        this.availableModels.forEach((m) => {
          dropdown.addOption(m.name, m.displayName);
        });
        dropdown.setValue(this.command.model || "");
        dropdown.onChange((value) => {
          this.command.model = value ? (value as ModelType) : null;
        });
      });

    // Search setting (optional)
    new Setting(contentEl)
      .setName(t("settings.searchOptional"))
      .setDesc(t("settings.searchOptional.desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("__current__", t("settings.useCurrentSetting"));
        dropdown.addOption("", t("common.none"));
        if (this.allowWebSearch) {
          dropdown.addOption("__websearch__", t("input.webSearch"));
        }
        if (this.ragEnabled) {
          this.ragSettings.forEach((name) => {
            dropdown.addOption(name, t("input.rag", { name }));
          });
        }
        if (!this.allowWebSearch && this.command.searchSetting) {
          this.command.searchSetting = "";
        }
        // Map stored value to dropdown value
        const storedValue = this.command.searchSetting;
        const dropdownValue = storedValue === null || storedValue === undefined ? "__current__" : storedValue;
        dropdown.setValue(dropdownValue);
        dropdown.onChange((value) => {
          // Map dropdown value back to stored value
          this.command.searchSetting = value === "__current__" ? null : value;
        });
      });

    // Confirm edits toggle
    new Setting(contentEl)
      .setName(t("settings.confirmEdits"))
      .setDesc(t("settings.confirmEdits.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.command.confirmEdits !== false)
          .onChange((value) => {
            this.command.confirmEdits = value;
          })
      );

    // Vault tool mode (optional)
    new Setting(contentEl)
      .setName(t("settings.vaultToolModeOptional"))
      .setDesc(t("settings.vaultToolModeOptional.desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("__current__", t("settings.useCurrentSetting"));
        dropdown.addOption("all", t("input.vaultToolAll"));
        dropdown.addOption("noSearch", t("input.vaultToolNoSearch"));
        dropdown.addOption("none", t("input.vaultToolNone"));
        // Map stored value to dropdown value
        const storedValue = this.command.vaultToolMode;
        const dropdownValue = storedValue === null || storedValue === undefined ? "__current__" : storedValue;
        dropdown.setValue(dropdownValue);
        dropdown.onChange((value) => {
          // Map dropdown value back to stored value
          this.command.vaultToolMode = value === "__current__" ? null : value as VaultToolMode;
        });
      });

    // MCP servers (optional) - only show if servers are configured
    if (this.mcpServers.length > 0) {
      new Setting(contentEl)
        .setName(t("settings.mcpServersOptional"))
        .setDesc(t("settings.mcpServersOptional.desc"));

      // Create container for checkboxes
      const mcpContainer = contentEl.createDiv({ cls: "gemini-helper-mcp-checkboxes" });

      // "Use current setting" option
      const currentSettingLabel = mcpContainer.createEl("label", { cls: "gemini-helper-mcp-checkbox-label" });
      const currentSettingCheckbox = currentSettingLabel.createEl("input", { type: "checkbox" });
      currentSettingCheckbox.checked = this.command.enabledMcpServers === null || this.command.enabledMcpServers === undefined;
      currentSettingLabel.appendText(t("settings.useCurrentSetting"));

      // Container for server checkboxes
      const serverCheckboxesContainer = mcpContainer.createDiv({ cls: "gemini-helper-mcp-server-checkboxes" });

      // Track enabled servers
      const enabledServers = new Set<string>(this.command.enabledMcpServers || []);

      // Update visibility based on "use current" state
      const updateServerCheckboxesVisibility = () => {
        serverCheckboxesContainer.style.display = currentSettingCheckbox.checked ? "none" : "block";
      };
      updateServerCheckboxesVisibility();

      // Create checkbox for each MCP server
      this.mcpServers.forEach((server) => {
        const label = serverCheckboxesContainer.createEl("label", { cls: "gemini-helper-mcp-checkbox-label" });
        const checkbox = label.createEl("input", { type: "checkbox" });
        checkbox.checked = this.command.enabledMcpServers === null || this.command.enabledMcpServers === undefined
          ? server.enabled
          : enabledServers.has(server.name);
        label.appendText(server.name);

        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            enabledServers.add(server.name);
          } else {
            enabledServers.delete(server.name);
          }
          this.command.enabledMcpServers = Array.from(enabledServers);
        });
      });

      // Handle "use current" checkbox change
      currentSettingCheckbox.addEventListener("change", () => {
        if (currentSettingCheckbox.checked) {
          this.command.enabledMcpServers = null;
        } else {
          // Initialize with currently enabled servers in settings
          const defaultEnabled = this.mcpServers.filter(s => s.enabled).map(s => s.name);
          enabledServers.clear();
          defaultEnabled.forEach(name => enabledServers.add(name));
          this.command.enabledMcpServers = defaultEnabled;
          // Update checkboxes to reflect default state
          serverCheckboxesContainer.querySelectorAll<HTMLInputElement>("input[type='checkbox']").forEach((cb, idx) => {
            cb.checked = enabledServers.has(this.mcpServers[idx].name);
          });
        }
        updateServerCheckboxesVisibility();
      });
    }

    // Action buttons
    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText(t("common.cancel")).onClick(() => this.close())
      )
      .addButton((btn) =>
        btn
          .setButtonText(this.isNew ? t("common.create") : t("common.save"))
          .setCta()
          .onClick(() => {
            if (!this.command.name.trim()) {
              new Notice(t("settings.commandName.required"));
              return;
            }
            if (!this.command.promptTemplate.trim()) {
              new Notice(t("settings.promptTemplate.required"));
              return;
            }
            void this.onSubmit(this.command);
            this.close();
          })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}

// Modal for creating/editing MCP servers
class McpServerModal extends Modal {
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

export class SettingsTab extends PluginSettingTab {
  plugin: GeminiHelperPlugin;
  private isSyncCancelled = false;

  constructor(app: App, plugin: GeminiHelperPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const cliConfig = this.plugin.settings.cliConfig || DEFAULT_CLI_CONFIG;
    const apiPlan = this.plugin.settings.apiPlan;
    const allowWebSearch = true;  // Web search available for API models
    const allowRag = this.plugin.settings.ragEnabled;
    const availableModels = getAvailableModels(apiPlan);

    // API settings (always shown)
    new Setting(containerEl).setName(t("settings.api")).setHeading();
    this.displayApiSettings(containerEl, apiPlan);

    // CLI settings (desktop only)
    if (!Platform.isMobile) {
      new Setting(containerEl).setName(t("settings.cliProviders")).setHeading();
      this.displayCliSettings(containerEl, cliConfig);
    }

    // Workspace settings
    new Setting(containerEl).setName(t("settings.workspace")).setHeading();

    // Workspace Folder
    new Setting(containerEl)
      .setName(t("settings.workspaceFolder"))
      .setDesc(t("settings.workspaceFolder.desc"))
      .addDropdown((dropdown: DropdownComponent) => {
        dropdown.addOption("", t("settings.workspaceFolder.vaultRoot"));

        const folders = this.app.vault
          .getAllLoadedFiles()
          .filter((file) => file instanceof TFolder && !file.isRoot());

        const currentFolder = this.plugin.settings.workspaceFolder;
        const folderPaths = new Set(folders.map((f) => f.path));

        // Add current setting if folder doesn't exist yet
        if (currentFolder && !folderPaths.has(currentFolder)) {
          dropdown.addOption(currentFolder, t("settings.workspaceFolder.willBeCreated", { folder: currentFolder }));
        }

        folders.forEach((folder) => {
          dropdown.addOption(folder.path, folder.name);
        });

        dropdown
          .setValue(currentFolder)
          .onChange((value) => {
            void (async () => {
              await this.plugin.changeWorkspaceFolder(value);
              this.display();
            })();
          });
      });

    // Save Chat History
    new Setting(containerEl)
      .setName(t("settings.saveChatHistory"))
      .setDesc(t("settings.saveChatHistory.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.saveChatHistory)
          .onChange((value) => {
            void (async () => {
              if (!value) {
                // Turning off - ask if user wants to delete existing history
                const confirmed = await new ConfirmModal(
                  this.app,
                  t("settings.deleteChatHistoryConfirm"),
                  t("common.delete"),
                  t("common.cancel")
                ).openAndWait();

                if (confirmed) {
                  // Delete all chat history files
                  await this.deleteChatHistoryFiles();
                }
              }
              this.plugin.settings.saveChatHistory = value;
              await this.plugin.saveSettings();
            })();
          })
      );

    // System Prompt
    const systemPromptSetting = new Setting(containerEl)
      .setName(t("settings.systemPrompt"))
      .setDesc(t("settings.systemPrompt.desc"));

    systemPromptSetting.settingEl.addClass("gemini-helper-settings-textarea-container");

    systemPromptSetting.addTextArea((text) => {
      text
        .setPlaceholder(t("settings.systemPrompt.placeholder"))
        .setValue(this.plugin.settings.systemPrompt)
        .onChange((value) => {
          void (async () => {
            this.plugin.settings.systemPrompt = value;
            await this.plugin.saveSettings();
          })();
        });
      text.inputEl.rows = 4;
      text.inputEl.addClass("gemini-helper-settings-textarea");
    });

    // Tool limits
    new Setting(containerEl).setName(t("settings.toolLimits")).setHeading();

    new Setting(containerEl)
      .setName(t("settings.maxToolCalls"))
      .setDesc(t("settings.maxToolCalls.desc"))
      .addSlider((slider) =>
        slider
          .setLimits(1, 50, 1)
          .setValue(this.plugin.settings.maxFunctionCalls)
          .setDynamicTooltip()
          .onChange((value) => {
            void (async () => {
              this.plugin.settings.maxFunctionCalls = value;
              const needsRefresh = this.plugin.settings.functionCallWarningThreshold > value;
              if (needsRefresh) {
                this.plugin.settings.functionCallWarningThreshold = value;
              }
              await this.plugin.saveSettings();
              if (needsRefresh) {
                this.display();
              }
            })();
          })
      )
      .addExtraButton((button) =>
        button
          .setIcon("reset")
          .setTooltip(t("settings.resetToDefault", { value: String(DEFAULT_SETTINGS.maxFunctionCalls) }))
          .onClick(() => {
            void (async () => {
              this.plugin.settings.maxFunctionCalls = DEFAULT_SETTINGS.maxFunctionCalls;
              if (this.plugin.settings.functionCallWarningThreshold > DEFAULT_SETTINGS.maxFunctionCalls) {
                this.plugin.settings.functionCallWarningThreshold = DEFAULT_SETTINGS.maxFunctionCalls;
              }
              await this.plugin.saveSettings();
              this.display();
            })();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.toolCallWarning"))
      .setDesc(t("settings.toolCallWarning.desc"))
      .addSlider((slider) =>
        slider
          .setLimits(1, 50, 1)
          .setValue(this.plugin.settings.functionCallWarningThreshold)
          .setDynamicTooltip()
          .onChange((value) => {
            void (async () => {
              const maxAllowed = this.plugin.settings.maxFunctionCalls;
              const nextValue = Math.min(value, maxAllowed);
              this.plugin.settings.functionCallWarningThreshold = nextValue;
              await this.plugin.saveSettings();
              if (nextValue !== value) {
                this.display();
              }
            })();
          })
      )
      .addExtraButton((button) =>
        button
          .setIcon("reset")
          .setTooltip(t("settings.resetToDefault", { value: String(DEFAULT_SETTINGS.functionCallWarningThreshold) }))
          .onClick(() => {
            void (async () => {
              this.plugin.settings.functionCallWarningThreshold = DEFAULT_SETTINGS.functionCallWarningThreshold;
              await this.plugin.saveSettings();
              this.display();
            })();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.listNotesLimit"))
      .setDesc(t("settings.listNotesLimit.desc"))
      .addSlider((slider) =>
        slider
          .setLimits(10, 200, 10)
          .setValue(this.plugin.settings.listNotesLimit)
          .setDynamicTooltip()
          .onChange((value) => {
            void (async () => {
              this.plugin.settings.listNotesLimit = value;
              await this.plugin.saveSettings();
            })();
          })
      )
      .addExtraButton((button) =>
        button
          .setIcon("reset")
          .setTooltip(t("settings.resetToDefault", { value: String(DEFAULT_SETTINGS.listNotesLimit) }))
          .onClick(() => {
            void (async () => {
              this.plugin.settings.listNotesLimit = DEFAULT_SETTINGS.listNotesLimit;
              await this.plugin.saveSettings();
              this.display();
            })();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.maxNoteChars"))
      .setDesc(t("settings.maxNoteChars.desc"))
      .addSlider((slider) =>
        slider
          .setLimits(1000, 100000, 1000)
          .setValue(this.plugin.settings.maxNoteChars)
          .setDynamicTooltip()
          .onChange((value) => {
            void (async () => {
              this.plugin.settings.maxNoteChars = value;
              await this.plugin.saveSettings();
            })();
          })
      )
      .addExtraButton((button) =>
        button
          .setIcon("reset")
          .setTooltip(t("settings.resetToDefault", { value: String(DEFAULT_SETTINGS.maxNoteChars) }))
          .onClick(() => {
            void (async () => {
              this.plugin.settings.maxNoteChars = DEFAULT_SETTINGS.maxNoteChars;
              await this.plugin.saveSettings();
              this.display();
            })();
          })
      );

    // Edit history settings
    this.displayEditHistorySettings(containerEl);

    // Encryption settings
    this.displayEncryptionSettings(containerEl);

    // Slash commands settings
    new Setting(containerEl).setName(t("settings.slashCommands")).setHeading();

    const ragSettingNames = this.plugin.getRagSettingNames();

    new Setting(containerEl)
      .setName(t("settings.manageCommands"))
      .setDesc(t("settings.manageCommands.desc"))
      .addButton((btn) =>
        btn
          .setButtonText(t("settings.addCommand"))
          .setCta()
          .onClick(() => {
            new SlashCommandModal(
              this.app,
              null,
              allowRag,
              allowRag ? ragSettingNames : [],
              availableModels,
              allowWebSearch,
              this.plugin.settings.mcpServers,
              async (command) => {
                this.plugin.settings.slashCommands.push(command);
                await this.plugin.saveSettings();
                this.display();
                new Notice(t("settings.commandCreated", { name: command.name }));
              }
            ).open();
          })
      );

    // List existing commands
    if (this.plugin.settings.slashCommands.length > 0) {
      for (const command of this.plugin.settings.slashCommands) {
        const commandSetting = new Setting(containerEl)
          .setName(`/${command.name}`)
          .setDesc(
            command.description ||
              command.promptTemplate.slice(0, 50) +
                (command.promptTemplate.length > 50 ? "..." : "")
          );

        // Edit button
        commandSetting.addExtraButton((btn) => {
          btn
            .setIcon("pencil")
            .setTooltip(t("settings.editCommand"))
            .onClick(() => {
              new SlashCommandModal(
                this.app,
                command,
                allowRag,
                allowRag ? ragSettingNames : [],
                availableModels,
                allowWebSearch,
                this.plugin.settings.mcpServers,
                async (updated) => {
                  const index = this.plugin.settings.slashCommands.findIndex(
                    (c) => c.id === command.id
                  );
                  if (index >= 0) {
                    this.plugin.settings.slashCommands[index] = updated;
                    await this.plugin.saveSettings();
                    this.display();
                    new Notice(t("settings.commandUpdated", { name: updated.name }));
                  }
                }
              ).open();
            });
        });

        // Delete button
        commandSetting.addExtraButton((btn) => {
          btn
            .setIcon("trash")
            .setTooltip(t("settings.deleteCommand"))
            .onClick(async () => {
              this.plugin.settings.slashCommands =
                this.plugin.settings.slashCommands.filter(
                  (c) => c.id !== command.id
                );
              await this.plugin.saveSettings();
              this.display();
              new Notice(t("settings.commandDeleted", { name: command.name }));
            });
        });
      }
    }

    // RAG settings
    new Setting(containerEl).setName(t("settings.rag")).setHeading();

    new Setting(containerEl)
      .setName(t("settings.enableRag"))
      .setDesc(t("settings.enableRag.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.ragEnabled)
          .onChange((value) => {
            void (async () => {
              this.plugin.settings.ragEnabled = value;
              await this.plugin.saveSettings();
              this.display();
            })();
          })
      );

    if (allowRag) {
      this.displayRagSettings(containerEl);
    }

    // MCP servers settings
    new Setting(containerEl).setName(t("settings.mcpServers")).setHeading();
    this.displayMcpServersSettings(containerEl);
  }

  private displayApiSettings(containerEl: HTMLElement, apiPlan: ApiPlan): void {
    // Google API Key
    const apiKeySetting = new Setting(containerEl)
      .setName(t("settings.googleApiKey"))
      .setDesc(t("settings.googleApiKey.desc"));

    let apiKeyRevealed = false;
    apiKeySetting.addText((text) => {
      text
        .setPlaceholder(t("settings.googleApiKey.placeholder"))
        .setValue(this.plugin.settings.googleApiKey)
        .onChange((value) => {
          void (async () => {
            this.plugin.settings.googleApiKey = value;
            await this.plugin.saveSettings();
          })();
        });
      text.inputEl.type = "password";
    });

    apiKeySetting.addExtraButton((btn) => {
      btn
        .setIcon("eye")
        .setTooltip(t("settings.showOrHideApiKey"))
        .onClick(() => {
          apiKeyRevealed = !apiKeyRevealed;
          const input = apiKeySetting.controlEl.querySelector("input");
          if (input) input.type = apiKeyRevealed ? "text" : "password";
          btn.setIcon(apiKeyRevealed ? "eye-off" : "eye");
        });
    });

    new Setting(containerEl)
      .setName(t("settings.apiPlan"))
      .setDesc(t("settings.apiPlan.desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("paid", t("settings.apiPlan.paid"));
        dropdown.addOption("free", t("settings.apiPlan.free"));
        dropdown.setValue(apiPlan);
        dropdown.onChange((value) => {
          void (async () => {
            this.plugin.settings.apiPlan = value as ApiPlan;
            await this.plugin.saveSettings();
            const plan = this.plugin.settings.apiPlan;
            const selectedModel = this.plugin.getSelectedModel();
            if (!isModelAllowedForPlan(plan, selectedModel)) {
              await this.plugin.selectModel(getDefaultModelForPlan(plan));
            }
            this.display();
          })();
        });
      });
  }

  private displayCliSettings(
    containerEl: HTMLElement,
    cliConfig: import("src/types").CliProviderConfig
  ): void {
    // Introduction
    const introEl = containerEl.createDiv({ cls: "setting-item-description gemini-helper-cli-intro" });
    introEl.textContent = t("settings.cliIntro");

    // Gemini CLI row
    this.createCliVerifyRow(containerEl, {
      name: "Gemini CLI",
      cliType: "gemini",
      isVerified: !!cliConfig.cliVerified,
      customPath: cliConfig.geminiCliPath,
      installCmd: "npm install -g @google/gemini-cli",
      onVerify: (statusEl) => this.handleVerifyCli(statusEl),
      onDisable: async () => {
        this.plugin.settings.cliConfig = { ...cliConfig, cliVerified: false };
        await this.plugin.saveSettings();
        this.display();
        new Notice(t("settings.geminiCliDisabled"));
      },
    });

    // Claude CLI row
    this.createCliVerifyRow(containerEl, {
      name: "Claude CLI",
      cliType: "claude",
      isVerified: !!cliConfig.claudeCliVerified,
      customPath: cliConfig.claudeCliPath,
      installCmd: "npm install -g @anthropic-ai/claude-code",
      onVerify: (statusEl) => this.handleVerifyClaudeCli(statusEl),
      onDisable: async () => {
        this.plugin.settings.cliConfig = { ...cliConfig, claudeCliVerified: false };
        await this.plugin.saveSettings();
        this.display();
        new Notice(t("settings.claudeCliDisabled"));
      },
    });

    // Codex CLI row
    this.createCliVerifyRow(containerEl, {
      name: "Codex CLI",
      cliType: "codex",
      isVerified: !!cliConfig.codexCliVerified,
      customPath: cliConfig.codexCliPath,
      installCmd: "npm install -g @openai/codex",
      onVerify: (statusEl) => this.handleVerifyCodexCli(statusEl),
      onDisable: async () => {
        this.plugin.settings.cliConfig = { ...cliConfig, codexCliVerified: false };
        await this.plugin.saveSettings();
        this.display();
        new Notice(t("settings.codexCliDisabled"));
      },
    });

    // CLI limitations notice
    const noticeEl = containerEl.createDiv({ cls: "gemini-helper-cli-notice gemini-helper-cli-notice--spaced" });

    const noteTitle = noticeEl.createEl("strong");
    noteTitle.textContent = t("settings.cliLimitations");
    const noteList = noticeEl.createEl("ul");
    noteList.createEl("li").textContent = t("settings.cliLimitation1");
    noteList.createEl("li").textContent = t("settings.cliLimitation2");
    noteList.createEl("li").textContent = t("settings.cliLimitation3");
  }

  private createCliVerifyRow(
    containerEl: HTMLElement,
    options: {
      name: string;
      cliType: CliType;
      isVerified: boolean;
      customPath?: string;
      installCmd: string;
      onVerify: (statusEl: HTMLElement) => Promise<void>;
      onDisable: () => Promise<void>;
    }
  ): void {
    const setting = new Setting(containerEl)
      .setName(options.name)
      .setDesc(`Install: ${options.installCmd}`);

    // Add status element first
    const statusEl = setting.controlEl.createDiv({ cls: "gemini-helper-cli-row-status" });

    if (options.isVerified) {
      // Verified state: show status badge and Disable button
      statusEl.addClass("gemini-helper-cli-status--success");
      statusEl.textContent = t("settings.cliVerified");

      setting.addButton((button) =>
        button
          .setButtonText(t("settings.cliDisable"))
          .onClick(() => void options.onDisable())
      );
    } else {
      // Not verified: show Verify button
      setting.addButton((button) =>
        button
          .setButtonText(t("settings.cliVerify"))
          .setCta()
          .onClick(() => void options.onVerify(statusEl))
      );
    }

    // Add settings button (gear icon)
    setting.addExtraButton((button) =>
      button
        .setIcon("settings")
        .setTooltip(t("settings.cliPathSettings"))
        .onClick(() => {
          this.openCliPathModal(options.cliType, options.customPath);
        })
    );
  }

  private openCliPathModal(cliType: CliType, currentPath?: string): void {
    new CliPathModal(
      this.app,
      cliType,
      currentPath,
      async (path: string | undefined) => {
        const cliConfig = this.plugin.settings.cliConfig;
        const pathKey = cliType === "gemini" ? "geminiCliPath" :
                        cliType === "claude" ? "claudeCliPath" : "codexCliPath";

        if (path) {
          this.plugin.settings.cliConfig = { ...cliConfig, [pathKey]: path };
          await this.plugin.saveSettings();
          new Notice(t("settings.cliPathSaved"));
        } else {
          // Clear the path
          const newConfig = { ...cliConfig };
          delete newConfig[pathKey];
          this.plugin.settings.cliConfig = newConfig;
          await this.plugin.saveSettings();
          new Notice(t("settings.cliPathCleared"));
        }
        this.display();
      }
    ).open();
  }

  private async handleVerifyCli(statusEl: HTMLElement): Promise<void> {
    statusEl.empty();
    statusEl.removeClass("gemini-helper-cli-status--success", "gemini-helper-cli-status--error");
    statusEl.setText(t("settings.cliVerifyingCli"));

    try {
      const customPath = this.plugin.settings.cliConfig.geminiCliPath;
      const result = await verifyCli(customPath);

      if (!result.success) {
        statusEl.addClass("gemini-helper-cli-status--error");
        // Save unverified status
        this.plugin.settings.cliConfig = {
          ...this.plugin.settings.cliConfig,
          cliVerified: false,
        };
        await this.plugin.saveSettings();

        if (result.stage === "version") {
          statusEl.empty();
          statusEl.createEl("strong", { text: t("settings.cliNotFound") });
          statusEl.createSpan({ text: result.error || "Gemini CLI not found" });
        } else {
          statusEl.empty();
          statusEl.createEl("strong", { text: t("settings.cliLoginRequired") });
          statusEl.createSpan({ text: t("settings.cliRunGeminiLogin") });
        }
        return;
      }

      // Success - save verified status and refresh display
      this.plugin.settings.cliConfig = {
        ...this.plugin.settings.cliConfig,
        cliVerified: true,
      };
      await this.plugin.saveSettings();
      this.display();
      new Notice(t("settings.geminiCliVerified"));
    } catch (err) {
      // Save unverified status on error
      this.plugin.settings.cliConfig = {
        ...this.plugin.settings.cliConfig,
        cliVerified: false,
      };
      await this.plugin.saveSettings();

      statusEl.addClass("gemini-helper-cli-status--error");
      statusEl.empty();
      statusEl.createEl("strong", { text: t("common.error") });
      statusEl.createSpan({ text: String(err) });
    }
  }

  private async handleVerifyClaudeCli(statusEl: HTMLElement): Promise<void> {
    statusEl.empty();
    statusEl.removeClass("gemini-helper-cli-status--success", "gemini-helper-cli-status--error");
    statusEl.setText(t("settings.cliVerifying"));

    try {
      const customPath = this.plugin.settings.cliConfig.claudeCliPath;
      const result = await verifyClaudeCli(customPath);

      if (!result.success) {
        statusEl.addClass("gemini-helper-cli-status--error");
        // Save unverified status
        this.plugin.settings.cliConfig = {
          ...this.plugin.settings.cliConfig,
          claudeCliVerified: false,
        };
        await this.plugin.saveSettings();

        if (result.stage === "version") {
          statusEl.empty();
          statusEl.createEl("strong", { text: t("settings.cliNotFound") });
          statusEl.createSpan({ text: result.error || "Claude CLI not found" });
        } else {
          statusEl.empty();
          statusEl.createEl("strong", { text: t("settings.cliLoginRequired") });
          statusEl.createSpan({ text: result.error || t("settings.cliRunClaudeLogin") });
        }
        return;
      }

      // Success - save verified status and refresh display
      this.plugin.settings.cliConfig = {
        ...this.plugin.settings.cliConfig,
        claudeCliVerified: true,
      };
      await this.plugin.saveSettings();
      this.display();
      new Notice(t("settings.claudeCliVerified"));
    } catch (err) {
      // Save unverified status on error
      this.plugin.settings.cliConfig = {
        ...this.plugin.settings.cliConfig,
        claudeCliVerified: false,
      };
      await this.plugin.saveSettings();

      statusEl.addClass("gemini-helper-cli-status--error");
      statusEl.empty();
      statusEl.createEl("strong", { text: t("common.error") });
      statusEl.createSpan({ text: String(err) });
    }
  }

  private async handleVerifyCodexCli(statusEl: HTMLElement): Promise<void> {
    statusEl.empty();
    statusEl.removeClass("gemini-helper-cli-status--success", "gemini-helper-cli-status--error");
    statusEl.setText(t("settings.cliVerifying"));

    try {
      const customPath = this.plugin.settings.cliConfig.codexCliPath;
      const result = await verifyCodexCli(customPath);

      if (!result.success) {
        statusEl.addClass("gemini-helper-cli-status--error");
        // Save unverified status
        this.plugin.settings.cliConfig = {
          ...this.plugin.settings.cliConfig,
          codexCliVerified: false,
        };
        await this.plugin.saveSettings();

        if (result.stage === "version") {
          statusEl.empty();
          statusEl.createEl("strong", { text: t("settings.cliNotFound") });
          statusEl.createSpan({ text: result.error || "Codex CLI not found" });
        } else {
          statusEl.empty();
          statusEl.createEl("strong", { text: t("settings.cliLoginRequired") });
          statusEl.createSpan({ text: result.error || t("settings.cliRunCodexLogin") });
        }
        return;
      }

      // Success - save verified status and refresh display
      this.plugin.settings.cliConfig = {
        ...this.plugin.settings.cliConfig,
        codexCliVerified: true,
      };
      await this.plugin.saveSettings();
      this.display();
      new Notice(t("settings.codexCliVerified"));
    } catch (err) {
      // Save unverified status on error
      this.plugin.settings.cliConfig = {
        ...this.plugin.settings.cliConfig,
        codexCliVerified: false,
      };
      await this.plugin.saveSettings();

      statusEl.addClass("gemini-helper-cli-status--error");
      statusEl.empty();
      statusEl.createEl("strong", { text: t("common.error") });
      statusEl.createSpan({ text: String(err) });
    }
  }

  private displayEditHistorySettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(t("settings.editHistory")).setHeading();

    // Ensure editHistory settings exist
    if (!this.plugin.settings.editHistory) {
      this.plugin.settings.editHistory = { ...DEFAULT_EDIT_HISTORY_SETTINGS };
    }

    const editHistory = this.plugin.settings.editHistory;

    // Enable/Disable toggle
    new Setting(containerEl)
      .setName(t("settings.editHistoryEnabled"))
      .setDesc(t("settings.editHistoryEnabled.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(editHistory.enabled)
          .onChange((value) => {
            void (async () => {
              if (!value) {
                // Turning off - delete all edit history
                const manager = getEditHistoryManager();
                if (manager) {
                  const deletedCount = manager.clearAllHistory();
                  if (deletedCount > 0) {
                    new Notice(t("settings.editHistoryCleared", { count: String(deletedCount) }));
                  }
                }
              }
              this.plugin.settings.editHistory.enabled = value;
              await this.plugin.saveSettings();
              this.display();
            })();
          })
      );

    if (!editHistory.enabled) {
      return;
    }

    // Retention settings
    const retentionDesc = containerEl.createDiv({ cls: "setting-item-description gemini-helper-settings-subheading" });
    retentionDesc.textContent = t("settings.editHistoryRetention");

    new Setting(containerEl)
      .setName(t("settings.editHistoryMaxAge"))
      .setDesc(t("settings.editHistoryMaxAge.desc"))
      .addText((text) =>
        text
          .setValue(String(editHistory.retention.maxAgeInDays))
          .onChange((value) => {
            void (async () => {
              const num = parseInt(value, 10);
              if (!isNaN(num) && num >= 0) {
                this.plugin.settings.editHistory.retention.maxAgeInDays = num;
                await this.plugin.saveSettings();
              }
            })();
          })
      )
      .addExtraButton((btn) =>
        btn
          .setIcon("reset")
          .setTooltip(t("settings.resetToDefault", { value: String(DEFAULT_EDIT_HISTORY_SETTINGS.retention.maxAgeInDays) }))
          .onClick(() => {
            void (async () => {
              this.plugin.settings.editHistory.retention.maxAgeInDays = DEFAULT_EDIT_HISTORY_SETTINGS.retention.maxAgeInDays;
              await this.plugin.saveSettings();
              this.display();
            })();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.editHistoryMaxEntries"))
      .setDesc(t("settings.editHistoryMaxEntries.desc"))
      .addText((text) =>
        text
          .setValue(String(editHistory.retention.maxEntriesPerFile))
          .onChange((value) => {
            void (async () => {
              const num = parseInt(value, 10);
              if (!isNaN(num) && num >= 0) {
                this.plugin.settings.editHistory.retention.maxEntriesPerFile = num;
                await this.plugin.saveSettings();
              }
            })();
          })
      )
      .addExtraButton((btn) =>
        btn
          .setIcon("reset")
          .setTooltip(t("settings.resetToDefault", { value: String(DEFAULT_EDIT_HISTORY_SETTINGS.retention.maxEntriesPerFile) }))
          .onClick(() => {
            void (async () => {
              this.plugin.settings.editHistory.retention.maxEntriesPerFile = DEFAULT_EDIT_HISTORY_SETTINGS.retention.maxEntriesPerFile;
              await this.plugin.saveSettings();
              this.display();
            })();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.editHistoryContextLines"))
      .setDesc(t("settings.editHistoryContextLines.desc"))
      .addSlider((slider) =>
        slider
          .setLimits(0, 10, 1)
          .setValue(editHistory.diff.contextLines)
          .setDynamicTooltip()
          .onChange((value) => {
            void (async () => {
              this.plugin.settings.editHistory.diff.contextLines = value;
              await this.plugin.saveSettings();
            })();
          })
      )
      .addExtraButton((btn) =>
        btn
          .setIcon("reset")
          .setTooltip(t("settings.resetToDefault", { value: String(DEFAULT_EDIT_HISTORY_SETTINGS.diff.contextLines) }))
          .onClick(() => {
            void (async () => {
              this.plugin.settings.editHistory.diff.contextLines = DEFAULT_EDIT_HISTORY_SETTINGS.diff.contextLines;
              await this.plugin.saveSettings();
              this.display();
            })();
          })
      );

    // Prune and Stats buttons
    new Setting(containerEl)
      .addButton((btn) =>
        btn
          .setButtonText(t("settings.editHistoryPrune"))
          .onClick(() => {
            const manager = getEditHistoryManager();
            if (!manager) {
              new Notice("Edit history manager not initialized");
              return;
            }
            const result = manager.prune();
            new Notice(t("settings.editHistoryPruned", { count: String(result.deletedCount) }));
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText(t("settings.editHistoryViewStats"))
          .onClick(() => {
            const manager = getEditHistoryManager();
            if (!manager) {
              new Notice("Edit history manager not initialized");
              return;
            }
            const stats = manager.getStats();
            new Notice(t("settings.editHistoryStats", {
              files: String(stats.totalFiles),
              entries: String(stats.totalEntries),
            }));
          })
      );
  }

  private displayEncryptionSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(t("settings.encryption")).setHeading();

    // Ensure encryption settings exist
    if (!this.plugin.settings.encryption) {
      this.plugin.settings.encryption = { ...DEFAULT_ENCRYPTION_SETTINGS };
    }

    const encryption = this.plugin.settings.encryption;
    const hasKeys = !!encryption.publicKey && !!encryption.encryptedPrivateKey;

    // Encryption toggles (only if keys are set up)
    if (hasKeys) {
      // Show configured status
      new Setting(containerEl)
        .setName(t("settings.encryptionConfigured"))
        .setDesc(t("settings.encryptionConfigured.desc"));

      // Encrypt chat history toggle
      new Setting(containerEl)
        .setName(t("settings.encryptChatHistory"))
        .setDesc(t("settings.encryptChatHistory.desc"))
        .addToggle((toggle) =>
          toggle
            .setValue(encryption.encryptChatHistory ?? false)
            .onChange(async (value) => {
              this.plugin.settings.encryption.encryptChatHistory = value;
              // Also update legacy enabled flag for backward compatibility
              this.plugin.settings.encryption.enabled = value || encryption.encryptWorkflowHistory;
              await this.plugin.saveSettings();
            })
        );

      // Encrypt workflow history toggle
      new Setting(containerEl)
        .setName(t("settings.encryptWorkflowHistory"))
        .setDesc(t("settings.encryptWorkflowHistory.desc"))
        .addToggle((toggle) =>
          toggle
            .setValue(encryption.encryptWorkflowHistory ?? false)
            .onChange(async (value) => {
              this.plugin.settings.encryption.encryptWorkflowHistory = value;
              // Also update legacy enabled flag for backward compatibility
              this.plugin.settings.encryption.enabled = value || encryption.encryptChatHistory;
              await this.plugin.saveSettings();
            })
        );

      // Reset keys button
      new Setting(containerEl)
        .setName(t("settings.encryptionResetKeys"))
        .setDesc(t("settings.encryptionResetKeys.desc"))
        .addButton((btn) =>
          btn
            .setButtonText(t("settings.encryptionResetKeys"))
            .setWarning()
            .onClick(() => {
              void (async () => {
                const confirmed = await new ConfirmModal(
                  this.app,
                  t("settings.encryptionResetKeysConfirm"),
                  t("common.confirm"),
                  t("common.cancel")
                ).openAndWait();
                if (!confirmed) return;

                // Reset encryption settings
                this.plugin.settings.encryption = { ...DEFAULT_ENCRYPTION_SETTINGS };
                await this.plugin.saveSettings();
                this.display();
                new Notice(t("settings.encryptionKeysReset"));
              })();
            })
        );
    } else {
      // Setup encryption keys
      new Setting(containerEl)
        .setName(t("settings.encryptionSetup"))
        .setDesc(t("settings.encryptionSetup.desc"));

      // Password inputs
      let password = "";
      let confirmPassword = "";

      new Setting(containerEl)
        .setName(t("settings.encryptionPassword"))
        .setDesc(t("settings.encryptionPassword.desc"))
        .addText((text) => {
          text
            .setPlaceholder(t("settings.encryptionPassword.placeholder"))
            .onChange((value) => {
              password = value;
            });
          text.inputEl.type = "password";
        });

      new Setting(containerEl)
        .setName(t("settings.encryptionConfirmPassword"))
        .addText((text) => {
          text
            .setPlaceholder(t("settings.encryptionConfirmPassword.placeholder"))
            .onChange((value) => {
              confirmPassword = value;
            });
          text.inputEl.type = "password";
        });

      new Setting(containerEl)
        .addButton((btn) =>
          btn
            .setButtonText(t("settings.encryptionSetupBtn"))
            .setCta()
            .onClick(() => {
              void (async () => {
                if (!password) {
                  new Notice(t("settings.encryptionPassword.placeholder"));
                  return;
                }
                if (password !== confirmPassword) {
                  new Notice(t("settings.encryptionPasswordMismatch"));
                  return;
                }

                try {
                  // Generate key pair
                  const { publicKey, privateKey } = await generateKeyPair();

                  // Encrypt private key with password
                  const { encryptedPrivateKey, salt } = await encryptPrivateKey(privateKey, password);

                  // Save settings - enable both encryption types by default
                  this.plugin.settings.encryption = {
                    enabled: true,
                    encryptChatHistory: true,
                    encryptWorkflowHistory: true,
                    publicKey,
                    encryptedPrivateKey,
                    salt,
                  };
                  await this.plugin.saveSettings();
                  this.display();
                  new Notice(t("settings.encryptionSetupSuccess"));
                } catch (error) {
                  new Notice(t("settings.encryptionSetupFailed", { error: formatError(error) }));
                }
              })();
            })
        );
    }
  }

  private displayRagSettings(containerEl: HTMLElement): void {
    const ragSettingNames = this.plugin.getRagSettingNames();
    const selectedName = this.plugin.workspaceState.selectedRagSetting;

    // Top K setting (number of chunks to retrieve)
    new Setting(containerEl)
      .setName(t("settings.retrievedChunksLimit"))
      .setDesc(t("settings.retrievedChunksLimit.desc"))
      .addSlider((slider) =>
        slider
          .setLimits(1, 20, 1)
          .setValue(this.plugin.settings.ragTopK)
          .setDynamicTooltip()
          .onChange((value) => {
            void (async () => {
              this.plugin.settings.ragTopK = value;
              await this.plugin.saveSettings();
            })();
          })
      )
      .addExtraButton((button) =>
        button
          .setIcon("reset")
          .setTooltip(t("settings.resetToDefault", { value: String(DEFAULT_SETTINGS.ragTopK) }))
          .onClick(() => {
            void (async () => {
              this.plugin.settings.ragTopK = DEFAULT_SETTINGS.ragTopK;
              await this.plugin.saveSettings();
              this.display();
            })();
          })
      );

    // RAG setting selection
    const ragSelectSetting = new Setting(containerEl)
      .setName(t("settings.ragSetting"))
      .setDesc(t("settings.ragSetting.desc"));

    ragSelectSetting.addDropdown((dropdown) => {
      ragSettingNames.forEach((name) => {
        dropdown.addOption(name, name);
      });

      dropdown.setValue(selectedName || "").onChange((value) => {
        void (async () => {
          await this.plugin.selectRagSetting(value || null);
          this.display();
        })();
      });
    });

    // Add new RAG setting button
    ragSelectSetting.addExtraButton((btn) => {
      btn
        .setIcon("plus")
        .setTooltip(t("settings.createRagSetting"))
        .onClick(() => {
          new RagSettingNameModal(
            this.app,
            t("settings.createRagSetting"),
            "",
            async (name) => {
              try {
                await this.plugin.createRagSetting(name);
                await this.plugin.selectRagSetting(name);
                this.display();
                new Notice(t("settings.ragSettingCreated", { name }));
              } catch (error) {
                new Notice(t("error.failedToCreate", { error: formatError(error) }));
              }
            }
          ).open();
        });
    });

    // Show selected RAG setting details
    if (selectedName) {
      const ragSetting = this.plugin.getRagSetting(selectedName);
      if (ragSetting) {
        this.displaySelectedRagSetting(containerEl, selectedName, ragSetting);
      }
    }
  }

  private displaySelectedRagSetting(
    containerEl: HTMLElement,
    name: string,
    ragSetting: import("src/types").RagSetting
  ): void {
    // Setting header with rename/delete buttons
    const headerSetting = new Setting(containerEl)
      .setName(t("settings.settingsFor", { name }))
      .setDesc(t("settings.configureThisSetting"));

    headerSetting.addExtraButton((btn) => {
      btn
        .setIcon("pencil")
        .setTooltip(t("settings.renameSetting"))
        .onClick(() => {
          new RagSettingNameModal(
            this.app,
            t("settings.renameRagSetting"),
            name,
            async (newName) => {
              try {
                await this.plugin.renameRagSetting(name, newName);
                this.display();
                new Notice(t("settings.renamedTo", { name: newName }));
              } catch (error) {
                new Notice(t("error.failedToRename", { error: formatError(error) }));
              }
            }
          ).open();
        });
    });

    headerSetting.addExtraButton((btn) => {
      btn
        .setIcon("trash")
        .setTooltip(t("settings.deleteSetting"))
        .onClick(() => {
          void (async () => {
            const confirmed = await new ConfirmModal(
              this.app,
              t("settings.deleteSettingConfirm", { name }),
              t("common.delete"),
              t("common.cancel")
            ).openAndWait();
            if (!confirmed) return;

            try {
              await this.plugin.deleteRagSetting(name);
              this.display();
              new Notice(t("settings.ragSettingDeleted", { name }));
            } catch (error) {
              new Notice(t("error.failedToDelete", { error: formatError(error) }));
            }
          })();
        });
    });

    // Store Mode Toggle
    new Setting(containerEl)
      .setName(t("settings.storeMode"))
      .setDesc(t("settings.storeMode.desc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("internal", t("settings.storeModeInternal"))
          .addOption("external", t("settings.storeModeExternal"))
          .setValue(ragSetting.isExternal ? "external" : "internal")
          .onChange((value) => {
            void (async () => {
              if (value === "external") {
                await this.plugin.updateRagSetting(name, {
                  isExternal: true,
                  storeId: null,
                  storeName: null,
                });
              } else {
                await this.plugin.updateRagSetting(name, {
                  isExternal: false,
                  storeId: null,
                  storeName: null,
                });
              }
              const fileSearchManager = getFileSearchManager();
              if (fileSearchManager) {
                fileSearchManager.setStoreName(null);
              }
              this.display();
            })();
          })
      );

    if (ragSetting.isExternal) {
      // External store mode - show multiple Store IDs
      this.displayExternalStoreSettings(containerEl, name, ragSetting);
    } else {
      // Internal store mode - show sync options
      this.displayInternalStoreSettings(containerEl, name, ragSetting);
    }
  }

  private displayExternalStoreSettings(
    containerEl: HTMLElement,
    name: string,
    ragSetting: import("src/types").RagSetting
  ): void {
    // Header for store IDs
    const storeIdsSetting = new Setting(containerEl)
      .setName(t("settings.storeIds"))
      .setDesc(t("settings.storeIds.desc"));

    storeIdsSetting.settingEl.addClass("gemini-helper-settings-textarea-container");

    storeIdsSetting.addTextArea((text) => {
      text
        .setPlaceholder(t("settings.storeIds.placeholder"))
        .setValue(ragSetting.storeIds.join("\n"))
        .onChange((value) => {
          void (async () => {
            const storeIds = value
              .split("\n")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.updateRagSetting(name, { storeIds });

            // Sync FileSearchManager with first store ID
            const fileSearchManager = getFileSearchManager();
            if (fileSearchManager) {
              fileSearchManager.setStoreName(storeIds[0] || null);
            }
          })();
        });
      text.inputEl.rows = 4;
      text.inputEl.addClass("gemini-helper-settings-textarea");
    });

    // Show current store count
    const storeCount = ragSetting.storeIds.length;
    new Setting(containerEl)
      .setName(t("settings.storeCount"))
      .setDesc(t("settings.storeCountDesc", { count: String(storeCount) }));
  }

  private displayInternalStoreSettings(
    containerEl: HTMLElement,
    name: string,
    ragSetting: import("src/types").RagSetting
  ): void {
    // Show current store ID if exists (with copy button)
    if (ragSetting.storeId) {
      const storeId = ragSetting.storeId;
      new Setting(containerEl)
        .setName(t("settings.currentStoreId"))
        .setDesc(storeId)
        .addExtraButton((btn) => {
          btn
            .setIcon("copy")
            .setTooltip(t("settings.copyStoreId"))
            .onClick(() => {
              void navigator.clipboard.writeText(storeId);
              new Notice(t("settings.storeIdCopied"));
            });
        });
    }

    // Target Folders
    new Setting(containerEl)
      .setName(t("settings.targetFolders"))
      .setDesc(t("settings.targetFolders.desc"))
      .addText((text) =>
        text
          .setPlaceholder(t("settings.targetFolders.placeholder"))
          .setValue(ragSetting.targetFolders.join(", "))
          .onChange((value) => {
            void (async () => {
              const folders = value
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
              await this.plugin.updateRagSetting(name, { targetFolders: folders });
            })();
          })
      );

    // Excluded Patterns (Regex)
    const excludePatternsSetting = new Setting(containerEl)
      .setName(t("settings.excludedPatterns"))
      .setDesc(t("settings.excludedPatterns.desc"));

    excludePatternsSetting.settingEl.addClass("gemini-helper-settings-textarea-container");

      excludePatternsSetting.addTextArea((text) => {
        text
          .setPlaceholder(t("settings.excludedPatterns.placeholder"))
          .setValue(ragSetting.excludePatterns.join("\n"))
          .onChange((value) => {
            void (async () => {
              const patterns = value
                .split("\n")
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
              await this.plugin.updateRagSetting(name, { excludePatterns: patterns });
            })();
          });
        text.inputEl.rows = 4;
        text.inputEl.addClass("gemini-helper-settings-textarea");
      });

    // Sync Status
    const syncedCount = Object.keys(ragSetting.files).length;
    const lastSync = ragSetting.lastFullSync
      ? new Date(ragSetting.lastFullSync).toLocaleString()
      : t("settings.syncStatusNever");

    const syncStatusSetting = new Setting(containerEl)
      .setName(t("settings.syncVault"))
      .setDesc(t("settings.syncStatus", { count: String(syncedCount), lastSync }));

    // View files button (only when files exist)
    if (syncedCount > 0) {
      syncStatusSetting.addExtraButton((btn) => {
        btn
          .setIcon("list")
          .setTooltip(t("settings.viewFiles"))
          .onClick(() => {
            new RagFilesModal(this.app, name, ragSetting.files).open();
          });
      });
    }

    // Progress container
    const progressContainer = containerEl.createDiv({
      cls: "gemini-helper-sync-progress",
    });
    progressContainer.addClass("gemini-helper-hidden");

    const progressText = progressContainer.createDiv();
    const progressBar = progressContainer.createEl("progress");
    progressBar.addClass("gemini-helper-progress-bar");

    let cancelBtn: HTMLButtonElement | null = null;

    syncStatusSetting
      .addButton((btn) => {
        cancelBtn = btn.buttonEl;
        btn
          .setButtonText(t("settings.cancelSync"))
          .setWarning()
          .onClick(() => {
            this.isSyncCancelled = true;
            new Notice(t("settings.cancellingSync"));
          });
        btn.buttonEl.addClass("gemini-helper-hidden");
      })
      .addButton((btn) =>
        btn
          .setButtonText(t("settings.syncVault"))
          .setCta()
          .onClick(() => {
            void (async () => {
              this.isSyncCancelled = false;
              btn.setDisabled(true);
              btn.setButtonText(t("settings.syncing"));
              if (cancelBtn) cancelBtn.removeClass("gemini-helper-hidden");
              progressContainer.removeClass("gemini-helper-hidden");
              progressText.removeClass("gemini-helper-progress-error");
              progressText.textContent = t("settings.syncPreparing");
              progressBar.value = 0;
              progressBar.max = 100;

              try {
                const result = await this.plugin.syncVaultForRAG(
                  name,
                  (current, total, fileName, action) => {
                    if (this.isSyncCancelled) {
                      throw new Error("Cancelled by user");
                    }
                    const percent = Math.round((current / total) * 100);
                    progressBar.value = percent;
                    progressBar.max = 100;

                    const actionText =
                      action === "upload"
                        ? t("settings.syncUploading")
                        : action === "skip"
                          ? t("settings.syncSkipping")
                          : t("settings.syncDeleting");
                    progressText.textContent = `${actionText}: ${fileName} (${current}/${total})`;
                  }
                );
                if (result) {
                  new Notice(
                    t("settings.syncResult", {
                      uploaded: String(result.uploaded.length),
                      skipped: String(result.skipped.length),
                      deleted: String(result.deleted.length),
                    })
                  );
                }
              } catch (error) {
                const msg = formatError(error);
                if (msg === "Cancelled by user") {
                  new Notice(t("settings.syncCancelled"));
                  progressText.textContent = t("settings.syncCancelled");
                } else {
                  new Notice(t("settings.syncFailed", { error: msg }));
                  progressText.textContent = `${t("common.error")}${msg}`;
                  progressText.addClass("gemini-helper-progress-error");
                }
              } finally {
                btn.setDisabled(false);
                btn.setButtonText(t("settings.syncVault"));
                if (cancelBtn) cancelBtn.addClass("gemini-helper-hidden");
                this.isSyncCancelled = false;
                setTimeout(() => {
                  progressContainer.addClass("gemini-helper-hidden");
                  this.display();
                }, 2000);
              }
            })();
          })
      );

    // Advanced semantic search settings
    new Setting(containerEl).setName(t("settings.advancedSemanticSearch")).setHeading();

    // Reset Sync State
    new Setting(containerEl)
      .setName(t("settings.resetSyncState"))
      .setDesc(t("settings.resetSyncState.desc"))
      .addButton((btn) =>
        btn.setButtonText(t("common.reset")).onClick(() => {
          void (async () => {
            const confirmed = await new ConfirmModal(
              this.app,
              t("settings.resetSyncStateConfirm"),
              t("common.reset"),
              t("common.cancel")
            ).openAndWait();
            if (!confirmed) return;

            await this.plugin.resetRagSettingSyncState(name);
            this.display();
          })();
        })
      );

    // Delete Store (only for internal stores with store ID)
    if (ragSetting.storeId && !ragSetting.isExternal) {
      new Setting(containerEl)
        .setName(t("settings.deleteStore"))
        .setDesc(t("settings.deleteStore.desc"))
        .addButton((btn) =>
          btn
            .setButtonText(t("settings.deleteStore"))
            .setWarning()
            .onClick(() => {
              void (async () => {
                const confirmed = await new ConfirmModal(
                  this.app,
                  t("settings.deleteStoreConfirm"),
                  t("common.delete"),
                  t("common.cancel")
                ).openAndWait();
                if (!confirmed) return;

                try {
                  await this.plugin.deleteRagStore(name);
                  new Notice(t("settings.storeDeleted"));
                  this.display();
                } catch (error) {
                  new Notice(t("settings.deleteStoreFailed", { error: formatError(error) }));
                }
              })();
            })
        );
    }
  }

  private displayMcpServersSettings(containerEl: HTMLElement): void {
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
              this.app,
              null,
              async (server) => {
                this.plugin.settings.mcpServers.push(server);
                await this.plugin.saveSettings();
                clearMcpToolsCache();
                this.display();
                new Notice(t("settings.mcpServerCreated", { name: server.name }));
              }
            ).open();
          })
      );

    // List existing servers
    const servers = this.plugin.settings.mcpServers;
    if (servers.length === 0) {
      const emptyEl = containerEl.createDiv({ cls: "setting-item-description gemini-helper-mcp-empty" });
      emptyEl.textContent = t("settings.mcpNoServers");
    } else {
      for (const server of servers) {
        // Build description with URL and tool hints
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
                this.app,
                server,
                async (updated) => {
                  const index = this.plugin.settings.mcpServers.findIndex(
                    (s) => s.name === server.name && s.url === server.url
                  );
                  if (index >= 0) {
                    this.plugin.settings.mcpServers[index] = updated;
                    await this.plugin.saveSettings();
                    clearMcpToolsCache();
                    this.display();
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
            .onClick(async () => {
              this.plugin.settings.mcpServers = this.plugin.settings.mcpServers.filter(
                (s) => !(s.name === server.name && s.url === server.url)
              );
              await this.plugin.saveSettings();
              clearMcpToolsCache();
              this.display();
              new Notice(t("settings.mcpServerDeleted", { name: server.name }));
            });
        });
      }
    }
  }

  private async deleteChatHistoryFiles(): Promise<void> {
    const workspaceFolder = this.plugin.settings.workspaceFolder || "GeminiHelper";
    const folder = this.app.vault.getAbstractFileByPath(workspaceFolder);

    if (!(folder instanceof TFolder)) {
      return;
    }

    const chatFiles = folder.children.filter(
      (file) => file instanceof TFile && file.name.startsWith("chat_") && file.name.endsWith(".md")
    );

    let deletedCount = 0;
    for (const file of chatFiles) {
      if (file instanceof TFile) {
        try {
          await this.app.fileManager.trashFile(file);
          deletedCount++;
        } catch {
          // Ignore errors for individual files
        }
      }
    }

    if (deletedCount > 0) {
      new Notice(t("settings.chatHistoryDeleted", { count: String(deletedCount) }));
    }
  }
}
