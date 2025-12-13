import { Plugin, WorkspaceLeaf, Notice } from "obsidian";
import EventEmitter from "events";
import { ChatView, VIEW_TYPE_GEMINI_CHAT } from "src/ui/ChatView";
import { SettingsTab } from "src/ui/SettingsTab";
import {
  type GeminiHelperSettings,
  type WorkspaceState,
  type RagSetting,
  type RagState,
  DEFAULT_SETTINGS,
  DEFAULT_WORKSPACE_STATE,
  DEFAULT_RAG_SETTING,
  DEFAULT_RAG_STATE,
} from "src/types";
import { initGeminiClient, resetGeminiClient } from "src/core/gemini";
import {
  initFileSearchManager,
  resetFileSearchManager,
  getFileSearchManager,
  type SyncResult,
} from "src/core/fileSearch";

const WORKSPACE_STATE_FILENAME = ".gemini-workspace.json";
const OLD_RAG_STATE_FILENAME = ".gemini-rag-state.json";

let pluginInstance: GeminiHelperPlugin;

export class GeminiHelperPlugin extends Plugin {
  settings!: GeminiHelperSettings;
  workspaceState: WorkspaceState = { ...DEFAULT_WORKSPACE_STATE };
  settingsEmitter = new EventEmitter();

  onload(): void {
    pluginInstance = this;

    // Load settings and workspace state
    void this.loadSettings().then(async () => {
      // Migrate from old settings format first (one-time)
      await this.migrateFromOldSettings();
      await this.loadWorkspaceState();
      // Initialize Gemini client if API key is set
      if (this.settings.googleApiKey) {
        this.initializeClients();
      }
      // Emit event to refresh UI after workspace state is loaded
      this.settingsEmitter.emit("workspace-state-loaded", this.workspaceState);
    });

    // Add settings tab
    this.addSettingTab(new SettingsTab(this.app, this));

    // Register chat view
    this.registerView(
      VIEW_TYPE_GEMINI_CHAT,
      (leaf) => new ChatView(leaf, this)
    );

    // Ensure chat view exists on layout ready
    this.app.workspace.onLayoutReady(() => {
      void this.ensureChatViewExists();
    });

    // Add ribbon icon
    this.addRibbonIcon("message-square", "Open chat", () => {
      void this.activateChatView();
    });

    // Add command to open chat
    this.addCommand({
      id: "open-chat",
      name: "Open chat",
      callback: () => {
        void this.activateChatView();
      },
    });

    // Add command to sync vault (RAG)
    this.addCommand({
      id: "sync-vault-rag",
      name: "Sync vault for RAG",
      callback: () => {
        void this.syncVaultForRAG();
      },
    });
  }

  onunload(): void {
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

  // Get the path to the workspace state file
  private getWorkspaceStateFilePath(): string {
    const folder = this.settings.workspaceFolder || "";
    return folder ? `${folder}/${WORKSPACE_STATE_FILENAME}` : WORKSPACE_STATE_FILENAME;
  }

  // Get the path to the old RAG state file (for migration)
  private getOldRagStateFilePath(): string {
    const folder = this.settings.workspaceFolder || "";
    return folder ? `${folder}/${OLD_RAG_STATE_FILENAME}` : OLD_RAG_STATE_FILENAME;
  }

  // Load workspace state from file
  async loadWorkspaceState(): Promise<void> {
    this.workspaceState = { ...DEFAULT_WORKSPACE_STATE };

    const filePath = this.getWorkspaceStateFilePath();

    try {
      const exists = await this.app.vault.adapter.exists(filePath);
      if (exists) {
        const content = await this.app.vault.adapter.read(filePath);
        const loaded = JSON.parse(content) as Partial<WorkspaceState>;
        this.workspaceState = { ...DEFAULT_WORKSPACE_STATE, ...loaded };

        // Ensure each RAG setting has all required fields (migration for new fields)
        for (const [settingName, setting] of Object.entries(this.workspaceState.ragSettings)) {
          this.workspaceState.ragSettings[settingName] = {
            ...DEFAULT_RAG_SETTING,
            ...setting,
          };
        }

        // Sync FileSearchManager with selected RAG setting's store ID
        this.syncFileSearchManagerWithSelectedRag();
      } else {
        // Check for old RAG state file and migrate
        await this.migrateOldRagStateFile();
      }
    } catch {
      // Failed to load, use default
    }
  }

  // Migrate old .gemini-rag-state.json to new format
  private async migrateOldRagStateFile(): Promise<void> {
    const oldFilePath = this.getOldRagStateFilePath();

    try {
      const exists = await this.app.vault.adapter.exists(oldFilePath);
      if (!exists) return;

      const content = await this.app.vault.adapter.read(oldFilePath);
      const oldState = JSON.parse(content) as Partial<RagState>;

      // Convert old format to new RagSetting
      // Detect external store: has storeId but no storeName
      const isExternal = !!(oldState.storeId && !oldState.storeName);
      const ragSetting: RagSetting = {
        storeId: isExternal ? null : (oldState.storeId || null),
        storeIds: isExternal && oldState.storeId ? [oldState.storeId] : [],
        storeName: oldState.storeName || null,
        isExternal,
        targetFolders: oldState.includeFolders || [],
        excludePatterns: oldState.excludePatterns || [],
        files: oldState.files || {},
        lastFullSync: oldState.lastFullSync || null,
      };

      // Create default name based on store name or "default"
      const settingName = oldState.storeName || "default";

      this.workspaceState = {
        selectedRagSetting: settingName,
        ragSettings: {
          [settingName]: ragSetting,
        },
      };

      // Save new format
      await this.saveWorkspaceState();

      // Delete old file
      await this.app.vault.adapter.remove(oldFilePath);

      // Sync FileSearchManager
      this.syncFileSearchManagerWithSelectedRag();
    } catch {
      // Migration failed, continue with default
    }
  }

  // Sync FileSearchManager with currently selected RAG setting
  private syncFileSearchManagerWithSelectedRag(): void {
    const fileSearchManager = getFileSearchManager();
    const selectedRag = this.getSelectedRagSetting();

    if (fileSearchManager && selectedRag?.storeId) {
      fileSearchManager.setStoreName(selectedRag.storeId);
    }
  }

  // Load workspace state, create file if not exists
  async loadOrCreateWorkspaceState(): Promise<void> {
    await this.loadWorkspaceState();

    const filePath = this.getWorkspaceStateFilePath();
    const exists = await this.app.vault.adapter.exists(filePath);
    if (!exists) {
      await this.saveWorkspaceState();
    }
  }

  // Save workspace state to file
  async saveWorkspaceState(): Promise<void> {
    const filePath = this.getWorkspaceStateFilePath();
    const content = JSON.stringify(this.workspaceState, null, 2);

    // Ensure folder exists
    const folder = this.settings.workspaceFolder;
    if (folder) {
      const folderExists = await this.app.vault.adapter.exists(folder);
      if (!folderExists) {
        await this.app.vault.createFolder(folder);
      }
    }

    await this.app.vault.adapter.write(filePath, content);
  }

  // Change workspace folder and migrate state file
  async changeWorkspaceFolder(newFolder: string): Promise<void> {
    const oldFolder = this.settings.workspaceFolder;

    // If same folder, do nothing
    if (oldFolder === newFolder) return;

    const oldFilePath = this.getWorkspaceStateFilePath();

    // Update settings first
    this.settings.workspaceFolder = newFolder;
    await this.saveSettings();

    // Check if new folder already has a state file
    const newFilePath = this.getWorkspaceStateFilePath();
    const newFileExists = await this.app.vault.adapter.exists(newFilePath);

    if (newFileExists) {
      // Load existing state from new folder
      await this.loadWorkspaceState();
    } else {
      // Copy state to new folder
      try {
        const oldFileExists = await this.app.vault.adapter.exists(oldFilePath);
        if (oldFileExists) {
          const content = await this.app.vault.adapter.read(oldFilePath);

          // Ensure new folder exists
          if (newFolder) {
            const folderExists = await this.app.vault.adapter.exists(newFolder);
            if (!folderExists) {
              await this.app.vault.createFolder(newFolder);
            }
          }

          // Write to new location
          await this.app.vault.adapter.write(newFilePath, content);
        } else {
          // No old file, save current state to new location
          await this.saveWorkspaceState();
        }
      } catch {
        // Failed to copy, just save current state
        await this.saveWorkspaceState();
      }
    }

    // Sync FileSearchManager with selected RAG
    this.syncFileSearchManagerWithSelectedRag();

    // Emit event
    this.settingsEmitter.emit("workspace-state-loaded", this.workspaceState);
  }

  // Get currently selected RAG setting
  getSelectedRagSetting(): RagSetting | null {
    const name = this.workspaceState.selectedRagSetting;
    if (!name) return null;
    return this.workspaceState.ragSettings[name] || null;
  }

  // Get RAG setting by name
  getRagSetting(name: string): RagSetting | null {
    return this.workspaceState.ragSettings[name] || null;
  }

  // Get all RAG setting names
  getRagSettingNames(): string[] {
    return Object.keys(this.workspaceState.ragSettings);
  }

  // Select a RAG setting
  async selectRagSetting(name: string | null): Promise<void> {
    this.workspaceState.selectedRagSetting = name;
    await this.saveWorkspaceState();
    this.syncFileSearchManagerWithSelectedRag();
    this.settingsEmitter.emit("rag-setting-changed", name);
  }

  // Create a new RAG setting
  async createRagSetting(name: string, setting?: Partial<RagSetting>): Promise<void> {
    if (this.workspaceState.ragSettings[name]) {
      throw new Error(`RAG setting "${name}" already exists`);
    }

    this.workspaceState.ragSettings[name] = {
      ...DEFAULT_RAG_SETTING,
      ...setting,
    };

    await this.saveWorkspaceState();
  }

  // Update a RAG setting
  async updateRagSetting(name: string, updates: Partial<RagSetting>): Promise<void> {
    const existing = this.workspaceState.ragSettings[name];
    if (!existing) {
      throw new Error(`RAG setting "${name}" not found`);
    }

    this.workspaceState.ragSettings[name] = {
      ...existing,
      ...updates,
    };

    await this.saveWorkspaceState();

    // If this is the selected setting, sync FileSearchManager
    if (name === this.workspaceState.selectedRagSetting) {
      this.syncFileSearchManagerWithSelectedRag();
    }
  }

  // Delete a RAG setting
  async deleteRagSetting(name: string): Promise<void> {
    if (!this.workspaceState.ragSettings[name]) {
      return;
    }

    delete this.workspaceState.ragSettings[name];

    // If this was the selected setting, clear selection
    if (this.workspaceState.selectedRagSetting === name) {
      this.workspaceState.selectedRagSetting = null;
    }

    await this.saveWorkspaceState();
  }

  // Rename a RAG setting
  async renameRagSetting(oldName: string, newName: string): Promise<void> {
    if (!this.workspaceState.ragSettings[oldName]) {
      throw new Error(`RAG setting "${oldName}" not found`);
    }
    if (this.workspaceState.ragSettings[newName]) {
      throw new Error(`RAG setting "${newName}" already exists`);
    }

    this.workspaceState.ragSettings[newName] = this.workspaceState.ragSettings[oldName];
    delete this.workspaceState.ragSettings[oldName];

    // Update selection if needed
    if (this.workspaceState.selectedRagSetting === oldName) {
      this.workspaceState.selectedRagSetting = newName;
    }

    await this.saveWorkspaceState();
  }

  // Reset sync state for a RAG setting
  async resetRagSettingSyncState(name: string): Promise<void> {
    const setting = this.workspaceState.ragSettings[name];
    if (!setting) {
      throw new Error(`RAG setting "${name}" not found`);
    }

    this.workspaceState.ragSettings[name] = {
      ...setting,
      files: {},
      lastFullSync: null,
    };

    await this.saveWorkspaceState();
    new Notice("Sync state has been reset. Next sync will re-upload all files.");
  }

  // Migrate from old settings format
  private async migrateFromOldSettings(): Promise<void> {
    const data = await this.loadData();
    if (!data) return;

    let needsSave = false;

    // Migrate chatsFolder to workspaceFolder
    if (data.chatsFolder !== undefined && data.workspaceFolder === undefined) {
      data.workspaceFolder = data.chatsFolder;
      delete data.chatsFolder;
      this.settings.workspaceFolder = data.workspaceFolder as string;
      needsSave = true;
    }

    // Check for old RAG format fields in settings (very old format)
    const oldStoreId = data.ragStoreId as string | null | undefined;
    const oldSyncState = data.ragSyncState as { files?: Record<string, unknown>; lastFullSync?: number | null } | undefined;
    const oldIncludeFolders = data.ragIncludeFolders as string[] | undefined;
    const oldExcludePatterns = data.ragExcludePatterns as string[] | undefined;

    if (oldStoreId || (oldSyncState && Object.keys(oldSyncState.files || {}).length > 0) || oldIncludeFolders || oldExcludePatterns) {
      // Migrate to new workspace state format
      const ragSetting: RagSetting = {
        storeId: oldStoreId || null,
        storeIds: [],
        storeName: null,
        isExternal: false,
        targetFolders: oldIncludeFolders || [],
        excludePatterns: oldExcludePatterns || [],
        files: (oldSyncState?.files || {}) as RagSetting["files"],
        lastFullSync: oldSyncState?.lastFullSync || null,
      };

      this.workspaceState = {
        selectedRagSetting: "default",
        ragSettings: {
          default: ragSetting,
        },
      };

      // Save to new state file
      await this.saveWorkspaceState();

      // Remove old fields from settings
      delete data.ragStoreId;
      delete data.ragSyncState;
      delete data.ragAutoSync;
      delete data.ragIncludeFolders;
      delete data.ragExcludePatterns;
      needsSave = true;

      // Sync FileSearchManager
      this.syncFileSearchManagerWithSelectedRag();
    }

    if (needsSave) {
      await this.saveData(data);
    }
  }

  // Get vault name for store naming
  getVaultStoreName(): string {
    const vaultName = this.app.vault.getName();
    return `obsidian-${vaultName}`;
  }

  private initializeClients() {
    initGeminiClient(this.settings.googleApiKey, this.settings.model);
    initFileSearchManager(this.settings.googleApiKey, this.app);

    // Sync FileSearchManager with selected RAG setting
    this.syncFileSearchManagerWithSelectedRag();
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
    ragSettingName?: string,
    onProgress?: (
      current: number,
      total: number,
      fileName: string,
      action: "upload" | "skip" | "delete"
    ) => void
  ): Promise<SyncResult | null> {
    const fileSearchManager = getFileSearchManager();

    if (!fileSearchManager) {
      new Notice("File Search Manager not initialized. Please set API key.");
      return null;
    }

    if (!this.settings.ragEnabled) {
      new Notice("RAG is not enabled. Enable it in settings first.");
      return null;
    }

    // Determine which RAG setting to sync
    const settingName = ragSettingName || this.workspaceState.selectedRagSetting;
    if (!settingName) {
      new Notice("No RAG setting selected. Please select or create a RAG setting first.");
      return null;
    }

    const ragSetting = this.workspaceState.ragSettings[settingName];
    if (!ragSetting) {
      new Notice(`RAG setting "${settingName}" not found.`);
      return null;
    }

    // External stores cannot be synced
    if (ragSetting.isExternal) {
      new Notice("Cannot sync external RAG store. Only internal stores can be synced.");
      return null;
    }

    try {
      // Get or create store with setting-specific name
      const storeName = ragSetting.storeName || `${this.getVaultStoreName()}-${settingName}`;
      const storeId = await fileSearchManager.getOrCreateStore(storeName);

      // If store ID changed, clear files to force re-upload
      let currentSyncState = { files: ragSetting.files, lastFullSync: ragSetting.lastFullSync };
      if (ragSetting.storeId && ragSetting.storeId !== storeId) {
        // Store changed, need to re-upload all files
        currentSyncState = { files: {}, lastFullSync: null };
        new Notice("Store changed. Re-uploading all files...");
      }

      // Smart sync with checksum-based diff detection
      const result = await fileSearchManager.smartSync(
        currentSyncState,
        {
          includeFolders: ragSetting.targetFolders,
          excludePatterns: ragSetting.excludePatterns,
        },
        (current, total, fileName, action) => {
          onProgress?.(current, total, fileName, action);
        }
      );

      // Save store ID and sync state
      const finalStoreId = fileSearchManager.getStoreName();
      this.workspaceState.ragSettings[settingName] = {
        ...ragSetting,
        storeId: finalStoreId,
        storeName: storeName,
        files: result.newSyncState.files,
        lastFullSync: result.newSyncState.lastFullSync,
      };
      await this.saveWorkspaceState();

      // Log summary
      const summary = `Sync completed: ${result.uploaded.length} uploaded, ${result.skipped.length} skipped, ${result.deleted.length} deleted, ${result.errors.length} errors`;
      new Notice(summary);

      return result;
    } catch (error) {
      new Notice(`Sync failed: ${error}`);
      return null;
    }
  }

  // Delete RAG store from server
  async deleteRagStore(ragSettingName: string): Promise<void> {
    const ragSetting = this.workspaceState.ragSettings[ragSettingName];
    if (!ragSetting) {
      throw new Error(`RAG setting "${ragSettingName}" not found`);
    }

    if (!ragSetting.storeId) {
      throw new Error("No store ID to delete");
    }

    // External stores should not be deleted
    if (ragSetting.isExternal) {
      throw new Error("Cannot delete external store");
    }

    const fileSearchManager = getFileSearchManager();
    if (!fileSearchManager) {
      throw new Error("File Search Manager not initialized");
    }

    await fileSearchManager.deleteStore(ragSetting.storeId);

    // Clear the setting's store info
    this.workspaceState.ragSettings[ragSettingName] = {
      ...ragSetting,
      storeId: null,
      storeName: null,
      files: {},
      lastFullSync: null,
    };

    await this.saveWorkspaceState();
  }

  // Legacy compatibility: ragState getter
  get ragState(): RagState {
    const selected = this.getSelectedRagSetting();
    if (!selected) {
      return { ...DEFAULT_RAG_STATE };
    }
    // For external stores, use first storeId from storeIds array
    const storeId = selected.isExternal
      ? (selected.storeIds[0] || null)
      : selected.storeId;
    return {
      storeId,
      storeName: selected.storeName,
      files: selected.files,
      lastFullSync: selected.lastFullSync,
      includeFolders: selected.targetFolders,
      excludePatterns: selected.excludePatterns,
    };
  }

  // Get all store IDs for the selected RAG setting (for external stores with multiple IDs)
  getSelectedStoreIds(): string[] {
    const selected = this.getSelectedRagSetting();
    if (!selected) return [];
    if (selected.isExternal) {
      return selected.storeIds;
    }
    return selected.storeId ? [selected.storeId] : [];
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
