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

// Modal for creating/renaming RAG settings
class RagSettingNameModal extends Modal {
  private name = "";
  private onSubmit: (name: string) => void;
  private title: string;
  private initialValue: string;

  constructor(
    app: App,
    title: string,
    initialValue: string,
    onSubmit: (name: string) => void
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
      this.onSubmit(this.name.trim());
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

    // API Settings
    containerEl.createEl("h2", { text: "API Settings" });

    // Google API Key
    const apiKeySetting = new Setting(containerEl)
      .setName("Google API Key")
      .setDesc("Enter your Google AI API key (get one at ai.google.dev)");

    let apiKeyRevealed = false;
    apiKeySetting.addText((text) => {
      text
        .setPlaceholder("Enter your API key")
        .setValue(this.plugin.settings.googleApiKey)
        .onChange(async (value) => {
          this.plugin.settings.googleApiKey = value;
          await this.plugin.saveSettings();
        });
      text.inputEl.type = "password";
    });

    apiKeySetting.addExtraButton((btn) => {
      btn
        .setIcon("eye")
        .setTooltip("Show/hide API key")
        .onClick(() => {
          apiKeyRevealed = !apiKeyRevealed;
          const input = apiKeySetting.controlEl.querySelector("input");
          if (input) input.type = apiKeyRevealed ? "text" : "password";
          btn.setIcon(apiKeyRevealed ? "eye-off" : "eye");
        });
    });

    // Workspace Settings
    containerEl.createEl("h2", { text: "Workspace Settings" });

    // Workspace Folder
    new Setting(containerEl)
      .setName("Workspace Folder")
      .setDesc("Folder to store chat histories and RAG settings")
      .addDropdown((dropdown: DropdownComponent) => {
        dropdown.addOption("", "Vault Root");

        const folders = this.app.vault
          .getAllLoadedFiles()
          .filter((file) => file instanceof TFolder && !file.isRoot());

        folders.forEach((folder) => {
          dropdown.addOption(folder.path, folder.name);
        });

        dropdown
          .setValue(this.plugin.settings.workspaceFolder)
          .onChange(async (value) => {
            await this.plugin.changeWorkspaceFolder(value);
            this.display();
          });
      });

    // Save Chat History
    new Setting(containerEl)
      .setName("Save Chat History")
      .setDesc("Save chat conversations as Markdown files in the workspace folder")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.saveChatHistory)
          .onChange(async (value) => {
            this.plugin.settings.saveChatHistory = value;
            await this.plugin.saveSettings();
          })
      );

    // System Prompt
    const systemPromptSetting = new Setting(containerEl)
      .setName("System Prompt")
      .setDesc("Additional instructions for the AI assistant");

    systemPromptSetting.settingEl.addClass("gemini-helper-settings-textarea-container");

    systemPromptSetting.addTextArea((text) => {
      text
        .setPlaceholder("E.g., Always respond in Japanese.")
        .setValue(this.plugin.settings.systemPrompt)
        .onChange(async (value) => {
          this.plugin.settings.systemPrompt = value;
          await this.plugin.saveSettings();
        });
      text.inputEl.rows = 4;
      text.inputEl.addClass("gemini-helper-settings-textarea");
    });

    // RAG Settings
    containerEl.createEl("h2", { text: "RAG (File Search) Settings" });

    new Setting(containerEl)
      .setName("Enable RAG")
      .setDesc("Enable File Search RAG to search your vault with AI")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.ragEnabled)
          .onChange(async (value) => {
            this.plugin.settings.ragEnabled = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.ragEnabled) {
      this.displayRagSettings(containerEl);
    }
  }

  private displayRagSettings(containerEl: HTMLElement): void {
    const ragSettingNames = this.plugin.getRagSettingNames();
    const selectedName = this.plugin.workspaceState.selectedRagSetting;

    // RAG Setting Selection
    const ragSelectSetting = new Setting(containerEl)
      .setName("RAG Setting")
      .setDesc("Select or create a RAG setting to use");

    ragSelectSetting.addDropdown((dropdown) => {
      dropdown.addOption("", "-- None --");

      ragSettingNames.forEach((name) => {
        dropdown.addOption(name, name);
      });

      dropdown.setValue(selectedName || "").onChange(async (value) => {
        await this.plugin.selectRagSetting(value || null);
        this.display();
      });
    });

    // Add new RAG setting button
    ragSelectSetting.addExtraButton((btn) => {
      btn
        .setIcon("plus")
        .setTooltip("Create new RAG setting")
        .onClick(() => {
          new RagSettingNameModal(
            this.app,
            "Create RAG Setting",
            "",
            async (name) => {
              try {
                await this.plugin.createRagSetting(name);
                await this.plugin.selectRagSetting(name);
                this.display();
                new Notice(`RAG setting "${name}" created`);
              } catch (error) {
                new Notice(`Failed to create: ${error}`);
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
      .setName(`Settings: ${name}`)
      .setDesc("Configure this RAG setting");

    headerSetting.addExtraButton((btn) => {
      btn
        .setIcon("pencil")
        .setTooltip("Rename")
        .onClick(() => {
          new RagSettingNameModal(
            this.app,
            "Rename RAG Setting",
            name,
            async (newName) => {
              try {
                await this.plugin.renameRagSetting(name, newName);
                this.display();
                new Notice(`Renamed to "${newName}"`);
              } catch (error) {
                new Notice(`Failed to rename: ${error}`);
              }
            }
          ).open();
        });
    });

    headerSetting.addExtraButton((btn) => {
      btn
        .setIcon("trash")
        .setTooltip("Delete")
        .onClick(async () => {
          const confirmed = confirm(
            `Are you sure you want to delete the RAG setting "${name}"? This will NOT delete the store from the server.`
          );
          if (!confirmed) return;

          await this.plugin.deleteRagSetting(name);
          this.display();
          new Notice(`RAG setting "${name}" deleted`);
        });
    });

    // Store Mode Toggle
    new Setting(containerEl)
      .setName("Store Mode")
      .setDesc("Internal: sync your vault files. External: use an existing RAG store.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("internal", "Internal (Vault Sync)")
          .addOption("external", "External (Existing Store)")
          .setValue(ragSetting.isExternal ? "external" : "internal")
          .onChange(async (value) => {
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
      .setName("RAG Store IDs")
      .setDesc("External File Search Store IDs (one per line)");

    storeIdsSetting.settingEl.addClass("gemini-helper-settings-textarea-container");

    storeIdsSetting.addTextArea((text) => {
      text
        .setPlaceholder("fileSearchStores/xxx\nfileSearchStores/yyy")
        .setValue(ragSetting.storeIds.join("\n"))
        .onChange(async (value) => {
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
        });
      text.inputEl.rows = 4;
      text.inputEl.addClass("gemini-helper-settings-textarea");
    });

    // Show current store count
    const storeCount = ragSetting.storeIds.length;
    new Setting(containerEl)
      .setName("Store Count")
      .setDesc(`${storeCount} store${storeCount !== 1 ? "s" : ""} configured`);
  }

  private displayInternalStoreSettings(
    containerEl: HTMLElement,
    name: string,
    ragSetting: import("src/types").RagSetting
  ): void {
    // Show current store ID if exists (with copy button)
    if (ragSetting.storeId) {
      new Setting(containerEl)
        .setName("Current Store ID")
        .setDesc(ragSetting.storeId)
        .addExtraButton((btn) => {
          btn
            .setIcon("copy")
            .setTooltip("Copy Store ID")
            .onClick(() => {
              navigator.clipboard.writeText(ragSetting.storeId!);
              new Notice("Store ID copied to clipboard");
            });
        });
    }

    // Target Folders
    new Setting(containerEl)
      .setName("Target Folders")
      .setDesc("Folders to include in RAG indexing (comma-separated). Leave empty to include all folders.")
      .addText((text) =>
        text
          .setPlaceholder("e.g., notes, projects, docs")
          .setValue(ragSetting.targetFolders.join(", "))
          .onChange(async (value) => {
            const folders = value
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.updateRagSetting(name, { targetFolders: folders });
          })
      );

    // Excluded Patterns (Regex)
    const excludePatternsSetting = new Setting(containerEl)
      .setName("Excluded Patterns (Regex)")
      .setDesc(
        "Regular expression patterns to exclude files (one per line). E.g., ^daily/, \\.excalidraw\\.md$"
      );

    excludePatternsSetting.settingEl.addClass("gemini-helper-settings-textarea-container");

    excludePatternsSetting.addTextArea((text) => {
      text
        .setPlaceholder("^daily/\n\\.excalidraw\\.md$\n^templates/")
        .setValue(ragSetting.excludePatterns.join("\n"))
        .onChange(async (value) => {
          const patterns = value
            .split("\n")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          await this.plugin.updateRagSetting(name, { excludePatterns: patterns });
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
      .setName("Sync Vault")
      .setDesc(`${syncedCount} files indexed | Last sync: ${lastSync}`);

    // Progress container
    const progressContainer = containerEl.createDiv({
      cls: "gemini-helper-sync-progress",
    });
    progressContainer.style.display = "none";
    progressContainer.style.marginTop = "8px";
    progressContainer.style.padding = "8px";
    progressContainer.style.backgroundColor = "var(--background-secondary)";
    progressContainer.style.borderRadius = "4px";

    const progressText = progressContainer.createDiv();
    const progressBar = progressContainer.createEl("progress");
    progressBar.style.width = "100%";
    progressBar.style.marginTop = "4px";

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
        btn.buttonEl.style.display = "none";
      })
      .addButton((btn) =>
        btn
          .setButtonText("Sync Vault")
          .setCta()
          .onClick(async () => {
            this.isSyncCancelled = false;
            btn.setDisabled(true);
            btn.setButtonText("Syncing...");
            if (cancelBtn) cancelBtn.style.display = "inline-block";
            progressContainer.style.display = "block";
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
              const msg = error instanceof Error ? error.message : String(error);
              if (msg === "Cancelled by user") {
                new Notice("Sync cancelled");
                progressText.textContent = "Cancelled";
              } else {
                new Notice(`Sync failed: ${msg}`);
                progressText.textContent = `Error: ${msg}`;
                progressText.style.color = "var(--text-error)";
              }
            } finally {
              btn.setDisabled(false);
              btn.setButtonText("Sync Vault");
              if (cancelBtn) cancelBtn.style.display = "none";
              this.isSyncCancelled = false;
              setTimeout(() => {
                progressContainer.style.display = "none";
                this.display();
              }, 2000);
            }
          })
      );

    // Advanced RAG Settings
    containerEl.createEl("h3", { text: "Advanced RAG Settings" });

    // Reset Sync State
    new Setting(containerEl)
      .setName("Reset Sync State")
      .setDesc("Clear the local sync state. Next sync will re-upload all files.")
      .addButton((btn) =>
        btn.setButtonText("Reset").onClick(async () => {
          const confirmed = confirm(
            "Are you sure you want to reset the sync state?"
          );
          if (!confirmed) return;

          await this.plugin.resetRagSettingSyncState(name);
          this.display();
        })
      );

    // Delete Store (only for internal stores with store ID)
    if (ragSetting.storeId && !ragSetting.isExternal) {
      new Setting(containerEl)
        .setName("Delete RAG Store")
        .setDesc(
          "Delete the current RAG store and all indexed data from the server"
        )
        .addButton((btn) =>
          btn
            .setButtonText("Delete Store")
            .setWarning()
            .onClick(async () => {
              const confirmed = confirm(
                "Are you sure you want to delete the RAG store? This will remove all indexed data from the server. This cannot be undone."
              );
              if (!confirmed) return;

              try {
                await this.plugin.deleteRagStore(name);
                new Notice("RAG store deleted");
                this.display();
              } catch (error) {
                new Notice(`Failed to delete store: ${error}`);
              }
            })
        );
    }
  }
}
