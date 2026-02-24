import { TFile, TFolder, type App } from "obsidian";
import { formatError } from "src/utils/error";
import { DEFAULT_SETTINGS } from "src/types";
import { getEditHistoryManager } from "src/core/editHistory";

export interface NoteInfo {
  path: string;
  name: string;
  basename: string;
  extension: string;
  mtime: number;
  ctime: number;
  size: number;
}

// Find a file by name (fuzzy matching)
export function findFileByName(app: App, fileName: string): TFile | null {
  const files = app.vault.getMarkdownFiles();

  // Normalize the search term
  const searchTerm = fileName
    .toLowerCase()
    .replace(/\.md$/, "")
    .trim();

  // Exact match first
  const exactMatch = files.find((f) => {
    const baseName = f.basename.toLowerCase();
    const fullPath = f.path.toLowerCase().replace(/\.md$/, "");
    return baseName === searchTerm || fullPath === searchTerm;
  });

  if (exactMatch) return exactMatch;

  // Fuzzy match
  const fuzzyMatches = files.filter((f) => {
    const baseName = f.basename.toLowerCase();
    const fullPath = f.path.toLowerCase();
    return baseName.includes(searchTerm) || fullPath.includes(searchTerm);
  });

  // Return the best match (shortest path that matches)
  if (fuzzyMatches.length > 0) {
    return fuzzyMatches.sort((a, b) => a.path.length - b.path.length)[0];
  }

  return null;
}

// Find a folder by path (fuzzy matching)
export function findFolderByPath(app: App, folderPath: string): TFolder | null {
  const folders = app.vault
    .getAllLoadedFiles()
    .filter((f): f is TFolder => f instanceof TFolder);

  const searchTerm = folderPath.toLowerCase().trim();

  // Exact match first
  const exactMatch = folders.find(
    (f) => f.path.toLowerCase() === searchTerm || f.name.toLowerCase() === searchTerm
  );

  if (exactMatch) return exactMatch;

  // Fuzzy match
  const fuzzyMatches = folders.filter(
    (f) =>
      f.path.toLowerCase().includes(searchTerm) ||
      f.name.toLowerCase().includes(searchTerm)
  );

  if (fuzzyMatches.length > 0) {
    return fuzzyMatches.sort((a, b) => a.path.length - b.path.length)[0];
  }

  return null;
}

// Read a note's content
export async function readNote(
  app: App,
  fileName?: string,
  activeNote?: boolean,
  maxChars: number = DEFAULT_SETTINGS.maxNoteChars
): Promise<{ success: boolean; content?: string; path?: string; error?: string; truncated?: boolean }> {
  let file: TFile | null = null;

  if (activeNote) {
    file = app.workspace.getActiveFile();
    if (!file) {
      return {
        success: false,
        error: "No active note found. Please open a note first.",
      };
    }
  } else if (fileName) {
    file = findFileByName(app, fileName);
    if (!file) {
      return {
        success: false,
        error: `Could not find note "${fileName}". Please check the name and try again.`,
      };
    }
  } else {
    return {
      success: false,
      error: "Please provide either a file name or set activeNote to true.",
    };
  }

  let content = await app.vault.read(file);
  let truncated = false;

  // Truncate if too long to prevent token explosion
  if (content.length > maxChars) {
    content = content.slice(0, maxChars) + "\n\n... [Content truncated. Note is too long to read fully.]";
    truncated = true;
  }

  return { success: true, content, path: file.path, truncated };
}

// Create a new note
export async function createNote(
  app: App,
  name: string,
  content: string,
  folder?: string,
  tags?: string
): Promise<{ success: boolean; path?: string; error?: string }> {
  // Ensure .md extension
  if (!name.endsWith(".md")) {
    name += ".md";
  }

  // Build full path
  let fullPath = name;
  if (folder) {
    const targetFolder = findFolderByPath(app, folder);
    if (targetFolder) {
      fullPath = `${targetFolder.path}/${name}`;
    } else {
      // Create folder if it doesn't exist
      await app.vault.createFolder(folder);
      fullPath = `${folder}/${name}`;
    }
  }

  // Add tags if provided
  let finalContent = content;
  if (tags) {
    const tagList = tags
      .split(",")
      .map((t) => `#${t.trim().replace(/^#/, "")}`)
      .join(" ");
    finalContent = `${tagList}\n\n${content}`;
  }

  // Check if file already exists
  const existingFile = app.vault.getAbstractFileByPath(fullPath);
  if (existingFile) {
    // Generate unique name
    const baseName = name.replace(/\.md$/, "");
    let counter = 1;
    while (app.vault.getAbstractFileByPath(fullPath)) {
      fullPath = folder
        ? `${folder}/${baseName} ${counter}.md`
        : `${baseName} ${counter}.md`;
      counter++;
    }
  }

  try {
    await app.vault.create(fullPath, finalContent);
    return { success: true, path: fullPath };
  } catch (error) {
    return {
      success: false,
      error: `Failed to create note: ${formatError(error)}`,
    };
  }
}

// Update an existing note
export async function updateNote(
  app: App,
  fileName?: string,
  activeNote?: boolean,
  newContent?: string,
  mode: "replace" | "append" | "prepend" = "replace"
): Promise<{ success: boolean; path?: string; error?: string }> {
  let file: TFile | null = null;

  if (activeNote) {
    file = app.workspace.getActiveFile();
    if (!file) {
      return {
        success: false,
        error: "No active note found. Please open a note first.",
      };
    }
  } else if (fileName) {
    file = findFileByName(app, fileName);
    if (!file) {
      return {
        success: false,
        error: `Could not find note "${fileName}". Please check the name and try again.`,
      };
    }
  } else {
    return {
      success: false,
      error: "Please provide either a file name or set activeNote to true.",
    };
  }

  if (!newContent) {
    return {
      success: false,
      error: "No content provided for update.",
    };
  }

  try {
    let finalContent = newContent;

    if (mode === "append" || mode === "prepend") {
      const existingContent = await app.vault.read(file);
      finalContent =
        mode === "append"
          ? `${existingContent}\n${newContent}`
          : `${newContent}\n${existingContent}`;
    }

    await app.vault.modify(file, finalContent);
    return { success: true, path: file.path };
  } catch (error) {
    return {
      success: false,
      error: `Failed to update note: ${formatError(error)}`,
    };
  }
}

// Delete a note
export async function deleteNote(
  app: App,
  fileName: string
): Promise<{ success: boolean; path?: string; error?: string }> {
  const file = findFileByName(app, fileName);
  if (!file) {
    return {
      success: false,
      error: `Could not find note "${fileName}".`,
    };
  }

  try {
    await app.fileManager.trashFile(file);
    return { success: true, path: file.path };
  } catch (error) {
    return {
      success: false,
      error: `Failed to delete note: ${formatError(error)}`,
    };
  }
}

// Pending rename info stored globally
export interface PendingRename {
  originalPath: string;  // Resolved file path
  newPath: string;       // Target path (with .md extension)
  createdAt: number;
}

let pendingRename: PendingRename | null = null;

// Get pending rename
export function getPendingRename(): PendingRename | null {
  return pendingRename;
}

// Propose a rename - stores proposed rename without executing
export function proposeRename(
  app: App,
  oldPath: string,
  newPath: string
): { success: boolean; originalPath?: string; newPath?: string; error?: string; message?: string } {
  const file = findFileByName(app, oldPath);
  if (!file) {
    return {
      success: false,
      error: `Could not find note "${oldPath}".`,
    };
  }

  // Ensure .md extension
  if (!newPath.endsWith(".md")) {
    newPath += ".md";
  }

  // Check if target already exists
  const existing = app.vault.getAbstractFileByPath(newPath);
  if (existing) {
    return {
      success: false,
      error: `A file already exists at "${newPath}".`,
    };
  }

  // Store pending rename (do NOT rename yet)
  pendingRename = {
    originalPath: file.path,
    newPath,
    createdAt: Date.now(),
  };

  return {
    success: true,
    originalPath: file.path,
    newPath,
    message: `Proposed rename: "${file.path}" → "${newPath}". Click "Apply" to rename or "Discard" to cancel.`,
  };
}

// Apply the pending rename
export async function applyRename(
  app: App
): Promise<{ success: boolean; path?: string; error?: string; message?: string }> {
  if (!pendingRename) {
    return {
      success: false,
      error: "No pending rename found.",
    };
  }

  try {
    const file = app.vault.getAbstractFileByPath(pendingRename.originalPath);

    if (!(file instanceof TFile)) {
      const path = pendingRename.originalPath;
      pendingRename = null;
      return {
        success: false,
        error: `File "${path}" no longer exists.`,
      };
    }

    const newPath = pendingRename.newPath;
    await app.fileManager.renameFile(file, newPath);

    pendingRename = null;

    return {
      success: true,
      path: newPath,
      message: `Renamed to "${newPath}".`,
    };
  } catch (error) {
    pendingRename = null;
    return {
      success: false,
      error: `Failed to rename: ${formatError(error)}`,
    };
  }
}

// Discard the pending rename
export function discardRename(
  _app: App
): { success: boolean; error?: string; message?: string } {
  if (!pendingRename) {
    return {
      success: false,
      error: "No pending rename found.",
    };
  }

  const discardedPath = pendingRename.originalPath;
  pendingRename = null;

  return {
    success: true,
    message: `Cancelled rename of "${discardedPath}".`,
  };
}

// Get info about the active note
export function getActiveNoteInfo(app: App): NoteInfo | null {
  const file = app.workspace.getActiveFile();
  if (!file) return null;

  return {
    path: file.path,
    name: file.name,
    basename: file.basename,
    extension: file.extension,
    mtime: file.stat.mtime,
    ctime: file.stat.ctime,
    size: file.stat.size,
  };
}

// Patch for search-and-replace editing
export interface EditPatch {
  search: string;
  replace: string;
}

// Pending edit info stored globally
export interface PendingEdit {
  originalPath: string;
  originalContent: string;  // 元の内容（復元用）
  newContent: string;       // 提案された新しい内容
  createdAt: number;
  model?: string;           // 使用したモデル（履歴用）
}

let pendingEdit: PendingEdit | null = null;

// Get pending edit
export function getPendingEdit(): PendingEdit | null {
  return pendingEdit;
}

// Propose an edit - stores proposed changes without writing to file
// User must confirm via applyEdit() to actually write
export async function proposeEdit(
  app: App,
  fileName?: string,
  activeNote?: boolean,
  newContent?: string,
  mode: "replace" | "append" | "prepend" | "patch" = "replace",
  model?: string,
  patches?: EditPatch[]
): Promise<{ success: boolean; originalPath?: string; error?: string; message?: string; warning?: string }> {
  let file: TFile | null = null;

  if (activeNote) {
    file = app.workspace.getActiveFile();
    if (!file) {
      return {
        success: false,
        error: "No active note found. Please open a note first.",
      };
    }
  } else if (fileName) {
    file = findFileByName(app, fileName);
    if (!file) {
      return {
        success: false,
        error: `Could not find note "${fileName}". Please check the name and try again.`,
      };
    }
  } else {
    return {
      success: false,
      error: "Please provide either a file name or set activeNote to true.",
    };
  }

  if (mode === "patch") {
    if (!patches || patches.length === 0) {
      return {
        success: false,
        error: "No patches provided for patch mode.",
      };
    }
  } else if (!newContent) {
    return {
      success: false,
      error: "No content provided for edit.",
    };
  }

  try {
    // Read original content
    const originalContent = await app.vault.read(file);

    // Calculate final content
    let finalContent: string;
    let warning: string | undefined;

    if (mode === "patch" && patches) {
      // Apply patches sequentially
      finalContent = originalContent;
      let appliedCount = 0;
      const failedPatches: number[] = [];

      for (let i = 0; i < patches.length; i++) {
        const patch = patches[i];
        if (finalContent.includes(patch.search)) {
          // Use function replacement to avoid special replacement patterns ($1, $&, etc.)
          finalContent = finalContent.replace(patch.search, () => patch.replace);
          appliedCount++;
        } else {
          failedPatches.push(i + 1);
        }
      }

      if (appliedCount === 0) {
        return {
          success: false,
          error: `None of the ${patches.length} patches matched. No changes were made.`,
        };
      }

      if (failedPatches.length > 0) {
        warning = `${appliedCount}/${patches.length} patches applied. Patches ${failedPatches.join(", ")} did not match.`;
      }
    } else if (mode === "append") {
      finalContent = `${originalContent}\n${newContent}`;
    } else if (mode === "prepend") {
      finalContent = `${newContent}\n${originalContent}`;
    } else {
      finalContent = newContent!;
    }

    // Store pending edit info (do NOT write to file yet)
    pendingEdit = {
      originalPath: file.path,
      originalContent,
      newContent: finalContent,
      createdAt: Date.now(),
      model,
    };

    return {
      success: true,
      originalPath: file.path,
      message: `Proposed changes to "${file.basename}". Click "Apply" to write or "Discard" to cancel.`,
      warning,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to propose edit: ${formatError(error)}`,
    };
  }
}

// Apply the pending edit - actually writes to file
export async function applyEdit(
  app: App
): Promise<{ success: boolean; path?: string; error?: string; message?: string }> {
  if (!pendingEdit) {
    return {
      success: false,
      error: "No pending edit found.",
    };
  }

  try {
    const file = app.vault.getAbstractFileByPath(pendingEdit.originalPath);

    if (!(file instanceof TFile)) {
      const path = pendingEdit.originalPath;
      pendingEdit = null;
      return {
        success: false,
        error: `File "${path}" no longer exists.`,
      };
    }

    // Save edit history before writing
    const historyManager = getEditHistoryManager();
    if (historyManager) {
      // Ensure snapshot exists before modification
      await historyManager.ensureSnapshot(pendingEdit.originalPath);
      historyManager.saveEdit({
        path: pendingEdit.originalPath,
        modifiedContent: pendingEdit.newContent,
        source: "propose_edit",
        model: pendingEdit.model,
      });
    }

    // Write the new content to file
    await app.vault.modify(file, pendingEdit.newContent);

    // Open the file to show changes
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(file);

    const appliedPath = pendingEdit.originalPath;
    pendingEdit = null;

    return {
      success: true,
      path: appliedPath,
      message: `Changes to "${appliedPath}" applied.`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to apply edit: ${formatError(error)}`,
    };
  }
}

// Discard the pending edit (just clear without writing)
export function discardEdit(
  _app: App
): { success: boolean; error?: string; message?: string } {
  if (!pendingEdit) {
    return {
      success: false,
      error: "No pending edit found.",
    };
  }

  const discardedPath = pendingEdit.originalPath;
  pendingEdit = null;

  return {
    success: true,
    message: `Discarded proposed changes to "${discardedPath}".`,
  };
}

// Pending delete info stored globally
export interface PendingDelete {
  path: string;
  fileName: string;
  content: string;
  createdAt: number;
}

let pendingDelete: PendingDelete | null = null;

// Get pending delete
export function getPendingDelete(): PendingDelete | null {
  return pendingDelete;
}

// Propose a delete - stores proposed deletion without actually deleting
// User must confirm via applyDelete() to actually delete
export async function proposeDelete(
  app: App,
  fileName: string
): Promise<{ success: boolean; path?: string; error?: string; message?: string }> {
  const file = findFileByName(app, fileName);
  if (!file) {
    return {
      success: false,
      error: `Could not find note "${fileName}".`,
    };
  }

  // Read file content for preview
  const content = await app.vault.read(file);

  // Store pending delete info (do NOT delete yet)
  pendingDelete = {
    path: file.path,
    fileName: file.basename,
    content,
    createdAt: Date.now(),
  };

  return {
    success: true,
    path: file.path,
    message: `Proposed deletion of "${file.basename}". Click "Delete" to confirm or "Cancel" to keep the file.`,
  };
}

// Apply the pending delete - actually deletes the file
export async function applyDelete(
  app: App
): Promise<{ success: boolean; path?: string; error?: string; message?: string }> {
  if (!pendingDelete) {
    return {
      success: false,
      error: "No pending delete found.",
    };
  }

  try {
    const file = app.vault.getAbstractFileByPath(pendingDelete.path);

    if (!(file instanceof TFile)) {
      const path = pendingDelete.path;
      pendingDelete = null;
      return {
        success: false,
        error: `File "${path}" no longer exists.`,
      };
    }

    // Delete the file (move to trash)
    await app.fileManager.trashFile(file);

    const deletedPath = pendingDelete.path;
    pendingDelete = null;

    return {
      success: true,
      path: deletedPath,
      message: `Deleted "${deletedPath}".`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to delete: ${formatError(error)}`,
    };
  }
}

// Discard the pending delete (cancel without deleting)
export function discardDelete(
  _app: App
): { success: boolean; error?: string; message?: string } {
  if (!pendingDelete) {
    return {
      success: false,
      error: "No pending delete found.",
    };
  }

  const discardedPath = pendingDelete.path;
  pendingDelete = null;

  return {
    success: true,
    message: `Cancelled deletion of "${discardedPath}".`,
  };
}

// ============================================
// Bulk Edit Operations
// ============================================

export interface BulkEditItem {
  path: string;
  originalContent: string;
  newContent: string;
  mode: "replace" | "append" | "prepend";
  model?: string;
}

export interface PendingBulkEdit {
  items: BulkEditItem[];
  createdAt: number;
}

let pendingBulkEdit: PendingBulkEdit | null = null;

export function getPendingBulkEdit(): PendingBulkEdit | null {
  return pendingBulkEdit;
}

export function clearPendingBulkEdit(): void {
  pendingBulkEdit = null;
}

// Propose bulk edits - stores proposed changes without writing
export async function proposeBulkEdit(
  app: App,
  edits: Array<{ fileName: string; newContent: string; mode?: "replace" | "append" | "prepend" }>
): Promise<{ success: boolean; items?: BulkEditItem[]; errors?: string[]; message?: string }> {
  const items: BulkEditItem[] = [];
  const errors: string[] = [];

  for (const edit of edits) {
    const file = findFileByName(app, edit.fileName);
    if (!file) {
      errors.push(`Could not find note "${edit.fileName}"`);
      continue;
    }

    const originalContent = await app.vault.read(file);
    const mode = edit.mode || "replace";
    let finalContent = edit.newContent;

    if (mode === "append") {
      finalContent = `${originalContent}\n${edit.newContent}`;
    } else if (mode === "prepend") {
      finalContent = `${edit.newContent}\n${originalContent}`;
    }

    items.push({
      path: file.path,
      originalContent,
      newContent: finalContent,
      mode,
    });
  }

  if (items.length === 0) {
    return {
      success: false,
      errors,
      message: "No valid files found for bulk edit.",
    };
  }

  pendingBulkEdit = {
    items,
    createdAt: Date.now(),
  };

  return {
    success: true,
    items,
    errors: errors.length > 0 ? errors : undefined,
    message: `Proposed edits to ${items.length} file(s). Select files to apply changes.`,
  };
}

// Apply selected bulk edits
export async function applyBulkEdit(
  app: App,
  selectedPaths: string[]
): Promise<{ success: boolean; applied: string[]; failed: string[]; message?: string }> {
  if (!pendingBulkEdit) {
    return {
      success: false,
      applied: [],
      failed: [],
      message: "No pending bulk edit found.",
    };
  }

  const applied: string[] = [];
  const failed: string[] = [];
  const historyManager = getEditHistoryManager();

  for (const item of pendingBulkEdit.items) {
    if (!selectedPaths.includes(item.path)) {
      continue;
    }

    try {
      const file = app.vault.getAbstractFileByPath(item.path);
      if (file instanceof TFile) {
        // Save edit history before writing
        if (historyManager) {
          await historyManager.ensureSnapshot(item.path);
          historyManager.saveEdit({
            path: item.path,
            modifiedContent: item.newContent,
            source: "propose_edit",
            model: item.model,
          });
        }

        await app.vault.modify(file, item.newContent);
        applied.push(item.path);
      } else {
        failed.push(item.path);
      }
    } catch {
      failed.push(item.path);
    }
  }

  pendingBulkEdit = null;

  return {
    success: applied.length > 0,
    applied,
    failed,
    message: `Applied ${applied.length} edit(s)${failed.length > 0 ? `, ${failed.length} failed` : ""}.`,
  };
}

// Discard bulk edit
export function discardBulkEdit(): { success: boolean; message: string } {
  pendingBulkEdit = null;
  return {
    success: true,
    message: "Discarded bulk edit.",
  };
}

// ============================================
// Bulk Delete Operations
// ============================================

export interface BulkDeleteItem {
  path: string;
  fileName: string;
  content: string;
}

export interface PendingBulkDelete {
  items: BulkDeleteItem[];
  createdAt: number;
}

let pendingBulkDelete: PendingBulkDelete | null = null;

export function getPendingBulkDelete(): PendingBulkDelete | null {
  return pendingBulkDelete;
}

export function clearPendingBulkDelete(): void {
  pendingBulkDelete = null;
}

// Propose bulk deletes - stores proposed deletions without deleting
export async function proposeBulkDelete(
  app: App,
  fileNames: string[]
): Promise<{ success: boolean; items?: BulkDeleteItem[]; errors?: string[]; message?: string }> {
  const items: BulkDeleteItem[] = [];
  const errors: string[] = [];

  for (const fileName of fileNames) {
    const file = findFileByName(app, fileName);
    if (!file) {
      errors.push(`Could not find note "${fileName}"`);
      continue;
    }

    const content = await app.vault.read(file);
    items.push({
      path: file.path,
      fileName: file.basename,
      content,
    });
  }

  if (items.length === 0) {
    return {
      success: false,
      errors,
      message: "No valid files found for bulk delete.",
    };
  }

  pendingBulkDelete = {
    items,
    createdAt: Date.now(),
  };

  return {
    success: true,
    items,
    errors: errors.length > 0 ? errors : undefined,
    message: `Proposed deletion of ${items.length} file(s). Select files to delete.`,
  };
}

// Apply selected bulk deletes
export async function applyBulkDelete(
  app: App,
  selectedPaths: string[]
): Promise<{ success: boolean; deleted: string[]; failed: string[]; message?: string }> {
  if (!pendingBulkDelete) {
    return {
      success: false,
      deleted: [],
      failed: [],
      message: "No pending bulk delete found.",
    };
  }

  const deleted: string[] = [];
  const failed: string[] = [];

  for (const item of pendingBulkDelete.items) {
    if (!selectedPaths.includes(item.path)) {
      continue;
    }

    try {
      const file = app.vault.getAbstractFileByPath(item.path);
      if (file instanceof TFile) {
        await app.fileManager.trashFile(file);
        deleted.push(item.path);
      } else {
        failed.push(item.path);
      }
    } catch {
      failed.push(item.path);
    }
  }

  pendingBulkDelete = null;

  return {
    success: deleted.length > 0,
    deleted,
    failed,
    message: `Deleted ${deleted.length} file(s)${failed.length > 0 ? `, ${failed.length} failed` : ""}.`,
  };
}

// Discard bulk delete
export function discardBulkDelete(): { success: boolean; message: string } {
  pendingBulkDelete = null;
  return {
    success: true,
    message: "Discarded bulk delete.",
  };
}

// ============================================
// Bulk Rename Operations
// ============================================

export interface BulkRenameItem {
  originalPath: string;
  newPath: string;
}

export interface PendingBulkRename {
  items: BulkRenameItem[];
  createdAt: number;
}

let pendingBulkRename: PendingBulkRename | null = null;

export function getPendingBulkRename(): PendingBulkRename | null {
  return pendingBulkRename;
}

export function clearPendingBulkRename(): void {
  pendingBulkRename = null;
}

// Propose bulk renames - stores proposed renames without executing
export function proposeBulkRename(
  app: App,
  renames: Array<{ oldPath: string; newPath: string }>
): { success: boolean; items?: BulkRenameItem[]; errors?: string[]; message?: string } {
  const items: BulkRenameItem[] = [];
  const errors: string[] = [];

  for (const rename of renames) {
    const file = findFileByName(app, rename.oldPath);
    if (!file) {
      errors.push(`Could not find note "${rename.oldPath}"`);
      continue;
    }

    let newPath = rename.newPath;
    if (!newPath.endsWith(".md")) {
      newPath += ".md";
    }

    const existing = app.vault.getAbstractFileByPath(newPath);
    if (existing) {
      errors.push(`A file already exists at "${newPath}"`);
      continue;
    }

    items.push({
      originalPath: file.path,
      newPath,
    });
  }

  if (items.length === 0) {
    return {
      success: false,
      errors,
      message: "No valid files found for bulk rename.",
    };
  }

  pendingBulkRename = {
    items,
    createdAt: Date.now(),
  };

  return {
    success: true,
    items,
    errors: errors.length > 0 ? errors : undefined,
    message: `Proposed rename of ${items.length} file(s). Select files to rename.`,
  };
}

// Apply selected bulk renames
export async function applyBulkRename(
  app: App,
  selectedPaths: string[]
): Promise<{ success: boolean; applied: string[]; failed: string[]; message?: string }> {
  if (!pendingBulkRename) {
    return {
      success: false,
      applied: [],
      failed: [],
      message: "No pending bulk rename found.",
    };
  }

  const applied: string[] = [];
  const failed: string[] = [];

  for (const item of pendingBulkRename.items) {
    if (!selectedPaths.includes(item.originalPath)) {
      continue;
    }

    try {
      const file = app.vault.getAbstractFileByPath(item.originalPath);
      if (file instanceof TFile) {
        await app.fileManager.renameFile(file, item.newPath);
        applied.push(item.originalPath);
      } else {
        failed.push(item.originalPath);
      }
    } catch {
      failed.push(item.originalPath);
    }
  }

  pendingBulkRename = null;

  return {
    success: applied.length > 0,
    applied,
    failed,
    message: `Renamed ${applied.length} file(s)${failed.length > 0 ? `, ${failed.length} failed` : ""}.`,
  };
}

// Discard bulk rename
export function discardBulkRename(): { success: boolean; message: string } {
  pendingBulkRename = null;
  return {
    success: true,
    message: "Discarded bulk rename.",
  };
}
