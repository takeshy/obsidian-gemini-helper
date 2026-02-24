// Main Google Drive sync engine for Obsidian.
// Manages push/pull sync between Obsidian Vault and Google Drive.
// Adapted from GemiHub's useSync.ts hook — restructured as a class.

import { App, TFile, Notice } from "obsidian";
import { t } from "src/i18n";
import type { GeminiHelperPlugin } from "src/plugin";
import type { DriveSyncSettings, DriveSessionTokens } from "src/types";
import {
  decodeBackupToken,
  fetchEncryptedAuth,
  decryptAuthData,
  refreshAccessToken,
  getValidSessionTokens,
} from "./googleDriveAuth";
import { ensureRootFolder } from "./googleDrive";
import * as drive from "./googleDrive";
import {
  computeSyncDiff,
  type SyncMeta,
  type SyncDiff,
  type ConflictInfo,
} from "./syncDiff";
import {
  readLocalSyncMeta,
  writeLocalSyncMeta,
  readRemoteSyncMeta,
  writeRemoteSyncMeta,
  toLocalSyncMeta,
  upsertFileInMeta,
  removeFileFromMeta,
  saveConflictBackup,
  buildIdToPathMap,
  type LocalDriveSyncMeta,
} from "./driveSyncMeta";
import {
  isSyncExcludedPath,
  isBinaryExtension,
  getMimeType,
  md5Hash,
  md5HashString,
} from "./driveSyncUtils";
import { formatError } from "src/utils/error";
import { getLocalMetaPath } from "./driveSyncMeta";
import { getEditHistoryManager } from "./editHistory";
import {
  getFileSearchManager,
  isSupportedFile,
  shouldIncludeFile,
  type FilterConfig,
} from "./fileSearch";
import type { RagFileInfo } from "src/types";
import {
  saveEditToDrive,
  ensureEditHistoryFolderId,
  loadEditHistoryFromDrive,
  clearEditHistoryFromDrive,
  type DriveEditHistoryEntry,
} from "./driveEditHistory";

export type DriveSyncStatus = "idle" | "pushing" | "pulling" | "conflict" | "error";

export interface TempFilePayload {
  fileId: string;
  content: string;
  savedAt: string;
  isBinary: boolean;
}

const MAX_TEMP_FILE_BYTES = 30 * 1024 * 1024; // 30 MB

/** Convert ArrayBuffer to base64 string in chunks (stack-safe). */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/** Decode base64 string to ArrayBuffer. */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export interface SyncFileListItem {
  id: string;   // Drive file ID or vault path (for new files)
  name: string;  // Display name (vault path)
  type: "new" | "modified" | "deleted" | "editDeleted" | "renamed" | "conflict";
  oldName?: string; // Previous path (for renames)
}

export interface SyncFileListResult {
  files: SyncFileListItem[];
  hasRemoteChanges: boolean;  // true when remote has unpulled changes
}

/** Validate that a vault path from remote metadata is safe (no traversal). */
function isValidVaultPath(path: string): boolean {
  if (!path || path.startsWith("/") || path.startsWith("\\")) return false;
  const parts = path.split("/");
  return parts.every(p => p !== ".." && p !== "." && p.length > 0);
}

const CONCURRENCY = 5;

export class DriveSyncManager {
  private app: App;
  private plugin: GeminiHelperPlugin;
  private syncLock = false;
  private autoSyncInterval: ReturnType<typeof setInterval> | null = null;

  // Session-only tokens (never persisted to disk)
  private sessionTokens: DriveSessionTokens | null = null;

  // Observable state
  private _syncStatus: DriveSyncStatus = "idle";
  localModifiedCount = 0;
  remoteModifiedCount = 0;
  conflicts: ConflictInfo[] = [];
  lastError: string | null = null;

  // Status change callback (used by status bar UI)
  onStatusChange: (() => void) | null = null;

  get syncStatus(): DriveSyncStatus {
    return this._syncStatus;
  }
  set syncStatus(value: DriveSyncStatus) {
    this._syncStatus = value;
    this.onStatusChange?.();
  }

  constructor(app: App, plugin: GeminiHelperPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  get settings(): DriveSyncSettings {
    return this.plugin.settings.driveSync;
  }

  get workspaceFolder(): string {
    return this.plugin.settings.workspaceFolder;
  }

  /** Whether the session has been unlocked (password entered). */
  get isUnlocked(): boolean {
    return this.sessionTokens !== null;
  }

  /** Whether encrypted auth is configured (but may not be unlocked). */
  get isConfigured(): boolean {
    return this.settings.enabled && this.settings.encryptedAuth !== null;
  }

  // ========================================
  // Setup & Unlock
  // ========================================

  /**
   * Initial setup: decode Migration Tool token, fetch encrypted auth from Drive, persist.
   */
  async setupWithBackupToken(backupTokenHex: string): Promise<void> {
    const { accessToken, rootFolderId } = decodeBackupToken(backupTokenHex);

    // Fetch encrypted auth from Drive
    const { data, encryptedPrivateKey, salt } = await fetchEncryptedAuth(accessToken, rootFolderId);

    // Persist encrypted auth
    this.plugin.settings.driveSync.encryptedAuth = { data, encryptedPrivateKey, salt, rootFolderId };
    await this.plugin.saveSettings();
  }

  /**
   * Unlock session with password: decrypt auth, refresh access token, start auto-sync.
   */
  async unlockWithPassword(password: string): Promise<void> {
    const auth = this.settings.encryptedAuth;
    if (!auth) throw new Error("No encrypted auth configured");

    // Decrypt refresh token + API origin (RSA hybrid decryption)
    const { refreshToken, apiOrigin } = await decryptAuthData(
      auth.data, auth.encryptedPrivateKey, auth.salt, password
    );

    // Get a fresh access token via GemiHub API proxy
    const refreshed = await refreshAccessToken(apiOrigin, refreshToken);

    this.sessionTokens = {
      accessToken: refreshed.accessToken,
      refreshToken,
      apiOrigin,
      expiryTime: refreshed.expiryTime,
      rootFolderId: auth.rootFolderId,
    };

    // Verify root folder still exists and update if needed
    const rootFolderId = await ensureRootFolder(
      this.sessionTokens.accessToken, this.settings.rootFolderName
    );
    if (rootFolderId !== auth.rootFolderId) {
      this.sessionTokens.rootFolderId = rootFolderId;
      this.plugin.settings.driveSync.encryptedAuth = {
        ...auth,
        rootFolderId,
      };
      await this.plugin.saveSettings();

      // Back up locally modified files to sync_conflicts/ before resetting
      const { accessToken } = this.sessionTokens;
      const localMeta = await readLocalSyncMeta(this.app, this.workspaceFolder);
      if (Object.keys(localMeta.files).length > 0) {
        const vaultFiles = this.getAllVaultFiles();
        const { checksums } = await this.computeVaultChecksums(vaultFiles, localMeta);
        const { modifiedIds } = this.findLocallyModifiedFiles(localMeta, checksums);
        const idToPath = buildIdToPathMap(localMeta);
        let backupCount = 0;
        for (const fileId of modifiedIds) {
          const path = idToPath[fileId];
          if (!path) continue;
          try {
            const file = this.app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
              if (isBinaryExtension(path)) {
                const buf = await this.app.vault.readBinary(file);
                await saveConflictBackup(accessToken, rootFolderId, path, buf);
              } else {
                const content = await this.app.vault.read(file);
                await saveConflictBackup(accessToken, rootFolderId, path, content);
              }
              backupCount++;
            }
          } catch (err) {
            console.warn(`[DriveSync] Failed to back up modified file: ${path}`, err);
          }
        }
        if (backupCount > 0) {
          new Notice(`Drive sync: backed up ${backupCount} modified file(s) to sync_conflicts.`);
        }
      }

      // Reset local sync meta so next push/pull works against the new folder
      await writeLocalSyncMeta(this.app, this.workspaceFolder, {
        lastUpdatedAt: "",
        files: {},
        pathToId: {},
      });
      new Notice("Drive sync: root folder changed. Local sync state has been reset.");
    }

    this.startAutoSync();

    // If autoSync is disabled, still refresh counts once after unlock
    if (!this.settings.autoSync) {
      void this.refreshSyncCounts();
    }
  }

  // ========================================
  // Auto-sync management
  // ========================================

  startAutoSync(): void {
    this.stopAutoSync();
    if (!this.settings.autoSync || !this.settings.enabled || !this.sessionTokens) return;

    // Refresh counts immediately, then on interval
    void this.refreshSyncCounts();

    const intervalMs = Math.max(3, this.settings.syncIntervalMinutes) * 60 * 1000;
    this.autoSyncInterval = setInterval(() => {
      void this.refreshSyncCounts();
    }, intervalMs);
  }

  stopAutoSync(): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }

  // ========================================
  // Token management
  // ========================================

  private async getTokens(): Promise<DriveSessionTokens> {
    if (!this.sessionTokens) {
      throw new Error("Drive sync not unlocked. Enter your password first.");
    }
    this.sessionTokens = await getValidSessionTokens(this.sessionTokens);
    return this.sessionTokens;
  }

  /** Read a remote file's text content by Drive file ID. */
  async readRemoteFile(fileId: string): Promise<string> {
    const tokens = await this.getTokens();
    return drive.readFile(tokens.accessToken, fileId);
  }

  /** Read a remote file's text content by vault path (uses pathToId mapping). */
  async readRemoteFileByPath(vaultPath: string): Promise<string | null> {
    const tokens = await this.getTokens();
    const localMeta = await readLocalSyncMeta(this.app, this.workspaceFolder);
    const fileId = localMeta.pathToId[vaultPath];
    if (!fileId) return null;
    return drive.readFile(tokens.accessToken, fileId);
  }

  /** Load remote edit history entries for a file from Google Drive. */
  async loadRemoteEditHistory(filePath: string): Promise<DriveEditHistoryEntry[]> {
    const tokens = await this.getTokens();
    const historyFolderId = await ensureEditHistoryFolderId(tokens.accessToken, tokens.rootFolderId);
    return loadEditHistoryFromDrive(tokens.accessToken, historyFolderId, filePath);
  }

  /** Clear remote edit history for a file from Google Drive. */
  async clearRemoteEditHistory(filePath: string): Promise<void> {
    const tokens = await this.getTokens();
    const historyFolderId = await ensureEditHistoryFolderId(tokens.accessToken, tokens.rootFolderId);
    await clearEditHistoryFromDrive(tokens.accessToken, historyFolderId, filePath);
  }

  // ========================================
  // Vault scanning
  // ========================================

  /**
   * Get all syncable files in the Vault.
   */
  private getAllVaultFiles(): TFile[] {
    const excludePatterns = this.settings.excludePatterns;
    const syncMetaPath = getLocalMetaPath(this.workspaceFolder);
    const configDir = this.app.vault.configDir;
    const wsFolder = this.workspaceFolder;
    return this.app.vault.getFiles().filter((file) => {
      // Exclude the local sync meta file itself
      if (file.path === syncMetaPath) return false;
      return !isSyncExcludedPath(file.path, excludePatterns, configDir, wsFolder);
    });
  }

  /** Check if a vault path is excluded from sync. */
  private isExcludedPath(filePath: string): boolean {
    return isSyncExcludedPath(filePath, this.settings.excludePatterns, this.app.vault.configDir, this.workspaceFolder);
  }

  /**
   * Compute MD5 checksums for all vault files.
   * Skips MD5 computation when file mtime+size match the cached values in localMeta.
   * Returns checksums (path → md5) and vaultStats (path → {mtime, size}).
   */
  private async computeVaultChecksums(
    files: TFile[],
    localMeta?: LocalDriveSyncMeta
  ): Promise<{ checksums: Map<string, string>; vaultStats: Map<string, { mtime: number; size: number }> }> {
    const checksums = new Map<string, string>();
    const vaultStats = new Map<string, { mtime: number; size: number }>();

    // Build path → cached entry lookup from localMeta
    const cachedByPath = new Map<string, { md5Checksum: string; localMtime?: number; localSize?: number }>();
    if (localMeta) {
      for (const [path, id] of Object.entries(localMeta.pathToId)) {
        const entry = localMeta.files[id];
        if (entry) cachedByPath.set(path, entry);
      }
    }

    for (let i = 0; i < files.length; i += CONCURRENCY) {
      const batch = files.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (file) => {
        try {
          const mtime = file.stat.mtime;
          const size = file.stat.size;
          vaultStats.set(file.path, { mtime, size });

          // Skip MD5 if mtime+size unchanged from cached values
          const cached = cachedByPath.get(file.path);
          if (cached?.localMtime === mtime && cached?.localSize === size && cached.md5Checksum) {
            checksums.set(file.path, cached.md5Checksum);
            return;
          }

          if (isBinaryExtension(file.path)) {
            const content = await this.app.vault.readBinary(file);
            checksums.set(file.path, md5Hash(new Uint8Array(content)));
          } else {
            const content = await this.app.vault.read(file);
            checksums.set(file.path, md5HashString(content));
          }
        } catch (err) {
          console.warn(`[DriveSync] Skipping file (read error): ${file.path}`, err);
        }
      }));
    }
    return { checksums, vaultStats };
  }

  /**
   * Find locally modified files by comparing current checksums with local sync meta.
   * Also detects renames: files whose path changed but content (checksum) stayed the same.
   */
  private findLocallyModifiedFiles(
    localMeta: LocalDriveSyncMeta,
    currentChecksums: Map<string, string>
  ): { modifiedIds: Set<string>; newPaths: Set<string>; renames: Map<string, string>; deletedIds: Set<string> } {
    const modifiedIds = new Set<string>();
    const newPaths = new Set<string>();

    // Track disappeared paths (in pathToId but file no longer exists at that path)
    // Map: checksum → { fileId, oldPath }
    const disappearedByChecksum = new Map<string, { fileId: string; oldPath: string }>();

    // Check existing tracked files
    for (const [path, fileId] of Object.entries(localMeta.pathToId)) {
      const currentChecksum = currentChecksums.get(path);
      const trackedChecksum = localMeta.files[fileId]?.md5Checksum;

      if (!currentChecksum && trackedChecksum) {
        // File disappeared from this path — candidate for rename detection
        disappearedByChecksum.set(trackedChecksum, { fileId, oldPath: path });
      } else if (currentChecksum && trackedChecksum && currentChecksum !== trackedChecksum) {
        modifiedIds.add(fileId);
      }
    }

    // Find new files (not in pathToId) and detect renames by matching checksums
    // renames: oldPath → newPath
    const renames = new Map<string, string>();
    for (const path of currentChecksums.keys()) {
      if (!localMeta.pathToId[path]) {
        const checksum = currentChecksums.get(path)!;
        const disappeared = disappearedByChecksum.get(checksum);
        if (disappeared) {
          // Same checksum: this is a rename, not a new file
          renames.set(disappeared.oldPath, path);
          disappearedByChecksum.delete(checksum);
        } else {
          newPaths.add(path);
        }
      }
    }

    // Remaining disappeared entries are truly deleted files (not renamed)
    const deletedIds = new Set<string>();
    for (const { fileId } of disappearedByChecksum.values()) {
      deletedIds.add(fileId);
    }

    return { modifiedIds, newPaths, renames, deletedIds };
  }

  /**
   * Find files tracked in both local and remote meta but physically missing from disk.
   * These should be re-downloaded on pull.
   * Files in deletedIds are intentionally deleted by the user and excluded.
   */
  private findMissingLocalFiles(
    localMeta: LocalDriveSyncMeta,
    remoteMeta: SyncMeta | null,
    checksums: Map<string, string>,
    diff: SyncDiff,
    renames: Map<string, string> = new Map(),
    deletedIds: Set<string> = new Set()
  ): string[] {
    if (!remoteMeta) return [];
    const idToPath = buildIdToPathMap(localMeta);
    const alreadyHandled = new Set([
      ...diff.toPush, ...diff.toPull,
      ...diff.localOnly, ...diff.remoteOnly,
      ...diff.editDeleteConflicts,
      ...diff.conflicts.map(c => c.fileId),
    ]);

    const missing: string[] = [];
    for (const fileId of Object.keys(remoteMeta.files)) {
      if (alreadyHandled.has(fileId)) continue;
      if (deletedIds.has(fileId)) continue; // intentionally deleted locally
      if (!localMeta.files[fileId]) continue;
      const remoteFile = remoteMeta.files[fileId];
      const path = idToPath[fileId] || remoteFile.path || remoteFile.name;
      if (!path) continue;
      if (renames.has(path)) continue; // file was renamed, not deleted
      if (!checksums.has(path)) {
        missing.push(fileId);
      }
    }
    return missing;
  }

  // ========================================
  // Sync count refresh
  // ========================================

  async refreshSyncCounts(): Promise<void> {
    if (!this.settings.enabled || !this.sessionTokens) {
      this.localModifiedCount = 0;
      this.remoteModifiedCount = 0;
      this.onStatusChange?.();
      return;
    }

    try {
      const tokens = await this.getTokens();
      const localMeta = await readLocalSyncMeta(this.app, this.workspaceFolder);
      const remoteMeta = await readRemoteSyncMeta(tokens.accessToken, tokens.rootFolderId);

      const vaultFiles = this.getAllVaultFiles();
      const { checksums } = await this.computeVaultChecksums(vaultFiles, localMeta);
      const { modifiedIds, newPaths, renames, deletedIds } = this.findLocallyModifiedFiles(localMeta, checksums);

      const diff = computeSyncDiff(localMeta, remoteMeta, modifiedIds);

      // Detect files tracked in meta but physically missing from disk (exclude intentional deletions)
      const missingLocal = this.findMissingLocalFiles(localMeta, remoteMeta, checksums, diff, renames, deletedIds);
      diff.toPull.push(...missingLocal);

      // Resolve id → path for exclusion filtering
      const idToPath = buildIdToPathMap(localMeta);
      const remoteFiles = remoteMeta?.files ?? {};
      const resolvePath = (id: string): string | null => idToPath[id] || remoteFiles[id]?.path || remoteFiles[id]?.name || null;

      const isExcludedId = (id: string): boolean => {
        const path = resolvePath(id);
        return path !== null && this.isExcludedPath(path);
      };

      // Push count = modified files + new files + renames + local deletions (excluding excluded paths)
      const pushCount = diff.toPush.filter(id => !isExcludedId(id)).length
        + [...newPaths].filter(p => !this.isExcludedPath(p)).length
        + [...renames].filter(([, newPath]) => !this.isExcludedPath(newPath)).length
        + diff.editDeleteConflicts.filter(id => !isExcludedId(id)).length
        + [...deletedIds].filter(id => !isExcludedId(id)).length;
      this.localModifiedCount = pushCount;

      // Pull count = remote changes + remote-only + locally-deleted-remotely + conflicts (excluding excluded paths)
      if (!remoteMeta) {
        this.remoteModifiedCount = 0;
      } else {
        const pullLocalOnly = diff.localOnly.filter(id => id in localMeta.files);
        this.remoteModifiedCount =
          diff.toPull.filter(id => !isExcludedId(id)).length
          + diff.remoteOnly.filter(id => !isExcludedId(id)).length
          + pullLocalOnly.filter(id => !isExcludedId(id)).length
          + diff.conflicts.filter(c => !isExcludedId(c.fileId)).length;
      }
    } catch (err) {
      // Background refresh failure is expected (e.g. offline); silently ignored.
      console.debug("[DriveSync] refreshSyncCounts failed:", err);
    }
    this.onStatusChange?.();
  }

  // ========================================
  // Sync file list (for diff dialog)
  // ========================================

  async computeSyncFileList(direction: "push" | "pull"): Promise<SyncFileListResult> {
    if (!this.settings.enabled || !this.sessionTokens) return { files: [], hasRemoteChanges: false };

    const tokens = await this.getTokens();
    const localMeta = await readLocalSyncMeta(this.app, this.workspaceFolder);
    const remoteMeta = await readRemoteSyncMeta(tokens.accessToken, tokens.rootFolderId);

    const vaultFiles = this.getAllVaultFiles();
    const { checksums } = await this.computeVaultChecksums(vaultFiles, localMeta);
    const { modifiedIds, newPaths, renames, deletedIds } = this.findLocallyModifiedFiles(localMeta, checksums);

    const diff = computeSyncDiff(localMeta, remoteMeta, modifiedIds);

    // Detect files tracked in meta but physically missing from disk (for pull, exclude intentional deletions)
    if (direction === "pull") {
      const missingLocal = this.findMissingLocalFiles(localMeta, remoteMeta, checksums, diff, renames, deletedIds);
      diff.toPull.push(...missingLocal);
    }

    const remoteFiles = remoteMeta?.files ?? {};
    const idToPath = buildIdToPathMap(localMeta);

    const files: SyncFileListItem[] = [];

    if (direction === "push") {
      for (const id of diff.toPush) {
        const name = idToPath[id] || remoteFiles[id]?.name || id;
        files.push({ id, name, type: "modified" });
      }
      for (const path of newPaths) {
        files.push({ id: path, name: path, type: "new" });
      }
      for (const [oldPath, newPath] of renames) {
        const fileId = localMeta.pathToId[oldPath] || oldPath;
        files.push({ id: fileId, name: newPath, type: "renamed", oldName: oldPath });
      }
      for (const id of diff.editDeleteConflicts) {
        const name = idToPath[id] || id;
        files.push({ id, name, type: "editDeleted" });
      }
      // Show locally deleted files (will be moved to trash/ on Drive)
      // Both localOnly (in localMeta only) and deletedIds (in both metas but deleted from disk)
      for (const id of diff.localOnly) {
        const path = idToPath[id];
        if (path && !checksums.has(path)) {
          files.push({ id, name: path, type: "deleted" });
        }
      }
      for (const id of deletedIds) {
        const path = idToPath[id];
        if (path) {
          files.push({ id, name: path, type: "deleted" });
        }
      }
    } else {
      for (const id of diff.remoteOnly) {
        const name = remoteFiles[id]?.path || remoteFiles[id]?.name || id;
        files.push({ id, name, type: "new" });
      }
      for (const id of diff.toPull) {
        const name = idToPath[id] || remoteFiles[id]?.path || remoteFiles[id]?.name || id;
        files.push({ id, name, type: "modified" });
      }
      for (const id of diff.localOnly) {
        if (!(id in localMeta.files)) continue;
        const name = idToPath[id] || id;
        files.push({ id, name, type: "deleted" });
      }
      for (const id of diff.editDeleteConflicts) {
        const name = idToPath[id] || id;
        files.push({ id, name, type: "editDeleted" });
      }
      for (const c of diff.conflicts) {
        const name = idToPath[c.fileId] || remoteFiles[c.fileId]?.path || remoteFiles[c.fileId]?.name || c.fileId;
        files.push({ id: c.fileId, name, type: "conflict" });
      }
    }

    files.sort((a, b) => a.name.localeCompare(b.name));
    const filtered = files.filter((f) => !this.isExcludedPath(f.name));

    // Detect remote changes that would block a push
    const localMetaFiles = localMeta?.files ?? {};
    const remoteDeletedCount = diff.localOnly.filter(id => id in localMetaFiles).length;
    const hasRemoteChanges =
      diff.conflicts.length > 0 ||
      diff.editDeleteConflicts.length > 0 ||
      diff.toPull.length > 0 ||
      diff.remoteOnly.length > 0 ||
      remoteDeletedCount > 0;

    return { files: filtered, hasRemoteChanges };
  }

  // ========================================
  // Push
  // ========================================

  async push(): Promise<void> {
    if (this.syncLock) {
      console.warn("[DriveSync] push skipped: sync already in progress");
      return;
    }
    this.syncLock = true;
    this.syncStatus = "pushing";
    this.lastError = null;
    new Notice(t("driveSync.startPushing"));

    try {
      const tokens = await this.getTokens();
      const { accessToken, rootFolderId } = tokens;

      // 1. Get local and remote meta
      const localMeta = await readLocalSyncMeta(this.app, this.workspaceFolder);
      let remoteMeta = await readRemoteSyncMeta(accessToken, rootFolderId);

      // 2. Compute vault checksums and find modified files
      const vaultFiles = this.getAllVaultFiles();
      const { checksums, vaultStats } = await this.computeVaultChecksums(vaultFiles, localMeta);
      const { modifiedIds, newPaths, renames, deletedIds } = this.findLocallyModifiedFiles(localMeta, checksums);

      // 3. Compute diff (exclude renamed file IDs from localOnly detection)
      const renamedFileIds = new Set<string>();
      for (const [oldPath] of renames) {
        const fid = localMeta.pathToId[oldPath];
        if (fid) renamedFileIds.add(fid);
      }
      const diff = computeSyncDiff(localMeta, remoteMeta, modifiedIds);

      // 4. Reject push if remote has changes
      const localMetaFiles = localMeta?.files ?? {};
      const remoteDeletedCount = diff.localOnly.filter(id => id in localMetaFiles && !renamedFileIds.has(id)).length;
      if (
        diff.conflicts.length > 0 ||
        diff.editDeleteConflicts.length > 0 ||
        diff.toPull.length > 0 ||
        diff.remoteOnly.length > 0 ||
        remoteDeletedCount > 0
      ) {
        this.lastError = "Remote has pending changes. Please pull first.";
        this.syncStatus = "error";
        new Notice(`Drive sync push failed: ${this.lastError}`);
        return;
      }

      // 5. Prepare remote meta for updates
      if (!remoteMeta) {
        remoteMeta = { lastUpdatedAt: new Date().toISOString(), files: {} };
      }

      const idToPath = buildIdToPathMap(localMeta);

      // 6. Handle renames (update Drive file name, no re-upload needed)
      for (const [oldPath, newPath] of renames) {
        const fileId = localMeta.pathToId[oldPath];
        if (!fileId) continue;
        const driveFile = await drive.renameFile(accessToken, fileId, newPath);
        // Update local meta path mapping
        delete localMeta.pathToId[oldPath];
        localMeta.pathToId[newPath] = fileId;
        // Update remote meta
        upsertFileInMeta(remoteMeta, driveFile, newPath);
      }

      // 7. Upload modified files (existing)
      const modifiedPaths: string[] = [];
      for (const fileId of diff.toPush) {
        const path = idToPath[fileId];
        if (path) modifiedPaths.push(path);
      }

      // 8. Upload new files
      const allPathsToUpload = [...modifiedPaths, ...newPaths];

      // Track old/new content for Drive edit history
      const uploadResults: Array<{ path: string; oldContent: string | null; newContent: string | null }> = [];

      // Process in batches of CONCURRENCY
      for (let i = 0; i < allPathsToUpload.length; i += CONCURRENCY) {
        const batch = allPathsToUpload.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (path) => {
          const existingId = localMeta.pathToId[path];
          const result = await this.uploadFile(accessToken, rootFolderId, path, existingId, remoteMeta, localMeta, checksums);
          uploadResults.push({ path, ...result });
        }));
      }

      // 9. Handle locally deleted files: move to trash/ subfolder on Drive
      // - localOnly: files in localMeta but not remoteMeta (deleted locally before ever syncing remote)
      // - deletedIds: files in both metas but physically deleted from disk
      const filesToTrash = [
        ...diff.localOnly.filter(id => {
          if (renamedFileIds.has(id)) return false;
          const path = idToPath[id];
          return path && !checksums.has(path);
        }),
        ...deletedIds,
      ];
      if (filesToTrash.length > 0) {
        const trashFolderId = await drive.ensureSubFolder(accessToken, rootFolderId, "trash");
        for (const fileId of filesToTrash) {
          const path = idToPath[fileId];
          if (!path) continue;
          try {
            await drive.moveFile(accessToken, fileId, trashFolderId, rootFolderId);
            removeFileFromMeta(remoteMeta, fileId);
            delete localMeta.files[fileId];
            delete localMeta.pathToId[path];
          } catch (err) {
            console.warn(`[DriveSync] Failed to move file to trash on Drive: ${path}`, err);
          }
        }
      }

      // 10. Write updated remote meta
      remoteMeta.lastUpdatedAt = new Date().toISOString();
      await writeRemoteSyncMeta(accessToken, rootFolderId, remoteMeta);

      // 11. Update local meta (with vault stats for mtime/size caching)
      const updatedLocalMeta = toLocalSyncMeta(remoteMeta, localMeta, vaultStats);
      await writeLocalSyncMeta(this.app, this.workspaceFolder, updatedLocalMeta);

      // 12. Clear edit history for pushed/trashed files
      const historyManager = getEditHistoryManager();
      if (historyManager) {
        for (const path of allPathsToUpload) {
          historyManager.clearHistory(path);
          historyManager.clearSnapshot(path);
        }
        for (const fileId of filesToTrash) {
          const path = idToPath[fileId];
          if (path) {
            historyManager.clearHistory(path);
            historyManager.clearSnapshot(path);
          }
        }
      }

      // 13. Save remote edit history in background (best-effort, does not block UI)
      const historyEntries = uploadResults.filter(
        (r) => r.oldContent != null && r.newContent != null && r.oldContent !== r.newContent
      );
      if (historyEntries.length > 0) {
        const editHistorySettings = this.plugin.settings.editHistory;
        void (async () => {
          try {
            const historyFolderId = await ensureEditHistoryFolderId(accessToken, rootFolderId);
            for (let i = 0; i < historyEntries.length; i += CONCURRENCY) {
              const batch = historyEntries.slice(i, i + CONCURRENCY);
              await Promise.all(batch.map(async (r) => {
                await saveEditToDrive(accessToken, historyFolderId, editHistorySettings, {
                  path: r.path,
                  oldContent: r.oldContent!,
                  newContent: r.newContent!,
                  source: "manual",
                });
              }));
            }
          } catch (err) {
            // best-effort: don't block sync for background history save
            console.debug("[DriveSync] background history save failed:", err);
          }
        })();
      }

      // 14. RAG sync in background (best-effort, does not block UI)
      void (async () => {
        try {
          await this.syncRagAfterPush(
            accessToken,
            rootFolderId,
            allPathsToUpload,
            renames,
            filesToTrash.map(id => idToPath[id]).filter((p): p is string => !!p)
          );
        } catch (err) {
          console.debug("[DriveSync] background RAG sync failed:", err);
        }
      })();

      this.syncStatus = "idle";
      const totalCount = allPathsToUpload.length + renames.size + filesToTrash.length;
      const parts: string[] = [];
      if (renames.size > 0) parts.push(`${renames.size} renamed`);
      if (filesToTrash.length > 0) parts.push(`${filesToTrash.length} trashed`);
      const detail = parts.length > 0 ? ` (${parts.join(", ")})` : "";
      new Notice(`Drive sync: pushed ${totalCount} file(s)${detail}`);
    } catch (err) {
      this.lastError = formatError(err);
      this.syncStatus = "error";
      new Notice(`Drive sync push failed: ${this.lastError}`);
    } finally {
      this.syncLock = false;
      await this.refreshSyncCounts();
    }
  }

  /**
   * Upload a single file to Drive.
   * Returns old/new content for text files (for edit history tracking).
   */
  private async uploadFile(
    accessToken: string,
    rootFolderId: string,
    vaultPath: string,
    existingDriveId: string | undefined,
    remoteMeta: SyncMeta,
    localMeta: LocalDriveSyncMeta,
    checksums: Map<string, string>
  ): Promise<{ oldContent: string | null; newContent: string | null }> {
    const file = this.app.vault.getAbstractFileByPath(vaultPath);
    if (!(file instanceof TFile)) return { oldContent: null, newContent: null };

    const mimeType = getMimeType(vaultPath);
    const isBinary = isBinaryExtension(vaultPath);

    let oldContent: string | null = null;
    let newContent: string | null = null;

    // Drive uses flat structure: file name = vault path (e.g., "notes/daily/2024-01-01.md")
    let driveFile: drive.DriveFile;

    if (existingDriveId) {
      // Get old content for edit history (text files only)
      if (!isBinary) {
        // Try to reconstruct old content from local edit history first
        const historyManager = getEditHistoryManager();
        if (historyManager) {
          const entries = historyManager.getHistory(vaultPath);
          if (entries.length > 0) {
            oldContent = historyManager.getContentAt(vaultPath, entries[0].id);
          }
        }
        // Fall back to reading from Drive if local history not available
        if (oldContent === null) {
          try {
            oldContent = await drive.readFile(accessToken, existingDriveId);
          } catch (err) {
            // File might be unreadable, skip history
            console.debug("[DriveSync] old content read failed:", err);
          }
        }
      }

      // Update existing file
      if (isBinary) {
        const content = await this.app.vault.readBinary(file);
        driveFile = await drive.updateFileBinary(accessToken, existingDriveId, content, mimeType);
      } else {
        const content = await this.app.vault.read(file);
        newContent = content;
        driveFile = await drive.updateFile(accessToken, existingDriveId, content, mimeType);
      }
    } else {
      // Create new file in root folder with vaultPath as name
      if (isBinary) {
        const content = await this.app.vault.readBinary(file);
        driveFile = await drive.createFileBinary(accessToken, vaultPath, content, rootFolderId, mimeType);
      } else {
        const content = await this.app.vault.read(file);
        newContent = content;
        driveFile = await drive.createFile(accessToken, vaultPath, content, rootFolderId, mimeType);
      }
    }

    // Update remote meta
    upsertFileInMeta(remoteMeta, driveFile, vaultPath);

    // Update local meta mappings
    localMeta.pathToId[vaultPath] = driveFile.id;
    localMeta.files[driveFile.id] = {
      md5Checksum: checksums.get(vaultPath) ?? driveFile.md5Checksum ?? "",
      modifiedTime: driveFile.modifiedTime ?? "",
    };

    return { oldContent, newContent };
  }

  // ========================================
  // Pull
  // ========================================

  async pull(): Promise<void> {
    if (this.syncLock) {
      console.warn("[DriveSync] pull skipped: sync already in progress");
      return;
    }
    this.syncLock = true;
    this.syncStatus = "pulling";
    this.lastError = null;
    new Notice(t("driveSync.startPulling"));

    try {
      const tokens = await this.getTokens();
      const { accessToken, rootFolderId } = tokens;

      // 1. Get local and remote meta
      const localMeta = await readLocalSyncMeta(this.app, this.workspaceFolder);
      const remoteMeta = await readRemoteSyncMeta(accessToken, rootFolderId);

      if (!remoteMeta) {
        new Notice("Drive sync: no remote data found. Push first.");
        this.syncStatus = "idle";
        return;
      }

      // 2. Compute vault checksums and find modified files
      const vaultFiles = this.getAllVaultFiles();
      const { checksums } = await this.computeVaultChecksums(vaultFiles, localMeta);
      const { modifiedIds, renames, deletedIds } = this.findLocallyModifiedFiles(localMeta, checksums);

      // 3. Compute diff
      const diff = computeSyncDiff(localMeta, remoteMeta, modifiedIds);

      // 3.1. Re-download files tracked in meta but physically missing from disk (exclude intentional deletions)
      const missingLocal = this.findMissingLocalFiles(localMeta, remoteMeta, checksums, diff, renames, deletedIds);
      diff.toPull.push(...missingLocal);

      // 3.5. Guard: detect untracked local files that would be overwritten
      const safeRemoteOnly: string[] = [];
      const untrackedConflicts: ConflictInfo[] = [];
      for (const fileId of diff.remoteOnly) {
        const fileMeta = remoteMeta.files[fileId];
        if (!fileMeta) { safeRemoteOnly.push(fileId); continue; }
        const vaultPath = fileMeta.path || fileMeta.name;
        const localChecksum = checksums.get(vaultPath);
        if (localChecksum && localChecksum !== fileMeta.md5Checksum) {
          untrackedConflicts.push({
            fileId,
            fileName: vaultPath,
            localChecksum,
            remoteChecksum: fileMeta.md5Checksum,
            localModifiedTime: "",
            remoteModifiedTime: fileMeta.modifiedTime,
          });
        } else {
          safeRemoteOnly.push(fileId);
        }
      }
      diff.remoteOnly = safeRemoteOnly;

      // 4. Handle conflicts
      const allConflicts: ConflictInfo[] = [...diff.conflicts, ...untrackedConflicts];
      if (diff.editDeleteConflicts.length > 0) {
        const idToPath = buildIdToPathMap(localMeta);
        for (const fid of diff.editDeleteConflicts) {
          allConflicts.push({
            fileId: fid,
            fileName: idToPath[fid] || fid,
            localChecksum: localMeta.files[fid]?.md5Checksum ?? "",
            remoteChecksum: "",
            localModifiedTime: localMeta.files[fid]?.modifiedTime ?? "",
            remoteModifiedTime: "",
            isEditDelete: true,
          });
        }
      }

      if (allConflicts.length > 0) {
        this.conflicts = allConflicts;
        this.syncStatus = "conflict";
        return;
      }

      // 5. Process the diff
      await this.applyPullDiff(accessToken, rootFolderId, localMeta, remoteMeta, diff);

      this.syncStatus = "idle";
      const pullCount = diff.toPull.length + diff.remoteOnly.length;
      const deleteCount = diff.localOnly.length;
      const parts: string[] = [];
      if (pullCount > 0) parts.push(`pulled ${pullCount}`);
      if (deleteCount > 0) parts.push(`deleted ${deleteCount}`);
      if (parts.length > 0) {
        new Notice(`Drive sync: ${parts.join(", ")}`);
      } else {
        new Notice("Drive sync: already up to date");
      }
    } catch (err) {
      this.lastError = formatError(err);
      this.syncStatus = "error";
      new Notice(`Drive sync pull failed: ${this.lastError}`);
    } finally {
      this.syncLock = false;
      await this.refreshSyncCounts();
    }
  }

  /**
   * Apply pull diff: delete local-only, download remote changes.
   */
  private async applyPullDiff(
    accessToken: string,
    rootFolderId: string,
    localMeta: LocalDriveSyncMeta,
    remoteMeta: SyncMeta,
    diff: SyncDiff
  ): Promise<void> {
    const idToPath = buildIdToPathMap(localMeta);
    const historyManager = getEditHistoryManager();

    // 1. Delete localOnly files (remotely deleted)
    for (const fileId of diff.localOnly) {
      const path = idToPath[fileId];
      if (path) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
          await this.app.fileManager.trashFile(file);
        }
        // Clear edit history for deleted files
        if (historyManager) {
          historyManager.clearHistory(path);
          historyManager.clearSnapshot(path);
        }
        delete localMeta.pathToId[path];
      }
      delete localMeta.files[fileId];
    }

    // 2. Handle remote renames: remove old local file before downloading to new path
    for (const fileId of diff.toPull) {
      const oldPath = idToPath[fileId];
      const remotePath = remoteMeta.files[fileId]?.path || remoteMeta.files[fileId]?.name;
      if (oldPath && remotePath && oldPath !== remotePath) {
        const oldFile = this.app.vault.getAbstractFileByPath(oldPath);
        if (oldFile instanceof TFile) {
          await this.app.fileManager.trashFile(oldFile);
        }
        if (historyManager) {
          historyManager.clearHistory(oldPath);
          historyManager.clearSnapshot(oldPath);
        }
        delete localMeta.pathToId[oldPath];
      }
    }

    // 2b. Download toPull + remoteOnly files
    const filesToPull = [...diff.toPull, ...diff.remoteOnly];

    for (let i = 0; i < filesToPull.length; i += CONCURRENCY) {
      const batch = filesToPull.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (fileId) => {
        await this.downloadFile(accessToken, rootFolderId, fileId, remoteMeta, localMeta);
        // Clear edit history for pulled files (pulled content is the new base)
        const vaultPath = remoteMeta.files[fileId]?.path || remoteMeta.files[fileId]?.name;
        if (vaultPath && historyManager) {
          historyManager.clearHistory(vaultPath);
          historyManager.clearSnapshot(vaultPath);
        }
      }));
    }

    // 3. Update local meta
    const vaultStats = new Map<string, { mtime: number; size: number }>();
    for (const f of this.getAllVaultFiles()) {
      vaultStats.set(f.path, { mtime: f.stat.mtime, size: f.stat.size });
    }
    const updatedLocalMeta = toLocalSyncMeta(remoteMeta, localMeta, vaultStats);
    await writeLocalSyncMeta(this.app, this.workspaceFolder, updatedLocalMeta);
  }

  /**
   * Download a single file from Drive and write to Vault.
   */
  private async downloadFile(
    accessToken: string,
    _rootFolderId: string,
    fileId: string,
    remoteMeta: SyncMeta,
    localMeta: LocalDriveSyncMeta
  ): Promise<void> {
    const fileMeta = remoteMeta.files[fileId];
    if (!fileMeta) return;

    // Determine vault path from remote meta path field or fallback to name
    const vaultPath = fileMeta.path || fileMeta.name;

    // Validate path safety (no traversal)
    if (!isValidVaultPath(vaultPath)) {
      console.warn("[DriveSync] Skipping unsafe remote path:", vaultPath);
      return;
    }

    // Skip excluded paths (e.g., workspace folder)
    if (this.isExcludedPath(vaultPath)) return;

    const isBinary = isBinaryExtension(vaultPath);

    // Ensure parent directories exist
    const dirPath = vaultPath.substring(0, vaultPath.lastIndexOf("/"));
    if (dirPath) {
      await this.ensureVaultFolder(dirPath);
    }

    // Download and write (use vault API to update Obsidian's internal cache/file tree)
    const existingFile = this.app.vault.getAbstractFileByPath(vaultPath);
    if (isBinary) {
      const content = await drive.readFileRaw(accessToken, fileId);
      if (existingFile instanceof TFile) {
        await this.app.vault.modifyBinary(existingFile, content);
      } else {
        await this.app.vault.createBinary(vaultPath, content);
      }
    } else {
      const content = await drive.readFile(accessToken, fileId);
      if (existingFile instanceof TFile) {
        await this.app.vault.modify(existingFile, content);
      } else {
        await this.app.vault.create(vaultPath, content);
      }
    }

    // Update local meta
    localMeta.pathToId[vaultPath] = fileId;
    localMeta.files[fileId] = {
      md5Checksum: fileMeta.md5Checksum,
      modifiedTime: fileMeta.modifiedTime,
    };
  }

  /**
   * Ensure a folder path exists in the Vault.
   */
  private async ensureVaultFolder(folderPath: string): Promise<void> {
    const parts = folderPath.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const exists = await this.app.vault.adapter.exists(current);
      if (!exists) {
        await this.app.vault.adapter.mkdir(current);
      }
    }
  }

  // ========================================
  // Full Pull
  // ========================================

  async fullPull(): Promise<void> {
    if (this.syncLock) {
      console.warn("[DriveSync] fullPull skipped: sync already in progress");
      return;
    }
    this.syncLock = true;
    this.syncStatus = "pulling";
    this.lastError = null;
    new Notice(t("driveSync.startFullPulling"));

    try {
      const tokens = await this.getTokens();
      const { accessToken, rootFolderId } = tokens;

      // Get remote meta (or rebuild)
      const remoteMeta = await readRemoteSyncMeta(accessToken, rootFolderId);
      if (!remoteMeta) {
        new Notice("Drive sync: no remote data found");
        this.syncStatus = "idle";
        return;
      }

      // Build empty local meta (full pull = remote is authoritative)
      const newLocalMeta: LocalDriveSyncMeta = {
        lastUpdatedAt: new Date().toISOString(),
        files: {},
        pathToId: {},
      };

      // Download all remote files
      const fileIds = Object.keys(remoteMeta.files);
      let downloadedCount = 0;

      for (let i = 0; i < fileIds.length; i += CONCURRENCY) {
        const batch = fileIds.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (fileId) => {
          await this.downloadFile(accessToken, rootFolderId, fileId, remoteMeta, newLocalMeta);
          downloadedCount++;
        }));
      }

      // Delete vault files not in remote (use newLocalMeta.pathToId populated by downloadFile)
      const vaultFiles = this.getAllVaultFiles();
      for (const file of vaultFiles) {
        if (!newLocalMeta.pathToId[file.path]) {
          await this.app.fileManager.trashFile(file);
        }
      }

      // Save local meta (collect fresh vault stats after download)
      const freshVaultStats = new Map<string, { mtime: number; size: number }>();
      for (const f of this.getAllVaultFiles()) {
        freshVaultStats.set(f.path, { mtime: f.stat.mtime, size: f.stat.size });
      }
      const updatedLocalMeta = toLocalSyncMeta(remoteMeta, newLocalMeta, freshVaultStats);
      await writeLocalSyncMeta(this.app, this.workspaceFolder, updatedLocalMeta);

      // Full pull: clear all edit history
      const historyManager = getEditHistoryManager();
      if (historyManager) {
        historyManager.clearAllHistory();
      }

      this.syncStatus = "idle";
      new Notice(`Drive sync: full pull completed (${downloadedCount} files)`);
    } catch (err) {
      this.lastError = formatError(err);
      this.syncStatus = "error";
      new Notice(`Drive sync full pull failed: ${this.lastError}`);
    } finally {
      this.syncLock = false;
      await this.refreshSyncCounts();
    }
  }

  // ========================================
  // Full Push
  // ========================================

  async fullPush(): Promise<void> {
    if (this.syncLock) {
      console.warn("[DriveSync] fullPush skipped: sync already in progress");
      return;
    }
    this.syncLock = true;
    this.syncStatus = "pushing";
    this.lastError = null;
    new Notice(t("driveSync.startFullPushing"));

    try {
      const tokens = await this.getTokens();
      const { accessToken, rootFolderId } = tokens;

      // Build fresh remote meta (full push = local is authoritative)
      const remoteMeta: SyncMeta = {
        lastUpdatedAt: new Date().toISOString(),
        files: {},
      };

      // Build fresh local meta
      const newLocalMeta: LocalDriveSyncMeta = {
        lastUpdatedAt: new Date().toISOString(),
        files: {},
        pathToId: {},
      };

      // Read existing local meta to reuse Drive file IDs
      const oldLocalMeta = await readLocalSyncMeta(this.app, this.workspaceFolder);

      // Get all vault files and compute checksums
      const vaultFiles = this.getAllVaultFiles();
      const { checksums, vaultStats: fullPushVaultStats } = await this.computeVaultChecksums(vaultFiles, oldLocalMeta);

      // Upload all files
      let uploadedCount = 0;
      const allPaths = vaultFiles.map(f => f.path);

      for (let i = 0; i < allPaths.length; i += CONCURRENCY) {
        const batch = allPaths.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (path) => {
          const existingId = oldLocalMeta.pathToId[path];
          await this.uploadFile(accessToken, rootFolderId, path, existingId, remoteMeta, newLocalMeta, checksums);
          uploadedCount++;
        }));
      }

      // Write updated remote meta
      remoteMeta.lastUpdatedAt = new Date().toISOString();
      await writeRemoteSyncMeta(accessToken, rootFolderId, remoteMeta);

      // Save local meta (with vault stats for mtime/size caching)
      const updatedLocalMeta = toLocalSyncMeta(remoteMeta, newLocalMeta, fullPushVaultStats);
      await writeLocalSyncMeta(this.app, this.workspaceFolder, updatedLocalMeta);

      // Full push: clear all edit history
      const historyManager = getEditHistoryManager();
      if (historyManager) {
        historyManager.clearAllHistory();
      }

      this.syncStatus = "idle";
      new Notice(`Drive sync: full push completed (${uploadedCount} files)`);
    } catch (err) {
      this.lastError = formatError(err);
      this.syncStatus = "error";
      new Notice(`Drive sync full push failed: ${this.lastError}`);
    } finally {
      this.syncLock = false;
      await this.refreshSyncCounts();
    }
  }

  // ========================================
  // Conflict Resolution
  // ========================================

  async resolveConflict(fileId: string, choice: "local" | "remote"): Promise<void> {
    if (this.syncLock) {
      console.warn("[DriveSync] resolveConflict skipped: sync already in progress");
      return;
    }
    this.syncLock = true;
    this.lastError = null;

    let shouldPull = false;
    try {
      const tokens = await this.getTokens();
      const { accessToken, rootFolderId } = tokens;
      const localMeta = await readLocalSyncMeta(this.app, this.workspaceFolder);
      const remoteMeta = await readRemoteSyncMeta(accessToken, rootFolderId);
      if (!remoteMeta) throw new Error("Remote meta not found");

      const conflict = this.conflicts.find(c => c.fileId === fileId);
      if (!conflict) throw new Error("Conflict not found");

      const idToPath = buildIdToPathMap(localMeta);
      const vaultPath = idToPath[fileId] || conflict.fileName;

      if (conflict.isEditDelete) {
        await this.resolveEditDeleteConflict(
          accessToken, rootFolderId, fileId, vaultPath, choice, localMeta, remoteMeta
        );
      } else {
        await this.resolveNormalConflict(
          accessToken, rootFolderId, fileId, vaultPath, choice, localMeta, remoteMeta
        );
      }

      // Clear edit history for resolved conflict file
      const historyManager = getEditHistoryManager();
      if (historyManager) {
        historyManager.clearHistory(vaultPath);
        historyManager.clearSnapshot(vaultPath);
      }

      // Remove resolved conflict
      this.conflicts = this.conflicts.filter(c => c.fileId !== fileId);

      // If no more conflicts, continue pull while still holding the lock
      if (this.conflicts.length === 0 && this.syncStatus === "conflict") {
        shouldPull = true;
      }
    } catch (err) {
      this.lastError = formatError(err);
      this.syncStatus = "error";
      throw err;
    } finally {
      this.syncLock = false;
    }

    if (shouldPull) {
      // pull() acquires its own lock; no gap for interleaving
      // since JS is single-threaded and we release+reacquire synchronously
      await this.pull();
    }
  }

  private async resolveNormalConflict(
    accessToken: string,
    rootFolderId: string,
    fileId: string,
    vaultPath: string,
    choice: "local" | "remote",
    localMeta: LocalDriveSyncMeta,
    remoteMeta: SyncMeta
  ): Promise<void> {
    const isBinary = isBinaryExtension(vaultPath);

    if (choice === "local") {
      // Local wins: upload local content to Drive, backup remote
      const file = this.app.vault.getAbstractFileByPath(vaultPath);
      if (file instanceof TFile) {
        // Backup remote content (binary or text)
        if (isBinary) {
          const remoteContent = await drive.readFileRaw(accessToken, fileId);
          await saveConflictBackup(accessToken, rootFolderId, vaultPath, remoteContent);
        } else {
          const remoteContent = await drive.readFile(accessToken, fileId);
          await saveConflictBackup(accessToken, rootFolderId, vaultPath, remoteContent);
        }

        // Upload local content
        const mimeType = getMimeType(vaultPath);
        let driveFile: drive.DriveFile;
        if (isBinary) {
          const content = await this.app.vault.readBinary(file);
          driveFile = await drive.updateFileBinary(accessToken, fileId, content, mimeType);
        } else {
          const content = await this.app.vault.read(file);
          driveFile = await drive.updateFile(accessToken, fileId, content, mimeType);
        }

        upsertFileInMeta(remoteMeta, driveFile, vaultPath);
      }
    } else {
      // Remote wins: download remote content, backup local
      const file = this.app.vault.getAbstractFileByPath(vaultPath);
      if (file instanceof TFile) {
        if (isBinary) {
          const localContent = await this.app.vault.readBinary(file);
          await saveConflictBackup(accessToken, rootFolderId, vaultPath, localContent);
        } else {
          const localContent = await this.app.vault.read(file);
          await saveConflictBackup(accessToken, rootFolderId, vaultPath, localContent);
        }
      }

      // Download remote content
      await this.downloadFile(accessToken, rootFolderId, fileId, remoteMeta, localMeta);
    }

    // Update remote and local meta
    await writeRemoteSyncMeta(accessToken, rootFolderId, remoteMeta);
    const updatedLocalMeta = toLocalSyncMeta(remoteMeta, localMeta);
    await writeLocalSyncMeta(this.app, this.workspaceFolder, updatedLocalMeta);
  }

  private async resolveEditDeleteConflict(
    accessToken: string,
    rootFolderId: string,
    fileId: string,
    vaultPath: string,
    choice: "local" | "remote",
    localMeta: LocalDriveSyncMeta,
    remoteMeta: SyncMeta
  ): Promise<void> {
    if (choice === "local") {
      // Keep local file: re-upload to Drive
      const file = this.app.vault.getAbstractFileByPath(vaultPath);
      if (file instanceof TFile) {
        const mimeType = getMimeType(vaultPath);
        const isBinary = isBinaryExtension(vaultPath);

        // Drive uses flat structure: file name = vault path
        let driveFile: drive.DriveFile;
        if (isBinary) {
          const content = await this.app.vault.readBinary(file);
          driveFile = await drive.createFileBinary(accessToken, vaultPath, content, rootFolderId, mimeType);
        } else {
          const content = await this.app.vault.read(file);
          driveFile = await drive.createFile(accessToken, vaultPath, content, rootFolderId, mimeType);
        }

        // Update mappings with new file ID
        delete localMeta.pathToId[vaultPath];
        localMeta.pathToId[vaultPath] = driveFile.id;
        upsertFileInMeta(remoteMeta, driveFile, vaultPath);
      }
    } else {
      // Accept deletion: remove local file
      const file = this.app.vault.getAbstractFileByPath(vaultPath);
      if (file instanceof TFile) {
        // Backup before deleting (binary or text)
        if (isBinaryExtension(vaultPath)) {
          const content = await this.app.vault.readBinary(file);
          await saveConflictBackup(accessToken, rootFolderId, vaultPath, content);
        } else {
          const content = await this.app.vault.read(file);
          await saveConflictBackup(accessToken, rootFolderId, vaultPath, content);
        }
        await this.app.fileManager.trashFile(file);
      }
      delete localMeta.pathToId[vaultPath];
      delete localMeta.files[fileId];
    }

    // Remove old file ID from remote meta
    removeFileFromMeta(remoteMeta, fileId);

    await writeRemoteSyncMeta(accessToken, rootFolderId, remoteMeta);
    const updatedLocalMeta = toLocalSyncMeta(remoteMeta, localMeta);
    await writeLocalSyncMeta(this.app, this.workspaceFolder, updatedLocalMeta);
  }

  // ========================================
  // Trash Management (trash/ folder on Drive)
  // ========================================

  async listTrashFiles(): Promise<drive.DriveFile[]> {
    const tokens = await this.getTokens();
    const trashFolderId = await drive.ensureSubFolder(tokens.accessToken, tokens.rootFolderId, "trash");
    return drive.listFiles(tokens.accessToken, trashFolderId);
  }

  async restoreFromTrash(fileIds: string[]): Promise<number> {
    const tokens = await this.getTokens();
    const { accessToken, rootFolderId } = tokens;
    const trashFolderId = await drive.ensureSubFolder(accessToken, rootFolderId, "trash");
    const remoteMeta = await readRemoteSyncMeta(accessToken, rootFolderId) ?? {
      lastUpdatedAt: new Date().toISOString(),
      files: {},
    };

    let restored = 0;
    for (const fileId of fileIds) {
      try {
        await drive.moveFile(accessToken, fileId, rootFolderId, trashFolderId);
        const fileMeta = await drive.getFileMetadata(accessToken, fileId);
        upsertFileInMeta(remoteMeta, fileMeta, fileMeta.name);
        restored++;
      } catch (err) {
        // ignore individual restore failures
        console.debug("[DriveSync] restoreFromTrash failed for file:", fileId, err);
      }
    }

    if (restored > 0) {
      await writeRemoteSyncMeta(accessToken, rootFolderId, remoteMeta);
    }
    return restored;
  }

  async permanentDeleteFiles(fileIds: string[]): Promise<number> {
    const tokens = await this.getTokens();
    let deleted = 0;
    for (const fileId of fileIds) {
      try {
        await drive.deleteFile(tokens.accessToken, fileId);
        deleted++;
      } catch (err) {
        // ignore individual delete failures
        console.debug("[DriveSync] permanentDeleteFiles failed for file:", fileId, err);
      }
    }
    return deleted;
  }

  // ========================================
  // Conflict Backup Management (sync_conflicts/ folder on Drive)
  // ========================================

  async listConflictFiles(): Promise<drive.DriveFile[]> {
    const tokens = await this.getTokens();
    const conflictFolderId = await drive.ensureSubFolder(tokens.accessToken, tokens.rootFolderId, "sync_conflicts");
    return drive.listFiles(tokens.accessToken, conflictFolderId);
  }

  async restoreConflictFile(fileId: string, restoreName: string): Promise<void> {
    const tokens = await this.getTokens();
    const { accessToken } = tokens;
    const isBinary = isBinaryExtension(restoreName);

    // Read conflict backup content from Drive and write to local vault only.
    // The file will be pushed to Drive on the next push.
    const dirPath = restoreName.substring(0, restoreName.lastIndexOf("/"));
    if (dirPath) await this.ensureVaultFolder(dirPath);

    const existingLocal = this.app.vault.getAbstractFileByPath(restoreName);
    if (isBinary) {
      const content = await drive.readFileRaw(accessToken, fileId);
      if (existingLocal instanceof TFile) {
        await this.app.vault.modifyBinary(existingLocal, content);
      } else {
        await this.app.vault.createBinary(restoreName, content);
      }
    } else {
      const content = await drive.readFile(accessToken, fileId);
      if (existingLocal instanceof TFile) {
        await this.app.vault.modify(existingLocal, content);
      } else {
        await this.app.vault.create(restoreName, content);
      }
    }

    // Delete the conflict backup file from Drive
    await drive.deleteFile(accessToken, fileId);
  }

  async deleteConflictFiles(fileIds: string[]): Promise<number> {
    const tokens = await this.getTokens();
    let deleted = 0;
    for (const fileId of fileIds) {
      try {
        await drive.deleteFile(tokens.accessToken, fileId);
        deleted++;
      } catch (err) {
        // ignore individual delete failures
        console.debug("[DriveSync] deleteConflictFiles failed for file:", fileId, err);
      }
    }
    return deleted;
  }

  // ========================================
  // Temp File Management (__TEMP__/ folder on Drive)
  // ========================================

  async listTempFiles(): Promise<Array<{ file: drive.DriveFile; payload: TempFilePayload }>> {
    const tokens = await this.getTokens();
    const tempFolderId = await drive.ensureSubFolder(tokens.accessToken, tokens.rootFolderId, "__TEMP__");
    const files = await drive.listFiles(tokens.accessToken, tempFolderId);

    const results: Array<{ file: drive.DriveFile; payload: TempFilePayload }> = [];
    for (const file of files) {
      if (file.name.startsWith("_")) continue;
      try {
        const raw = await drive.readFile(tokens.accessToken, file.id);
        const payload: TempFilePayload = JSON.parse(raw);
        results.push({ file, payload });
      } catch (err) {
        // skip malformed temp files
        console.debug("[DriveSync] listTempFiles: skipping malformed temp file:", file.id, err);
      }
    }
    return results;
  }

  async applyTempFile(tempFileId: string, payload: TempFilePayload): Promise<void> {
    const tokens = await this.getTokens();
    const { accessToken, rootFolderId } = tokens;

    // Write content to the actual Drive file
    if (payload.isBinary) {
      await drive.updateFileBinary(accessToken, payload.fileId, base64ToArrayBuffer(payload.content));
    } else {
      await drive.updateFile(accessToken, payload.fileId, payload.content);
    }

    // Update remote meta
    const fileMeta = await drive.getFileMetadata(accessToken, payload.fileId);
    const remoteMeta = await readRemoteSyncMeta(accessToken, rootFolderId) ?? {
      lastUpdatedAt: new Date().toISOString(),
      files: {},
    };
    upsertFileInMeta(remoteMeta, fileMeta, fileMeta.name);
    await writeRemoteSyncMeta(accessToken, rootFolderId, remoteMeta);

    // Delete the temp file
    await drive.deleteFile(accessToken, tempFileId);
  }

  /**
   * Save a vault file to __TEMP__/ on Drive.
   * Mirrors GemiHub's saveTempFile logic (overwrite if same name exists).
   * Returns { fileId, fileName } for use by callers.
   */
  async saveTempFile(vaultPath: string): Promise<{ fileId: string; fileName: string }> {
    const tokens = await this.getTokens();
    const { accessToken, rootFolderId } = tokens;

    const localMeta = await readLocalSyncMeta(this.app, this.workspaceFolder);
    const fileId = localMeta.pathToId[vaultPath] || vaultPath;

    const file = this.app.vault.getAbstractFileByPath(vaultPath);
    if (!(file instanceof TFile)) throw new Error(`File not found: ${vaultPath}`);
    if (file.stat.size > MAX_TEMP_FILE_BYTES) {
      throw new Error(`File too large (${Math.round(file.stat.size / 1024 / 1024)}MB). Max 30MB.`);
    }

    const binary = isBinaryExtension(vaultPath);
    const content = binary
      ? arrayBufferToBase64(await this.app.vault.readBinary(file))
      : await this.app.vault.read(file);

    const payload: TempFilePayload = {
      fileId,
      content,
      savedAt: new Date().toISOString(),
      isBinary: binary,
    };

    const tempFolderId = await drive.ensureSubFolder(accessToken, rootFolderId, "__TEMP__");
    const fileName = vaultPath.split("/").pop() || vaultPath;
    const payloadJson = JSON.stringify(payload);

    // Overwrite if same name exists
    const existing = (await drive.listFiles(accessToken, tempFolderId))
      .find((f) => f.name === fileName);
    if (existing) {
      await drive.updateFile(accessToken, existing.id, payloadJson, "application/json");
    } else {
      await drive.createFile(accessToken, fileName, payloadJson, tempFolderId, "application/json");
    }

    return { fileId, fileName };
  }

  /**
   * Download a temp file's content to the vault, then apply to Drive and delete temp.
   */
  async downloadTempToVault(tempFileId: string, payload: TempFilePayload): Promise<void> {
    // Resolve vault path from fileId
    const localMeta = await readLocalSyncMeta(this.app, this.workspaceFolder);
    const idToPath = buildIdToPathMap(localMeta);
    const vaultPath = idToPath[payload.fileId] || payload.fileId;

    // Ensure parent directory exists
    const dirPath = vaultPath.substring(0, vaultPath.lastIndexOf("/"));
    if (dirPath) {
      await this.ensureVaultFolder(dirPath);
    }

    // Write to vault (use vault API to update Obsidian's internal cache/file tree)
    const existingFile = this.app.vault.getAbstractFileByPath(vaultPath);
    if (payload.isBinary) {
      const buf = base64ToArrayBuffer(payload.content);
      if (existingFile instanceof TFile) {
        await this.app.vault.modifyBinary(existingFile, buf);
      } else {
        await this.app.vault.createBinary(vaultPath, buf);
      }
    } else {
      if (existingFile instanceof TFile) {
        await this.app.vault.modify(existingFile, payload.content);
      } else {
        await this.app.vault.create(vaultPath, payload.content);
      }
    }

    // Apply to Drive and delete temp
    await this.applyTempFile(tempFileId, payload);
  }

  async deleteTempFiles(fileIds: string[]): Promise<number> {
    const tokens = await this.getTokens();
    let deleted = 0;
    for (const fileId of fileIds) {
      try {
        await drive.deleteFile(tokens.accessToken, fileId);
        deleted++;
      } catch (err) {
        // ignore individual delete failures
        console.debug("[DriveSync] deleteTempFiles failed for file:", fileId, err);
      }
    }
    return deleted;
  }

  // ========================================
  // RAG Sync (after push)
  // ========================================

  private static readonly GEMIHUB_RAG_STORE_KEY = "gemihub";
  private static readonly RAG_CONCURRENCY = 5;

  /**
   * Sync files to the gemihub RAG store after a successful push.
   * Handles deletions, renames, and new/modified file uploads with checksum-based skip.
   */
  private async syncRagAfterPush(
    accessToken: string,
    rootFolderId: string,
    uploadedPaths: string[],
    renames: Map<string, string>,
    deletedPaths: string[]
  ): Promise<void> {
    // 1. Precondition checks
    if (!this.plugin.settings.ragEnabled) return;

    const ragSetting = this.plugin.workspaceState.ragSettings[DriveSyncManager.GEMIHUB_RAG_STORE_KEY];
    if (!ragSetting) return;
    if (!ragSetting.storeId) return;
    if (ragSetting.isExternal) return;

    const fileSearchManager = getFileSearchManager();
    if (!fileSearchManager) return;

    const storeId = ragSetting.storeId;

    // 2. Build filter config with workspace/.obsidian exclusions
    const excludePatterns = [...ragSetting.excludePatterns];
    const workspaceFolder = this.plugin.settings.workspaceFolder;
    if (workspaceFolder) {
      excludePatterns.push(`^${workspaceFolder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`);
    }
    excludePatterns.push(`^\\.obsidian/`);
    const filterConfig: FilterConfig = {
      includeFolders: ragSetting.targetFolders,
      excludePatterns,
    };

    const updatedFiles: Record<string, RagFileInfo> = { ...ragSetting.files };

    // 3. Delete files from RAG store
    for (const filePath of deletedPaths) {
      if (!updatedFiles[filePath]) continue;
      try {
        await fileSearchManager.deleteFileFromStoreById(filePath, storeId);
      } catch {
        // Ignore deletion errors
      }
      delete updatedFiles[filePath];
    }

    // 4. Handle renames (delete old path, upload new path)
    for (const [oldPath, newPath] of renames) {
      // Delete old path from RAG store
      if (updatedFiles[oldPath]) {
        try {
          await fileSearchManager.deleteFileFromStoreById(oldPath, storeId);
        } catch {
          // Ignore deletion errors
        }
        delete updatedFiles[oldPath];
      }

      // Upload new path if eligible
      const newFile = this.app.vault.getAbstractFileByPath(newPath);
      if (!(newFile instanceof TFile)) continue;
      if (!isSupportedFile(newFile)) continue;
      if (!shouldIncludeFile(newPath, filterConfig)) continue;

      try {
        const { checksum } = await fileSearchManager.getChecksumForFile(newFile);
        const fileId = await fileSearchManager.uploadFileToStore(newFile, storeId);
        updatedFiles[newPath] = { checksum, uploadedAt: Date.now(), fileId };
      } catch (err) {
        console.debug(`[DriveSync] RAG upload failed for renamed file: ${newPath}`, err);
      }
    }

    // 5. Upload new/modified files (checksum-based skip, batched)
    const renamedNewPaths = new Set(renames.values());
    const filesToProcess = uploadedPaths.filter(p => !renamedNewPaths.has(p));
    const uploadQueue: Array<{ file: TFile; path: string }> = [];

    for (const path of filesToProcess) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      if (!isSupportedFile(file)) continue;
      if (!shouldIncludeFile(path, filterConfig)) continue;
      uploadQueue.push({ file, path });
    }

    // Process uploads in batches with concurrency limit
    for (let i = 0; i < uploadQueue.length; i += DriveSyncManager.RAG_CONCURRENCY) {
      const batch = uploadQueue.slice(i, i + DriveSyncManager.RAG_CONCURRENCY);
      await Promise.all(batch.map(async ({ file, path }) => {
        try {
          const { checksum } = await fileSearchManager.getChecksumForFile(file);

          // Skip if unchanged
          const existing = updatedFiles[path];
          if (existing && existing.checksum === checksum) return;

          // Delete old document if it exists
          if (existing) {
            try {
              await fileSearchManager.deleteFileFromStoreById(path, storeId);
            } catch {
              // Ignore deletion errors
            }
          }

          const fileId = await fileSearchManager.uploadFileToStore(file, storeId);
          updatedFiles[path] = { checksum, uploadedAt: Date.now(), fileId };
        } catch (err) {
          console.debug(`[DriveSync] RAG upload failed for: ${path}`, err);
        }
      }));
    }

    // 6. Update local workspace state
    this.plugin.workspaceState.ragSettings[DriveSyncManager.GEMIHUB_RAG_STORE_KEY] = {
      ...ragSetting,
      files: updatedFiles,
    };
    await this.plugin.saveWorkspaceState();

    // 7. Update gemihub settings.json on Drive
    await this.updateGemihubSettingsOnDrive(accessToken, rootFolderId, updatedFiles);

    console.debug(`[DriveSync] RAG sync completed: ${Object.keys(updatedFiles).length} files tracked`);
  }

  /**
   * Update gemihub's settings.json on Drive with the current RAG file tracking info.
   * Reads existing settings, merges ragSettings["gemihub"].files with status: "registered",
   * and writes back to Drive.
   */
  private async updateGemihubSettingsOnDrive(
    accessToken: string,
    rootFolderId: string,
    files: Record<string, RagFileInfo>
  ): Promise<void> {
    const SETTINGS_FILE_NAME = "settings.json";

    try {
      // Read existing settings.json from Drive
      const existingFile = await drive.findFileByExactName(accessToken, SETTINGS_FILE_NAME, rootFolderId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let settings: Record<string, any> = {};
      if (existingFile) {
        const content = await drive.readFile(accessToken, existingFile.id);
        try {
          settings = JSON.parse(content);
        } catch {
          // Invalid JSON, start fresh
          settings = {};
        }
      }

      // Ensure ragSettings structure exists
      if (!settings.ragSettings) {
        settings.ragSettings = {};
      }
      if (!settings.ragSettings[DriveSyncManager.GEMIHUB_RAG_STORE_KEY]) {
        settings.ragSettings[DriveSyncManager.GEMIHUB_RAG_STORE_KEY] = {};
      }

      // Merge files with status: "registered" for gemihub compatibility
      const gemihubFiles: Record<string, RagFileInfo & { status: string }> = {};
      for (const [path, info] of Object.entries(files)) {
        gemihubFiles[path] = { ...info, status: "registered" };
      }
      settings.ragSettings[DriveSyncManager.GEMIHUB_RAG_STORE_KEY].files = gemihubFiles;

      // Copy storeId from local ragSetting
      const localRagSetting = this.plugin.workspaceState.ragSettings[DriveSyncManager.GEMIHUB_RAG_STORE_KEY];
      if (localRagSetting) {
        settings.ragSettings[DriveSyncManager.GEMIHUB_RAG_STORE_KEY].storeId = localRagSetting.storeId;
        settings.ragSettings[DriveSyncManager.GEMIHUB_RAG_STORE_KEY].storeName = localRagSetting.storeName;
      }

      // Set ragEnabled and selectedRagSetting if files are registered
      if (Object.keys(files).length > 0) {
        settings.ragEnabled = true;
        settings.selectedRagSetting = DriveSyncManager.GEMIHUB_RAG_STORE_KEY;
      }

      // Write back to Drive
      const content = JSON.stringify(settings, null, 2);
      if (existingFile) {
        await drive.updateFile(accessToken, existingFile.id, content, "application/json");
      } else {
        await drive.createFile(accessToken, SETTINGS_FILE_NAME, content, rootFolderId, "application/json");
      }
    } catch (err) {
      console.debug("[DriveSync] Failed to update gemihub settings.json on Drive:", err);
    }
  }

  destroy(): void {
    this.stopAutoSync();
    this.sessionTokens = null;
    this.conflicts = [];
    this.lastError = null;
  }
}
