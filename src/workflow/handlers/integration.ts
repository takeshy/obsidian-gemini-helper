import { App, TFile, WorkspaceLeaf } from "obsidian";
import type { GeminiHelperPlugin } from "../../plugin";
import { getFileSearchManager } from "../../core/fileSearch";
import { WorkflowNode, ExecutionContext, PromptCallbacks } from "../types";
import { replaceVariables } from "./utils";

// Handle workflow node - execute a sub-workflow
export async function handleWorkflowNode(
  node: WorkflowNode,
  context: ExecutionContext,
  _app: App,
  promptCallbacks?: PromptCallbacks
): Promise<void> {
  const path = replaceVariables(node.properties["path"] || "", context);
  const name = node.properties["name"]
    ? replaceVariables(node.properties["name"], context)
    : undefined;
  const inputStr = node.properties["input"] || "";
  const outputStr = node.properties["output"] || "";

  if (!path) {
    throw new Error("Workflow node missing 'path' property");
  }

  if (!promptCallbacks?.executeSubWorkflow) {
    throw new Error("Sub-workflow execution not available");
  }

  // Parse input variable mapping (JSON object: {"subVar": "{{parentVar}}"})
  const inputVariables = new Map<string, string | number>();
  if (inputStr) {
    const replacedInput = replaceVariables(inputStr, context);
    try {
      const inputMapping = JSON.parse(replacedInput);
      if (typeof inputMapping === "object" && inputMapping !== null) {
        for (const [key, value] of Object.entries(inputMapping)) {
          if (typeof value === "string" || typeof value === "number") {
            inputVariables.set(key, value);
          } else {
            inputVariables.set(key, JSON.stringify(value));
          }
        }
      }
    } catch {
      // If not valid JSON, try to parse as comma-separated key=value pairs
      const pairs = replacedInput.split(",");
      for (const pair of pairs) {
        const eqIndex = pair.indexOf("=");
        if (eqIndex !== -1) {
          const key = pair.substring(0, eqIndex).trim();
          const value = pair.substring(eqIndex + 1).trim();
          if (key) {
            // Try to get value from context if it looks like a variable reference
            const contextValue = context.variables.get(value);
            inputVariables.set(key, contextValue !== undefined ? contextValue : value);
          }
        }
      }
    }
  }

  // Execute sub-workflow
  const resultVariables = await promptCallbacks.executeSubWorkflow(
    path,
    name,
    inputVariables
  );

  // Copy output variables back to parent context
  if (outputStr) {
    // Parse output mapping (JSON object: {"parentVar": "subVar"} or comma-separated)
    const replacedOutput = replaceVariables(outputStr, context);
    try {
      const outputMapping = JSON.parse(replacedOutput);
      if (typeof outputMapping === "object" && outputMapping !== null) {
        for (const [parentVar, subVar] of Object.entries(outputMapping)) {
          if (typeof subVar === "string") {
            const value = resultVariables.get(subVar);
            if (value !== undefined) {
              context.variables.set(parentVar, value);
            }
          }
        }
      }
    } catch {
      // Comma-separated: parentVar=subVar
      const pairs = replacedOutput.split(",");
      for (const pair of pairs) {
        const eqIndex = pair.indexOf("=");
        if (eqIndex !== -1) {
          const parentVar = pair.substring(0, eqIndex).trim();
          const subVar = pair.substring(eqIndex + 1).trim();
          if (parentVar && subVar) {
            const value = resultVariables.get(subVar);
            if (value !== undefined) {
              context.variables.set(parentVar, value);
            }
          }
        }
      }
    }
  } else {
    // No explicit output mapping - copy all result variables with optional prefix
    const prefix = node.properties["prefix"] || "";
    for (const [key, value] of resultVariables) {
      context.variables.set(prefix + key, value);
    }
  }
}

// Handle rag-sync node - sync a note to RAG store
// Supports oldPath for rename scenarios: deletes old path entry before uploading new
// If only oldPath is specified (no path), performs delete only
export async function handleRagSyncNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App,
  plugin: GeminiHelperPlugin
): Promise<void> {
  const pathRaw = node.properties["path"] || "";
  const oldPathRaw = node.properties["oldPath"] || "";
  const ragSettingName = replaceVariables(node.properties["ragSetting"] || "", context);
  const saveTo = node.properties["saveTo"];

  const hasPath = pathRaw.trim().length > 0;
  const hasOldPath = oldPathRaw.trim().length > 0;

  if (!hasPath && !hasOldPath) {
    throw new Error("rag-sync node requires 'path' or 'oldPath' property");
  }

  if (!ragSettingName.trim()) {
    throw new Error("rag-sync node missing 'ragSetting' property");
  }

  const path = hasPath ? replaceVariables(pathRaw, context) : null;
  const oldPath = hasOldPath ? replaceVariables(oldPathRaw, context) : null;

  // Ensure .md extension
  const notePath = path ? (path.endsWith(".md") ? path : `${path}.md`) : null;
  const oldNotePath = oldPath ? (oldPath.endsWith(".md") ? oldPath : `${oldPath}.md`) : null;

  // Get RAG setting
  const workspaceState = plugin.workspaceState;
  const ragSetting = workspaceState.ragSettings[ragSettingName] || null;
  if (!ragSetting) {
    throw new Error(`RAG setting not found: ${ragSettingName}`);
  }

  if (!ragSetting.storeId) {
    throw new Error(`RAG setting "${ragSettingName}" has no store configured.`);
  }

  // Get or create FileSearchManager
  const fileSearchManager = getFileSearchManager();
  if (!fileSearchManager) {
    throw new Error("FileSearchManager not initialized. Please check your API key.");
  }

  // Set the store name
  fileSearchManager.setStoreName(ragSetting.storeId);

  // If oldPath is specified, delete the old file from store
  let deletedOldPath = false;
  if (oldNotePath && ragSetting.files[oldNotePath]) {
    try {
      // Delete by displayName (file path) from the store
      await fileSearchManager.deleteFileFromStore(oldNotePath);
      deletedOldPath = true;
    } catch {
      // Ignore deletion errors - file may already be deleted
    }
    // Remove old path from sync state
    delete ragSetting.files[oldNotePath];
  }

  // If no path specified, this is delete-only mode
  if (!notePath) {
    // Save the updated workspace state
    workspaceState.ragSettings[ragSettingName] = ragSetting;
    await plugin.saveWorkspaceState();

    // Set result if saveTo is specified
    if (saveTo) {
      context.variables.set(saveTo, JSON.stringify({
        path: null,
        oldPath: oldNotePath,
        deletedOldPath,
        fileId: null,
        ragSetting: ragSettingName,
        syncedAt: Date.now(),
        mode: "delete",
      }));
    }
    return;
  }

  // Get the file for upload
  const file = app.vault.getAbstractFileByPath(notePath);
  if (!(file instanceof TFile)) {
    throw new Error(`Note not found: ${notePath}`);
  }

  // Read file content and calculate checksum
  const content = await app.vault.read(file);
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const checksum = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  // Upload the file
  const fileId = await fileSearchManager.uploadFile(file);

  // Update the RAG setting's files state
  ragSetting.files[notePath] = {
    checksum,
    uploadedAt: Date.now(),
    fileId,
  };

  // Save the updated workspace state
  workspaceState.ragSettings[ragSettingName] = ragSetting;
  await plugin.saveWorkspaceState();

  // Set result if saveTo is specified
  if (saveTo) {
    context.variables.set(saveTo, JSON.stringify({
      path: notePath,
      oldPath: oldNotePath,
      deletedOldPath,
      fileId,
      ragSetting: ragSettingName,
      syncedAt: Date.now(),
      mode: oldNotePath ? "rename" : "sync",
    }));
  }
}

// Handle obsidian-command node - execute an Obsidian command
export async function handleObsidianCommandNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App
): Promise<void> {
  const commandId = replaceVariables(node.properties["command"] || "", context);
  const path = replaceVariables(node.properties["path"] || "", context);

  if (!commandId) {
    throw new Error("obsidian-command node missing 'command' property");
  }

  // Check if command exists
  const command = (app as unknown as { commands: { commands: Record<string, unknown> } }).commands.commands[commandId];
  if (!command) {
    throw new Error(`Command not found: ${commandId}`);
  }

  // If path is specified, open the file first
  if (path) {
    const filePath = path.endsWith(".md") ? path : `${path}.md`;
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Check if file is already open in any leaf
    let existingLeaf: WorkspaceLeaf | null = null;
    app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view?.getViewType() === "markdown") {
        const viewFile = (leaf.view as unknown as { file?: TFile }).file;
        if (viewFile?.path === file.path) {
          existingLeaf = leaf;
        }
      }
    });

    if (existingLeaf) {
      // File is already open, just activate it
      app.workspace.setActiveLeaf(existingLeaf, { focus: true });
    } else {
      // Open in a new tab (tab remains open after command execution)
      const newLeaf = app.workspace.getLeaf("tab");
      await newLeaf.openFile(file);
      // Ensure the new leaf is active
      app.workspace.setActiveLeaf(newLeaf, { focus: true });
    }
    // Wait for the workspace to settle before executing command
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Execute the command
  await (app as unknown as { commands: { executeCommandById: (id: string) => Promise<void> } }).commands.executeCommandById(commandId);

  // Save execution info to variable if specified
  const saveTo = node.properties["saveTo"];
  if (saveTo) {
    context.variables.set(saveTo, JSON.stringify({
      commandId,
      path: path || undefined,
      executed: true,
      timestamp: Date.now(),
    }));
  }
}

// Handle JSON parse node - parse string to JSON object
export function handleJsonNode(
  node: WorkflowNode,
  context: ExecutionContext
): void {
  const sourceVar = node.properties["source"];
  const saveTo = node.properties["saveTo"];

  if (!sourceVar) {
    throw new Error("JSON node missing 'source' property");
  }
  if (!saveTo) {
    throw new Error("JSON node missing 'saveTo' property");
  }

  // Get the source string
  const sourceValue = context.variables.get(sourceVar);
  if (sourceValue === undefined) {
    throw new Error(`Variable '${sourceVar}' not found`);
  }

  let jsonString = String(sourceValue);

  // Extract JSON from markdown code block if present
  const codeBlockMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonString = codeBlockMatch[1].trim();
  }

  // Parse JSON and save as string (for consistent storage)
  try {
    const parsed = JSON.parse(jsonString);
    // Store as JSON string so it can be accessed with dot notation
    context.variables.set(saveTo, JSON.stringify(parsed));
  } catch (e) {
    throw new Error(`Failed to parse JSON from '${sourceVar}': ${e instanceof Error ? e.message : String(e)}`);
  }
}
