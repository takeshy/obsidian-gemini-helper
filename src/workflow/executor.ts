import { App, TFile } from "obsidian";
import type { GeminiHelperPlugin } from "../plugin";
import {
  Workflow,
  WorkflowNode,
  ExecutionContext,
  ExecutionLog,
  ExecutionRecord,
  WorkflowInput,
  PromptCallbacks,
} from "./types";
import { getNextNodes } from "./parser";
import {
  handleVariableNode,
  handleSetNode,
  handleIfNode,
  handleWhileNode,
  handleCommandNode,
  handleHttpNode,
  handleJsonNode,
  handleNoteNode,
  handleNoteReadNode,
  handleNoteSearchNode,
  handleNoteListNode,
  handleFolderListNode,
  handleOpenNode,
  handleDialogNode,
  handlePromptFileNode,
  handlePromptSelectionNode,
  handleFileExplorerNode,
  handleFileSaveNode,
  handleWorkflowNode,
  handleRagSyncNode,
  handleMcpNode,
  handleObsidianCommandNode,
  replaceVariables,
} from "./nodeHandlers";
import { parseWorkflowFromMarkdown } from "./parser";
import { ExecutionHistoryManager } from "./history";

const MAX_ITERATIONS = 1000; // Prevent infinite loops

export interface ExecuteOptions {
  workflowPath?: string;
  workflowName?: string;
  recordHistory?: boolean;
}

export interface ExecuteResult {
  context: ExecutionContext;
  historyRecord?: ExecutionRecord;
}

export class WorkflowExecutor {
  private app: App;
  private plugin: GeminiHelperPlugin;
  private historyManager: ExecutionHistoryManager;

  constructor(app: App, plugin: GeminiHelperPlugin) {
    this.app = app;
    this.plugin = plugin;
    this.historyManager = new ExecutionHistoryManager(
      app,
      plugin.settings.workspaceFolder
    );
  }

  async execute(
    workflow: Workflow,
    input: WorkflowInput,
    onLog?: (log: ExecutionLog) => void,
    options?: ExecuteOptions,
    promptCallbacks?: PromptCallbacks
  ): Promise<ExecuteResult> {
    const context: ExecutionContext = {
      variables: new Map(input.variables),
      logs: [],
    };

    // Initialize history record if recording is enabled
    const shouldRecord = options?.recordHistory && options?.workflowPath;
    let historyRecord: ExecutionRecord | undefined;
    if (shouldRecord && options.workflowPath) {
      historyRecord = this.historyManager.createRecord(
        options.workflowPath,
        options.workflowName
      );
    }

    if (!workflow.startNode) {
      throw new Error("No workflow nodes found");
    }

    const log = (
      nodeId: string,
      nodeType: WorkflowNode["type"],
      message: string,
      status: ExecutionLog["status"] = "info"
    ) => {
      const logEntry: ExecutionLog = {
        nodeId,
        nodeType,
        message,
        timestamp: new Date(),
        status,
      };
      context.logs.push(logEntry);
      onLog?.(logEntry);
    };

    const addHistoryStep = (
      nodeId: string,
      nodeType: WorkflowNode["type"],
      input?: Record<string, unknown>,
      output?: unknown,
      status: "success" | "error" | "skipped" = "success",
      error?: string
    ) => {
      if (historyRecord) {
        this.historyManager.addStep(
          historyRecord,
          nodeId,
          nodeType,
          input,
          output,
          status,
          error
        );
      }
    };

    // Stack-based execution for handling loops
    const stack: { nodeId: string; iterationCount: number }[] = [
      { nodeId: workflow.startNode, iterationCount: 0 },
    ];

    // Track while loop states
    const whileLoopStates = new Map<string, { iterationCount: number }>();

    let totalIterations = 0;

    while (stack.length > 0 && totalIterations < MAX_ITERATIONS) {
      totalIterations++;
      const current = stack.pop()!;
      const node = workflow.nodes.get(current.nodeId);

      if (!node) {
        continue;
      }

      log(node.id, node.type, `Executing node: ${node.type}`);

      // Track current node input for error reporting
      let currentNodeInput: Record<string, unknown> | undefined;

      try {
        switch (node.type) {
          case "variable": {
            handleVariableNode(node, context);
            const varName = node.properties["name"];
            const varValue = context.variables.get(varName);
            log(
              node.id,
              node.type,
              `Set variable ${varName} = ${varValue}`,
              "success"
            );
            addHistoryStep(
              node.id,
              node.type,
              { name: varName, value: node.properties["value"] },
              varValue,
              "success"
            );
            // Push next nodes
            const varNextNodes = getNextNodes(workflow, node.id);
            for (const nextId of varNextNodes.reverse()) {
              stack.push({ nodeId: nextId, iterationCount: 0 });
            }
            break;
          }

          case "set": {
            handleSetNode(node, context);
            const setVarName = node.properties["name"];
            const setVarValue = context.variables.get(setVarName);
            log(
              node.id,
              node.type,
              `Updated variable ${setVarName} = ${setVarValue}`,
              "success"
            );
            addHistoryStep(
              node.id,
              node.type,
              { name: setVarName, expression: node.properties["value"] },
              setVarValue,
              "success"
            );
            // Push next nodes
            const setNextNodes = getNextNodes(workflow, node.id);
            for (const nextId of setNextNodes.reverse()) {
              stack.push({ nodeId: nextId, iterationCount: 0 });
            }
            break;
          }

          case "if": {
            const ifResult = handleIfNode(node, context);
            log(
              node.id,
              node.type,
              `Condition evaluated to: ${ifResult}`,
              "success"
            );
            addHistoryStep(
              node.id,
              node.type,
              { condition: node.properties["condition"] },
              ifResult,
              "success"
            );
            // Push the branch based on condition result
            const ifNextNodes = getNextNodes(workflow, node.id, ifResult);
            for (const nextId of ifNextNodes.reverse()) {
              stack.push({ nodeId: nextId, iterationCount: 0 });
            }
            break;
          }

          case "while": {
            const whileResult = handleWhileNode(node, context);
            const whileState = whileLoopStates.get(node.id) || {
              iterationCount: 0,
            };

            if (whileResult) {
              // Condition is true, enter/continue loop
              whileState.iterationCount++;
              if (whileState.iterationCount > MAX_ITERATIONS) {
                throw new Error(
                  `While loop exceeded maximum iterations (${MAX_ITERATIONS})`
                );
              }
              whileLoopStates.set(node.id, whileState);

              log(
                node.id,
                node.type,
                `Loop iteration ${whileState.iterationCount}, condition: true`,
                "info"
              );
              addHistoryStep(
                node.id,
                node.type,
                {
                  condition: node.properties["condition"],
                  iteration: whileState.iterationCount,
                },
                whileResult,
                "success"
              );

              // Get true branch (loop body)
              const trueNodes = getNextNodes(workflow, node.id, true);
              for (const nextId of trueNodes.reverse()) {
                stack.push({ nodeId: nextId, iterationCount: 0 });
              }
            } else {
              // Condition is false, exit loop
              log(node.id, node.type, `Loop condition false, exiting`, "success");
              addHistoryStep(
                node.id,
                node.type,
                { condition: node.properties["condition"] },
                whileResult,
                "success"
              );
              whileLoopStates.delete(node.id);

              // Get false branch
              const falseNodes = getNextNodes(workflow, node.id, false);
              for (const nextId of falseNodes.reverse()) {
                stack.push({ nodeId: nextId, iterationCount: 0 });
              }
            }
            break;
          }

          case "command": {
            const promptTemplate = node.properties["prompt"] || "";
            const promptPreview = promptTemplate.length > 50
              ? promptTemplate.substring(0, 50) + "..."
              : promptTemplate;
            log(node.id, node.type, `Executing LLM: ${promptPreview}`, "info");

            const cmdInput: Record<string, unknown> = {
              prompt: promptTemplate,
              model: node.properties["model"] || "(current)",
              ragSetting: node.properties["ragSetting"] || "(current)",
            };

            await handleCommandNode(node, context, this.app, this.plugin);

            const saveTo = node.properties["saveTo"];
            const cmdOutput = saveTo ? context.variables.get(saveTo) : undefined;
            if (saveTo) {
              const response = context.variables.get(saveTo);
              const preview =
                typeof response === "string"
                  ? response.substring(0, 50) + "..."
                  : response;
              log(
                node.id,
                node.type,
                `LLM completed, saved to ${saveTo}: ${preview}`,
                "success"
              );
            } else {
              log(node.id, node.type, `LLM completed`, "success");
            }
            addHistoryStep(node.id, node.type, cmdInput, cmdOutput, "success");

            // Push next nodes
            const cmdNextNodes = getNextNodes(workflow, node.id);
            for (const nextId of cmdNextNodes.reverse()) {
              stack.push({ nodeId: nextId, iterationCount: 0 });
            }
            break;
          }

          case "http": {
            const httpUrlTemplate = node.properties["url"] || "";
            const httpUrl = replaceVariables(httpUrlTemplate, context);
            const httpMethod = node.properties["method"] || "GET";
            log(node.id, node.type, `HTTP ${httpMethod} ${httpUrl}`, "info");

            const httpInput: Record<string, unknown> = {
              url: httpUrl,
              method: httpMethod,
            };
            if (node.properties["headers"])
              httpInput.headers = node.properties["headers"];
            if (node.properties["body"])
              httpInput.body = replaceVariables(node.properties["body"], context);

            // Set for error reporting
            currentNodeInput = httpInput;

            await handleHttpNode(node, context);

            const httpSaveTo = node.properties["saveTo"];
            const httpOutput = httpSaveTo
              ? context.variables.get(httpSaveTo)
              : undefined;
            if (httpSaveTo) {
              const httpResponse = context.variables.get(httpSaveTo);
              const httpPreview =
                typeof httpResponse === "string"
                  ? httpResponse.substring(0, 50) + "..."
                  : httpResponse;
              log(
                node.id,
                node.type,
                `HTTP completed, saved to ${httpSaveTo}: ${httpPreview}`,
                "success"
              );
            } else {
              log(node.id, node.type, `HTTP completed`, "success");
            }
            addHistoryStep(node.id, node.type, httpInput, httpOutput, "success");

            // Push next nodes
            const httpNextNodes = getNextNodes(workflow, node.id);
            for (const nextId of httpNextNodes.reverse()) {
              stack.push({ nodeId: nextId, iterationCount: 0 });
            }
            break;
          }

          case "json": {
            const jsonSource = node.properties["source"] || "";
            const jsonSaveTo = node.properties["saveTo"] || "";
            log(
              node.id,
              node.type,
              `Parsing JSON: ${jsonSource} -> ${jsonSaveTo}`,
              "info"
            );

            const jsonInput = context.variables.get(jsonSource);
            handleJsonNode(node, context);
            const jsonOutput = context.variables.get(jsonSaveTo);

            log(node.id, node.type, `JSON parsed successfully`, "success");
            addHistoryStep(
              node.id,
              node.type,
              { source: jsonSource, input: jsonInput },
              jsonOutput,
              "success"
            );

            // Push next nodes
            const jsonNextNodes = getNextNodes(workflow, node.id);
            for (const nextId of jsonNextNodes.reverse()) {
              stack.push({ nodeId: nextId, iterationCount: 0 });
            }
            break;
          }

          case "note": {
            const notePath = node.properties["path"] || "";
            const noteMode = node.properties["mode"] || "overwrite";
            log(
              node.id,
              node.type,
              `Writing note: ${notePath} (${noteMode})`,
              "info"
            );

            const noteInput: Record<string, unknown> = {
              path: notePath,
              mode: noteMode,
              content: node.properties["content"],
            };

            await handleNoteNode(node, context, this.app, promptCallbacks);

            log(node.id, node.type, `Note written: ${notePath}`, "success");
            addHistoryStep(node.id, node.type, noteInput, notePath, "success");

            // Push next nodes
            const noteNextNodes = getNextNodes(workflow, node.id);
            for (const nextId of noteNextNodes.reverse()) {
              stack.push({ nodeId: nextId, iterationCount: 0 });
            }
            break;
          }

          case "note-read": {
            const noteReadPath = node.properties["path"] || "";
            const noteReadSaveTo = node.properties["saveTo"] || "";
            log(node.id, node.type, `Reading note: ${noteReadPath}`, "info");

            await handleNoteReadNode(node, context, this.app, promptCallbacks);

            const noteReadContent = context.variables.get(noteReadSaveTo);
            const noteReadPreview =
              typeof noteReadContent === "string"
                ? noteReadContent.substring(0, 50) +
                  (noteReadContent.length > 50 ? "..." : "")
                : noteReadContent;
            log(
              node.id,
              node.type,
              `Note read, saved to ${noteReadSaveTo}: ${noteReadPreview}`,
              "success"
            );
            addHistoryStep(
              node.id,
              node.type,
              { path: noteReadPath },
              noteReadContent,
              "success"
            );

            // Push next nodes
            const noteReadNextNodes = getNextNodes(workflow, node.id);
            for (const nextId of noteReadNextNodes.reverse()) {
              stack.push({ nodeId: nextId, iterationCount: 0 });
            }
            break;
          }

          case "note-search": {
            const noteSearchQuery = node.properties["query"] || "";
            const noteSearchSaveTo = node.properties["saveTo"] || "";
            const noteSearchContent = node.properties["searchContent"] === "true";
            log(
              node.id,
              node.type,
              `Searching notes: ${noteSearchQuery} (content: ${noteSearchContent})`,
              "info"
            );

            await handleNoteSearchNode(node, context, this.app);

            const noteSearchResults = context.variables.get(noteSearchSaveTo);
            log(
              node.id,
              node.type,
              `Search complete, saved to ${noteSearchSaveTo}`,
              "success"
            );
            addHistoryStep(
              node.id,
              node.type,
              { query: noteSearchQuery, searchContent: noteSearchContent },
              noteSearchResults,
              "success"
            );

            // Push next nodes
            const noteSearchNextNodes = getNextNodes(workflow, node.id);
            for (const nextId of noteSearchNextNodes.reverse()) {
              stack.push({ nodeId: nextId, iterationCount: 0 });
            }
            break;
          }

          case "note-list": {
            const noteListFolder = node.properties["folder"] || "";
            const noteListSaveTo = node.properties["saveTo"] || "";
            const noteListRecursive = node.properties["recursive"] === "true";
            log(
              node.id,
              node.type,
              `Listing notes in: ${noteListFolder || "(root)"} (recursive: ${noteListRecursive})`,
              "info"
            );

            handleNoteListNode(node, context, this.app);

            const noteListResults = context.variables.get(noteListSaveTo);
            log(
              node.id,
              node.type,
              `List complete, saved to ${noteListSaveTo}`,
              "success"
            );
            addHistoryStep(
              node.id,
              node.type,
              { folder: noteListFolder, recursive: noteListRecursive },
              noteListResults,
              "success"
            );

            // Push next nodes
            const noteListNextNodes = getNextNodes(workflow, node.id);
            for (const nextId of noteListNextNodes.reverse()) {
              stack.push({ nodeId: nextId, iterationCount: 0 });
            }
            break;
          }

          case "folder-list": {
            const folderListParent = node.properties["folder"] || "";
            const folderListSaveTo = node.properties["saveTo"] || "";
            log(
              node.id,
              node.type,
              `Listing folders in: ${folderListParent || "(root)"}`,
              "info"
            );

            handleFolderListNode(node, context, this.app);

            const folderListResults = context.variables.get(folderListSaveTo);
            log(
              node.id,
              node.type,
              `Folder list complete, saved to ${folderListSaveTo}`,
              "success"
            );
            addHistoryStep(
              node.id,
              node.type,
              { folder: folderListParent },
              folderListResults,
              "success"
            );

            // Push next nodes
            const folderListNextNodes = getNextNodes(workflow, node.id);
            for (const nextId of folderListNextNodes.reverse()) {
              stack.push({ nodeId: nextId, iterationCount: 0 });
            }
            break;
          }

          case "open": {
            const openPath = replaceVariables(node.properties["path"] || "", context);
            log(node.id, node.type, `Opening file: ${openPath}`, "info");

            await handleOpenNode(node, context, this.app, promptCallbacks);

            log(node.id, node.type, `File opened: ${openPath}`, "success");
            addHistoryStep(
              node.id,
              node.type,
              { path: openPath },
              openPath,
              "success"
            );

            // Push next nodes
            const openNextNodes = getNextNodes(workflow, node.id);
            for (const nextId of openNextNodes.reverse()) {
              stack.push({ nodeId: nextId, iterationCount: 0 });
            }
            break;
          }

          case "dialog": {
            const dialogTitle = node.properties["title"] || "Dialog";
            const dialogSaveTo = node.properties["saveTo"] || "";
            log(node.id, node.type, `Showing dialog: ${dialogTitle}`, "info");

            await handleDialogNode(node, context, this.app, promptCallbacks);

            const dialogResult = dialogSaveTo ? context.variables.get(dialogSaveTo) : undefined;
            log(node.id, node.type, `Dialog completed`, "success");
            addHistoryStep(
              node.id,
              node.type,
              { title: dialogTitle },
              dialogResult,
              "success"
            );

            // Push next nodes
            const dialogNextNodes = getNextNodes(workflow, node.id);
            for (const nextId of dialogNextNodes.reverse()) {
              stack.push({ nodeId: nextId, iterationCount: 0 });
            }
            break;
          }

          case "prompt-file": {
            const promptFileTitle = node.properties["title"] || "Select a file";
            const promptFileSaveTo = node.properties["saveTo"] || "";
            log(
              node.id,
              node.type,
              `Prompting for file: ${promptFileTitle}`,
              "info"
            );

            await handlePromptFileNode(node, context, this.app, promptCallbacks);

            const selectedFile = context.variables.get(promptFileSaveTo);
            log(node.id, node.type, `File selected: ${selectedFile}`, "success");
            addHistoryStep(
              node.id,
              node.type,
              { title: promptFileTitle },
              selectedFile,
              "success"
            );

            // Push next nodes
            const promptFileNextNodes = getNextNodes(workflow, node.id);
            for (const nextId of promptFileNextNodes.reverse()) {
              stack.push({ nodeId: nextId, iterationCount: 0 });
            }
            break;
          }

          case "prompt-selection": {
            const promptSelTitle = node.properties["title"] || "Select text";
            const promptSelSaveTo = node.properties["saveTo"] || "";
            log(
              node.id,
              node.type,
              `Prompting for selection: ${promptSelTitle}`,
              "info"
            );

            await handlePromptSelectionNode(
              node,
              context,
              this.app,
              promptCallbacks
            );

            const selectedText = context.variables.get(promptSelSaveTo);
            const preview =
              typeof selectedText === "string"
                ? selectedText.substring(0, 50) +
                  (selectedText.length > 50 ? "..." : "")
                : selectedText;
            log(
              node.id,
              node.type,
              `Selection saved to ${promptSelSaveTo}: ${preview}`,
              "success"
            );
            addHistoryStep(
              node.id,
              node.type,
              { title: promptSelTitle },
              selectedText,
              "success"
            );

            // Push next nodes
            const promptSelNextNodes = getNextNodes(workflow, node.id);
            for (const nextId of promptSelNextNodes.reverse()) {
              stack.push({ nodeId: nextId, iterationCount: 0 });
            }
            break;
          }

          case "file-explorer": {
            const fileExpTitle = node.properties["title"] || "Select a file";
            const fileExpMode = node.properties["mode"] || "select";
            const fileExpSaveTo = node.properties["saveTo"] || "";
            const fileExpSavePathTo = node.properties["savePathTo"] || "";
            log(
              node.id,
              node.type,
              `File explorer (${fileExpMode}): ${fileExpTitle}`,
              "info"
            );

            await handleFileExplorerNode(node, context, this.app, promptCallbacks);

            const fileExpResult = fileExpSaveTo
              ? context.variables.get(fileExpSaveTo)
              : context.variables.get(fileExpSavePathTo);
            log(node.id, node.type, `File explorer completed`, "success");
            addHistoryStep(
              node.id,
              node.type,
              { title: fileExpTitle, mode: fileExpMode },
              fileExpResult,
              "success"
            );

            // Push next nodes
            const fileExpNextNodes = getNextNodes(workflow, node.id);
            for (const nextId of fileExpNextNodes.reverse()) {
              stack.push({ nodeId: nextId, iterationCount: 0 });
            }
            break;
          }

          case "file-save": {
            const fileSaveSource = node.properties["source"] || "";
            const fileSavePath = replaceVariables(node.properties["path"] || "", context);
            log(
              node.id,
              node.type,
              `Saving file from '${fileSaveSource}' to '${fileSavePath}'`,
              "info"
            );

            await handleFileSaveNode(node, context, this.app);

            log(node.id, node.type, `File saved to ${fileSavePath}`, "success");
            addHistoryStep(
              node.id,
              node.type,
              { source: fileSaveSource, path: fileSavePath },
              fileSavePath,
              "success"
            );

            // Push next nodes
            const fileSaveNextNodes = getNextNodes(workflow, node.id);
            for (const nextId of fileSaveNextNodes.reverse()) {
              stack.push({ nodeId: nextId, iterationCount: 0 });
            }
            break;
          }

          case "workflow": {
            const subWorkflowPath = replaceVariables(node.properties["path"] || "", context);
            const subWorkflowName = node.properties["name"]
              ? replaceVariables(node.properties["name"], context)
              : undefined;
            log(
              node.id,
              node.type,
              `Executing sub-workflow: ${subWorkflowPath}${subWorkflowName ? ` (${subWorkflowName})` : ""}`,
              "info"
            );

            // Create executeSubWorkflow callback for the handler
            const executeSubWorkflow = async (
              workflowPath: string,
              workflowName: string | undefined,
              inputVariables: Map<string, string | number>
            ): Promise<Map<string, string | number>> => {
              // Read workflow file
              const file = this.app.vault.getAbstractFileByPath(workflowPath);
              if (!file) {
                // Try with .md extension
                const mdPath = workflowPath.endsWith(".md") ? workflowPath : `${workflowPath}.md`;
                const mdFile = this.app.vault.getAbstractFileByPath(mdPath);
                if (!mdFile) {
                  throw new Error(`Workflow file not found: ${workflowPath}`);
                }
                workflowPath = mdPath;
              }

              const actualFile = this.app.vault.getAbstractFileByPath(workflowPath);
              if (!(actualFile instanceof TFile)) {
                throw new Error(`Invalid workflow file: ${workflowPath}`);
              }

              const content = await this.app.vault.read(actualFile);
              const subWorkflow = parseWorkflowFromMarkdown(content, workflowName);

              // Execute sub-workflow
              const subInput: WorkflowInput = { variables: inputVariables };
              const subResult = await this.execute(
                subWorkflow,
                subInput,
                (subLog) => {
                  // Forward sub-workflow logs with prefix
                  // Use node.type for system logs since log() expects WorkflowNodeType
                  const logNodeType = subLog.nodeType === "system" ? node.type : subLog.nodeType;
                  log(
                    `${node.id}/${subLog.nodeId}`,
                    logNodeType,
                    `[sub] ${subLog.message}`,
                    subLog.status
                  );
                },
                undefined, // Don't record sub-workflow history separately
                promptCallbacks
              );

              return subResult.context.variables;
            };

            // Create extended callbacks with sub-workflow execution
            const extendedCallbacks: PromptCallbacks | undefined = promptCallbacks
              ? { ...promptCallbacks, executeSubWorkflow }
              : {
                  promptForFile: () => Promise.resolve(null),
                  promptForSelection: () => Promise.resolve(null),
                  promptForValue: () => Promise.resolve(null),
                  promptForConfirmation: () => Promise.resolve(false),
                  executeSubWorkflow
                };

            await handleWorkflowNode(node, context, this.app, extendedCallbacks);

            log(node.id, node.type, `Sub-workflow completed: ${subWorkflowPath}`, "success");
            addHistoryStep(
              node.id,
              node.type,
              { path: subWorkflowPath, name: subWorkflowName },
              "completed",
              "success"
            );

            // Push next nodes
            const workflowNextNodes = getNextNodes(workflow, node.id);
            for (const nextId of workflowNextNodes.reverse()) {
              stack.push({ nodeId: nextId, iterationCount: 0 });
            }
            break;
          }

          case "rag-sync": {
            const ragSyncPath = replaceVariables(node.properties["path"] || "", context);
            const ragSettingName = node.properties["ragSetting"] || "";
            log(
              node.id,
              node.type,
              `Syncing to RAG: ${ragSyncPath}${ragSettingName ? ` (${ragSettingName})` : ""}`,
              "info"
            );

            await handleRagSyncNode(node, context, this.app, this.plugin);

            const ragSyncSaveTo = node.properties["saveTo"];
            const ragSyncResult = ragSyncSaveTo ? context.variables.get(ragSyncSaveTo) : undefined;
            log(
              node.id,
              node.type,
              `RAG sync completed: ${ragSyncPath}`,
              "success"
            );
            addHistoryStep(
              node.id,
              node.type,
              { path: ragSyncPath, ragSetting: ragSettingName },
              ragSyncResult,
              "success"
            );

            // Push next nodes
            const ragSyncNextNodes = getNextNodes(workflow, node.id);
            for (const nextId of ragSyncNextNodes.reverse()) {
              stack.push({ nodeId: nextId, iterationCount: 0 });
            }
            break;
          }

          case "mcp": {
            const mcpUrl = replaceVariables(node.properties["url"] || "", context);
            const mcpTool = replaceVariables(node.properties["tool"] || "", context);
            log(
              node.id,
              node.type,
              `Calling MCP: ${mcpTool} @ ${mcpUrl}`,
              "info"
            );

            const mcpInput: Record<string, unknown> = {
              url: mcpUrl,
              tool: mcpTool,
            };
            if (node.properties["args"]) {
              mcpInput.args = replaceVariables(node.properties["args"], context);
            }

            await handleMcpNode(node, context, this.app, this.plugin);

            const mcpSaveTo = node.properties["saveTo"];
            const mcpResult = mcpSaveTo ? context.variables.get(mcpSaveTo) : undefined;
            if (mcpSaveTo) {
              const mcpPreview =
                typeof mcpResult === "string"
                  ? mcpResult.substring(0, 50) + (mcpResult.length > 50 ? "..." : "")
                  : mcpResult;
              log(
                node.id,
                node.type,
                `MCP completed, saved to ${mcpSaveTo}: ${mcpPreview}`,
                "success"
              );
            } else {
              log(node.id, node.type, `MCP completed`, "success");
            }
            addHistoryStep(node.id, node.type, mcpInput, mcpResult, "success");

            // Push next nodes
            const mcpNextNodes = getNextNodes(workflow, node.id);
            for (const nextId of mcpNextNodes.reverse()) {
              stack.push({ nodeId: nextId, iterationCount: 0 });
            }
            break;
          }

          case "obsidian-command": {
            const obsidianCommandId = replaceVariables(node.properties["command"] || "", context);
            log(
              node.id,
              node.type,
              `Executing Obsidian command: ${obsidianCommandId}`,
              "info"
            );

            const obsidianCmdInput: Record<string, unknown> = {
              command: obsidianCommandId,
            };

            await handleObsidianCommandNode(node, context, this.app);

            const obsidianCmdSaveTo = node.properties["saveTo"];
            const obsidianCmdResult = obsidianCmdSaveTo
              ? context.variables.get(obsidianCmdSaveTo)
              : undefined;
            log(
              node.id,
              node.type,
              `Obsidian command executed: ${obsidianCommandId}`,
              "success"
            );
            addHistoryStep(
              node.id,
              node.type,
              obsidianCmdInput,
              obsidianCmdResult,
              "success"
            );

            // Push next nodes
            const obsidianCmdNextNodes = getNextNodes(workflow, node.id);
            for (const nextId of obsidianCmdNextNodes.reverse()) {
              stack.push({ nodeId: nextId, iterationCount: 0 });
            }
            break;
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        log(node.id, node.type, `Error: ${errorMessage}`, "error");
        addHistoryStep(
          node.id,
          node.type,
          currentNodeInput,
          undefined,
          "error",
          errorMessage
        );

        // Complete and save history with error status
        if (historyRecord) {
          this.historyManager.completeRecord(historyRecord, "error");
          await this.historyManager.saveRecord(historyRecord);
        }

        throw error;
      }
    }

    if (totalIterations >= MAX_ITERATIONS) {
      const errorMsg = `Workflow exceeded maximum iterations (${MAX_ITERATIONS})`;

      if (historyRecord) {
        this.historyManager.completeRecord(historyRecord, "error");
        await this.historyManager.saveRecord(historyRecord);
      }

      throw new Error(errorMsg);
    }

    // Complete and save history
    if (historyRecord) {
      this.historyManager.completeRecord(historyRecord, "completed");
      await this.historyManager.saveRecord(historyRecord);
    }

    return { context, historyRecord };
  }
}
