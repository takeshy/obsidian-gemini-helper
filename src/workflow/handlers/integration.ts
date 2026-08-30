import { App, TFile, WorkspaceLeaf } from "obsidian";
import type { GeminiHelperPlugin } from "../../plugin";
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
      const inputMapping = JSON.parse(replacedInput) as Record<string, unknown>;
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
    inputVariables
  );

  // Copy output variables back to parent context
  if (outputStr) {
    // Parse output mapping (JSON object: {"parentVar": "subVar"} or comma-separated)
    const replacedOutput = replaceVariables(outputStr, context);
    try {
      const outputMapping = JSON.parse(replacedOutput) as Record<string, unknown>;
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
    await new Promise(resolve => window.setTimeout(resolve, 100));
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
    const parsed: unknown = JSON.parse(jsonString);
    // Store as JSON string so it can be accessed with dot notation
    context.variables.set(saveTo, JSON.stringify(parsed));
  } catch (e) {
    throw new Error(`Failed to parse JSON from '${sourceVar}': ${e instanceof Error ? e.message : String(e)}`);
  }
}
