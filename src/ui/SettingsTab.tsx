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
import { verifyCli, verifyClaudeCli, verifyCodexCli } from "src/core/cliProvider";
import { formatError } from "src/utils/error";
import { t } from "src/i18n";
import {
  DEFAULT_MODEL,
  DEFAULT_SETTINGS,
  DEFAULT_CLI_CONFIG,
  DEFAULT_EDIT_HISTORY_SETTINGS,
  getAvailableModels,
  isModelAllowedForPlan,
  type ApiPlan,
  type ModelInfo,
  type SlashCommand,
  type ModelType,
} from "src/types";
import { getEditHistoryManager } from "src/core/editHistory";
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
              await this.plugin.selectModel(DEFAULT_MODEL);
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
      isVerified: !!cliConfig.cliVerified,
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
      isVerified: !!cliConfig.claudeCliVerified,
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
      isVerified: !!cliConfig.codexCliVerified,
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
      isVerified: boolean;
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
  }

  private async handleVerifyCli(statusEl: HTMLElement): Promise<void> {
    statusEl.empty();
    statusEl.removeClass("gemini-helper-cli-status--success", "gemini-helper-cli-status--error");
    statusEl.setText(t("settings.cliVerifyingCli"));

    try {
      const result = await verifyCli();

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
      const result = await verifyClaudeCli();

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
      const result = await verifyCodexCli();

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
                  const deletedCount = await manager.clearAllHistory();
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
            void (async () => {
              const manager = getEditHistoryManager();
              if (!manager) {
                new Notice("Edit history manager not initialized");
                return;
              }
              const result = await manager.prune();
              new Notice(t("settings.editHistoryPruned", { count: String(result.deletedCount) }));
            })();
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText(t("settings.editHistoryViewStats"))
          .onClick(() => {
            void (async () => {
              const manager = getEditHistoryManager();
              if (!manager) {
                new Notice("Edit history manager not initialized");
                return;
              }
              const stats = await manager.getStats();
              const sizeStr = stats.totalSizeBytes < 1024
                ? `${stats.totalSizeBytes}B`
                : stats.totalSizeBytes < 1024 * 1024
                  ? `${(stats.totalSizeBytes / 1024).toFixed(1)}KB`
                  : `${(stats.totalSizeBytes / 1024 / 1024).toFixed(1)}MB`;
              new Notice(t("settings.editHistoryStats", {
                files: String(stats.totalFiles),
                entries: String(stats.totalEntries),
                size: sizeStr,
              }));
            })();
          })
      );
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

    // Disable Vault Search toggle
    new Setting(containerEl)
      .setName(t("settings.disableVaultSearch"))
      .setDesc(t("settings.disableVaultSearch.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(ragSetting.disableVaultSearch ?? true)
          .onChange((value) => {
            void (async () => {
              await this.plugin.updateRagSetting(name, { disableVaultSearch: value });
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
          await this.app.vault.delete(file);
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
