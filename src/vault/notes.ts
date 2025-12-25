import { TFile, TFolder, type App } from "obsidian";
import { formatError } from "src/utils/error";

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
  activeNote?: boolean
): Promise<{ success: boolean; content?: string; path?: string; error?: string }> {
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

  const content = await app.vault.read(file);
  return { success: true, content, path: file.path };
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

// Rename/move a note
export async function renameNote(
  app: App,
  oldPath: string,
  newPath: string
): Promise<{ success: boolean; path?: string; error?: string }> {
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

  try {
    await app.fileManager.renameFile(file, newPath);
    return { success: true, path: newPath };
  } catch (error) {
    return {
      success: false,
      error: `Failed to rename note: ${formatError(error)}`,
    };
  }
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

// Pending edit info stored globally
export interface PendingEdit {
  originalPath: string;
  originalContent: string;  // バックアップ用
  createdAt: number;
}

let pendingEdit: PendingEdit | null = null;

// Get pending edit
export function getPendingEdit(): PendingEdit | null {
  return pendingEdit;
}

// Clear pending edit
export function clearPendingEdit(): void {
  pendingEdit = null;
}

// Propose an edit by directly modifying the file
export async function proposeEdit(
  app: App,
  fileName?: string,
  activeNote?: boolean,
  newContent?: string,
  mode: "replace" | "append" | "prepend" = "replace"
): Promise<{ success: boolean; originalPath?: string; error?: string; message?: string }> {
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
      error: "No content provided for edit.",
    };
  }

  try {
    // Read original content for backup
    const originalContent = await app.vault.read(file);

    // Calculate final content
    let finalContent = newContent;

    if (mode === "append") {
      finalContent = `${originalContent}\n${newContent}`;
    } else if (mode === "prepend") {
      finalContent = `${newContent}\n${originalContent}`;
    }

    // Store pending edit info with original content backup
    pendingEdit = {
      originalPath: file.path,
      originalContent,
      createdAt: Date.now(),
    };

    // Apply the edit directly to the file
    await app.vault.modify(file, finalContent);

    // Open the file to show changes
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(file);

    return {
      success: true,
      originalPath: file.path,
      message: `Applied changes to "${file.basename}". Click "Apply" to keep or "Discard" to undo.`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to edit: ${formatError(error)}`,
    };
  }
}

// Apply the pending edit (just clear the backup)
export function applyEdit(
  _app: App
): Promise<{ success: boolean; path?: string; error?: string; message?: string }> {
  if (!pendingEdit) {
    return Promise.resolve({
      success: false,
      error: "No pending edit found.",
    });
  }

  const appliedPath = pendingEdit.originalPath;
  pendingEdit = null;

  return Promise.resolve({
    success: true,
    path: appliedPath,
    message: `Changes to "${appliedPath}" confirmed.`,
  });
}

// Discard the pending edit (undo the changes)
export async function discardEdit(
  app: App
): Promise<{ success: boolean; error?: string; message?: string }> {
  if (!pendingEdit) {
    return {
      success: false,
      error: "No pending edit found.",
    };
  }

  try {
    const originalPath = pendingEdit.originalPath;
    const file = app.vault.getAbstractFileByPath(originalPath);

    if (!(file instanceof TFile)) {
      pendingEdit = null;
      return {
        success: false,
        error: `File "${originalPath}" no longer exists.`,
      };
    }

    // Restore original content
    await app.vault.modify(file, pendingEdit.originalContent);

    // Refresh the view
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(file);

    pendingEdit = null;

    return {
      success: true,
      message: "Changes discarded and file restored.",
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to discard edit: ${formatError(error)}`,
    };
  }
}
