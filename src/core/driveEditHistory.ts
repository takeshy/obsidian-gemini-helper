// Drive-based edit history persistence (called at Push time)
// Saves unified diffs to history/files/ on Google Drive,
// compatible with GemiHub's remote edit history format.

import * as Diff from "diff";
import * as drive from "./googleDrive";
import type { EditHistorySettings } from "src/types";

const HISTORY_FOLDER = "history";
const EDIT_HISTORY_FOLDER = "files";

export interface DriveEditHistoryEntry {
  id: string;
  timestamp: string;
  source: "workflow" | "propose_edit" | "manual" | "auto";
  workflowName?: string;
  model?: string;
  diff: string;
  stats: {
    additions: number;
    deletions: number;
  };
}

export interface DriveEditHistoryFile {
  version: number;
  path: string;
  entries: DriveEditHistoryEntry[];
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function pathToHistoryFileName(filePath: string): string {
  // Encode path separators to avoid collisions (e.g. "a/b.md" vs "a-b.md")
  return filePath.replace(/%/g, "%25").replace(/\//g, "%2F") + ".history.json";
}

/**
 * Ensure history/files/ subfolder exists on Drive.
 * Call once before batch processing, then pass the result to saveEditToDrive.
 */
export async function ensureEditHistoryFolderId(
  accessToken: string,
  rootFolderId: string
): Promise<string> {
  const historyFolderId = await drive.ensureSubFolder(accessToken, rootFolderId, HISTORY_FOLDER);
  return drive.ensureSubFolder(accessToken, historyFolderId, EDIT_HISTORY_FOLDER);
}

/**
 * Find a history file by name in the edit-history folder.
 */
async function findFileByName(
  accessToken: string,
  folderId: string,
  fileName: string
): Promise<string | null> {
  const found = await drive.findFileByExactName(accessToken, fileName, folderId);
  return found?.id ?? null;
}

/**
 * Load existing history file from Drive.
 */
async function loadHistoryFile(
  accessToken: string,
  historyFolderId: string,
  filePath: string
): Promise<{ history: DriveEditHistoryFile; fileId: string | null }> {
  const fileName = pathToHistoryFileName(filePath);
  const fileId = await findFileByName(accessToken, historyFolderId, fileName);

  if (!fileId) {
    return {
      history: { version: 1, path: filePath, entries: [] },
      fileId: null,
    };
  }

  try {
    const content = await drive.readFile(accessToken, fileId);
    return { history: JSON.parse(content) as DriveEditHistoryFile, fileId };
  } catch (err) {
    console.debug("[DriveEditHistory] loadHistoryFile: failed to parse history for:", filePath, err);
    return {
      history: { version: 1, path: filePath, entries: [] },
      fileId,
    };
  }
}

/**
 * Save history file to Drive (create or update).
 */
async function saveHistoryFile(
  accessToken: string,
  historyFolderId: string,
  filePath: string,
  history: DriveEditHistoryFile,
  existingFileId: string | null
): Promise<void> {
  const content = JSON.stringify(history, null, 2);
  const fileName = pathToHistoryFileName(filePath);

  if (existingFileId) {
    await drive.updateFile(accessToken, existingFileId, content, "application/json");
  } else {
    await drive.createFile(accessToken, fileName, content, historyFolderId, "application/json");
  }
}

/**
 * Create a unified diff between old and new content.
 */
function createDiffStr(
  originalContent: string,
  modifiedContent: string,
  contextLines: number
): { diff: string; stats: { additions: number; deletions: number } } {
  const patch = Diff.structuredPatch(
    "original",
    "modified",
    originalContent,
    modifiedContent,
    undefined,
    undefined,
    { context: contextLines }
  );

  const lines: string[] = [];
  let additions = 0;
  let deletions = 0;

  for (const hunk of patch.hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
    for (const line of hunk.lines) {
      lines.push(line);
      if (line.startsWith("+") && !line.startsWith("+++")) additions++;
      else if (line.startsWith("-") && !line.startsWith("---")) deletions++;
    }
  }

  return { diff: lines.join("\n"), stats: { additions, deletions } };
}

/**
 * Load edit history entries from Drive for a given file path.
 */
export async function loadEditHistoryFromDrive(
  accessToken: string,
  historyFolderId: string,
  filePath: string
): Promise<DriveEditHistoryEntry[]> {
  const { history } = await loadHistoryFile(accessToken, historyFolderId, filePath);
  return history.entries;
}

/**
 * Clear (delete) edit history from Drive for a given file path.
 */
export async function clearEditHistoryFromDrive(
  accessToken: string,
  historyFolderId: string,
  filePath: string
): Promise<void> {
  const fileName = pathToHistoryFileName(filePath);
  const fileId = await findFileByName(accessToken, historyFolderId, fileName);
  if (fileId) {
    await drive.deleteFile(accessToken, fileId);
  }
}

/**
 * Save an edit to Drive history (oldContent → newContent forward diff).
 * Compatible with GemiHub's remote edit history format.
 *
 * @param historyFolderId - Pre-resolved folder ID from ensureEditHistoryFolderId()
 */
export async function saveEditToDrive(
  accessToken: string,
  historyFolderId: string,
  settings: EditHistorySettings,
  params: {
    path: string;
    oldContent: string;
    newContent: string;
    source: "workflow" | "propose_edit" | "manual" | "auto";
    workflowName?: string;
    model?: string;
  }
): Promise<DriveEditHistoryEntry | null> {
  const { diff, stats } = createDiffStr(params.oldContent, params.newContent, settings.diff.contextLines);

  if (stats.additions === 0 && stats.deletions === 0) return null;

  const entry: DriveEditHistoryEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    source: params.source,
    workflowName: params.workflowName,
    model: params.model,
    diff,
    stats,
  };

  const { history, fileId: historyFileId } = await loadHistoryFile(
    accessToken,
    historyFolderId,
    params.path
  );

  history.entries.push(entry);

  await saveHistoryFile(accessToken, historyFolderId, params.path, history, historyFileId);

  return entry;
}
