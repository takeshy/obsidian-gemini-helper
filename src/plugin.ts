import { Plugin, WorkspaceLeaf, Notice } from "obsidian";
import EventEmitter from "events";
import { ChatView, VIEW_TYPE_GEMINI_CHAT } from "src/ui/ChatView";
import { SettingsTab } from "src/ui/SettingsTab";
import {
  type GeminiHelperSettings,
  DEFAULT_SETTINGS,
} from "src/types";
import { initGeminiClient, resetGeminiClient } from "src/core/gemini";
import {
  initFileSearchManager,
  resetFileSearchManager,
  type SyncResult,
} from "src/core/fileSearch";

let pluginInstance: GeminiHelperPlugin;

export class GeminiHelperPlugin extends Plugin {
  settings!: GeminiHelperSettings;
  settingsEmitter = new EventEmitter();

  async onload() {
    pluginInstance = this;

    // Load settings
    await this.loadSettings();

    // Initialize Gemini client if API key is set
    if (this.settings.googleApiKey) {
      this.initializeClients();
    }

    // Add settings tab
    this.addSettingTab(new SettingsTab(this.app, this));

    // Register chat view
    this.registerView(
      VIEW_TYPE_GEMINI_CHAT,
      (leaf) => new ChatView(leaf, this)
    );

    // Ensure chat view exists on layout ready
    this.app.workspace.onLayoutReady(async () => {
      await this.ensureChatViewExists();
    });

    // Add ribbon icon
    this.addRibbonIcon("message-square", "Open Gemini Chat", () => {
      this.activateChatView();
    });

    // Add command to open chat
    this.addCommand({
      id: "open-gemini-chat",
      name: "Open Gemini Chat",
      callback: () => {
        this.activateChatView();
      },
    });

    // Add command to sync vault (RAG)
    this.addCommand({
      id: "sync-vault-rag",
      name: "Sync vault for RAG",
      callback: () => {
        this.syncVaultForRAG();
      },
    });
  }

  async onunload() {
    resetGeminiClient();
    resetFileSearchManager();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.settingsEmitter.emit("settings-updated", this.settings);

    // Reinitialize clients if API key changed
    if (this.settings.googleApiKey) {
      this.initializeClients();
    }
  }

  private initializeClients() {
    initGeminiClient(this.settings.googleApiKey, this.settings.model);
    initFileSearchManager(this.settings.googleApiKey, this.app);
  }

  private async ensureChatViewExists() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GEMINI_CHAT);
    if (leaves.length === 0) {
      let leaf = this.app.workspace.getRightLeaf(false);
      if (!leaf) {
        leaf = this.app.workspace.getRightLeaf(true);
      }
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_GEMINI_CHAT,
          active: false,
        });
      }
    }
  }

  async activateChatView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;

    const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_GEMINI_CHAT);
    if (existingLeaves.length > 0) {
      leaf = existingLeaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_GEMINI_CHAT,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  async syncVaultForRAG(
    onProgress?: (
      current: number,
      total: number,
      fileName: string,
      action: "upload" | "skip" | "delete"
    ) => void
  ): Promise<SyncResult | null> {
    const fileSearchManager = await import("src/core/fileSearch").then(
      (m) => m.getFileSearchManager()
    );

    if (!fileSearchManager) {
      console.error("File Search Manager not initialized");
      new Notice("File Search Manager not initialized. Please set API key.");
      return null;
    }

    if (!this.settings.ragEnabled) {
      new Notice("RAG is not enabled. Enable it in settings first.");
      return null;
    }

    try {
      // Get or create store
      await fileSearchManager.getOrCreateStore("obsidian-vault");

      // Smart sync with checksum-based diff detection
      const result = await fileSearchManager.smartSync(
        this.settings.ragSyncState,
        {
          includeFolders: this.settings.ragIncludeFolders,
          excludePatterns: this.settings.ragExcludePatterns,
        },
        (current, total, fileName, action) => {
          if (this.settings.debugMode) {
            console.log(`[${action}] ${current}/${total}: ${fileName}`);
          }
          onProgress?.(current, total, fileName, action);
        }
      );

      // Save store ID and sync state
      const storeName = fileSearchManager.getStoreName();
      if (storeName) {
        this.settings.ragStoreId = storeName;
      }
      this.settings.ragSyncState = result.newSyncState;
      await this.saveSettings();

      // Log summary
      const summary = `Sync completed: ${result.uploaded.length} uploaded, ${result.skipped.length} skipped, ${result.deleted.length} deleted, ${result.errors.length} errors`;
      new Notice(summary);

      if (result.errors.length > 0 && this.settings.debugMode) {
        console.error("Sync errors:", result.errors);
      }

      return result;
    } catch (error) {
      console.error("Failed to sync vault:", error);
      new Notice(`Sync failed: ${error}`);
      return null;
    }
  }

  // Reset sync state (for troubleshooting)
  async resetSyncState(): Promise<void> {
    this.settings.ragSyncState = {
      files: {},
      lastFullSync: null,
    };
    await this.saveSettings();
    new Notice("Sync state has been reset. Next sync will re-upload all files.");
  }
}

export function getPlugin(): GeminiHelperPlugin {
  if (!pluginInstance) throw new Error("Plugin instance not set yet");
  return pluginInstance;
}

export function getSettings(): GeminiHelperSettings {
  if (!pluginInstance) throw new Error("Plugin instance not set yet");
  return pluginInstance.settings;
}
