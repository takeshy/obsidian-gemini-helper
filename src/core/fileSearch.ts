import { GoogleGenAI } from "@google/genai";
import type { TFile, App } from "obsidian";
import type {
  SyncStatus,
  RagSyncState,
} from "src/types";
import { formatError } from "src/utils/error";

export interface SyncResult {
  uploaded: string[];
  skipped: string[];
  deleted: string[];
  errors: Array<{ path: string; error: string }>;
  newSyncState: RagSyncState;
}

// Sync status query result types
export interface FileSyncStatus {
  path: string;
  isSynced: boolean;
  importedAt: number | null;
  hasDiff: boolean;
  currentChecksum: string | null;
  syncedChecksum: string | null;
}

export interface DirectoryUnsyncedResult {
  directory: string;
  unsyncedFiles: Array<{
    path: string;
    reason: "not_imported" | "has_diff";
  }>;
  totalFiles: number;
  syncedCount: number;
}

export interface VaultSyncSummary {
  totalFiles: number;
  syncedFiles: number;
  unsyncedFiles: number;
  filesWithDiff: number;
  lastFullSync: number | null;
}

export interface FilterConfig {
  includeFolders: string[];  // 対象フォルダ（空の場合は全体）
  excludePatterns: string[]; // 正規表現パターンで除外
}

export class FileSearchManager {
  private ai: GoogleGenAI;
  private app: App;
  private storeName: string | null = null;
  private syncStatus: SyncStatus = {
    lastSync: null,
    syncedFiles: [],
    pendingFiles: [],
    isRunning: false,
  };

  constructor(apiKey: string, app: App) {
    this.ai = new GoogleGenAI({ apiKey });
    this.app = app;
  }

  // Calculate checksum (simple hash based on content)
  private async calculateChecksum(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Check if file should be included based on filter config
  private shouldInclude(filePath: string, config: FilterConfig): boolean {
    // Check include folders (if empty, include all)
    if (config.includeFolders.length > 0) {
      let isInIncludedFolder = false;
      for (const folder of config.includeFolders) {
        const normalizedFolder = folder.replace(/\/$/, "");
        if (
          filePath.startsWith(normalizedFolder + "/") ||
          filePath === normalizedFolder
        ) {
          isInIncludedFolder = true;
          break;
        }
      }
      if (!isInIncludedFolder) {
        return false;
      }
    }

    // Check regex pattern exclusions
    for (const pattern of config.excludePatterns) {
      try {
        const regex = new RegExp(pattern);
        if (regex.test(filePath)) {
          return false;
        }
      } catch {
        // Invalid regex pattern, skip
      }
    }

    return true;
  }

  // Create a new File Search Store
  async createStore(displayName: string): Promise<string> {
    const store = await this.ai.fileSearchStores.create({
      config: { displayName },
    });

    if (!store.name) {
      throw new Error("Failed to create store: no name returned");
    }

    this.storeName = store.name;
    return store.name;
  }

  // Get existing store or create new one
  async getOrCreateStore(displayName: string): Promise<string> {
    if (this.storeName) {
      return this.storeName;
    }

    // Try to list existing stores and find matching one
    try {
      const pager = await this.ai.fileSearchStores.list();
      for await (const store of pager) {
        if (store.displayName === displayName && store.name) {
          this.storeName = store.name;
          return store.name;
        }
      }
    } catch {
      // Failed to list stores, will create new one
    }

    // Create new store if not found
    return this.createStore(displayName);
  }

  // Set store name (for loading from settings)
  setStoreName(storeName: string | null): void {
    this.storeName = storeName;
  }

  // Get current store name
  getStoreName(): string | null {
    return this.storeName;
  }

  // Upload a single file to the store and return file ID
  async uploadFile(file: TFile): Promise<string | null> {
    if (!this.storeName) {
      throw new Error("No File Search Store configured");
    }

    const content = await this.app.vault.read(file);

    const blob = new Blob([content], { type: "text/markdown" });

    const operation = await this.ai.fileSearchStores.uploadToFileSearchStore({
      file: blob,
      fileSearchStoreName: this.storeName,
      config: {
        displayName: file.path,
      },
    });

    return operation?.name ?? null;
  }

  // Delete a file from the store
  async deleteFileFromStore(fileId: string): Promise<void> {
    if (!this.storeName) {
      throw new Error("No File Search Store configured");
    }

    try {
      // Try to delete the file using the files API
      await this.ai.files.delete({ name: fileId });
    } catch {
      // File deletion might not be supported or file already deleted
    }
  }

  // Smart sync with checksum-based diff detection
  async smartSync(
    currentSyncState: RagSyncState,
    filterConfig: FilterConfig,
    onProgress?: (
      current: number,
      total: number,
      fileName: string,
      action: "upload" | "skip" | "delete"
    ) => void
  ): Promise<SyncResult> {
    if (!this.storeName) {
      throw new Error("No File Search Store configured");
    }

    if (this.syncStatus.isRunning) {
      throw new Error("Sync is already running");
    }

    this.syncStatus.isRunning = true;

    const result: SyncResult = {
      uploaded: [],
      skipped: [],
      deleted: [],
      errors: [],
      newSyncState: {
        files: { ...currentSyncState.files },
        lastFullSync: Date.now(),
      },
    };

    try {
      // Get all markdown files from vault
      const vaultFiles = this.app.vault.getMarkdownFiles();

      // Filter to included files only
      const eligibleFiles = vaultFiles.filter(
        (f) => this.shouldInclude(f.path, filterConfig)
      );

      // Create a set of current file paths
      const currentFilePaths = new Set(eligibleFiles.map((f) => f.path));

      // Find deleted files (in sync state but not in vault)
      const deletedPaths = Object.keys(currentSyncState.files).filter(
        (path) => !currentFilePaths.has(path)
      );

      const totalOperations =
        eligibleFiles.length + deletedPaths.length;
      let currentOperation = 0;

      // Process deletions first
      for (const deletedPath of deletedPaths) {
        currentOperation++;
        onProgress?.(
          currentOperation,
          totalOperations,
          deletedPath,
          "delete"
        );

        const fileInfo = currentSyncState.files[deletedPath];
        if (fileInfo?.fileId) {
          try {
            await this.deleteFileFromStore(fileInfo.fileId);
            result.deleted.push(deletedPath);
          } catch (error) {
            result.errors.push({
              path: deletedPath,
              error: `Delete failed: ${formatError(error)}`,
            });
          }
        }
        // Remove from sync state regardless of API success
        delete result.newSyncState.files[deletedPath];
      }

      // Prepare files for processing (calculate checksums first)
      const filesToProcess: Array<{
        file: TFile;
        content: string;
        checksum: string;
        needsUpload: boolean;
      }> = [];

      for (const file of eligibleFiles) {
        const content = await this.app.vault.read(file);
        const newChecksum = await this.calculateChecksum(content);
        const existingInfo = currentSyncState.files[file.path];

        const needsUpload = !existingInfo || existingInfo.checksum !== newChecksum;
        filesToProcess.push({ file, content, checksum: newChecksum, needsUpload });
      }

      // Separate files to upload and skip
      const filesToUpload = filesToProcess.filter(f => f.needsUpload);
      const filesToSkip = filesToProcess.filter(f => !f.needsUpload);

      // Process skipped files
      for (const { file } of filesToSkip) {
        currentOperation++;
        onProgress?.(currentOperation, totalOperations, file.path, "skip");
        result.skipped.push(file.path);
      }

      // Parallel upload with concurrency limit
      const CONCURRENCY_LIMIT = 5;
      const uploadQueue = [...filesToUpload];

      const uploadFile = async (item: typeof filesToUpload[0]) => {
        currentOperation++;
        onProgress?.(currentOperation, totalOperations, item.file.path, "upload");

        try {
          const fileId = await this.uploadFile(item.file);

          result.uploaded.push(item.file.path);
          result.newSyncState.files[item.file.path] = {
            checksum: item.checksum,
            uploadedAt: Date.now(),
            fileId,
          };

          // Update sync status
          if (!this.syncStatus.syncedFiles.includes(item.file.path)) {
            this.syncStatus.syncedFiles.push(item.file.path);
          }
        } catch (error) {
          result.errors.push({
            path: item.file.path,
            error: `Upload failed: ${formatError(error)}`,
          });
        }
      };

      // Process uploads in parallel batches
      while (uploadQueue.length > 0) {
        const batch = uploadQueue.splice(0, CONCURRENCY_LIMIT);
        await Promise.all(batch.map(uploadFile));
      }

      this.syncStatus.lastSync = Date.now();
    } finally {
      this.syncStatus.isRunning = false;
    }

    return result;
  }

  // Legacy sync method for backwards compatibility
  async syncVault(
    includeFolders: string[] = [],
    onProgress?: (current: number, total: number, fileName: string) => void
  ): Promise<void> {
    await this.smartSync(
      { files: {}, lastFullSync: null },
      { includeFolders, excludePatterns: [] },
      (current, total, fileName) => {
        onProgress?.(current, total, fileName);
      }
    );
  }

  // Delete store
  async deleteStore(storeNameOverride?: string): Promise<void> {
    const targetStore = storeNameOverride || this.storeName;
    if (!targetStore) {
      return;
    }

    await this.ai.fileSearchStores.delete({ name: targetStore, config: { force: true } });
    this.storeName = null;
    this.syncStatus = {
      lastSync: null,
      syncedFiles: [],
      pendingFiles: [],
      isRunning: false,
    };
  }

  // Query sync status for a specific file
  async getFileSyncStatus(
    filePath: string,
    syncState: RagSyncState
  ): Promise<FileSyncStatus> {
    const file = this.app.vault.getAbstractFileByPath(filePath);

    if (!file || !(file instanceof this.app.vault.adapter.constructor)) {
      // Try to find as TFile
      const tfile = this.app.vault.getMarkdownFiles().find(f => f.path === filePath);
      if (!tfile) {
        return {
          path: filePath,
          isSynced: false,
          importedAt: null,
          hasDiff: false,
          currentChecksum: null,
          syncedChecksum: null,
        };
      }
    }

    const syncInfo = syncState.files[filePath];

    if (!syncInfo) {
      // File not synced
      const tfile = this.app.vault.getMarkdownFiles().find(f => f.path === filePath);
      let currentChecksum: string | null = null;
      if (tfile) {
        const content = await this.app.vault.read(tfile);
        currentChecksum = await this.calculateChecksum(content);
      }
      return {
        path: filePath,
        isSynced: false,
        importedAt: null,
        hasDiff: false,
        currentChecksum,
        syncedChecksum: null,
      };
    }

    // File is synced, check for diff
    const tfile = this.app.vault.getMarkdownFiles().find(f => f.path === filePath);
    let currentChecksum: string | null = null;
    let hasDiff = false;

    if (tfile) {
      const content = await this.app.vault.read(tfile);
      currentChecksum = await this.calculateChecksum(content);
      hasDiff = currentChecksum !== syncInfo.checksum;
    }

    return {
      path: filePath,
      isSynced: true,
      importedAt: syncInfo.uploadedAt,
      hasDiff,
      currentChecksum,
      syncedChecksum: syncInfo.checksum,
    };
  }

  // Get unsynced files in a directory
  async getUnsyncedFilesInDirectory(
    directory: string,
    syncState: RagSyncState,
    filterConfig: FilterConfig
  ): Promise<DirectoryUnsyncedResult> {
    const allFiles = this.app.vault.getMarkdownFiles();

    // Filter files in the specified directory
    const normalizedDir = directory.replace(/\/$/, "");
    const filesInDir = allFiles.filter(f => {
      if (normalizedDir === "" || normalizedDir === "/") {
        return true; // Root directory means all files
      }
      return f.path.startsWith(normalizedDir + "/");
    });

    // Filter to included files only
    const eligibleFiles = filesInDir.filter(
      f => this.shouldInclude(f.path, filterConfig)
    );

    const unsyncedFiles: Array<{ path: string; reason: "not_imported" | "has_diff" }> = [];
    let syncedCount = 0;

    for (const file of eligibleFiles) {
      const syncInfo = syncState.files[file.path];

      if (!syncInfo) {
        unsyncedFiles.push({ path: file.path, reason: "not_imported" });
        continue;
      }

      // Check for diff
      const content = await this.app.vault.read(file);
      const currentChecksum = await this.calculateChecksum(content);

      if (currentChecksum !== syncInfo.checksum) {
        unsyncedFiles.push({ path: file.path, reason: "has_diff" });
      } else {
        syncedCount++;
      }
    }

    return {
      directory: normalizedDir || "/",
      unsyncedFiles,
      totalFiles: eligibleFiles.length,
      syncedCount,
    };
  }

  // Get vault-wide sync summary
  async getVaultSyncSummary(
    syncState: RagSyncState,
    filterConfig: FilterConfig
  ): Promise<VaultSyncSummary> {
    const allFiles = this.app.vault.getMarkdownFiles();

    // Filter to included files only
    const eligibleFiles = allFiles.filter(
      f => this.shouldInclude(f.path, filterConfig)
    );

    let syncedFiles = 0;
    let filesWithDiff = 0;

    for (const file of eligibleFiles) {
      const syncInfo = syncState.files[file.path];

      if (!syncInfo) {
        continue;
      }

      const content = await this.app.vault.read(file);
      const currentChecksum = await this.calculateChecksum(content);

      if (currentChecksum === syncInfo.checksum) {
        syncedFiles++;
      } else {
        filesWithDiff++;
      }
    }

    return {
      totalFiles: eligibleFiles.length,
      syncedFiles,
      unsyncedFiles: eligibleFiles.length - syncedFiles - filesWithDiff,
      filesWithDiff,
      lastFullSync: syncState.lastFullSync,
    };
  }

}

// Singleton instance
let fileSearchManagerInstance: FileSearchManager | null = null;

export function getFileSearchManager(): FileSearchManager | null {
  return fileSearchManagerInstance;
}

export function initFileSearchManager(
  apiKey: string,
  app: App
): FileSearchManager {
  fileSearchManagerInstance = new FileSearchManager(apiKey, app);
  return fileSearchManagerInstance;
}

export function resetFileSearchManager(): void {
  fileSearchManagerInstance = null;
}
