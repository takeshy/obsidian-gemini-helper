import type { App } from "obsidian";
import type { GeminiHelperPlugin } from "src/plugin";
import type { WorkflowNode, ExecutionContext } from "obsidian-llm-hub-common/workflow";
import { replaceVariables } from "obsidian-llm-hub-common/workflow";

// Handle rag-sync node - run a full checksum-based incremental RAG sync.
export async function handleRagSyncNode(
  node: WorkflowNode,
  context: ExecutionContext,
  _app: App,
  plugin: GeminiHelperPlugin
): Promise<void> {
  const saveTo = node.properties["saveTo"];
  const pathRaw = node.properties["path"] || "";
  const requestedPath = pathRaw ? replaceVariables(pathRaw, context) : undefined;
  const ragSettingRaw = node.properties["ragSetting"] || "";
  const ragSetting = (ragSettingRaw ? replaceVariables(ragSettingRaw, context) : "")
    || plugin.workspaceState.selectedRagSetting;

  if (!ragSetting) {
    throw new Error("No RAG setting selected. Set ragSetting or select a semantic search setting first.");
  }

  const result = await plugin.syncVaultForRAG(ragSetting);
  if (!result) throw new Error(`RAG sync could not start for setting "${ragSetting}".`);
  if (result.errors.length > 0) {
    const first = result.errors[0];
    throw new Error(
      `RAG sync completed with ${result.errors.length} error(s). ${first.path}: ${first.error}`
    );
  }

  if (saveTo) {
    context.variables.set(saveTo, JSON.stringify({
      ...result,
      ragSetting,
      requestedPath,
      syncedAt: Date.now(),
      mode: "full-incremental",
    }));
  }
}

// Handle obsidian-command node - execute an Obsidian command
