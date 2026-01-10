import { useState, useEffect, useCallback, useRef } from "react";
import { TFile, Notice, Menu, MarkdownView, stringifyYaml } from "obsidian";
import { FileText, Keyboard, KeyboardOff, Plus, Save, Sparkles, Zap, ZapOff } from "lucide-react";
import { EventTriggerModal } from "./EventTriggerModal";
import type { WorkflowEventTrigger } from "src/types";
import { promptForAIWorkflow } from "./AIWorkflowModal";
import type { GeminiHelperPlugin } from "src/plugin";
import { SidebarNode, WorkflowNodeType, WorkflowInput, PromptCallbacks } from "src/workflow/types";
import { loadFromCodeBlock, saveToCodeBlock } from "src/workflow/codeblockSync";
import { listWorkflowOptions, parseWorkflowFromMarkdown, WorkflowOption } from "src/workflow/parser";
import { WorkflowExecutor } from "src/workflow/executor";
import { NodeEditorModal } from "./NodeEditorModal";
import { HistoryModal } from "./HistoryModal";
import { promptForFile, promptForAnyFile, promptForNewFilePath } from "./FilePromptModal";
import { promptForValue } from "./ValuePromptModal";
import { promptForSelection } from "./SelectionPromptModal";
import { promptForConfirmation } from "./EditConfirmationModal";
import { promptForDialog } from "./DialogPromptModal";
import { t } from "src/i18n";
import { EditHistoryModal } from "../EditHistoryModal";
import { getEditHistoryManager } from "src/core/editHistory";

interface WorkflowPanelProps {
  plugin: GeminiHelperPlugin;
}

const getNodeTypeLabels = (): Record<WorkflowNodeType, string> => ({
  variable: t("workflow.nodeType.variable"),
  set: t("workflow.nodeType.set"),
  if: t("workflow.nodeType.if"),
  while: t("workflow.nodeType.while"),
  command: t("workflow.nodeType.command"),
  http: t("workflow.nodeType.http"),
  json: t("workflow.nodeType.json"),
  note: t("workflow.nodeType.note"),
  "note-read": t("workflow.nodeType.noteRead"),
  "note-search": t("workflow.nodeType.noteSearch"),
  "note-list": t("workflow.nodeType.noteList"),
  "folder-list": t("workflow.nodeType.folderList"),
  open: t("workflow.nodeType.open"),
  dialog: t("workflow.nodeType.dialog"),
  "prompt-file": t("workflow.nodeType.promptFile"),
  "prompt-selection": t("workflow.nodeType.promptSelection"),
  "file-explorer": t("workflow.nodeType.fileExplorer"),
  "file-save": t("workflow.nodeType.fileSave"),
  workflow: t("workflow.nodeType.workflow"),
  "rag-sync": t("workflow.nodeType.ragSync"),
  mcp: t("workflow.nodeType.mcp"),
  "obsidian-command": t("workflow.nodeType.obsidianCommand"),
});

const ADDABLE_NODE_TYPES: WorkflowNodeType[] = [
  "variable",
  "set",
  "if",
  "while",
  "command",
  "http",
  "json",
  "note",
  "note-read",
  "note-search",
  "note-list",
  "folder-list",
  "open",
  "dialog",
  "prompt-file",
  "prompt-selection",
  "file-explorer",
  "file-save",
  "workflow",
  "rag-sync",
  "mcp",
  "obsidian-command",
];

function getDefaultProperties(type: WorkflowNodeType): Record<string, string> {
  switch (type) {
    case "variable":
    case "set":
      return { name: "", value: "" };
    case "if":
    case "while":
      return { condition: "" };
    case "command":
      return { prompt: "", model: "", ragSetting: "__none__", attachments: "", saveTo: "" };
    case "http":
      return { url: "", method: "POST", saveTo: "" };
    case "json":
      return { source: "", saveTo: "" };
    case "note":
      return { path: "", content: "", mode: "overwrite" };
    case "note-read":
      return { path: "", saveTo: "" };
    case "note-search":
      return { query: "", searchContent: "false", limit: "10", saveTo: "" };
    case "note-list":
      return { folder: "", recursive: "false", tags: "", tagMatch: "any", createdWithin: "", modifiedWithin: "", sortBy: "", sortOrder: "desc", limit: "50", saveTo: "" };
    case "folder-list":
      return { folder: "", saveTo: "" };
    case "open":
      return { path: "" };
    case "dialog":
      return { title: "", message: "", markdown: "false", options: "", multiSelect: "false", inputTitle: "", multiline: "false", defaults: "", button1: "OK", button2: "", saveTo: "" };
    case "prompt-file":
      return { title: "", saveTo: "", saveFileTo: "" };
    case "prompt-selection":
      return { title: "", saveTo: "", saveSelectionTo: "" };
    case "file-explorer":
      return { mode: "select", title: "", extensions: "", default: "", saveTo: "", savePathTo: "" };
    case "workflow":
      return { path: "", name: "", input: "", output: "", prefix: "" };
    case "rag-sync":
      return { path: "", ragSetting: "", saveTo: "" };
    case "file-save":
      return { source: "", path: "", savePathTo: "" };
    case "mcp":
      return { url: "", tool: "", args: "", headers: "", saveTo: "" };
    case "obsidian-command":
      return { command: "", saveTo: "" };
    default:
      return {};
  }
}

// Build a map of incoming connections: nodeId -> { from: sourceNodeId, type: "next" | "true" | "false" }
interface IncomingConnection {
  from: string;
  type: "next" | "true" | "false";
}

function buildIncomingMap(nodes: SidebarNode[]): Map<string, IncomingConnection[]> {
  const map = new Map<string, IncomingConnection[]>();

  for (const node of nodes) {
    // Check next
    if (node.next) {
      const existing = map.get(node.next) || [];
      existing.push({ from: node.id, type: "next" });
      map.set(node.next, existing);
    }
    // Check trueNext
    if (node.trueNext) {
      const existing = map.get(node.trueNext) || [];
      existing.push({ from: node.id, type: "true" });
      map.set(node.trueNext, existing);
    }
    // Check falseNext
    if (node.falseNext) {
      const existing = map.get(node.falseNext) || [];
      existing.push({ from: node.id, type: "false" });
      map.set(node.falseNext, existing);
    }
  }

  return map;
}

// Build a map of outgoing connections: nodeId -> { to: targetNodeId, type: "next" | "true" | "false" }
interface OutgoingConnection {
  to: string;
  type: "next" | "true" | "false";
}

function buildOutgoingMap(nodes: SidebarNode[]): Map<string, OutgoingConnection[]> {
  const map = new Map<string, OutgoingConnection[]>();

  for (const node of nodes) {
    const connections: OutgoingConnection[] = [];
    if (node.next) {
      connections.push({ to: node.next, type: "next" });
    }
    if (node.trueNext) {
      connections.push({ to: node.trueNext, type: "true" });
    }
    if (node.falseNext) {
      connections.push({ to: node.falseNext, type: "false" });
    }
    if (connections.length > 0) {
      map.set(node.id, connections);
    }
  }

  return map;
}

function getNodeSummary(node: SidebarNode): string {
  switch (node.type) {
    case "variable":
      return `${node.properties["name"]} = ${node.properties["value"]}`;
    case "set":
      return `${node.properties["name"]} = ${node.properties["value"]}`;
    case "if":
    case "while":
      return node.properties["condition"] || "(no condition)";
    case "command": {
      const prompt = node.properties["prompt"] || "";
      const truncated = prompt.length > 30 ? prompt.substring(0, 30) + "..." : prompt;
      return truncated || "(no prompt)";
    }
    case "http":
      return `${node.properties["method"] || "POST"} ${node.properties["url"] || ""}`;
    case "json":
      return `${node.properties["source"]} -> ${node.properties["saveTo"]}`;
    case "note":
      return `${node.properties["path"]} (${node.properties["mode"] || "overwrite"})`;
    case "note-read":
      return `${node.properties["path"]} -> ${node.properties["saveTo"]}`;
    case "note-search":
      return `"${node.properties["query"]}" -> ${node.properties["saveTo"]}`;
    case "note-list":
      return `${node.properties["folder"] || "(root)"} -> ${node.properties["saveTo"]}`;
    case "folder-list":
      return `${node.properties["folder"] || "(all)"} -> ${node.properties["saveTo"]}`;
    case "open":
      return node.properties["path"] || "(no path)";
    case "dialog":
      return node.properties["title"] || "(no title)";
    case "prompt-file":
    case "prompt-selection":
    case "file-explorer":
      return node.properties["title"] || "(no title)";
    case "workflow":
      return `${node.properties["path"]}${node.properties["name"] ? ` (${node.properties["name"]})` : ""}`;
    case "rag-sync":
      return `${node.properties["path"]} → ${node.properties["ragSetting"]}`;
    case "file-save":
      return `${node.properties["source"]} → ${node.properties["path"]}`;
    case "mcp":
      return `${node.properties["tool"]} @ ${node.properties["url"]}`;
    case "obsidian-command":
      return node.properties["command"] || "(no command)";
  }
}

export default function WorkflowPanel({ plugin }: WorkflowPanelProps) {
  const [workflowFile, setWorkflowFile] = useState<TFile | null>(null);
  const [workflowName, setWorkflowName] = useState<string | null>(null);
  const [workflowOptions, setWorkflowOptions] = useState<WorkflowOption[]>([]);
  const [currentWorkflowIndex, setCurrentWorkflowIndex] = useState<number>(0);
  const [nodes, setNodes] = useState<SidebarNode[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ index: number; position: "above" | "below" } | null>(null);
  const [enabledHotkeys, setEnabledHotkeys] = useState<string[]>(plugin.settings.enabledWorkflowHotkeys);
  const [eventTriggers, setEventTriggers] = useState<WorkflowEventTrigger[]>(plugin.settings.enabledWorkflowEventTriggers);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  // Load workflow from active file
  const loadWorkflow = useCallback(async () => {
    const activeFile = plugin.app.workspace.getActiveFile();
    if (!activeFile || activeFile.extension !== "md") {
      setWorkflowFile(null);
      setNodes([]);
      setWorkflowOptions([]);
      return;
    }

    const content = await plugin.app.vault.read(activeFile);
    const options = listWorkflowOptions(content);

    if (options.length === 0) {
      setWorkflowFile(activeFile);
      setNodes([]);
      setWorkflowOptions([]);
      return;
    }

    setWorkflowFile(activeFile);
    setWorkflowOptions(options);

    const indexToLoad = currentWorkflowIndex < options.length ? currentWorkflowIndex : 0;
    const data = loadFromCodeBlock(content, undefined, indexToLoad);
    if (data) {
      setNodes(data.nodes);
      setWorkflowName(data.name || null);
      setCurrentWorkflowIndex(indexToLoad);
    }
  }, [plugin.app, currentWorkflowIndex]);

  // Watch active file changes
  useEffect(() => {
    void loadWorkflow();

    const handler = () => {
      void loadWorkflow();
    };

    plugin.app.workspace.on("active-leaf-change", handler);
    return () => {
      plugin.app.workspace.off("active-leaf-change", handler);
    };
  }, [loadWorkflow, plugin.app.workspace]);

  // Save workflow
  const saveWorkflow = useCallback(async (newNodes: SidebarNode[]) => {
    if (!workflowFile) return;

    await saveToCodeBlock(plugin.app, workflowFile, {
      name: workflowName || "default",
      nodes: newNodes,
    }, currentWorkflowIndex);
  }, [plugin.app, workflowFile, workflowName, currentWorkflowIndex]);

  // Handle workflow selection change
  const handleWorkflowSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;

    // Handle reload from file
    if (value === "__reload__") {
      e.target.value = String(currentWorkflowIndex);
      await loadWorkflow();
      new Notice(t("workflow.reloaded"));
      return;
    }

    // Handle AI workflow creation
    if (value === "__new_ai__") {
      // Reset the select to previous value
      e.target.value = String(currentWorkflowIndex);

      const result = await promptForAIWorkflow(plugin.app, plugin, "create");

      if (result && result.outputPath) {
        // Ensure the path has .md extension
        const filePath = result.outputPath.endsWith(".md")
          ? result.outputPath
          : `${result.outputPath}.md`;

        // Create parent folders if needed
        const folderPath = filePath.substring(0, filePath.lastIndexOf("/"));
        if (folderPath) {
          const folder = plugin.app.vault.getAbstractFileByPath(folderPath);
          if (!folder) {
            await plugin.app.vault.createFolder(folderPath);
          }
        }

        // Create the workflow content
        const workflowContent = `\`\`\`workflow
name: ${result.name}
nodes:
${result.nodes.map(node => {
  const lines: string[] = [];
  lines.push(`  - id: ${node.id}`);
  lines.push(`    type: ${node.type}`);
  for (const [key, value] of Object.entries(node.properties)) {
    if (value !== "") {
      // Handle multiline values
      if (value.includes("\n")) {
        lines.push(`    ${key}: |`);
        for (const line of value.split("\n")) {
          lines.push(`      ${line}`);
        }
      } else {
        lines.push(`    ${key}: ${JSON.stringify(value)}`);
      }
    }
  }
  if (node.type === "if" || node.type === "while") {
    if (node.trueNext) lines.push(`    trueNext: ${node.trueNext}`);
    if (node.falseNext) lines.push(`    falseNext: ${node.falseNext}`);
  } else if (node.next) {
    lines.push(`    next: ${node.next}`);
  }
  return lines.join("\n");
}).join("\n")}
\`\`\`
`;

        // Check if file already exists
        const existingFile = plugin.app.vault.getAbstractFileByPath(filePath);
        let targetFile: TFile;

        if (existingFile && existingFile instanceof TFile) {
          // Append to existing file
          const existingContent = await plugin.app.vault.read(existingFile);
          const separator = existingContent.endsWith("\n") ? "\n" : "\n\n";
          await plugin.app.vault.modify(existingFile, existingContent + separator + workflowContent);
          targetFile = existingFile;
          new Notice(t("workflow.appendedTo", { name: result.name, path: filePath }));
        } else {
          // Create new file
          targetFile = await plugin.app.vault.create(filePath, workflowContent);
          new Notice(t("workflow.createdAt", { name: result.name, path: filePath }));
        }

        // Open the file
        await plugin.app.workspace.getLeaf().openFile(targetFile);
      }
      return;
    }

    const index = Number(value);
    if (Number.isNaN(index) || !workflowFile) return;

    setCurrentWorkflowIndex(index);
    const content = await plugin.app.vault.read(workflowFile);
    const data = loadFromCodeBlock(content, undefined, index);
    if (data) {
      setNodes(data.nodes);
      setWorkflowName(data.name || null);
    }

    // Move cursor to the selected workflow's position
    const selectedOption = workflowOptions[index];
    if (selectedOption && workflowFile) {
      // Find the leaf that has this file open
      const leaves = plugin.app.workspace.getLeavesOfType("markdown");
      for (const leaf of leaves) {
        const view = leaf.view;
        if (view instanceof MarkdownView && view.file?.path === workflowFile.path) {
          const editor = view.editor;
          if (editor) {
            // Move to the start of the workflow block (line after ```workflow)
            editor.setCursor({ line: selectedOption.startLine + 1, ch: 0 });
            // Scroll to make it visible
            editor.scrollIntoView({ from: { line: selectedOption.startLine, ch: 0 }, to: { line: selectedOption.startLine + 5, ch: 0 } }, true);
            // Focus the editor
            editor.focus();
          }
          break;
        }
      }
    }
  };

  // Show add node menu
  const showAddNodeMenu = (e: React.MouseEvent) => {
    const menu = new Menu();
    const nodeTypeLabels = getNodeTypeLabels();

    for (const nodeType of ADDABLE_NODE_TYPES) {
      menu.addItem((item) => {
        item.setTitle(nodeTypeLabels[nodeType]);
        item.onClick(() => addNode(nodeType));
      });
    }

    menu.showAtMouseEvent(e.nativeEvent);
  };

  // Build YAML from current nodes
  const buildWorkflowYaml = (nodesToSerialize: SidebarNode[], name: string | null): string => {
    const data = {
      name: name || "workflow",
      nodes: nodesToSerialize.map((node) => {
        const entry: Record<string, unknown> = { id: node.id, type: node.type };
        for (const [key, value] of Object.entries(node.properties)) {
          if (value !== "") {
            entry[key] = value;
          }
        }
        if (node.type === "if" || node.type === "while") {
          if (node.trueNext) entry.trueNext = node.trueNext;
          if (node.falseNext) entry.falseNext = node.falseNext;
        } else if (node.next) {
          entry.next = node.next;
        }
        return entry;
      }),
    };
    return stringifyYaml(data);
  };

  // Handle AI modification
  const handleModifyWithAI = async () => {
    if (!workflowFile || nodes.length === 0) {
      new Notice(t("workflow.noWorkflowToModify"));
      return;
    }

    const currentYaml = buildWorkflowYaml(nodes, workflowName);
    const result = await promptForAIWorkflow(
      plugin.app,
      plugin,
      "modify",
      currentYaml,
      workflowName || undefined
    );

    if (result) {
      setNodes(result.nodes);
      setWorkflowName(result.name);
      await saveWorkflow(result.nodes);
      new Notice(t("workflow.modifiedSuccessfully"));
    }
  };

  // Add node
  const addNode = (type: WorkflowNodeType) => {
    const newNode: SidebarNode = {
      id: `node-${Date.now()}`,
      type,
      properties: getDefaultProperties(type),
    };

    const newNodes = [...nodes, newNode];
    setNodes(newNodes);

    // Get RAG setting names from workspace state
    const ragSettingNames = Object.keys(plugin.workspaceState.ragSettings || {});

    // Open editor for new node
    const modal = new NodeEditorModal(plugin.app, newNode, (updatedNode) => {
      const updatedNodes = newNodes.map((n) => (n.id === updatedNode.id ? updatedNode : n));
      setNodes(updatedNodes);
      void saveWorkflow(updatedNodes);
    }, ragSettingNames, plugin.settings.cliConfig);
    modal.open();
  };

  // Edit node
  const editNode = (index: number) => {
    const node = nodes[index];
    if (!node) return;

    // Get RAG setting names from workspace state
    const ragSettingNames = Object.keys(plugin.workspaceState.ragSettings || {});

    const modal = new NodeEditorModal(plugin.app, node, (updatedNode) => {
      const newNodes = nodes.map((n, i) => (i === index ? updatedNode : n));
      setNodes(newNodes);
      void saveWorkflow(newNodes);
    }, ragSettingNames, plugin.settings.cliConfig);
    modal.open();
  };

  // Delete node
  const deleteNode = async (index: number) => {
    const newNodes = nodes.filter((_, i) => i !== index);
    setNodes(newNodes);
    await saveWorkflow(newNodes);
  };

  // Drag and drop handlers
  const onDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) {
      setDropTarget(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? "above" : "below";
    setDropTarget({ index, position });
  };

  const onDragEnd = () => {
    setDraggedIndex(null);
    setDropTarget(null);
  };

  const onDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      onDragEnd();
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    let newIndex = e.clientY < midY ? targetIndex : targetIndex + 1;

    if (draggedIndex < newIndex) {
      newIndex--;
    }

    const newNodes = [...nodes];
    const [removed] = newNodes.splice(draggedIndex, 1);
    newNodes.splice(newIndex, 0, removed);

    setNodes(newNodes);
    await saveWorkflow(newNodes);
    onDragEnd();
  };

  // Run workflow
  const runWorkflow = async () => {
    if (!workflowFile || nodes.length === 0) {
      new Notice(t("workflow.noWorkflowToRun"));
      return;
    }

    setIsRunning(true);

    try {
      const content = await plugin.app.vault.read(workflowFile);
      const workflow = parseWorkflowFromMarkdown(content, workflowName || undefined, currentWorkflowIndex);

      const executor = new WorkflowExecutor(plugin.app, plugin);

      const input: WorkflowInput = {
        variables: new Map(),
      };

      for (const node of nodes) {
        if (node.type === "variable" && node.properties.name) {
          const value = node.properties.value || "";
          const numValue = parseFloat(value);
          if (!isNaN(numValue) && value === String(numValue)) {
            input.variables.set(node.properties.name, numValue);
          } else {
            input.variables.set(node.properties.name, value);
          }
        }
      }

      // Note: "file" variable is set by prompt-file node, not automatically
      // In panel mode, users must use prompt-file to select a file

      // Create prompt callbacks
      const promptCallbacks: PromptCallbacks = {
        promptForFile: (defaultPath?: string) => promptForFile(plugin.app, defaultPath || "Select a file"),
        promptForAnyFile: (extensions?: string[], defaultPath?: string) =>
          promptForAnyFile(plugin.app, extensions, defaultPath || "Select a file"),
        promptForNewFilePath: (extensions?: string[], defaultPath?: string) =>
          promptForNewFilePath(plugin.app, extensions, defaultPath),
        promptForSelection: () => promptForSelection(plugin.app, "Select text"),
        promptForValue: (prompt: string, defaultValue?: string, multiline?: boolean) =>
          promptForValue(plugin.app, prompt, defaultValue || "", multiline || false),
        promptForConfirmation: (filePath: string, content: string, mode: string) =>
          promptForConfirmation(plugin.app, filePath, content, mode),
        promptForDialog: (title: string, message: string, options: string[], multiSelect: boolean, button1: string, button2?: string, markdown?: boolean, inputTitle?: string, defaults?: { input?: string; selected?: string[] }, multiline?: boolean) =>
          promptForDialog(plugin.app, title, message, options, multiSelect, button1, button2, markdown, inputTitle, defaults, multiline),
        openFile: async (notePath: string) => {
          const noteFile = plugin.app.vault.getAbstractFileByPath(notePath);
          if (noteFile instanceof TFile) {
            await plugin.app.workspace.getLeaf().openFile(noteFile);
          }
        },
      };

      await executor.execute(
        workflow,
        input,
        () => {}, // Log callback - could show in UI
        {
          workflowPath: workflowFile.path,
          workflowName: workflowName || undefined,
          recordHistory: true,
        },
        promptCallbacks
      );

      new Notice(t("workflow.completedSuccessfully"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t("workflow.failed", { message }));
    } finally {
      setIsRunning(false);
    }
  };

  // Show history
  const showHistory = () => {
    if (!workflowFile) {
      new Notice(t("workflow.noFileSelected"));
      return;
    }

    const modal = new HistoryModal(
      plugin.app,
      workflowFile.path,
      plugin.settings.workspaceFolder
    );
    modal.open();
  };

  if (!workflowFile) {
    return (
      <div className="workflow-sidebar">
        <div className="workflow-sidebar-content">
          <div className="workflow-empty-state">
            {t("workflow.openMarkdownFile")}
          </div>
        </div>
      </div>
    );
  }

  // Workflowコードブロックがない場合はAI新規作成ボタンだけ表示
  if (workflowOptions.length === 0) {
    const handleCreateWithAI = async () => {
      const result = await promptForAIWorkflow(plugin.app, plugin, "create");

      if (result && result.outputPath) {
        const filePath = result.outputPath.endsWith(".md")
          ? result.outputPath
          : `${result.outputPath}.md`;

        const folderPath = filePath.substring(0, filePath.lastIndexOf("/"));
        if (folderPath) {
          const folder = plugin.app.vault.getAbstractFileByPath(folderPath);
          if (!folder) {
            await plugin.app.vault.createFolder(folderPath);
          }
        }

        const workflowContent = `\`\`\`workflow
name: ${result.name}
nodes:
${result.nodes.map(node => {
  const lines: string[] = [];
  lines.push(`  - id: ${node.id}`);
  lines.push(`    type: ${node.type}`);
  for (const [key, value] of Object.entries(node.properties)) {
    if (value !== "") {
      if (value.includes("\n")) {
        lines.push(`    ${key}: |`);
        for (const line of value.split("\n")) {
          lines.push(`      ${line}`);
        }
      } else {
        lines.push(`    ${key}: ${JSON.stringify(value)}`);
      }
    }
  }
  if (node.type === "if" || node.type === "while") {
    if (node.trueNext) lines.push(`    trueNext: ${node.trueNext}`);
    if (node.falseNext) lines.push(`    falseNext: ${node.falseNext}`);
  } else if (node.next) {
    lines.push(`    next: ${node.next}`);
  }
  return lines.join("\n");
}).join("\n")}
\`\`\`
`;

        const existingFile = plugin.app.vault.getAbstractFileByPath(filePath);
        let targetFile: TFile;

        if (existingFile && existingFile instanceof TFile) {
          const existingContent = await plugin.app.vault.read(existingFile);
          const separator = existingContent.endsWith("\n") ? "\n" : "\n\n";
          await plugin.app.vault.modify(existingFile, existingContent + separator + workflowContent);
          targetFile = existingFile;
          new Notice(t("workflow.appendedTo", { name: result.name, path: filePath }));
        } else {
          targetFile = await plugin.app.vault.create(filePath, workflowContent);
          new Notice(t("workflow.createdAt", { name: result.name, path: filePath }));
        }

        await plugin.app.workspace.getLeaf().openFile(targetFile);
      }
    };

    return (
      <div className="workflow-sidebar">
        <div className="workflow-sidebar-content">
          <div className="workflow-empty-state">
            <p>{t("workflow.noWorkflowInFile")}</p>
            <button
              className="workflow-sidebar-ai-btn mod-cta"
              onClick={() => void handleCreateWithAI()}
              style={{ marginTop: "12px", display: "inline-flex", alignItems: "center" }}
            >
              <Sparkles size={14} />
              <span style={{ marginLeft: "6px" }}>{t("workflow.createWithAI")}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="workflow-sidebar">
      {/* Header */}
      <div className="workflow-sidebar-header">
        <select
          className="workflow-sidebar-select"
          value={currentWorkflowIndex}
          onChange={(e) => void handleWorkflowSelect(e)}
        >
          {workflowOptions.length === 0 ? (
            <option value="" disabled>
              {t("workflow.noWorkflows")}
            </option>
          ) : (
            workflowOptions.map((option, index) => (
              <option key={index} value={index}>
                {option.label}
              </option>
            ))
          )}
          <option value="__new_ai__">{t("workflow.newAI")}</option>
          <option value="__reload__">{t("workflow.reloadFromFile")}</option>
        </select>
        <div className="workflow-sidebar-buttons">
          <button
            ref={addBtnRef}
            className="workflow-sidebar-add-btn"
            onClick={showAddNodeMenu}
            title={t("workflow.addNode")}
          >
            <Plus size={14} />
            <span className="workflow-btn-label">{t("workflow.addNode")}</span>
          </button>
          <button
            className="workflow-sidebar-ai-btn"
            onClick={() => void handleModifyWithAI()}
            disabled={nodes.length === 0}
            title={t("workflow.modifyWithAI")}
          >
            <Sparkles size={14} />
            <span className="workflow-btn-label">{t("workflow.aiModify")}</span>
          </button>
          <button
            className="workflow-sidebar-history-btn"
            onClick={() => {
              const activeFile = plugin.app.workspace.getActiveFile();
              if (activeFile) {
                new EditHistoryModal(plugin.app, activeFile.path).open();
              } else {
                new Notice(t("editHistory.noActiveFile"));
              }
            }}
            title={t("editHistory.showHistory")}
          >
            <FileText size={14} />
          </button>
          <button
            className="workflow-sidebar-save-btn"
            onClick={() => {
              void (async () => {
                const activeFile = plugin.app.workspace.getActiveFile();
                if (!activeFile) {
                  new Notice(t("editHistory.noActiveFile"));
                  return;
                }
                const historyManager = getEditHistoryManager();
                if (!historyManager) {
                  new Notice(t("editHistory.notInitialized"));
                  return;
                }
                const entry = await historyManager.saveManualSnapshot(activeFile.path);
                if (entry) {
                  new Notice(t("editHistory.saved"));
                } else {
                  new Notice(t("editHistory.noChanges"));
                }
              })();
            }}
            title={t("editHistory.saveSnapshot")}
          >
            <Save size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="workflow-sidebar-content">
        <div className="workflow-node-list">
          {nodes.length === 0 ? (
            <div className="workflow-empty-state">
              {t("workflow.noNodes")}
            </div>
          ) : (() => {
            const NODE_TYPE_LABELS = getNodeTypeLabels();
            const incomingMap = buildIncomingMap(nodes);
            const outgoingMap = buildOutgoingMap(nodes);

            return nodes.map((node, index) => {
              const incoming = incomingMap.get(node.id) || [];
              const outgoing = outgoingMap.get(node.id) || [];
              const nextNode = index < nodes.length - 1 ? nodes[index + 1] : null;
              const isBranchNode = node.type === "if" || node.type === "while";

              return (
                <div key={node.id}>
                  {/* Incoming connection indicator */}
                  {incoming.length > 0 && (
                    <div className="workflow-node-incoming">
                      {incoming.map((conn, i) => (
                        <span key={i} className={`workflow-incoming-badge workflow-incoming-${conn.type}`}>
                          ← {conn.from}{conn.type !== "next" ? `.${conn.type === "true" ? "True" : "False"}` : ""}
                        </span>
                      ))}
                    </div>
                  )}

                  <div
                    className={`workflow-node-card ${
                      draggedIndex === index ? "workflow-node-dragging" : ""
                    } ${
                      dropTarget?.index === index && dropTarget.position === "above"
                        ? "workflow-drop-above"
                        : ""
                    } ${
                      dropTarget?.index === index && dropTarget.position === "below"
                        ? "workflow-drop-below"
                        : ""
                    }`}
                    draggable
                    onDragStart={() => onDragStart(index)}
                    onDragOver={(e) => onDragOver(e, index)}
                    onDragEnd={onDragEnd}
                    onDrop={(e) => void onDrop(e, index)}
                  >
                    {/* Drag handle */}
                    <div className="workflow-node-drag-handle">&#x2630;</div>

                    {/* Header */}
                    <div className="workflow-node-header">
                      <span className={`workflow-node-type workflow-node-type-${node.type}`}>
                        {NODE_TYPE_LABELS[node.type]}
                      </span>
                      <span className="workflow-node-id">{node.id}</span>
                    </div>

                    {/* Summary */}
                    <div className="workflow-node-summary">
                      {getNodeSummary(node)}
                    </div>

                    {/* Actions */}
                    <div className="workflow-node-actions">
                      <button
                        className="workflow-node-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          editNode(index);
                        }}
                      >
                        {t("common.edit")}
                      </button>
                      <button
                        className="workflow-node-action-btn workflow-node-action-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteNode(index);
                        }}
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>

                  {/* Outgoing connections */}
                  {isBranchNode ? (
                    <div className="workflow-node-branch">
                      <div className="workflow-branch-row">
                        <span className="workflow-branch-label workflow-branch-label-true">{t("workflow.branchTrue")}</span>
                        <span className="workflow-branch-arrow">→</span>
                        <span className="workflow-branch-target">{node.trueNext || t("workflow.branchNext")}</span>
                      </div>
                      <div className="workflow-branch-row">
                        <span className="workflow-branch-label workflow-branch-label-false">{t("workflow.branchFalse")}</span>
                        <span className="workflow-branch-arrow">→</span>
                        <span className="workflow-branch-target">{node.falseNext || t("workflow.branchEnd")}</span>
                      </div>
                    </div>
                  ) : outgoing.length > 0 ? (
                    <div className="workflow-node-outgoing">
                      {outgoing.map((conn, i) => (
                        <span key={i} className="workflow-outgoing-badge">
                          → {conn.to}
                        </span>
                      ))}
                    </div>
                  ) : nextNode && (
                    <div className="workflow-node-arrow" />
                  )}
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Footer */}
      <div className="workflow-sidebar-footer">
        <button
          className="workflow-sidebar-run-btn mod-cta"
          onClick={() => void runWorkflow()}
          disabled={isRunning || nodes.length === 0}
        >
          {isRunning ? t("workflow.running") : t("workflow.run")}
        </button>
        <button
          className="workflow-sidebar-history-btn"
          onClick={showHistory}
        >
          {t("workflow.history")}
        </button>
        {(() => {
          const workflowId = workflowName ? `${workflowFile.path}#${workflowName}` : "";
          const isHotkeyEnabled = workflowName && enabledHotkeys.includes(workflowId);
          const currentEventTrigger = eventTriggers.find(t => t.workflowId === workflowId);
          const hasEventTrigger = !!currentEventTrigger;
          return (
            <>
              <button
                className={`workflow-sidebar-hotkey-btn ${isHotkeyEnabled ? "gemini-helper-hotkey-enabled" : ""}`}
                onClick={() => {
                  if (!workflowName) {
                    new Notice(t("workflow.mustHaveNameForHotkey"));
                    return;
                  }
                  let newEnabledHotkeys: string[];
                  if (isHotkeyEnabled) {
                    newEnabledHotkeys = enabledHotkeys.filter(id => id !== workflowId);
                    new Notice(t("workflow.hotkeyDisabled"));
                  } else {
                    newEnabledHotkeys = [...enabledHotkeys, workflowId];
                    new Notice(t("workflow.hotkeyEnabled", { name: workflowName }));
                  }
                  setEnabledHotkeys(newEnabledHotkeys);
                  plugin.settings.enabledWorkflowHotkeys = newEnabledHotkeys;
                  void plugin.saveSettings();
                }}
                title={isHotkeyEnabled ? t("workflow.hotkeyEnabledClick") : t("workflow.enableHotkey")}
                disabled={!workflowName}
              >
                {isHotkeyEnabled ? <Keyboard size={16} /> : <KeyboardOff size={16} />}
              </button>
              <button
                className={`workflow-sidebar-event-btn ${hasEventTrigger ? "gemini-helper-event-enabled" : ""}`}
                onClick={() => {
                  if (!workflowName) {
                    new Notice(t("workflow.mustHaveNameForEvent"));
                    return;
                  }
                  const modal = new EventTriggerModal(
                    plugin.app,
                    workflowId,
                    workflowName,
                    currentEventTrigger || null,
                    (trigger) => {
                      let newTriggers: WorkflowEventTrigger[];
                      if (trigger === null) {
                        // Remove trigger
                        newTriggers = eventTriggers.filter(t => t.workflowId !== workflowId);
                        new Notice(t("workflow.eventTriggersRemoved"));
                      } else {
                        // Add or update trigger
                        const existingIndex = eventTriggers.findIndex(t => t.workflowId === workflowId);
                        if (existingIndex >= 0) {
                          newTriggers = [...eventTriggers];
                          newTriggers[existingIndex] = trigger;
                        } else {
                          newTriggers = [...eventTriggers, trigger];
                        }
                        new Notice(t("workflow.eventTriggersEnabled", { name: workflowName }));
                      }
                      setEventTriggers(newTriggers);
                      plugin.settings.enabledWorkflowEventTriggers = newTriggers;
                      void plugin.saveSettings();
                    }
                  );
                  modal.open();
                }}
                title={hasEventTrigger ? t("workflow.eventTriggersActive", { events: currentEventTrigger?.events.join(", ") || "" }) : t("workflow.configureEventTriggers")}
                disabled={!workflowName}
              >
                {hasEventTrigger ? <Zap size={16} /> : <ZapOff size={16} />}
              </button>
            </>
          );
        })()}
      </div>
    </div>
  );
}
