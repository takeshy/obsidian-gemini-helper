import type { App } from "obsidian";
import {
  readNote,
  createNote,
  updateNote,
  deleteNote,
  renameNote,
  getActiveNoteInfo,
  proposeEdit,
  applyEdit,
  discardEdit,
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
import type { RagSyncState } from "src/types";

export type ToolResult = Record<string, unknown>;

// Context for tool execution (optional, used for RAG tools)
export interface ToolExecutionContext {
  ragSyncState?: RagSyncState;
  ragFilterConfig?: FilterConfig;
}

// Execute a tool call and return the result
export async function executeToolCall(
  app: App,
  toolName: string,
  args: Record<string, unknown>,
  context?: ToolExecutionContext
): Promise<ToolResult> {
  switch (toolName) {
    case "read_note":
      return readNote(
        app,
        args.fileName as string | undefined,
        args.activeNote as boolean | undefined
      );

    case "create_note":
      return createNote(
        app,
        args.name as string,
        args.content as string,
        args.folder as string | undefined,
        args.tags as string | undefined
      );

    case "update_note":
      return updateNote(
        app,
        args.fileName as string | undefined,
        args.activeNote as boolean | undefined,
        args.newContent as string | undefined,
        (args.mode as "replace" | "append" | "prepend") || "replace"
      );

    case "delete_note":
      return deleteNote(app, args.fileName as string);

    case "rename_note":
      return renameNote(app, args.oldPath as string, args.newPath as string);

    case "search_notes": {
      const query = args.query as string;
      const searchContent = args.searchContent as boolean | undefined;
      const limit = args.limit ? parseInt(args.limit as string, 10) : 10;

      if (searchContent) {
        const results = await searchByContent(app, query, limit);
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
        const results = searchByName(app, query, limit);
        return {
          success: true,
          results: results.map((r) => ({ name: r.name, path: r.path })),
          count: results.length,
        };
      }
    }

    case "list_notes": {
      const folder = args.folder as string | undefined;
      const recursive = args.recursive as boolean | undefined;
      const results = listNotes(app, folder, recursive);
      return {
        success: true,
        notes: results.map((r) => ({ name: r.name, path: r.path })),
        count: results.length,
      };
    }

    case "list_folders": {
      const parentFolder = args.parentFolder as string | undefined;
      const folders = listFolders(app, parentFolder);
      return {
        success: true,
        folders,
        count: folders.length,
      };
    }

    case "create_folder":
      return createFolder(app, args.path as string);

    case "get_active_note_info": {
      const info = getActiveNoteInfo(app);
      if (info) {
        return { success: true, ...info };
      }
      return {
        success: false,
        error: "No active note found. Please open a note first.",
      };
    }

    case "get_rag_sync_status": {
      const fileSearchManager = getFileSearchManager();
      if (!fileSearchManager) {
        return {
          success: false,
          error: "RAG is not enabled or File Search Manager is not initialized.",
        };
      }

      if (!context?.ragSyncState || !context?.ragFilterConfig) {
        return {
          success: false,
          error: "RAG sync state not available.",
        };
      }

      const filePath = args.filePath as string | undefined;
      const directory = args.directory as string | undefined;
      const listAll = args.listAll as boolean | undefined;

      // Query specific file
      if (filePath) {
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
            : `File "${status.path}" has not been imported to RAG yet.`,
        };
      }

      // List unsynced files in directory
      if (directory !== undefined) {
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
      return proposeEdit(
        app,
        args.fileName as string | undefined,
        args.activeNote as boolean | undefined,
        args.newContent as string | undefined,
        (args.mode as "replace" | "append" | "prepend") || "replace"
      );

    case "apply_edit":
      return applyEdit(app);

    case "discard_edit":
      return discardEdit(app);

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
