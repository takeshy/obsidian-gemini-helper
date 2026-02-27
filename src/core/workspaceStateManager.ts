import { App, Notice, Platform } from "obsidian";
import type { EventEmitter } from "../utils/EventEmitter";
import {
  type GeminiHelperSettings,
  type WorkspaceState,
  type RagSetting,
  type RagState,
  type ModelType,
  DEFAULT_WORKSPACE_STATE,
  DEFAULT_RAG_SETTING,
  DEFAULT_RAG_STATE,
  isModelAllowedForPlan,
  getDefaultModelForPlan,
} from "../types";
import { getFileSearchManager, type SyncResult } from "./fileSearch";
import { formatError } from "../utils/error";

const WORKSPACE_STATE_FILENAME = "gemini-workspace.json";
const OLD_WORKSPACE_STATE_FILENAME = ".gemini-workspace.json";
const OLD_RAG_STATE_FILENAME = ".gemini-rag-state.json";

export class WorkspaceStateManager {
  workspaceState: WorkspaceState = { ...DEFAULT_WORKSPACE_STATE };

  constructor(
    private app: App,
    private getSettings: () => GeminiHelperSettings,
    private saveSettingsCallback: () => Promise<void>,
    private settingsEmitter: EventEmitter,
    private loadDataCallback: () => Promise<unknown>
  ) {}

  private get settings(): GeminiHelperSettings {
    return this.getSettings();
  }

  // Get the path to the workspace state file
  getWorkspaceStateFilePath(): string {
    const folder = this.settings.workspaceFolder;
    return folder ? `${folder}/${WORKSPACE_STATE_FILENAME}` : WORKSPACE_STATE_FILENAME;
  }

  // Get the path to the old RAG state file (for migration)
  private getOldRagStateFilePath(): string {
    const folder = this.settings.workspaceFolder;
    return folder ? `${folder}/${OLD_RAG_STATE_FILENAME}` : OLD_RAG_STATE_FILENAME;
  }

  // Get old workspace state file path (for migration)
  private getOldWorkspaceStateFilePath(): string {
    const folder = this.settings.workspaceFolder;
    return folder ? `${folder}/${OLD_WORKSPACE_STATE_FILENAME}` : OLD_WORKSPACE_STATE_FILENAME;
  }

  // Load workspace state from file
  async loadWorkspaceState(): Promise<void> {
    this.workspaceState = { ...DEFAULT_WORKSPACE_STATE };

    const filePath = this.getWorkspaceStateFilePath();

    try {
      let exists = await this.app.vault.adapter.exists(filePath);

      // Migrate from old hidden file name if new file doesn't exist
      if (!exists) {
        const oldFilePath = this.getOldWorkspaceStateFilePath();
        const oldExists = await this.app.vault.adapter.exists(oldFilePath);
        if (oldExists) {
          const content = await this.app.vault.adapter.read(oldFilePath);
          await this.app.vault.adapter.write(filePath, content);
          await this.app.vault.adapter.remove(oldFilePath);
          exists = true;
        }
      }

      if (exists) {
        await this.loadWorkspaceStateFromPath(filePath);

        // Sync FileSearchManager with selected RAG setting's store ID
        this.syncFileSearchManagerWithSelectedRag();
      } else {
        // Check for old RAG state file and migrate
        await this.migrateOldRagStateFile();
      }
    } catch (error) {
      // Log error for debugging
      console.error("Gemini Helper: Failed to load workspace state:", formatError(error));
    }
  }

  private async loadWorkspaceStateFromPath(filePath: string): Promise<void> {
    const content = await this.app.vault.adapter.read(filePath);
    const loaded = JSON.parse(content) as Partial<WorkspaceState>;
    this.workspaceState = { ...DEFAULT_WORKSPACE_STATE, ...loaded };

    // Migrate deprecated model names
    if ((this.workspaceState.selectedModel as string) === "gemini-3-pro-preview") {
      this.workspaceState.selectedModel = "gemini-3.1-pro-preview";
    }

    // Ensure each RAG setting has all required fields (migration for new fields)
    for (const [settingName, setting] of Object.entries(this.workspaceState.ragSettings)) {
      this.workspaceState.ragSettings[settingName] = {
        ...DEFAULT_RAG_SETTING,
        ...setting,
      };
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
        selectedModel: null,
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
    } catch (error) {
      // Log error for debugging
      console.error("Gemini Helper: Migration from old RAG state file failed:", formatError(error));
    }
  }

  // Sync FileSearchManager with currently selected RAG setting
  syncFileSearchManagerWithSelectedRag(): void {
    const fileSearchManager = getFileSearchManager();
    const selectedRag = this.getSelectedRagSetting();

    if (!fileSearchManager) return;

    if (selectedRag?.storeId) {
      fileSearchManager.setStoreName(selectedRag.storeId);
    } else {
      fileSearchManager.setStoreName(null);
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

    // Compute paths explicitly (don't rely on settings which hasn't changed yet)
    const oldFilePath = oldFolder
      ? `${oldFolder}/${WORKSPACE_STATE_FILENAME}`
      : WORKSPACE_STATE_FILENAME;
    const newFilePath = newFolder
      ? `${newFolder}/${WORKSPACE_STATE_FILENAME}`
      : WORKSPACE_STATE_FILENAME;
    const newOldFilePath = newFolder
      ? `${newFolder}/${OLD_WORKSPACE_STATE_FILENAME}`
      : OLD_WORKSPACE_STATE_FILENAME;

    // Check if new folder already has a state file
    const newFileExists = await this.app.vault.adapter.exists(newFilePath);

    if (newFileExists) {
      // Load existing state from new folder
      try {
        await this.loadWorkspaceStateFromPath(newFilePath);
      } catch {
        // Failed to load, keep current state
      }
    } else {
      // Migrate from old hidden file name if present in new folder
      let migratedFromLegacy = false;
      const newOldFileExists = await this.app.vault.adapter.exists(newOldFilePath);
      if (newOldFileExists) {
        try {
          const content = await this.app.vault.adapter.read(newOldFilePath);
          // Ensure new folder exists
          if (newFolder) {
            const folderExists = await this.app.vault.adapter.exists(newFolder);
            if (!folderExists) {
              await this.app.vault.createFolder(newFolder);
            }
          }
          await this.app.vault.adapter.write(newFilePath, content);
          await this.app.vault.adapter.remove(newOldFilePath);
          await this.loadWorkspaceStateFromPath(newFilePath);
          migratedFromLegacy = true;
        } catch {
          // Failed to migrate, continue with copy/save
        }
      }

      // Copy state to new folder (skip if already migrated from legacy file)
      if (!migratedFromLegacy) {
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
            await this.loadWorkspaceStateFromPath(newFilePath);
          } else {
            // No old file, save current state to new location
            // Ensure new folder exists
            if (newFolder) {
              const folderExists = await this.app.vault.adapter.exists(newFolder);
              if (!folderExists) {
                await this.app.vault.createFolder(newFolder);
              }
            }
            const stateContent = JSON.stringify(this.workspaceState, null, 2);
            await this.app.vault.adapter.write(newFilePath, stateContent);
          }
        } catch {
          // Failed to copy, save current state to new location
          try {
            if (newFolder) {
              const folderExists = await this.app.vault.adapter.exists(newFolder);
              if (!folderExists) {
                await this.app.vault.createFolder(newFolder);
              }
            }
            const stateContent = JSON.stringify(this.workspaceState, null, 2);
            await this.app.vault.adapter.write(newFilePath, stateContent);
          } catch {
            // Failed to save, continue anyway
          }
        }
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

  // Select a model
  async selectModel(model: ModelType): Promise<void> {
    this.workspaceState.selectedModel = model;
    await this.saveWorkspaceState();
  }

  // Get selected model
  getSelectedModel(): ModelType {
    const defaultModel = getDefaultModelForPlan(this.settings.apiPlan);
    const selected = this.workspaceState.selectedModel || defaultModel;

    // CLI models are only allowed on desktop if verified
    const cliConfig = this.settings.cliConfig;
    if (selected === "gemini-cli") {
      if (Platform.isMobile || !cliConfig?.cliVerified) {
        return defaultModel;
      }
      return selected;
    }
    if (selected === "claude-cli") {
      if (Platform.isMobile || !cliConfig?.claudeCliVerified) {
        return defaultModel;
      }
      return selected;
    }
    if (selected === "codex-cli") {
      if (Platform.isMobile || !cliConfig?.codexCliVerified) {
        return defaultModel;
      }
      return selected;
    }

    return isModelAllowedForPlan(this.settings.apiPlan, selected)
      ? selected
      : defaultModel;
  }

  // Create a new RAG setting
  async createRagSetting(name: string, setting?: Partial<RagSetting>): Promise<void> {
    if (this.workspaceState.ragSettings[name]) {
      throw new Error(`Semantic search setting "${name}" already exists`);
    }

    this.workspaceState.ragSettings[name] = {
      ...DEFAULT_RAG_SETTING,
      ...setting,
    };

    await this.saveWorkspaceState();
    this.settingsEmitter.emit("workspace-state-loaded", this.workspaceState);
  }

  // Update a RAG setting
  async updateRagSetting(name: string, updates: Partial<RagSetting>): Promise<void> {
    const existing = this.workspaceState.ragSettings[name];
    if (!existing) {
      throw new Error(`Semantic search setting "${name}" not found`);
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
    this.settingsEmitter.emit("workspace-state-loaded", this.workspaceState);
  }

  // Rename a RAG setting
  async renameRagSetting(oldName: string, newName: string): Promise<void> {
    if (!this.workspaceState.ragSettings[oldName]) {
      throw new Error(`Semantic search setting "${oldName}" not found`);
    }
    if (this.workspaceState.ragSettings[newName]) {
      throw new Error(`Semantic search setting "${newName}" already exists`);
    }

    this.workspaceState.ragSettings[newName] = this.workspaceState.ragSettings[oldName];
    delete this.workspaceState.ragSettings[oldName];

    // Update selection if needed
    if (this.workspaceState.selectedRagSetting === oldName) {
      this.workspaceState.selectedRagSetting = newName;
    }

    await this.saveWorkspaceState();
    this.settingsEmitter.emit("workspace-state-loaded", this.workspaceState);
  }

  // Reset sync state for a RAG setting
  async resetRagSettingSyncState(name: string): Promise<void> {
    const setting = this.workspaceState.ragSettings[name];
    if (!setting) {
      throw new Error(`Semantic search setting "${name}" not found`);
    }

    this.workspaceState.ragSettings[name] = {
      ...setting,
      files: {},
      lastFullSync: null,
    };

    await this.saveWorkspaceState();
    new Notice("Sync state has been reset. Next sync will re-upload all files.");
  }

  // Get vault name for store naming
  getVaultStoreName(): string {
    const vaultName = this.app.vault.getName();
    return `obsidian-${vaultName}`;
  }

  // Sync vault files for RAG
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
      new Notice("File search manager not initialized. Please set API key.");
      return null;
    }

    if (!this.settings.ragEnabled) {
      new Notice("Semantic search is not enabled. Enable it in settings first.");
      return null;
    }

    // Determine which RAG setting to sync
    const settingName = ragSettingName || this.workspaceState.selectedRagSetting;
    if (!settingName) {
      new Notice("No semantic search setting selected. Please select or create a semantic search setting first.");
      return null;
    }

    const ragSetting = this.workspaceState.ragSettings[settingName];
    if (!ragSetting) {
      new Notice(`Semantic search setting "${settingName}" not found.`);
      return null;
    }

    // Ensure a new setting doesn't inherit a previous store
    if (!ragSetting.storeId) {
      fileSearchManager.setStoreName(null);
    }

    // External stores cannot be synced
    if (ragSetting.isExternal) {
      new Notice("Cannot sync external semantic search store. Only internal stores can be synced.");
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
      this.settingsEmitter.emit("workspace-state-loaded", this.workspaceState);

      // Log summary
      const summary = `Sync completed: ${result.uploaded.length} uploaded, ${result.skipped.length} skipped, ${result.deleted.length} deleted, ${result.errors.length} errors`;
      new Notice(summary);

      return result;
    } catch (error) {
      new Notice(`Sync failed: ${formatError(error)}`);
      return null;
    }
  }

  // Delete RAG store from server
  async deleteRagStore(ragSettingName: string): Promise<void> {
    const ragSetting = this.workspaceState.ragSettings[ragSettingName];
    if (!ragSetting) {
      throw new Error(`Semantic search setting "${ragSettingName}" not found`);
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
    this.settingsEmitter.emit("workspace-state-loaded", this.workspaceState);
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

  // Migrate from old settings format
  async migrateFromOldSettings(): Promise<void> {
    const data = await this.loadDataCallback() as Record<string, unknown> | undefined;
    if (!data) return;

    let needsSave = false;

    // Migrate chatsFolder to workspaceFolder
    if (data.chatsFolder !== undefined && data.workspaceFolder === undefined) {
      data.workspaceFolder = data.chatsFolder;
      delete data.chatsFolder;
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
        selectedModel: null,
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
      // The caller must handle saving the modified data
      // Since we can't directly save plugin data from here, we emit an event
      this.settingsEmitter.emit("migration-data-modified", data);
    }
  }

}
