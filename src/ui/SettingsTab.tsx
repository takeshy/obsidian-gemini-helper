import {
  PluginSettingTab,
  App,
  Setting,
  DropdownComponent,
  TFolder,
  Notice,
} from "obsidian";
import type { GeminiHelperPlugin } from "src/plugin";
import { getFileSearchManager } from "src/core/fileSearch";

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

    // Chat Settings
    containerEl.createEl("h2", { text: "Chat Settings" });

    // Chat History Folder
    new Setting(containerEl)
      .setName("Chat History Folder")
      .setDesc("Select folder to save chat histories")
      .addDropdown((dropdown: DropdownComponent) => {
        dropdown.addOption("", "Vault Root");

        const folders = this.app.vault
          .getAllLoadedFiles()
          .filter((file) => file instanceof TFolder && !file.isRoot());

        folders.forEach((folder) => {
          dropdown.addOption(folder.path, folder.name);
        });

        dropdown
          .setValue(this.plugin.settings.chatsFolder)
          .onChange(async (value) => {
            this.plugin.settings.chatsFolder = value;
            await this.plugin.saveSettings();
          });
      });

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
            this.display(); // Refresh to show/hide RAG options
          })
      );

    if (this.plugin.settings.ragEnabled) {
      // Auto Sync
      new Setting(containerEl)
        .setName("Auto Sync")
        .setDesc("Automatically sync changed files to RAG store")
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.ragAutoSync)
            .onChange(async (value) => {
              this.plugin.settings.ragAutoSync = value;
              await this.plugin.saveSettings();
            })
        );

      // Include Folders
      new Setting(containerEl)
        .setName("Target Folders")
        .setDesc("Folders to include in RAG indexing (comma-separated). Leave empty to include all folders.")
        .addText((text) =>
          text
            .setPlaceholder("e.g., notes, projects, docs")
            .setValue(this.plugin.settings.ragIncludeFolders.join(", "))
            .onChange(async (value) => {
              this.plugin.settings.ragIncludeFolders = value
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
              await this.plugin.saveSettings();
            })
        );

      // Excluded Patterns (Regex)
      const excludePatternsSetting = new Setting(containerEl)
        .setName("Excluded Patterns (Regex)")
        .setDesc(
          "Regular expression patterns to exclude files (one per line). E.g., ^daily/, \\.excalidraw\\.md$"
        );

      excludePatternsSetting.settingEl.addClass(
        "gemini-helper-settings-textarea-container"
      );

      excludePatternsSetting.addTextArea((text) => {
        text
          .setPlaceholder("^daily/\n\\.excalidraw\\.md$\n^templates/")
          .setValue(this.plugin.settings.ragExcludePatterns.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.ragExcludePatterns = value
              .split("\n")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 4;
        text.inputEl.addClass("gemini-helper-settings-textarea");
      });

      // Sync Status
      const syncState = this.plugin.settings.ragSyncState;
      const syncedCount = Object.keys(syncState.files).length;
      const lastSync = syncState.lastFullSync
        ? new Date(syncState.lastFullSync).toLocaleString()
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

      // RAG Store Info
      if (this.plugin.settings.ragStoreId) {
        new Setting(containerEl)
          .setName("RAG Store ID")
          .setDesc(`Store: ${this.plugin.settings.ragStoreId}`);
      }

      // Advanced RAG Settings
      containerEl.createEl("h3", { text: "Advanced RAG Settings" });

      // Reset Sync State
      new Setting(containerEl)
        .setName("Reset Sync State")
        .setDesc(
          "Clear the local sync state. Next sync will re-check all files (but won't re-upload unchanged files due to checksum comparison)."
        )
        .addButton((btn) =>
          btn.setButtonText("Reset").onClick(async () => {
            const confirmed = confirm(
              "Are you sure you want to reset the sync state?"
            );
            if (!confirmed) return;

            await this.plugin.resetSyncState();
            this.display();
          })
        );

      // Delete Store
      if (this.plugin.settings.ragStoreId) {
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

                const fileSearchManager = getFileSearchManager();
                if (fileSearchManager) {
                  try {
                    // Pass ragStoreId directly since manager may not have it loaded
                    await fileSearchManager.deleteStore(this.plugin.settings.ragStoreId || undefined);
                    this.plugin.settings.ragStoreId = null;
                    this.plugin.settings.ragSyncState = {
                      files: {},
                      lastFullSync: null,
                    };
                    await this.plugin.saveSettings();
                    new Notice("RAG store deleted");
                    this.display();
                  } catch (error) {
                    new Notice(`Failed to delete store: ${error}`);
                  }
                }
              })
          );
      }
    }

    // Developer Settings
    containerEl.createEl("h2", { text: "Developer Settings" });

    new Setting(containerEl)
      .setName("Debug Mode")
      .setDesc("Enable debug logging to console")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.debugMode)
          .onChange(async (value) => {
            this.plugin.settings.debugMode = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
