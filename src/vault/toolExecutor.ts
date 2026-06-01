import type { App, TFile } from "obsidian";
import {
  readNote,
  createNote,
  updateNote,
  deleteNote,
  findFileByName,
  getActiveNoteInfo,
  proposeEdit,
  applyEdit,
  discardEdit,
  proposeDelete,
  applyDelete,
  discardDelete,
  proposeRename,
  proposeBulkEdit,
  proposeBulkDelete,
  proposeBulkRename,
} from "./notes";
import {
  searchByName,
  searchByContent,
  listNotes,
  listFolders,
  createFolder,
} from "./search";
import {
  getFileSearchManager,
  type FilterConfig,
} from "src/core/fileSearch";
import { DEFAULT_SETTINGS, type RagSyncState } from "src/types";
import { formatError } from "src/utils/error";
import {
  AI_VAULT_SCOPE_DENIED_MSG,
  isFileAllowedForAiVaultTools,
  isPathInAllowedVaultFolders,
  normalizeAllowedVaultFolders,
  normalizeVaultScopePath,
} from "./aiVaultScope";

export type ToolResult = Record<string, unknown>;

// Context for tool execution (optional, used for RAG tools)
export interface ToolExecutionContext {
  ragSyncState?: RagSyncState;
  ragFilterConfig?: FilterConfig;
  listNotesLimit?: number;
  maxNoteChars?: number;
  limitAiVaultToolScope?: boolean;
  aiVaultToolAllowedFolders?: string[];
}

function hasAiVaultToolScope(context: ToolExecutionContext | undefined): boolean {
  return !!(context?.limitAiVaultToolScope && context.aiVaultToolAllowedFolders && context.aiVaultToolAllowedFolders.length > 0);
}

function aiVaultToolFileFilter(context: ToolExecutionContext | undefined): ((file: TFile) => boolean) | undefined {
  if (!hasAiVaultToolScope(context)) return undefined;
  return (file) => isFileAllowedForAiVaultTools(file, context?.aiVaultToolAllowedFolders);
}

function aiVaultToolFolderFilter(context: ToolExecutionContext | undefined): ((path: string) => boolean) | undefined {
  if (!hasAiVaultToolScope(context)) return undefined;
  const allowedFolders = normalizeAllowedVaultFolders(context?.aiVaultToolAllowedFolders);
  return (path) => {
    const normalizedPath = normalizeVaultScopePath(path)?.toLowerCase();
    if (!normalizedPath) return false;
    return allowedFolders.some((folder) =>
      normalizedPath === folder ||
      normalizedPath.startsWith(`${folder}/`) ||
      folder.startsWith(`${normalizedPath}/`)
    );
  };
}

function denyAiVaultToolScope(): ToolResult {
  return { success: false, error: AI_VAULT_SCOPE_DENIED_MSG };
}

function denyAiVaultToolScopeForBulk(rejectedPaths: string[]): ToolResult {
  return {
    success: false,
    error: AI_VAULT_SCOPE_DENIED_MSG,
    rejectedPaths,
  };
}

function isFileInAiVaultToolScope(app: App, fileName: string | undefined, activeNote: boolean | undefined, context: ToolExecutionContext | undefined): boolean {
  if (!hasAiVaultToolScope(context)) return true;
  const file = activeNote ? app.workspace.getActiveFile() : fileName ? findFileByName(app, fileName) : null;
  return !!(file && isFileAllowedForAiVaultTools(file, context?.aiVaultToolAllowedFolders));
}

function isPathInAiVaultToolScope(path: string | undefined, context: ToolExecutionContext | undefined): boolean {
  if (!hasAiVaultToolScope(context)) return true;
  return !!(path && isPathInAllowedVaultFolders(path, context?.aiVaultToolAllowedFolders));
}

// Execute a tool call and return the result
export async function executeToolCall(
  app: App,
  toolName: string,
  args: Record<string, unknown>,
  context?: ToolExecutionContext
): Promise<ToolResult> {
  try {
    return await executeToolCallInternal(app, toolName, args, context);
  } catch (error) {
    return {
      success: false,
      error: formatError(error),
      toolName,
    };
  }
}

// Coerce an AI-provided argument to string (AI may send numbers or other types)
function asString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // Avoid [object Object] for complex types
  try { return JSON.stringify(value); } catch { return undefined; }
}

// Internal function that may throw
async function executeToolCallInternal(
  app: App,
  toolName: string,
  args: Record<string, unknown>,
  context?: ToolExecutionContext
): Promise<ToolResult> {
  switch (toolName) {
    case "read_note":
      if (!isFileInAiVaultToolScope(app, asString(args.fileName), args.activeNote as boolean | undefined, context)) {
        return denyAiVaultToolScope();
      }
      return readNote(
        app,
        asString(args.fileName),
        args.activeNote as boolean | undefined,
        context?.maxNoteChars ?? DEFAULT_SETTINGS.maxNoteChars
      );

    case "create_note": {
      let name = asString(args.name);
      let folder = asString(args.folder);
      if (!name && args.path) {
        // Fallback: extract name and folder from path argument
        const pathStr = asString(args.path) || "";
        const lastSlash = pathStr.lastIndexOf("/");
        if (lastSlash >= 0) {
          name = pathStr.slice(lastSlash + 1);
          folder = folder ?? pathStr.slice(0, lastSlash);
        } else {
          name = pathStr;
        }
      }
      if (!name) {
        return { success: false, error: "Required parameter 'name' is missing" };
      }
      if (args.content == null) {
        return { success: false, error: "Required parameter 'content' is missing" };
      }
      const requestedPath = folder ? `${folder}/${name}` : name;
      if (!isPathInAiVaultToolScope(requestedPath, context)) {
        return denyAiVaultToolScope();
      }
      return createNote(
        app,
        name,
        asString(args.content) || "",
        folder,
        asString(args.tags)
      );
    }

    case "update_note":
      if (!isFileInAiVaultToolScope(app, asString(args.fileName), args.activeNote as boolean | undefined, context)) {
        return denyAiVaultToolScope();
      }
      return updateNote(
        app,
        asString(args.fileName),
        args.activeNote as boolean | undefined,
        asString(args.newContent),
        (asString(args.mode) as "replace" | "append" | "prepend") || "replace"
      );

    case "delete_note": {
      const fileName = asString(args.fileName);
      if (!fileName) {
        return { success: false, error: "Required parameter 'fileName' is missing" };
      }
      if (!isFileInAiVaultToolScope(app, fileName, false, context)) {
        return denyAiVaultToolScope();
      }
      return deleteNote(app, fileName);
    }

    case "rename_note": {
      const oldPath = asString(args.oldPath);
      const newPath = asString(args.newPath);
      if (!oldPath) {
        return { success: false, error: "Required parameter 'oldPath' is missing" };
      }
      if (!newPath) {
        return { success: false, error: "Required parameter 'newPath' is missing" };
      }
      if (!isFileInAiVaultToolScope(app, oldPath, false, context) || !isPathInAiVaultToolScope(newPath, context)) {
        return denyAiVaultToolScope();
      }
      return proposeRename(app, oldPath, newPath);
    }

    case "search_notes": {
      const query = asString(args.query);
      if (!query) {
        return { success: false, error: "Required parameter 'query' is missing" };
      }
      const searchContent = args.searchContent as boolean | undefined;
      const parsedLimit = args.limit ? parseInt(asString(args.limit) || "10", 10) : 10;
      const limit = Number.isNaN(parsedLimit) || parsedLimit <= 0 ? 10 : parsedLimit;

      if (searchContent) {
        const results = await searchByContent(app, query, limit, aiVaultToolFileFilter(context));
        return {
          success: true,
          results: results.map((r) => ({
            name: r.name,
            path: r.path,
            matchedContent: r.matchedContent,
          })),
          count: results.length,
        };
      } else {
        const results = searchByName(app, query, limit, aiVaultToolFileFilter(context));
        return {
          success: true,
          results: results.map((r) => ({ name: r.name, path: r.path })),
          count: results.length,
        };
      }
    }

    case "list_notes": {
      const folder = asString(args.folder);
      const recursive = args.recursive as boolean | undefined;
      const defaultLimit = context?.listNotesLimit ?? DEFAULT_SETTINGS.listNotesLimit;
      const parsedLimit = args.limit ? parseInt(asString(args.limit) || String(defaultLimit), 10) : defaultLimit;
      const limit = Number.isNaN(parsedLimit) || parsedLimit <= 0 ? defaultLimit : parsedLimit;
      if (folder && !isPathInAiVaultToolScope(folder, context)) {
        return denyAiVaultToolScope();
      }
      const { results, totalCount, hasMore } = listNotes(app, folder, recursive, limit, aiVaultToolFileFilter(context));
      return {
        success: true,
        notes: results.map((r) => ({ name: r.name, path: r.path })),
        count: results.length,
        totalCount,
        hasMore,
        message: hasMore
          ? `Showing ${results.length} of ${totalCount} files. Use 'limit' parameter to see more.`
          : undefined,
      };
    }

    case "list_folders": {
      const parentFolder = asString(args.parentFolder);
      if (parentFolder && !aiVaultToolFolderFilter(context)?.(parentFolder) && hasAiVaultToolScope(context)) {
        return denyAiVaultToolScope();
      }
      const folders = listFolders(app, parentFolder, aiVaultToolFolderFilter(context));
      return {
        success: true,
        folders,
        count: folders.length,
      };
    }

    case "create_folder": {
      const path = asString(args.path);
      if (!path) {
        return { success: false, error: "Required parameter 'path' is missing" };
      }
      if (!isPathInAiVaultToolScope(path, context)) {
        return denyAiVaultToolScope();
      }
      return createFolder(app, path);
    }

    case "get_active_note_info": {
      if (hasAiVaultToolScope(context)) {
        const file = app.workspace.getActiveFile();
        if (!file || !isFileAllowedForAiVaultTools(file, context?.aiVaultToolAllowedFolders)) {
          return denyAiVaultToolScope();
        }
      }
      const info = getActiveNoteInfo(app);
      if (info) {
        return { success: true, ...info };
      }
      return {
        success: false,
        error: "No active vault file found. Please open a file first.",
      };
    }

    case "get_rag_sync_status": {
      const fileSearchManager = getFileSearchManager();
      if (!fileSearchManager) {
        return {
          success: false,
          error: "Semantic search is not enabled or not initialized.",
        };
      }

      if (!context?.ragSyncState || !context?.ragFilterConfig) {
        return {
          success: false,
          error: "Semantic search sync state not available.",
        };
      }

      const filePath = asString(args.filePath);
      const directory = asString(args.directory);
      const listAll = args.listAll as boolean | undefined;

      // Query specific file
      if (filePath) {
        if (!isPathInAiVaultToolScope(filePath, context)) {
          return denyAiVaultToolScope();
        }
        const status = await fileSearchManager.getFileSyncStatus(
          filePath,
          context.ragSyncState
        );

        const importedAtStr = status.importedAt
          ? new Date(status.importedAt).toLocaleString()
          : null;

        return {
          success: true,
          file: status.path,
          isSynced: status.isSynced,
          importedAt: importedAtStr,
          importedAtTimestamp: status.importedAt,
          hasDiff: status.hasDiff,
          message: status.isSynced
            ? status.hasDiff
              ? `File "${status.path}" was imported at ${importedAtStr}, but has been modified since then.`
              : `File "${status.path}" was imported at ${importedAtStr} and is up to date.`
            : `File "${status.path}" has not been imported to semantic search yet.`,
        };
      }

      // List unsynced files in directory
      if (directory !== undefined) {
        if (!isPathInAiVaultToolScope(directory, context)) {
          return denyAiVaultToolScope();
        }
        const result = await fileSearchManager.getUnsyncedFilesInDirectory(
          directory,
          context.ragSyncState,
          context.ragFilterConfig
        );

        return {
          success: true,
          directory: result.directory,
          totalFiles: result.totalFiles,
          syncedCount: result.syncedCount,
          unsyncedCount: result.unsyncedFiles.length,
          unsyncedFiles: result.unsyncedFiles.map((f) => ({
            path: f.path,
            reason:
              f.reason === "not_imported"
                ? "Not imported yet"
                : "Has changes since last import",
          })),
          message: `Found ${result.unsyncedFiles.length} unsynced files out of ${result.totalFiles} total files in "${result.directory}".`,
        };
      }

      // Get vault-wide summary
      if (listAll) {
        if (hasAiVaultToolScope(context)) {
          return {
            success: false,
            error: "Vault-wide semantic search sync status is unavailable while AI vault tools are limited to allowed folders. Specify an allowed directory instead.",
          };
        }
        const summary = await fileSearchManager.getVaultSyncSummary(
          context.ragSyncState,
          context.ragFilterConfig
        );

        const lastSyncStr = summary.lastFullSync
          ? new Date(summary.lastFullSync).toLocaleString()
          : "Never";

        return {
          success: true,
          totalFiles: summary.totalFiles,
          syncedFiles: summary.syncedFiles,
          unsyncedFiles: summary.unsyncedFiles,
          filesWithDiff: summary.filesWithDiff,
          lastFullSync: lastSyncStr,
          lastFullSyncTimestamp: summary.lastFullSync,
          message: `Vault sync status: ${summary.syncedFiles}/${summary.totalFiles} files synced. ${summary.unsyncedFiles} not imported, ${summary.filesWithDiff} have changes. Last full sync: ${lastSyncStr}.`,
        };
      }

      return {
        success: false,
        error:
          "Please specify one of: filePath (to check a specific file), directory (to list unsynced files), or listAll (for vault summary).",
      };
    }

    case "propose_edit":
      if (!isFileInAiVaultToolScope(app, asString(args.fileName), args.activeNote as boolean | undefined, context)) {
        return denyAiVaultToolScope();
      }
      return proposeEdit(
        app,
        asString(args.fileName),
        args.activeNote as boolean | undefined,
        asString(args.newContent),
        (asString(args.mode) as "replace" | "append" | "prepend" | "patch") || "replace",
        undefined,
        args.patches as Array<{ search: string; replace: string }> | undefined
      );

    case "apply_edit":
      return applyEdit(app);

    case "discard_edit":
      return discardEdit(app);

    case "propose_delete": {
      const fileName = asString(args.fileName);
      if (!fileName) {
        return { success: false, error: "Required parameter 'fileName' is missing" };
      }
      if (!isFileInAiVaultToolScope(app, fileName, false, context)) {
        return denyAiVaultToolScope();
      }
      return proposeDelete(app, fileName);
    }

    case "apply_delete":
      return applyDelete(app);

    case "discard_delete":
      return discardDelete(app);

    case "bulk_propose_edit": {
      const edits = args.edits as Array<{
        fileName: string;
        newContent: string;
        mode?: "replace" | "append" | "prepend";
      }>;
      if (!edits || !Array.isArray(edits) || edits.length === 0) {
        return {
          success: false,
          error: "No edits provided. The 'edits' array is required.",
        };
      }
      const scopedEdits = hasAiVaultToolScope(context)
        ? edits.filter((edit) => isFileInAiVaultToolScope(app, edit.fileName, false, context))
        : edits;
      if (scopedEdits.length !== edits.length) {
        const scopedPaths = new Set(scopedEdits.map((edit) => edit.fileName));
        return denyAiVaultToolScopeForBulk(edits.map((edit) => edit.fileName).filter((path) => !scopedPaths.has(path)));
      }
      if (scopedEdits.length === 0) return denyAiVaultToolScope();
      return proposeBulkEdit(app, scopedEdits);
    }

    case "bulk_propose_rename": {
      const renames = args.renames as Array<{ oldPath: string; newPath: string }>;
      if (!renames || !Array.isArray(renames) || renames.length === 0) {
        return {
          success: false,
          error: "No renames provided. The 'renames' array is required.",
        };
      }
      const scopedRenames = hasAiVaultToolScope(context)
        ? renames.filter((rename) => isFileInAiVaultToolScope(app, rename.oldPath, false, context) && isPathInAiVaultToolScope(rename.newPath, context))
        : renames;
      if (scopedRenames.length !== renames.length) {
        const scopedKeys = new Set(scopedRenames.map((rename) => `${rename.oldPath}\u0000${rename.newPath}`));
        return denyAiVaultToolScopeForBulk(renames
          .filter((rename) => !scopedKeys.has(`${rename.oldPath}\u0000${rename.newPath}`))
          .flatMap((rename) => [rename.oldPath, rename.newPath]));
      }
      if (scopedRenames.length === 0) return denyAiVaultToolScope();
      return proposeBulkRename(app, scopedRenames);
    }

    case "bulk_propose_delete": {
      const fileNames = args.fileNames as string[];
      if (!fileNames || !Array.isArray(fileNames) || fileNames.length === 0) {
        return {
          success: false,
          error: "No files provided. The 'fileNames' array is required.",
        };
      }
      const scopedFileNames = hasAiVaultToolScope(context)
        ? fileNames.filter((fileName) => isFileInAiVaultToolScope(app, fileName, false, context))
        : fileNames;
      if (scopedFileNames.length !== fileNames.length) {
        const scopedPaths = new Set(scopedFileNames);
        return denyAiVaultToolScopeForBulk(fileNames.filter((path) => !scopedPaths.has(path)));
      }
      if (scopedFileNames.length === 0) return denyAiVaultToolScope();
      return proposeBulkDelete(app, scopedFileNames);
    }

    default:
      return {
        success: false,
        error: `Unknown tool: ${toolName}`,
      };
  }
}

// Create a tool executor function bound to a specific app instance
export function createToolExecutor(
  app: App,
  context?: ToolExecutionContext
): (name: string, args: Record<string, unknown>) => Promise<unknown> {
  return async (name: string, args: Record<string, unknown>) => {
    return executeToolCall(app, name, args, context);
  };
}
