// Sync metadata management for Google Drive sync.
// Manages both local (Vault) and remote (Drive) sync metadata.
// Adapted from GemiHub's sync-meta.server.ts.

import type { App } from "obsidian";
import {
  listUserFiles,
  readFile,
  createFile,
  createFileBinary,
  updateFile,
  findFileByExactName,
  ensureSubFolder,
  type DriveFile,
} from "./googleDrive";
import { SYNC_META_FILE_NAME, type SyncMeta } from "./syncDiff";

// ========================================
// Local sync metadata (stored in Vault)
// ========================================

export interface LocalDriveSyncMeta {
  lastUpdatedAt: string;
  files: Record<string, {
    md5Checksum: string;
    modifiedTime: string;
    name?: string;
    localMtime?: number;  // Vault file mtime (epoch ms) for checksum skip
    localSize?: number;   // Vault file size (bytes) for checksum skip
  }>;
  pathToId: Record<string, string>;  // Vault path → Drive file ID
}

const EMPTY_LOCAL_META: LocalDriveSyncMeta = {
  lastUpdatedAt: "",
  files: {},
  pathToId: {},
};

export function getLocalMetaPath(workspaceFolder: string): string {
  return `${workspaceFolder}/drive-sync-meta.json`;
}

export async function readLocalSyncMeta(
  app: App,
  workspaceFolder: string
): Promise<LocalDriveSyncMeta> {
  const metaPath = getLocalMetaPath(workspaceFolder);
  try {
    const exists = await app.vault.adapter.exists(metaPath);
    if (!exists) return { ...EMPTY_LOCAL_META, files: {}, pathToId: {} };
    const content = await app.vault.adapter.read(metaPath);
    return JSON.parse(content) as LocalDriveSyncMeta;
  } catch (err) {
    console.error("[DriveSync] Failed to read local sync meta:", err);
    return { ...EMPTY_LOCAL_META, files: {}, pathToId: {} };
  }
}

export async function writeLocalSyncMeta(
  app: App,
  workspaceFolder: string,
  meta: LocalDriveSyncMeta
): Promise<void> {
  const metaPath = getLocalMetaPath(workspaceFolder);
  // Ensure workspace folder exists
  const folderExists = await app.vault.adapter.exists(workspaceFolder);
  if (!folderExists) {
    await app.vault.adapter.mkdir(workspaceFolder);
  }
  await app.vault.adapter.write(metaPath, JSON.stringify(meta, null, 2));
}

/**
 * Build a reverse map: Drive file ID → Vault path
 */
export function buildIdToPathMap(meta: LocalDriveSyncMeta): Record<string, string> {
  const idToPath: Record<string, string> = {};
  for (const [path, id] of Object.entries(meta.pathToId)) {
    idToPath[id] = path;
  }
  return idToPath;
}

// ========================================
// Remote sync metadata (stored on Drive as _sync-meta.json)
// ========================================

export async function readRemoteSyncMeta(
  accessToken: string,
  rootFolderId: string
): Promise<SyncMeta | null> {
  const metaFile = await findFileByExactName(
    accessToken,
    SYNC_META_FILE_NAME,
    rootFolderId
  );
  if (!metaFile) return null;

  try {
    const content = await readFile(accessToken, metaFile.id);
    return JSON.parse(content) as SyncMeta;
  } catch (err) {
    console.error("[DriveSync] Failed to read remote sync meta:", err);
    return null;
  }
}

export async function writeRemoteSyncMeta(
  accessToken: string,
  rootFolderId: string,
  meta: SyncMeta
): Promise<void> {
  const metaFile = await findFileByExactName(
    accessToken,
    SYNC_META_FILE_NAME,
    rootFolderId
  );
  const content = JSON.stringify(meta, null, 2);

  if (metaFile) {
    await updateFile(accessToken, metaFile.id, content, "application/json");
  } else {
    await createFile(
      accessToken,
      SYNC_META_FILE_NAME,
      content,
      rootFolderId,
      "application/json"
    );
  }
}

/**
 * Rebuild sync meta from Drive API (full scan).
 */
export async function rebuildSyncMeta(
  accessToken: string,
  rootFolderId: string
): Promise<SyncMeta> {
  const existing = await readRemoteSyncMeta(accessToken, rootFolderId);
  const files = await listUserFiles(accessToken, rootFolderId);
  const meta: SyncMeta = {
    lastUpdatedAt: new Date().toISOString(),
    files: {},
  };
  for (const f of files) {
    const prev = existing?.files[f.id];
    meta.files[f.id] = {
      name: f.name,
      path: prev?.path,
      mimeType: f.mimeType,
      md5Checksum: f.md5Checksum ?? "",
      modifiedTime: f.modifiedTime ?? "",
      createdTime: f.createdTime,
      shared: prev?.shared,
      webViewLink: prev?.webViewLink,
    };
  }
  await writeRemoteSyncMeta(accessToken, rootFolderId, meta);
  return meta;
}

/**
 * Add or update a single file entry in remote meta.
 */
export function upsertFileInMeta(
  meta: SyncMeta,
  file: DriveFile,
  vaultPath?: string
): void {
  meta.files[file.id] = {
    name: file.name,
    path: vaultPath,
    mimeType: file.mimeType,
    md5Checksum: file.md5Checksum ?? "",
    modifiedTime: file.modifiedTime ?? "",
    createdTime: file.createdTime,
  };
  meta.lastUpdatedAt = new Date().toISOString();
}

/**
 * Remove a file entry from remote meta.
 */
export function removeFileFromMeta(
  meta: SyncMeta,
  fileId: string
): void {
  delete meta.files[fileId];
  meta.lastUpdatedAt = new Date().toISOString();
}

/**
 * Save a conflict backup to the sync_conflicts/ folder on Drive.
 * Supports both text (string) and binary (ArrayBuffer) content.
 */
export async function saveConflictBackup(
  accessToken: string,
  rootFolderId: string,
  fileName: string,
  content: string | ArrayBuffer
): Promise<void> {
  const folderId = await ensureSubFolder(accessToken, rootFolderId, "sync_conflicts");
  const now = new Date();
  const ts = now.toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
  const safeName = fileName.replace(/\//g, "_");
  const dotIdx = safeName.lastIndexOf(".");
  const backupName = dotIdx > 0
    ? `${safeName.slice(0, dotIdx)}_${ts}${safeName.slice(dotIdx)}`
    : `${safeName}_${ts}`;
  if (content instanceof ArrayBuffer) {
    await createFileBinary(accessToken, backupName, content, folderId);
  } else {
    await createFile(accessToken, backupName, content, folderId, "text/plain");
  }
}

/**
 * Convert remote SyncMeta to local format (for syncing after push/pull).
 */
export function toLocalSyncMeta(
  remoteMeta: SyncMeta,
  existingLocal: LocalDriveSyncMeta | null,
  vaultStats?: Map<string, { mtime: number; size: number }>
): LocalDriveSyncMeta {
  const files: LocalDriveSyncMeta["files"] = {};
  const pathToId: Record<string, string> = existingLocal?.pathToId
    ? { ...existingLocal.pathToId }
    : {};

  for (const [id, f] of Object.entries(remoteMeta.files)) {
    const vaultPath = f.path || f.name;
    const stats = vaultStats?.get(vaultPath);
    const existing = existingLocal?.files[id];
    // Only carry over cached mtime/size if checksum hasn't changed;
    // otherwise the cached values are stale and must be recomputed.
    const checksumUnchanged = existing && existing.md5Checksum === (f.md5Checksum ?? "");
    files[id] = {
      md5Checksum: f.md5Checksum ?? "",
      modifiedTime: f.modifiedTime ?? "",
      name: f.name,
      localMtime: stats?.mtime ?? (checksumUnchanged ? existing.localMtime : undefined),
      localSize: stats?.size ?? (checksumUnchanged ? existing.localSize : undefined),
    };
    // Update path mapping (use name as fallback for GemiHub-created files without path)
    // Remove old mapping for this ID (in case path changed)
    for (const [existingPath, existingId] of Object.entries(pathToId)) {
      if (existingId === id && existingPath !== vaultPath) {
        delete pathToId[existingPath];
      }
    }
    pathToId[vaultPath] = id;
  }

  return {
    lastUpdatedAt: remoteMeta.lastUpdatedAt,
    files,
    pathToId,
  };
}
