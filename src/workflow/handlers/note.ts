import { App, TFile } from "obsidian";
import { getEditHistoryManager } from "../../core/editHistory";
import { isEncryptedFile, decryptFileContent } from "../../core/crypto";
import { cryptoCache } from "../../core/cryptoCache";
import { WorkflowNode, ExecutionContext, PromptCallbacks } from "../types";
import { replaceVariables, RegenerateRequestError } from "./utils";

// Recursively ensure all parent folders exist
async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
  if (!folderPath) return;

  const folder = app.vault.getAbstractFileByPath(folderPath);
  if (folder) return; // Already exists

  // Get parent folder path
  const parentPath = folderPath.substring(0, folderPath.lastIndexOf("/"));
  if (parentPath) {
    // Recursively ensure parent exists first
    await ensureFolderExists(app, parentPath);
  }

  // Now create this folder
  try {
    await app.vault.createFolder(folderPath);
  } catch {
    // Folder might have been created by another process
  }
}

// Handle note node - write content to a note file
export async function handleNoteNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App,
  promptCallbacks?: PromptCallbacks
): Promise<void> {
  const path = replaceVariables(node.properties["path"] || "", context);
  const content = replaceVariables(node.properties["content"] || "", context);
  const mode = node.properties["mode"] || "overwrite"; // overwrite, append, create
  // Check if history should be saved: use settings by default, allow workflow to override
  const historyManager = getEditHistoryManager();
  const historyEnabled = historyManager?.isEnabled() ?? false;
  const saveHistory = node.properties["history"] === "false" ? false : historyEnabled;
  const workflowName = context.variables.get("__workflowName__") as string | undefined;
  const model = context.variables.get("__lastModel__") as string | undefined;

  if (!path) {
    throw new Error("Note node missing 'path' property");
  }

  // Ensure .md extension
  const notePath = path.endsWith(".md") ? path : `${path}.md`;

  // Check if confirmation is required (default: true)
  const confirm = node.properties["confirm"] !== "false";

  if (confirm && promptCallbacks?.promptForConfirmation) {
    const confirmResult = await promptCallbacks.promptForConfirmation(
      notePath,
      content,
      mode
    );
    if (!confirmResult.confirmed) {
      // Check if user requested regeneration
      if (confirmResult.additionalRequest && context.lastCommandInfo) {
        // Get the previous output from the command node
        const previousOutput = context.variables.get(context.lastCommandInfo.saveTo);
        const previousOutputStr = typeof previousOutput === "string" ? previousOutput : String(previousOutput ?? "");

        // Set regenerate info for the executor to handle
        context.regenerateInfo = {
          commandNodeId: context.lastCommandInfo.nodeId,
          originalPrompt: context.lastCommandInfo.originalPrompt,
          previousOutput: previousOutputStr,
          additionalRequest: confirmResult.additionalRequest,
        };
        throw new RegenerateRequestError("Regeneration requested by user");
      }
      throw new Error("Note write cancelled by user");
    }
  }

  // Check if file exists
  const existingFile = app.vault.getAbstractFileByPath(notePath);

  // Ensure snapshot exists before modification (for edit history)
  if (saveHistory && existingFile && historyManager) {
    await historyManager.ensureSnapshot(notePath);
  }

  // Ensure parent folder exists for all modes when creating new file
  const folderPath = notePath.substring(0, notePath.lastIndexOf("/"));

  let finalContent = content;

  if (mode === "create") {
    // Only create if file doesn't exist
    if (existingFile) {
      // File already exists, skip
      return;
    }
    await ensureFolderExists(app, folderPath);
    await app.vault.create(notePath, content);
  } else if (mode === "append") {
    if (existingFile && existingFile instanceof TFile) {
      // Append to existing file
      const currentContent = await app.vault.read(existingFile);
      finalContent = currentContent + "\n" + content;
      await app.vault.modify(existingFile, finalContent);
    } else {
      // Create new file with content
      await ensureFolderExists(app, folderPath);
      await app.vault.create(notePath, content);
    }
  } else {
    // overwrite mode (default)
    if (existingFile && existingFile instanceof TFile) {
      await app.vault.modify(existingFile, content);
    } else {
      await ensureFolderExists(app, folderPath);
      await app.vault.create(notePath, content);
    }
  }

  // Save edit history if enabled
  if (saveHistory && historyManager) {
    await historyManager.saveEdit({
      path: notePath,
      modifiedContent: finalContent,
      source: "workflow",
      workflowName,
      model,
    });
  }
}

// Handle note-read node - read note content from file
// Always requires path - use prompt-file first to get the file path
export async function handleNoteReadNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App,
  promptCallbacks?: PromptCallbacks
): Promise<void> {
  const pathRaw = node.properties["path"] || "";
  const saveTo = node.properties["saveTo"];

  if (!saveTo) {
    throw new Error("note-read node missing 'saveTo' property");
  }

  if (!pathRaw.trim()) {
    throw new Error("note-read node missing 'path' property. Use prompt-file first to get the file path.");
  }

  const path = replaceVariables(pathRaw, context);

  // Ensure .md extension
  const notePath = path.endsWith(".md") ? path : `${path}.md`;

  const file = app.vault.getAbstractFileByPath(notePath);
  if (!file) {
    throw new Error(`Note not found: ${notePath}`);
  }

  if (!(file instanceof TFile)) {
    throw new Error(`Path is not a file: ${notePath}`);
  }

  let content = await app.vault.read(file);

  // Check if file is encrypted and decrypt if needed
  if (isEncryptedFile(content)) {
    // Try cached password first
    let password = cryptoCache.getPassword();

    if (!password && promptCallbacks?.promptForPassword) {
      password = await promptCallbacks.promptForPassword();
    }

    if (!password) {
      throw new Error(`Cannot read encrypted file without password: ${notePath}`);
    }

    try {
      content = await decryptFileContent(content, password);
      // Cache the password on success
      cryptoCache.setPassword(password);
    } catch {
      throw new Error(`Failed to decrypt file (wrong password?): ${notePath}`);
    }
  }

  context.variables.set(saveTo, content);
}

// Handle note-search node - search for notes by name or content
export async function handleNoteSearchNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App
): Promise<void> {
  const query = replaceVariables(node.properties["query"] || "", context);
  const searchContent = node.properties["searchContent"] === "true";
  const limitStr = node.properties["limit"] || "10";
  const limit = parseInt(limitStr, 10) || 10;
  const saveTo = node.properties["saveTo"];

  if (!query) {
    throw new Error("note-search node missing 'query' property");
  }
  if (!saveTo) {
    throw new Error("note-search node missing 'saveTo' property");
  }

  const files = app.vault.getMarkdownFiles();
  const results: { name: string; path: string; matchedContent?: string }[] = [];

  if (searchContent) {
    // Search within file contents
    for (const file of files) {
      if (results.length >= limit) break;

      const content = await app.vault.cachedRead(file);
      const lowerContent = content.toLowerCase();
      const lowerQuery = query.toLowerCase();

      if (lowerContent.includes(lowerQuery)) {
        // Extract matched context (50 chars before and after)
        const index = lowerContent.indexOf(lowerQuery);
        const start = Math.max(0, index - 50);
        const end = Math.min(content.length, index + query.length + 50);
        const matchedContent = content.substring(start, end);

        results.push({
          name: file.basename,
          path: file.path,
          matchedContent:
            (start > 0 ? "..." : "") +
            matchedContent +
            (end < content.length ? "..." : ""),
        });
      }
    }
  } else {
    // Search by file name
    const lowerQuery = query.toLowerCase();
    for (const file of files) {
      if (results.length >= limit) break;

      if (
        file.basename.toLowerCase().includes(lowerQuery) ||
        file.path.toLowerCase().includes(lowerQuery)
      ) {
        results.push({
          name: file.basename,
          path: file.path,
        });
      }
    }
  }

  context.variables.set(saveTo, JSON.stringify(results));
}

// Parse time duration string (e.g., "7d", "30m", "2h") to milliseconds
function parseTimeDuration(duration: string): number | null {
  if (!duration) return null;

  const match = duration.trim().match(/^(\d+)\s*(m|min|h|hour|d|day)s?$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case "m":
    case "min":
      return value * 60 * 1000;
    case "h":
    case "hour":
      return value * 60 * 60 * 1000;
    case "d":
    case "day":
      return value * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

// Get tags from a file using Obsidian's metadata cache
function getFileTags(app: App, filePath: string): string[] {
  const cache = app.metadataCache.getCache(filePath);
  if (!cache) return [];

  const tags: string[] = [];

  // Get tags from frontmatter
  if (cache.frontmatter?.tags) {
    const fmTags = cache.frontmatter.tags;
    if (Array.isArray(fmTags)) {
      tags.push(...fmTags.map((t) => (t.startsWith("#") ? t : `#${t}`)));
    } else if (typeof fmTags === "string") {
      tags.push(fmTags.startsWith("#") ? fmTags : `#${fmTags}`);
    }
  }

  // Get inline tags
  if (cache.tags) {
    tags.push(...cache.tags.map((t) => t.tag));
  }

  return [...new Set(tags)]; // Remove duplicates
}

// Handle note-list node - list notes in a folder
export function handleNoteListNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App
): void {
  const folder = replaceVariables(node.properties["folder"] || "", context);
  const recursive = node.properties["recursive"] === "true";
  const limitStr = node.properties["limit"] || "50";
  const limit = parseInt(limitStr, 10) || 50;
  const saveTo = node.properties["saveTo"];

  // Date filtering
  const createdWithin = replaceVariables(
    node.properties["createdWithin"] || "",
    context
  );
  const modifiedWithin = replaceVariables(
    node.properties["modifiedWithin"] || "",
    context
  );
  const sortBy = node.properties["sortBy"] || ""; // "created", "modified", "name"
  const sortOrder = node.properties["sortOrder"] || "desc"; // "asc", "desc"

  // Tag filtering
  const tagsFilter = replaceVariables(node.properties["tags"] || "", context);
  const tagMatchMode = node.properties["tagMatch"] || "any"; // "any" or "all"

  if (!saveTo) {
    throw new Error("note-list node missing 'saveTo' property");
  }

  const now = Date.now();
  const createdThreshold = parseTimeDuration(createdWithin);
  const modifiedThreshold = parseTimeDuration(modifiedWithin);

  // Parse tag filter
  const requiredTags = tagsFilter
    ? tagsFilter
        .split(",")
        .map((t) => {
          const trimmed = t.trim();
          return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
        })
        .filter((t) => t.length > 1)
    : [];

  let files = app.vault.getMarkdownFiles();

  // Filter by folder
  if (folder) {
    const normalizedFolder = folder.endsWith("/") ? folder : folder + "/";
    files = files.filter((file) => {
      if (recursive) {
        return (
          file.path.startsWith(normalizedFolder) ||
          file.path === folder + ".md"
        );
      } else {
        const fileFolder =
          file.path.substring(0, file.path.lastIndexOf("/") + 1);
        return fileFolder === normalizedFolder || file.parent?.path === folder;
      }
    });
  }

  // Filter by creation time
  if (createdThreshold !== null) {
    const cutoff = now - createdThreshold;
    files = files.filter((file) => file.stat.ctime >= cutoff);
  }

  // Filter by modification time
  if (modifiedThreshold !== null) {
    const cutoff = now - modifiedThreshold;
    files = files.filter((file) => file.stat.mtime >= cutoff);
  }

  // Filter by tags
  if (requiredTags.length > 0) {
    files = files.filter((file) => {
      const fileTags = getFileTags(app, file.path);
      if (tagMatchMode === "all") {
        // All tags must be present
        return requiredTags.every((tag) => fileTags.includes(tag));
      } else {
        // Any tag must be present
        return requiredTags.some((tag) => fileTags.includes(tag));
      }
    });
  }

  // Sort files
  if (sortBy === "created") {
    files.sort((a, b) =>
      sortOrder === "asc"
        ? a.stat.ctime - b.stat.ctime
        : b.stat.ctime - a.stat.ctime
    );
  } else if (sortBy === "modified") {
    files.sort((a, b) =>
      sortOrder === "asc"
        ? a.stat.mtime - b.stat.mtime
        : b.stat.mtime - a.stat.mtime
    );
  } else if (sortBy === "name") {
    files.sort((a, b) =>
      sortOrder === "asc"
        ? a.basename.localeCompare(b.basename)
        : b.basename.localeCompare(a.basename)
    );
  }

  // Apply limit and build results
  const totalCount = files.length;
  const limitedFiles = files.slice(0, limit);

  const results = limitedFiles.map((file) => ({
    name: file.basename,
    path: file.path,
    created: file.stat.ctime,
    modified: file.stat.mtime,
    tags: getFileTags(app, file.path),
  }));

  context.variables.set(
    saveTo,
    JSON.stringify({
      notes: results,
      count: results.length,
      totalCount,
      hasMore: totalCount > limit,
    })
  );
}

// Handle folder-list node - list folders in the vault
export function handleFolderListNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App
): void {
  const parentFolder = replaceVariables(
    node.properties["folder"] || "",
    context
  );
  const saveTo = node.properties["saveTo"];

  if (!saveTo) {
    throw new Error("folder-list node missing 'saveTo' property");
  }

  const folders: string[] = [];

  // Get all folders from the vault
  const allFiles = app.vault.getAllLoadedFiles();
  for (const file of allFiles) {
    // Check if it's a folder (has children property)
    if ("children" in file && file.children !== undefined) {
      const folderPath = file.path;

      // Filter by parent folder if specified
      if (parentFolder) {
        const normalizedParent = parentFolder.endsWith("/")
          ? parentFolder.slice(0, -1)
          : parentFolder;
        if (
          !folderPath.startsWith(normalizedParent + "/") &&
          folderPath !== normalizedParent
        ) {
          continue;
        }
      }

      if (folderPath) {
        folders.push(folderPath);
      }
    }
  }

  // Sort alphabetically
  folders.sort();

  context.variables.set(
    saveTo,
    JSON.stringify({
      folders,
      count: folders.length,
    })
  );
}
