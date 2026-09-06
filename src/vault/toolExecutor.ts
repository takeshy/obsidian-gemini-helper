// The built-in Vault tools live in the shared library. What stays here is this
// host's execution context, the one tool only this plugin can answer, and the
// flag that says so.
import type { App } from "obsidian";
import {
  createVaultToolExecutor,
  executeVaultTool,
  type VaultToolExecutionContext,
  type VaultToolResult,
} from "obsidian-llm-hub-common/vault";
import {
  VAULT_TOOL_SCOPE_DENIED_MSG,
  isPathInAllowedVaultFolders,
} from "obsidian-llm-hub-common/core";
import { getFileSearchManager, type FilterConfig } from "src/core/fileSearch";
import type { RagSyncState } from "src/types";

/**
 * Whether this host can answer `get_rag_sync_status`. Its RAG store records
 * per-file import state, so executeHostTool below answers the tool and
 * `getEnabledVaultTools` may advertise it. toolExecutor.contract.test.ts fails
 * if this flag and the executor ever disagree.
 */
export const HOST_EXECUTES_RAG_SYNC_STATUS = true;

export type ToolResult = VaultToolResult;

/** The shared context plus the RAG sync state only this plugin's extra tool reads. */
export interface ToolExecutionContext extends VaultToolExecutionContext {
  ragSyncState?: RagSyncState;
  ragFilterConfig?: FilterConfig;
}

function hasScope(context: ToolExecutionContext | undefined): boolean {
  return !!(context?.limitVaultToolScope && context.vaultToolAllowedFolders?.length);
}

function isPathInScope(path: string | undefined, context: ToolExecutionContext | undefined): boolean {
  if (!hasScope(context)) return true;
  return !!path && isPathInAllowedVaultFolders(path, context?.vaultToolAllowedFolders);
}

function deny(): ToolResult {
  return { success: false, error: VAULT_TOOL_SCOPE_DENIED_MSG };
}

function asString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try { return JSON.stringify(value); } catch { return undefined; }
}

/** Report how much of the vault the Gemini File Search store has taken in. */
async function getRagSyncStatus(
  args: Record<string, unknown>,
  context: ToolExecutionContext | undefined,
): Promise<ToolResult> {
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
    if (!isPathInScope(filePath, context)) {
      return deny();
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
    if (!isPathInScope(directory, context)) {
      return deny();
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
    if (hasScope(context)) {
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

async function executeHostTool(
  _app: App,
  toolName: string,
  args: Record<string, unknown>,
  context: ToolExecutionContext | undefined,
): Promise<ToolResult | null> {
  if (toolName === "get_rag_sync_status") return getRagSyncStatus(args, context);
  return null;
}

export function executeToolCall(
  app: App,
  toolName: string,
  args: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<ToolResult> {
  return executeVaultTool(app, toolName, args, context, { executeHostTool });
}

export function createToolExecutor(
  app: App,
  context?: ToolExecutionContext,
): (name: string, args: Record<string, unknown>) => Promise<unknown> {
  return createVaultToolExecutor(app, context, { executeHostTool });
}
