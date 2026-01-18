import { useState, useEffect, useCallback, useRef } from "react";
import { TFile, Notice, Menu, MarkdownView, stringifyYaml, Modal, App } from "obsidian";
import { FileText, FolderOpen, Keyboard, KeyboardOff, LayoutGrid, Plus, Save, Sparkles, Zap, ZapOff } from "lucide-react";
import { EventTriggerModal } from "./EventTriggerModal";
import type { WorkflowEventTrigger } from "src/types";
import { promptForAIWorkflow, ResolvedMention } from "./AIWorkflowModal";
import { WorkflowExecutionModal } from "./WorkflowExecutionModal";
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
import { WorkflowSelectorModal } from "./WorkflowSelectorModal";
import { t } from "src/i18n";
import { EditHistoryModal } from "../EditHistoryModal";
import { getEditHistoryManager } from "src/core/editHistory";
import { openWorkflowAsCanvas } from "src/utils/workflowToCanvas";
import { cryptoCache } from "src/core/cryptoCache";

// Password prompt modal for encrypted files
function promptForPassword(app: App): Promise<string | null> {
  return new Promise((resolve) => {
    class PasswordModal extends Modal {
      onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("gemini-helper-password-modal");

        contentEl.createEl("h3", { text: t("crypt.enterPassword") });
        contentEl.createEl("p", { text: t("crypt.enterPasswordDesc") });

        const inputEl = contentEl.createEl("input", {
          type: "password",
          placeholder: t("crypt.passwordPlaceholder"),
          cls: "gemini-helper-password-input",
        });

        const buttonContainer = contentEl.createDiv({ cls: "gemini-helper-button-container" });

        const cancelBtn = buttonContainer.createEl("button", { text: t("common.cancel") });
        cancelBtn.addEventListener("click", () => {
          resolve(null);
          this.close();
        });

        const unlockBtn = buttonContainer.createEl("button", { text: t("crypt.unlock"), cls: "mod-cta" });
        unlockBtn.addEventListener("click", () => {
          const password = inputEl.value;
          if (password) {
            resolve(password);
            this.close();
          }
        });

        inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && inputEl.value) {
            resolve(inputEl.value);
            this.close();
          }
        });

        setTimeout(() => inputEl.focus(), 50);
      }

      onClose(): void {
        this.contentEl.empty();
      }
    }

    new PasswordModal(app).open();
  });
}

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
      return { command: "", path: "", saveTo: "" };
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

// Build history entry with optional collapsed file contents
function buildHistoryEntry(
  action: "Created" | "Modified",
  description: string,
  resolvedMentions?: ResolvedMention[]
): string {
  const timestamp = new Date().toLocaleString();
  let entry = `> - ${timestamp}: ${action} - "${description}"`;

  // Add collapsed sections for resolved file contents
  if (resolvedMentions && resolvedMentions.length > 0) {
    for (const mention of resolvedMentions) {
      const escapedContent = mention.content.split('\n').join('\n>   > ');
      entry += `\n>   > [!note]- ${mention.original}\n>   > \`\`\`\n>   > ${escapedContent}\n>   > \`\`\``;
    }
  }

  return entry;
}

export default function WorkflowPanel({ plugin }: WorkflowPanelProps) {
  const [workflowFile, setWorkflowFile] = useState<TFile | null>(null);
  const [workflowName, setWorkflowName] = useState<string | null>(null);
  const [workflowOptions, setWorkflowOptions] = useState<WorkflowOption[]>([]);
  const [currentWorkflowIndex, setCurrentWorkflowIndex] = useState<number>(0);
  const [nodes, setNodes] = useState<SidebarNode[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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
      setLoadError(null);
      return;
    }

    const content = await plugin.app.vault.read(activeFile);
    const options = listWorkflowOptions(content);

    if (options.length === 0) {
      setWorkflowFile(activeFile);
      setNodes([]);
      setWorkflowOptions([]);
      setLoadError(null);
      return;
    }

    setWorkflowFile(activeFile);
    setWorkflowOptions(options);

    const indexToLoad = currentWorkflowIndex < options.length ? currentWorkflowIndex : 0;
    const result = loadFromCodeBlock(content, undefined, indexToLoad);
    if (result.error) {
      setLoadError(result.error);
      setNodes([]);
      setWorkflowName(null);
      setCurrentWorkflowIndex(indexToLoad);
    } else if (result.data) {
      setLoadError(null);
      setNodes(result.data.nodes);
      setWorkflowName(result.data.name || null);
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

      // Use current file path as default output path (without .md extension)
      const defaultOutputPath = workflowFile?.path?.replace(/\.md$/, "");
      const result = await promptForAIWorkflow(plugin.app, plugin, "create", undefined, undefined, defaultOutputPath);

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

        // Create the workflow content with history
        const historyLine = buildHistoryEntry("Created", result.description || "", result.resolvedMentions);
        const historyEntry = `> [!info] AI Workflow History\n${historyLine}\n\n`;

        const workflowCodeBlock = `\`\`\`workflow
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

        const workflowContent = historyEntry + workflowCodeBlock;

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
    const result = loadFromCodeBlock(content, undefined, index);
    if (result.error) {
      setLoadError(result.error);
      setNodes([]);
      setWorkflowName(null);
    } else if (result.data) {
      setLoadError(null);
      setNodes(result.data.nodes);
      setWorkflowName(result.data.name || null);
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
    if (!workflowFile) {
      new Notice(t("workflow.noWorkflowToModify"));
      return;
    }

    // If nodes are empty (e.g., due to parse error), read YAML directly from file
    let currentYaml: string;
    if (nodes.length === 0) {
      const content = await plugin.app.vault.read(workflowFile);
      const match = content.match(/```workflow\n([\s\S]*?)\n```/);
      if (!match) {
        new Notice(t("workflow.noWorkflowToModify"));
        return;
      }
      currentYaml = match[1];
    } else {
      currentYaml = buildWorkflowYaml(nodes, workflowName);
    }
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

      // Add modification history entry
      if (result.description) {
        const historyLine = buildHistoryEntry("Modified", result.description, result.resolvedMentions);

        const content = await plugin.app.vault.read(workflowFile);
        // Find existing history callout and append to it
        const historyMatch = content.match(/(> \[!info\] AI Workflow History\n(?:>.*\n)*)/);
        let newContent: string;

        if (historyMatch) {
          // Append to existing history
          newContent = content.replace(
            historyMatch[0],
            historyMatch[0] + historyLine + "\n"
          );
        } else {
          // Insert new history before the workflow code block
          const workflowBlockMatch = content.match(/```workflow/);
          if (workflowBlockMatch && workflowBlockMatch.index !== undefined) {
            const historyEntry = `> [!info] AI Workflow History\n${historyLine}\n\n`;
            newContent = content.slice(0, workflowBlockMatch.index) + historyEntry + content.slice(workflowBlockMatch.index);
          } else {
            newContent = content;
          }
        }

        await plugin.app.vault.modify(workflowFile, newContent);
      }

      await saveWorkflow(result.nodes);
      new Notice(t("workflow.modifiedSuccessfully"));
    }
  };

  // Handle Canvas export
  const handleExportToCanvas = async () => {
    if (nodes.length === 0) {
      new Notice(t("workflow.noWorkflowToExport"));
      return;
    }

    try {
      await openWorkflowAsCanvas(
        plugin.app,
        nodes,
        plugin.settings.workspaceFolder,
        workflowName || undefined,
        workflowFile?.path
      );
      new Notice(t("workflow.exportedToCanvas"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t("workflow.canvasExportFailed", { message }));
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

    // Create abort controller for stopping workflow
    const abortController = new AbortController();
    let executionModal: WorkflowExecutionModal | null = null;

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

      // Create execution modal to show progress
      executionModal = new WorkflowExecutionModal(
        plugin.app,
        workflow,
        workflowName || workflowFile.basename,
        abortController,
        () => {
          // onAbort callback
          setIsRunning(false);
        }
      );
      executionModal.open();

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
        promptForPassword: async () => {
          // Try cached password first
          const cached = cryptoCache.getPassword();
          if (cached) return cached;
          // Prompt for password
          return promptForPassword(plugin.app);
        },
      };

      await executor.execute(
        workflow,
        input,
        (log) => {
          // Update execution modal with progress
          executionModal?.updateFromLog(log);
        },
        {
          workflowPath: workflowFile.path,
          workflowName: workflowName || undefined,
          recordHistory: true,
          abortSignal: abortController.signal,
        },
        promptCallbacks
      );

      // Mark execution as complete
      executionModal?.setComplete(true);
      new Notice(t("workflow.completedSuccessfully"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Always mark modal as complete (failed state)
      executionModal?.setComplete(false);
      // Don't show error notice if it was just stopped
      if (message !== "Workflow execution was stopped") {
        new Notice(t("workflow.failed", { message }));
      }
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

    // Build encryption config from settings
    const encryptionConfig = plugin.settings.encryption?.publicKey
      ? {
          enabled: plugin.settings.encryption.enabled,
          encryptWorkflowHistory: plugin.settings.encryption.encryptWorkflowHistory,
          publicKey: plugin.settings.encryption.publicKey,
          encryptedPrivateKey: plugin.settings.encryption.encryptedPrivateKey,
          salt: plugin.settings.encryption.salt,
        }
      : undefined;

    const modal = new HistoryModal(
      plugin.app,
      workflowFile.path,
      plugin.settings.workspaceFolder,
      encryptionConfig
    );
    modal.open();
  };

  // AI新規作成ハンドラー（ファイルの有無に関わらず使用）
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

        // Create the workflow content with history
        const historyLine = buildHistoryEntry("Created", result.description || "", result.resolvedMentions);
        const historyEntry = `> [!info] AI Workflow History\n${historyLine}\n\n`;

        const workflowCodeBlock = `\`\`\`workflow
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

        const workflowContent = historyEntry + workflowCodeBlock;

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

  // Open workflow selector modal
  const handleOpenWorkflowSelector = () => {
    new WorkflowSelectorModal(plugin.app, plugin, (filePath, workflowName) => {
      void plugin.executeWorkflowFromHotkey(filePath, workflowName);
    }).open();
  };

  // ファイルが選択されていない場合
  if (!workflowFile) {
    return (
      <div className="workflow-sidebar">
        <div className="workflow-sidebar-content">
          <div className="workflow-empty-state">
            <p>{t("workflow.openMarkdownFile")}</p>
            <button
              className="workflow-sidebar-run-btn"
              onClick={handleOpenWorkflowSelector}
            >
              <FolderOpen size={14} />
              <span>{t("workflowSelector.listButton")}</span>
            </button>
            <button
              className="workflow-sidebar-ai-btn mod-cta"
              onClick={() => void handleCreateWithAI()}
            >
              <Sparkles size={14} />
              <span>{t("workflow.createWithAI")}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Workflowコードブロックがない場合
  if (workflowOptions.length === 0) {
    return (
      <div className="workflow-sidebar">
        <div className="workflow-sidebar-content">
          <div className="workflow-empty-state">
            <p>{t("workflow.noWorkflowInFile")}</p>
            <button
              className="workflow-sidebar-run-btn"
              onClick={handleOpenWorkflowSelector}
            >
              <FolderOpen size={14} />
              <span>{t("workflowSelector.listButton")}</span>
            </button>
            <button
              className="workflow-sidebar-ai-btn mod-cta"
              onClick={() => void handleCreateWithAI()}
            >
              <Sparkles size={14} />
              <span>{t("workflow.createWithAI")}</span>
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
            disabled={!workflowFile}
            title={t("workflow.modifyWithAI")}
          >
            <Sparkles size={14} />
          </button>
          <button
            className="workflow-sidebar-canvas-btn"
            onClick={() => void handleExportToCanvas()}
            disabled={nodes.length === 0}
            title={t("workflow.exportToCanvas")}
          >
            <LayoutGrid size={14} />
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

      {/* Error display */}
      {loadError && (
        <div className="workflow-error-banner">
          <span className="workflow-error-icon">⚠</span>
          <span className="workflow-error-message">{loadError}</span>
        </div>
      )}

      {/* Content */}
      <div className="workflow-sidebar-content">
        <div className="workflow-node-list">
          {nodes.length === 0 && !loadError ? (
            <div className="workflow-empty-state">
              {t("workflow.noNodes")}
            </div>
          ) : nodes.length === 0 && loadError ? null : (() => {
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
