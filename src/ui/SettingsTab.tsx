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
import { formatError } from "src/utils/error";

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

    // API settings
    new Setting(containerEl).setName("API").setHeading();

    // Google API Key
    const apiKeySetting = new Setting(containerEl)
      .setName("Google API key")
      .setDesc("Enter your Google AI API key. Get one at ai.google.dev");

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
        .setPlaceholder("E.g., always respond in Japanese.")
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

    if (this.plugin.settings.ragEnabled) {
      this.displayRagSettings(containerEl);
    }
  }

  private displayRagSettings(containerEl: HTMLElement): void {
    const ragSettingNames = this.plugin.getRagSettingNames();
    const selectedName = this.plugin.workspaceState.selectedRagSetting;

    // Semantic search setting selection
    const ragSelectSetting = new Setting(containerEl)
      .setName("Semantic search setting")
      .setDesc("Select or create a semantic search setting to use");

    ragSelectSetting.addDropdown((dropdown) => {
      dropdown.addOption("", "-- none --");

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
