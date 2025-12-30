import {
  PluginSettingTab,
  App,
  Setting,
  DropdownComponent,
  TFolder,
  Notice,
  Modal,
} from "obsidian";
import type { GeminiHelperPlugin } from "src/plugin";
import { getFileSearchManager } from "src/core/fileSearch";
import { verifyCli } from "src/core/cliProvider";
import { formatError } from "src/utils/error";
import {
  DEFAULT_MODEL,
  DEFAULT_SETTINGS,
  DEFAULT_CLI_CONFIG,
  getAvailableModels,
  isModelAllowedForPlan,
  type ApiPlan,
  type ModelInfo,
  type SlashCommand,
  type ModelType,
} from "src/types";
import { Platform } from "obsidian";

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

    new Setting(contentEl).setName("Name").addText((text) => {
      text
        .setPlaceholder("Enter name")
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
        btn.setButtonText("Cancel").onClick(() => {
          this.close();
        })
      )
      .addButton((btn) =>
        btn
          .setButtonText("OK")
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
      new Notice("Name cannot be empty");
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

  constructor(app: App, message: string, confirmText = "Confirm", cancelText = "Cancel") {
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

// Modal for creating/editing slash commands
class SlashCommandModal extends Modal {
  private command: SlashCommand;
  private isNew: boolean;
  private onSubmit: (command: SlashCommand) => void | Promise<void>;
  private ragEnabled: boolean;
  private ragSettings: string[];
  private availableModels: ModelInfo[];
  private allowWebSearch: boolean;

  constructor(
    app: App,
    command: SlashCommand | null,
    ragEnabled: boolean,
    ragSettings: string[],
    availableModels: ModelInfo[],
    allowWebSearch: boolean,
    onSubmit: (command: SlashCommand) => void | Promise<void>
  ) {
    super(app);
    this.isNew = command === null;
    this.ragEnabled = ragEnabled;
    this.ragSettings = ragSettings;
    this.availableModels = availableModels;
    this.allowWebSearch = allowWebSearch;
    this.command = command
      ? { ...command }
      : {
          id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          name: "",
          promptTemplate: "",
          model: null,
          description: "",
          searchSetting: null,
        };
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", {
      text: this.isNew ? "Create slash command" : "Edit slash command",
    });

    // Command name
    new Setting(contentEl)
      .setName("Command name")
      .setDesc("Name used to trigger the command (e.g., 'translate')")
      .addText((text) => {
        text
          .setPlaceholder("Example: translate")
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
      .setName("Description")
      .setDesc("Brief description shown in autocomplete")
      .addText((text) => {
        text
          .setPlaceholder("Translate text to english")
          .setValue(this.command.description || "")
          .onChange((value) => {
            this.command.description = value;
          });
      });

    // Prompt template
    const promptSetting = new Setting(contentEl)
      .setName("Prompt template")
      .setDesc("Use {selection} for selected text (falls back to active note if no selection), {content} for active note");

    promptSetting.settingEl.addClass("gemini-helper-settings-textarea-container");

    promptSetting.addTextArea((text) => {
      text
        .setPlaceholder("Translate the following to english:\n\n{selection}")
        .setValue(this.command.promptTemplate)
        .onChange((value) => {
          this.command.promptTemplate = value;
        });
      text.inputEl.rows = 6;
      text.inputEl.addClass("gemini-helper-settings-textarea");
    });

    // Model selection (optional)
    new Setting(contentEl)
      .setName("Model (optional)")
      .setDesc("Override the current model when using this command")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "Use current model");
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
      .setName("Search (optional)")
      .setDesc("Override the current search setting when using this command")
      .addDropdown((dropdown) => {
        dropdown.addOption("__current__", "Use current setting");
        dropdown.addOption("", "None");
        if (this.allowWebSearch) {
          dropdown.addOption("__websearch__", "Web search");
        }
        if (this.ragEnabled) {
          this.ragSettings.forEach((name) => {
            dropdown.addOption(name, `Semantic search: ${name}`);
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

    // Action buttons
    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => this.close())
      )
      .addButton((btn) =>
        btn
          .setButtonText(this.isNew ? "Create" : "Save")
          .setCta()
          .onClick(() => {
            if (!this.command.name.trim()) {
              new Notice("Command name is required");
              return;
            }
            if (!this.command.promptTemplate.trim()) {
              new Notice("Prompt template is required");
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
    const isCliMode = cliConfig.provider !== "api";
    const apiPlan = this.plugin.settings.apiPlan;
    const allowWebSearch = !isCliMode;
    const allowRag = this.plugin.settings.ragEnabled;
    const availableModels = getAvailableModels(apiPlan);

    // API settings (always shown)
    new Setting(containerEl).setName("API settings").setHeading();
    this.displayApiSettings(containerEl, apiPlan);

    // CLI settings (desktop only)
    if (!Platform.isMobile) {
      new Setting(containerEl).setName("CLI mode").setHeading();
      this.displayCliSettings(containerEl, cliConfig, isCliMode);
    }

    // Workspace settings
    new Setting(containerEl).setName("Workspace").setHeading();

    // Workspace Folder
    new Setting(containerEl)
      .setName("Workspace folder")
      .setDesc("Folder to store chat histories and semantic search settings")
      .addDropdown((dropdown: DropdownComponent) => {
        dropdown.addOption("", "Vault root");

        const folders = this.app.vault
          .getAllLoadedFiles()
          .filter((file) => file instanceof TFolder && !file.isRoot());

        const currentFolder = this.plugin.settings.workspaceFolder;
        const folderPaths = new Set(folders.map((f) => f.path));

        // Add current setting if folder doesn't exist yet
        if (currentFolder && !folderPaths.has(currentFolder)) {
          dropdown.addOption(currentFolder, `${currentFolder} (will be created)`);
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
      .setName("Save chat history")
      .setDesc("Save chat conversations as Markdown files in the workspace folder")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.saveChatHistory)
          .onChange((value) => {
            void (async () => {
              this.plugin.settings.saveChatHistory = value;
              await this.plugin.saveSettings();
            })();
          })
      );

    // System Prompt
    const systemPromptSetting = new Setting(containerEl)
      .setName("System prompt")
      .setDesc("Additional instructions for the AI assistant");

    systemPromptSetting.settingEl.addClass("gemini-helper-settings-textarea-container");

    systemPromptSetting.addTextArea((text) => {
      text
        .setPlaceholder("Respond in the same language as the question.")
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
    new Setting(containerEl).setName("Tool limits").setHeading();

    new Setting(containerEl)
      .setName("Max tool calls per request")
      .setDesc("Upper limit for function calls during a single response")
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
          .setTooltip(`Reset to default (${DEFAULT_SETTINGS.maxFunctionCalls})`)
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
      .setName("Tool call warning threshold")
      .setDesc("Warn when remaining calls are at or below this number")
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
          .setTooltip(`Reset to default (${DEFAULT_SETTINGS.functionCallWarningThreshold})`)
          .onClick(() => {
            void (async () => {
              this.plugin.settings.functionCallWarningThreshold = DEFAULT_SETTINGS.functionCallWarningThreshold;
              await this.plugin.saveSettings();
              this.display();
            })();
          })
      );

    new Setting(containerEl)
      .setName("Default list_notes limit")
      .setDesc("Maximum number of notes returned by list_notes when no limit is specified")
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
          .setTooltip(`Reset to default (${DEFAULT_SETTINGS.listNotesLimit})`)
          .onClick(() => {
            void (async () => {
              this.plugin.settings.listNotesLimit = DEFAULT_SETTINGS.listNotesLimit;
              await this.plugin.saveSettings();
              this.display();
            })();
          })
      );

    new Setting(containerEl)
      .setName("Max note characters")
      .setDesc("Maximum characters to read from a note (longer notes will be truncated)")
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
          .setTooltip(`Reset to default (${DEFAULT_SETTINGS.maxNoteChars})`)
          .onClick(() => {
            void (async () => {
              this.plugin.settings.maxNoteChars = DEFAULT_SETTINGS.maxNoteChars;
              await this.plugin.saveSettings();
              this.display();
            })();
          })
      );

    // Slash commands settings
    new Setting(containerEl).setName("Slash commands").setHeading();

    const ragSettingNames = this.plugin.getRagSettingNames();

    new Setting(containerEl)
      .setName("Manage commands")
      .setDesc("Create reusable prompt templates triggered by typing / in chat")
      .addButton((btn) =>
        btn
          .setButtonText("Add command")
          .setCta()
          .onClick(() => {
            new SlashCommandModal(
              this.app,
              null,
              allowRag,
              allowRag ? ragSettingNames : [],
              availableModels,
              allowWebSearch,
              async (command) => {
                this.plugin.settings.slashCommands.push(command);
                await this.plugin.saveSettings();
                this.display();
                new Notice(`Command "/${command.name}" created`);
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
            .setTooltip("Edit command")
            .onClick(() => {
              new SlashCommandModal(
                this.app,
                command,
                allowRag,
                allowRag ? ragSettingNames : [],
                availableModels,
                allowWebSearch,
                async (updated) => {
                  const index = this.plugin.settings.slashCommands.findIndex(
                    (c) => c.id === command.id
                  );
                  if (index >= 0) {
                    this.plugin.settings.slashCommands[index] = updated;
                    await this.plugin.saveSettings();
                    this.display();
                    new Notice(`Command "/${updated.name}" updated`);
                  }
                }
              ).open();
            });
        });

        // Delete button
        commandSetting.addExtraButton((btn) => {
          btn
            .setIcon("trash")
            .setTooltip("Delete command")
            .onClick(async () => {
              this.plugin.settings.slashCommands =
                this.plugin.settings.slashCommands.filter(
                  (c) => c.id !== command.id
                );
              await this.plugin.saveSettings();
              this.display();
              new Notice(`Command "/${command.name}" deleted`);
            });
        });
      }
    }

    // Semantic search settings
    new Setting(containerEl).setName("Semantic search").setHeading();

    new Setting(containerEl)
      .setName("Enable semantic search")
      .setDesc("Enable semantic search to search your vault with AI")
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
  }

  private displayApiSettings(containerEl: HTMLElement, apiPlan: ApiPlan): void {
    // Google API Key
    const apiKeySetting = new Setting(containerEl)
      .setName("Google API key")
      .setDesc("Your API key from ai.google.dev");

    let apiKeyRevealed = false;
    apiKeySetting.addText((text) => {
      text
        .setPlaceholder("Enter your API key")
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
        .setTooltip("Show or hide API key")
        .onClick(() => {
          apiKeyRevealed = !apiKeyRevealed;
          const input = apiKeySetting.controlEl.querySelector("input");
          if (input) input.type = apiKeyRevealed ? "text" : "password";
          btn.setIcon(apiKeyRevealed ? "eye-off" : "eye");
        });
    });

    new Setting(containerEl)
      .setName("API plan")
      .setDesc("Select the plan type for your API key (affects available models and search features)")
      .addDropdown((dropdown) => {
        dropdown.addOption("paid", "Paid");
        dropdown.addOption("free", "Free");
        dropdown.setValue(apiPlan);
        dropdown.onChange((value) => {
          void (async () => {
            this.plugin.settings.apiPlan = value as ApiPlan;
            await this.plugin.saveSettings();
            const plan = this.plugin.settings.apiPlan;
            const selectedModel = this.plugin.getSelectedModel();
            if (!isModelAllowedForPlan(plan, selectedModel)) {
              await this.plugin.selectModel(DEFAULT_MODEL);
            }
            this.display();
          })();
        });
      });
  }

  private displayCliSettings(
    containerEl: HTMLElement,
    cliConfig: import("src/types").CliProviderConfig,
    isCliMode: boolean
  ): void {
    // Experimental warning
    const experimentalEl = containerEl.createDiv({ cls: "setting-item-description" });
    experimentalEl.style.marginBottom = "1em";
    experimentalEl.style.padding = "0.5em";
    experimentalEl.style.backgroundColor = "var(--background-modifier-message)";
    experimentalEl.style.borderRadius = "4px";
    experimentalEl.style.borderLeft = "3px solid var(--text-warning)";
    const warningTitle = experimentalEl.createEl("strong");
    warningTitle.textContent = "Experimental feature";
    const warningText = experimentalEl.createEl("p");
    warningText.style.margin = "0.5em 0 0 0";
    warningText.textContent = "This feature is experimental and may be removed in future versions.";

    // CLI Mode toggle
    new Setting(containerEl)
      .setName("Enable command line mode")
      .setDesc("Use the CLI instead of the API")
      .addToggle((toggle) =>
        toggle.setValue(isCliMode).onChange((value) => {
          void (async () => {
            this.plugin.settings.cliConfig = {
              ...cliConfig,
              provider: value ? "gemini-cli" : "api",
            };
            await this.plugin.saveSettings();
            this.display();
          })();
        })
      );

    // Show CLI settings only when enabled
    if (isCliMode) {
      // Status indicator
      const statusEl = containerEl.createDiv({ cls: "gemini-cli-status" });
      statusEl.style.marginBottom = "1em";
      statusEl.style.padding = "0.5em";
      statusEl.style.borderRadius = "4px";
      statusEl.style.fontSize = "0.9em";

      // Verify button
      new Setting(containerEl)
        .setName("Verify CLI")
        .setDesc("Check if the CLI is installed and authenticated")
        .addButton((button) =>
          button.setButtonText("Verify").onClick(() => {
            void this.handleVerifyCli(statusEl);
          })
        );

      // Notice about CLI mode requirements and limitations
      const noticeEl = containerEl.createDiv({ cls: "setting-item-description" });
      noticeEl.style.marginTop = "1em";
      noticeEl.style.padding = "0.5em";
      noticeEl.style.backgroundColor = "var(--background-modifier-message)";
      noticeEl.style.borderRadius = "4px";

      // Requirements section
      const reqTitle = noticeEl.createEl("strong");
      reqTitle.textContent = "Requirements:";
      const reqList = noticeEl.createEl("ul");
      reqList.style.margin = "0.5em 0";
      reqList.style.paddingLeft = "1.5em";

      const geminiCmd = "gemini";
      const appdataPath = "%APPDATA%\\npm";

      const macLi = reqList.createEl("li");
      macLi.createEl("strong").textContent = "macOS/Linux:";
      macLi.appendText(" ");
      macLi.createEl("code").textContent = geminiCmd;
      macLi.appendText(" command must be in PATH");

      const winLi = reqList.createEl("li");
      winLi.createEl("strong").textContent = "Windows:";
      winLi.appendText(" gemini-cli must be installed at ");
      winLi.createEl("code").textContent = appdataPath;

      // Read-only mode section
      const roTitle = noticeEl.createEl("strong");
      roTitle.textContent = "Read-only mode:";
      const roList = noticeEl.createEl("ul");
      roList.style.margin = "0.5em 0";
      roList.style.paddingLeft = "1.5em";
      roList.createEl("li").textContent = "Vault write operations are not available (read and search only)";
      roList.createEl("li").textContent = "Semantic search is not available";
      roList.createEl("li").textContent = "Web search is not available";
    }
  }

  private async handleVerifyCli(statusEl: HTMLElement): Promise<void> {
    statusEl.empty();
    statusEl.style.backgroundColor = "var(--background-modifier-message)";
    statusEl.setText("Verifying CLI...");

    try {
      const result = await verifyCli();

      if (!result.success) {
        statusEl.style.backgroundColor = "var(--background-modifier-error)";
        // Save unverified status
        this.plugin.settings.cliConfig = {
          ...this.plugin.settings.cliConfig,
          cliVerified: false,
        };
        await this.plugin.saveSettings();

        if (result.stage === "version") {
          statusEl.empty();
          statusEl.createEl("strong", { text: "CLI not found: " });
          statusEl.createSpan({ text: result.error || "Gemini CLI not found" });
        } else {
          statusEl.empty();
          statusEl.createEl("strong", { text: "Login required: " });
          statusEl.createSpan({ text: "Run 'gemini' command and complete login with /auth" });
        }
        return;
      }

      // Success - save verified status
      this.plugin.settings.cliConfig = {
        ...this.plugin.settings.cliConfig,
        cliVerified: true,
      };
      await this.plugin.saveSettings();

      statusEl.style.backgroundColor = "var(--background-modifier-success)";
      statusEl.empty();
      statusEl.createEl("strong", { text: "CLI verified: " });
      statusEl.createSpan({ text: "Ready to use" });
    } catch (err) {
      // Save unverified status on error
      this.plugin.settings.cliConfig = {
        ...this.plugin.settings.cliConfig,
        cliVerified: false,
      };
      await this.plugin.saveSettings();

      statusEl.style.backgroundColor = "var(--background-modifier-error)";
      statusEl.empty();
      statusEl.createEl("strong", { text: "Error: " });
      statusEl.createSpan({ text: String(err) });
    }
  }

  private displayRagSettings(containerEl: HTMLElement): void {
    const ragSettingNames = this.plugin.getRagSettingNames();
    const selectedName = this.plugin.workspaceState.selectedRagSetting;

    // Top K setting (number of chunks to retrieve)
    new Setting(containerEl)
      .setName("Retrieved chunks limit")
      .setDesc("Maximum number of document chunks to retrieve per query (lower = fewer tokens, faster)")
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
          .setTooltip(`Reset to default (${DEFAULT_SETTINGS.ragTopK})`)
          .onClick(() => {
            void (async () => {
              this.plugin.settings.ragTopK = DEFAULT_SETTINGS.ragTopK;
              await this.plugin.saveSettings();
              this.display();
            })();
          })
      );

    // Semantic search setting selection
    const ragSelectSetting = new Setting(containerEl)
      .setName("Semantic search setting")
      .setDesc("Select or create a semantic search setting to use");

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

    // Add new semantic search setting button
    ragSelectSetting.addExtraButton((btn) => {
      btn
        .setIcon("plus")
        .setTooltip("Create new semantic search setting")
        .onClick(() => {
          new RagSettingNameModal(
            this.app,
            "Create semantic search setting",
            "",
            async (name) => {
              try {
                await this.plugin.createRagSetting(name);
                await this.plugin.selectRagSetting(name);
                this.display();
                new Notice(`Semantic search setting "${name}" created`);
              } catch (error) {
                new Notice(`Failed to create: ${formatError(error)}`);
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
      .setName(`Settings for ${name}`)
      .setDesc("Configure this semantic search setting");

    headerSetting.addExtraButton((btn) => {
      btn
        .setIcon("pencil")
        .setTooltip("Rename setting")
        .onClick(() => {
          new RagSettingNameModal(
            this.app,
            "Rename semantic search setting",
            name,
            async (newName) => {
              try {
                await this.plugin.renameRagSetting(name, newName);
                this.display();
                new Notice(`Renamed to "${newName}"`);
              } catch (error) {
                new Notice(`Failed to rename: ${formatError(error)}`);
              }
            }
          ).open();
        });
    });

    headerSetting.addExtraButton((btn) => {
      btn
        .setIcon("trash")
        .setTooltip("Delete")
        .onClick(() => {
          void (async () => {
            const confirmed = await new ConfirmModal(
              this.app,
              `Are you sure you want to delete the semantic search setting "${name}"? This will not delete the store from the server.`,
              "Delete",
              "Cancel"
            ).openAndWait();
            if (!confirmed) return;

            try {
              await this.plugin.deleteRagSetting(name);
              this.display();
              new Notice(`Semantic search setting "${name}" deleted`);
            } catch (error) {
              new Notice(`Failed to delete setting: ${formatError(error)}`);
            }
          })();
        });
    });

    // Store Mode Toggle
    new Setting(containerEl)
      .setName("Store mode")
      .setDesc("Internal: sync your vault files. External: use an existing semantic search store.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("internal", "Internal (vault sync)")
          .addOption("external", "External (existing store)")
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
      .setName("Semantic search store ids")
      .setDesc("External semantic search store ids (one per line)");

    storeIdsSetting.settingEl.addClass("gemini-helper-settings-textarea-container");

    storeIdsSetting.addTextArea((text) => {
      text
        .setPlaceholder("E.g., fileSearchStores/xxx")
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
      .setName("Store count")
      .setDesc(`${storeCount} store${storeCount !== 1 ? "s" : ""} configured`);
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
        .setName("Current store ID")
        .setDesc(storeId)
        .addExtraButton((btn) => {
          btn
            .setIcon("copy")
            .setTooltip("Copy store ID")
            .onClick(() => {
              void navigator.clipboard.writeText(storeId);
              new Notice("Store ID copied to clipboard");
            });
        });
    }

    // Target Folders
    new Setting(containerEl)
      .setName("Target folders")
      .setDesc("Folders to include in semantic search indexing (comma-separated). Leave empty to include all folders.")
      .addText((text) =>
        text
          .setPlaceholder("E.g., notes, projects, docs")
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
      .setName("Excluded patterns (regex)")
      .setDesc(
        "Regular expression patterns to exclude files (one per line). E.g., ^daily/, \\.excalidraw\\.md$"
      );

    excludePatternsSetting.settingEl.addClass("gemini-helper-settings-textarea-container");

      excludePatternsSetting.addTextArea((text) => {
        text
          .setPlaceholder("^daily/\n\\.excalidraw\\.md$\n^templates/")
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
      : "Never";

    const syncStatusSetting = new Setting(containerEl)
      .setName("Sync vault")
      .setDesc(`${syncedCount} files indexed | Last sync: ${lastSync}`);

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
          .setButtonText("Cancel")
          .setWarning()
          .onClick(() => {
            this.isSyncCancelled = true;
            new Notice("Cancelling sync...");
          });
        btn.buttonEl.addClass("gemini-helper-hidden");
      })
      .addButton((btn) =>
        btn
          .setButtonText("Sync vault")
          .setCta()
          .onClick(() => {
            void (async () => {
              this.isSyncCancelled = false;
              btn.setDisabled(true);
              btn.setButtonText("Syncing...");
              if (cancelBtn) cancelBtn.removeClass("gemini-helper-hidden");
              progressContainer.removeClass("gemini-helper-hidden");
              progressText.removeClass("gemini-helper-progress-error");
              progressText.textContent = "Preparing...";
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
                        ? "Uploading"
                        : action === "skip"
                          ? "Skipping"
                          : "Deleting";
                    progressText.textContent = `${actionText}: ${fileName} (${current}/${total})`;
                  }
                );
                if (result) {
                  new Notice(
                    `Sync: ${result.uploaded.length} uploaded, ${result.skipped.length} skipped, ${result.deleted.length} deleted`
                  );
                }
              } catch (error) {
                const msg = formatError(error);
                if (msg === "Cancelled by user") {
                  new Notice("Sync cancelled");
                  progressText.textContent = "Cancelled";
                } else {
                  new Notice(`Sync failed: ${msg}`);
                  progressText.textContent = `Error: ${msg}`;
                  progressText.addClass("gemini-helper-progress-error");
                }
              } finally {
                btn.setDisabled(false);
                btn.setButtonText("Sync vault");
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
    new Setting(containerEl).setName("Advanced semantic search").setHeading();

    // Reset Sync State
    new Setting(containerEl)
      .setName("Reset sync state")
      .setDesc("Clear the local sync state. Next sync will re-upload all files.")
      .addButton((btn) =>
        btn.setButtonText("Reset").onClick(() => {
          void (async () => {
            const confirmed = await new ConfirmModal(
              this.app,
              "Are you sure you want to reset the sync state?",
              "Reset",
              "Cancel"
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
        .setName("Delete semantic search store")
        .setDesc(
          "Delete the current semantic search store and all indexed data from the server"
        )
        .addButton((btn) =>
          btn
            .setButtonText("Delete store")
            .setWarning()
            .onClick(() => {
              void (async () => {
                const confirmed = await new ConfirmModal(
                  this.app,
                  "Are you sure you want to delete the semantic search store? This will remove all indexed data from the server. This cannot be undone.",
                  "Delete",
                  "Cancel"
                ).openAndWait();
                if (!confirmed) return;

                try {
                  await this.plugin.deleteRagStore(name);
                  new Notice("Semantic search store deleted");
                  this.display();
                } catch (error) {
                  new Notice(`Failed to delete store: ${formatError(error)}`);
                }
              })();
            })
        );
    }
  }
}
