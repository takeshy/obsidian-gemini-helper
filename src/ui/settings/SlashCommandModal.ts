import { Modal, App, Setting, Notice } from "obsidian";
import type {
  SlashCommand,
  ModelInfo,
  ModelType,
  McpServerConfig,
  VaultToolMode,
} from "src/types";
import { t } from "src/i18n";

export class SlashCommandModal extends Modal {
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
