// Google Drive API client for Obsidian.
// Ported from GemiHub's google-drive.server.ts — uses Obsidian's requestUrl instead of fetch.

import { requestUrl, type RequestUrlResponse } from "obsidian";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

const SYSTEM_FILES = new Set(["settings.json", "_sync-meta.json"]);

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  createdTime?: string;
  parents?: string[];
  webViewLink?: string;
  md5Checksum?: string;
  size?: string;
}

interface DriveListResponse {
  files: DriveFile[];
  nextPageToken?: string;
}

/**
 * Make a Drive API request with retry on 429/503.
 */
async function driveRequest(
  url: string,
  accessToken: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | ArrayBuffer;
    contentType?: string;
  } = {},
  retries = 2
): Promise<RequestUrlResponse> {
  const response = await requestUrl({
    url,
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
    body: options.body,
    contentType: options.contentType,
    throw: false,
  });

  // Retry on 429 (rate limit) or 503 (service unavailable)
  if ((response.status === 429 || response.status === 503) && retries > 0) {
    const retryAfter = parseInt(response.headers["retry-after"] || "2", 10);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return driveRequest(url, accessToken, options, retries - 1);
  }

  if (response.status < 200 || response.status >= 300) {
    const body = response.text?.slice(0, 200) ?? "";
    throw new Error(`Drive API error ${response.status}: ${body}`);
  }

  return response;
}

// ========================================
// Folder operations
// ========================================

export async function ensureRootFolder(accessToken: string, folderName: string = "gemihub"): Promise<string> {
  const query = `name='${escapeDriveQuery(folderName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await driveRequest(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    accessToken
  );
  const data = res.json as DriveListResponse;

  if (data.files.length > 0) {
    return data.files[0].id;
  }

  const createRes = await driveRequest(`${DRIVE_API}/files`, accessToken, {
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  const folder = createRes.json as DriveFile;
  return folder.id;
}

// In-flight deduplication for ensureSubFolder
const subFolderInflight = new Map<string, Promise<string>>();

export async function ensureSubFolder(
  accessToken: string,
  parentId: string,
  folderName: string
): Promise<string> {
  const cacheKey = `${parentId}:${folderName}`;
  const inflight = subFolderInflight.get(cacheKey);
  if (inflight) return inflight;

  const promise = ensureSubFolderImpl(accessToken, parentId, folderName).finally(() => {
    subFolderInflight.delete(cacheKey);
  });
  subFolderInflight.set(cacheKey, promise);
  return promise;
}

async function ensureSubFolderImpl(
  accessToken: string,
  parentId: string,
  folderName: string
): Promise<string> {
  const query = `name='${escapeDriveQuery(folderName)}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await driveRequest(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    accessToken
  );
  const data = res.json as DriveListResponse;

  if (data.files.length > 0) {
    return data.files[0].id;
  }

  const createRes = await driveRequest(`${DRIVE_API}/files`, accessToken, {
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  const folder = createRes.json as DriveFile;
  return folder.id;
}

/**
 * Ensure nested folder path exists on Drive, returning the deepest folder's ID.
 * e.g., "notes/daily" creates "notes" then "daily" inside it.
 */
export async function ensureFolderPath(
  accessToken: string,
  rootFolderId: string,
  folderPath: string
): Promise<string> {
  const parts = folderPath.split("/").filter(Boolean);
  let currentParentId = rootFolderId;
  for (const part of parts) {
    currentParentId = await ensureSubFolder(accessToken, currentParentId, part);
  }
  return currentParentId;
}

// ========================================
// File listing
// ========================================

export async function listFiles(
  accessToken: string,
  folderId: string,
  mimeType?: string
): Promise<DriveFile[]> {
  let query = `'${folderId}' in parents and trashed=false`;
  if (mimeType) {
    query += ` and mimeType='${mimeType}'`;
  }

  const allFiles: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${DRIVE_API}/files`);
    url.searchParams.set("q", query);
    url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,modifiedTime,createdTime,webViewLink,md5Checksum)");
    url.searchParams.set("orderBy", "modifiedTime desc");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await driveRequest(url.toString(), accessToken);
    const data = res.json as DriveListResponse;
    allFiles.push(...data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

export async function listUserFiles(
  accessToken: string,
  rootFolderId: string
): Promise<DriveFile[]> {
  const allFiles = await listFiles(accessToken, rootFolderId);
  return allFiles.filter(
    (f) =>
      f.mimeType !== "application/vnd.google-apps.folder" &&
      !SYSTEM_FILES.has(f.name)
  );
}

// ========================================
// File read
// ========================================

export async function readFile(
  accessToken: string,
  fileId: string
): Promise<string> {
  const res = await driveRequest(
    `${DRIVE_API}/files/${fileId}?alt=media`,
    accessToken
  );
  return res.text;
}

export async function readFileRaw(
  accessToken: string,
  fileId: string
): Promise<ArrayBuffer> {
  const res = await driveRequest(
    `${DRIVE_API}/files/${fileId}?alt=media`,
    accessToken
  );
  return res.arrayBuffer;
}

// ========================================
// File metadata
// ========================================

export async function getFileMetadata(
  accessToken: string,
  fileId: string
): Promise<DriveFile> {
  const res = await driveRequest(
    `${DRIVE_API}/files/${fileId}?fields=id,name,mimeType,modifiedTime,createdTime,parents,webViewLink,md5Checksum,size`,
    accessToken
  );
  return res.json as DriveFile;
}

// ========================================
// File create (text)
// ========================================

export async function createFile(
  accessToken: string,
  name: string,
  content: string,
  parentId: string,
  mimeType: string = "text/plain"
): Promise<DriveFile> {
  const metadata = { name, parents: [parentId], mimeType };
  const boundary = "-------boundary" + Date.now();
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  const res = await driveRequest(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,createdTime,webViewLink,md5Checksum`,
    accessToken,
    {
      method: "POST",
      contentType: `multipart/related; boundary=${boundary}`,
      body,
    }
  );
  return res.json as DriveFile;
}

// ========================================
// File create (binary)
// ========================================

export async function createFileBinary(
  accessToken: string,
  name: string,
  contentBuffer: ArrayBuffer,
  parentId: string,
  mimeType: string = "application/octet-stream"
): Promise<DriveFile> {
  const metadata = JSON.stringify({ name, parents: [parentId], mimeType });
  const boundary = "-------boundary" + Date.now();

  const preamble = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
  );
  const epilogue = new TextEncoder().encode(`\r\n--${boundary}--`);

  // Concatenate ArrayBuffers
  const totalLength = preamble.byteLength + contentBuffer.byteLength + epilogue.byteLength;
  const combined = new Uint8Array(totalLength);
  combined.set(preamble, 0);
  combined.set(new Uint8Array(contentBuffer), preamble.byteLength);
  combined.set(epilogue, preamble.byteLength + contentBuffer.byteLength);

  const res = await driveRequest(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,createdTime,webViewLink,md5Checksum`,
    accessToken,
    {
      method: "POST",
      contentType: `multipart/related; boundary=${boundary}`,
      body: combined.buffer,
    }
  );
  return res.json as DriveFile;
}

// ========================================
// File update (text)
// ========================================

export async function updateFile(
  accessToken: string,
  fileId: string,
  content: string,
  mimeType: string = "text/plain"
): Promise<DriveFile> {
  const res = await driveRequest(
    `${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=media&fields=id,name,mimeType,modifiedTime,createdTime,webViewLink,md5Checksum`,
    accessToken,
    {
      method: "PATCH",
      contentType: mimeType,
      body: content,
    }
  );
  return res.json as DriveFile;
}

// ========================================
// File update (binary)
// ========================================

export async function updateFileBinary(
  accessToken: string,
  fileId: string,
  contentBuffer: ArrayBuffer,
  mimeType: string = "application/octet-stream"
): Promise<DriveFile> {
  const res = await driveRequest(
    `${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=media&fields=id,name,mimeType,modifiedTime,createdTime,webViewLink,md5Checksum`,
    accessToken,
    {
      method: "PATCH",
      contentType: mimeType,
      body: contentBuffer,
    }
  );
  return res.json as DriveFile;
}

// ========================================
// File move
// ========================================

export async function moveFile(
  accessToken: string,
  fileId: string,
  newParentId: string,
  oldParentId: string
): Promise<void> {
  await driveRequest(
    `${DRIVE_API}/files/${fileId}?addParents=${encodeURIComponent(newParentId)}&removeParents=${encodeURIComponent(oldParentId)}&fields=id`,
    accessToken,
    { method: "PATCH" }
  );
}

// ========================================
// File rename (metadata-only update)
// ========================================

export async function renameFile(
  accessToken: string,
  fileId: string,
  newName: string
): Promise<DriveFile> {
  const res = await driveRequest(
    `${DRIVE_API}/files/${fileId}?fields=id,name,mimeType,modifiedTime,createdTime,webViewLink,md5Checksum`,
    accessToken,
    {
      method: "PATCH",
      contentType: "application/json",
      body: JSON.stringify({ name: newName }),
    }
  );
  return res.json as DriveFile;
}

// ========================================
// File delete (permanent — use for temp/system files only)
// ========================================

export async function deleteFile(
  accessToken: string,
  fileId: string
): Promise<void> {
  await driveRequest(`${DRIVE_API}/files/${fileId}`, accessToken, {
    method: "DELETE",
  });
}

// ========================================
// File search
// ========================================

export async function findFileByExactName(
  accessToken: string,
  name: string,
  parentId?: string
): Promise<DriveFile | null> {
  let query = `name='${escapeDriveQuery(name)}' and mimeType!='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }
  const res = await driveRequest(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,md5Checksum)&pageSize=1`,
    accessToken
  );
  const data = res.json as DriveListResponse;
  return data.files.length > 0 ? data.files[0] : null;
}

export async function listFolders(
  accessToken: string,
  parentId: string
): Promise<DriveFile[]> {
  const query = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await driveRequest(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)&orderBy=name`,
    accessToken
  );
  const data = res.json as DriveListResponse;
  return data.files;
}
