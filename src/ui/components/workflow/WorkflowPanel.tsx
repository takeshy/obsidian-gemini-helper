import { useState, useEffect, useCallback, useRef } from "react";
import { type App, TFile, Notice, Menu, stringifyYaml } from "obsidian";
import { FolderOpen, Keyboard, KeyboardOff, Plus, Sparkles, Zap, ZapOff } from "lucide-react";
import { EventTriggerModal } from "./EventTriggerModal";
import type { WorkflowEventTrigger } from "src/types";
import { promptForAIWorkflow, type AIWorkflowResult, ResolvedMention } from "./AIWorkflowModal";
import { WorkflowExecutionModal } from "./WorkflowExecutionModal";
import type { GeminiHelperPlugin } from "src/plugin";
import { SidebarNode, WorkflowNodeType, WorkflowInput, PromptCallbacks } from "src/workflow/types";
import { loadFromCodeBlock, saveToCodeBlock } from "src/workflow/codeblockSync";
import { findWorkflowBlocks, parseWorkflowFromMarkdown } from "src/workflow/parser";
import { WorkflowExecutor } from "src/workflow/executor";
import { NodeEditorModal } from "./NodeEditorModal";
import { HistoryModal } from "./HistoryModal";
import { promptForFile, promptForAnyFile, promptForNewFilePath } from "./FilePromptModal";
import { promptForValue } from "./ValuePromptModal";
import { promptForSelection } from "./SelectionPromptModal";
import { promptForConfirmation } from "./EditConfirmationModal";
import { promptForDialog } from "./DialogPromptModal";
import { showMcpApp } from "./McpAppModal";
import { WorkflowSelectorModal } from "./WorkflowSelectorModal";
import { ConfirmModal } from "src/ui/components/ConfirmModal";
import { t } from "src/i18n";
import { cryptoCache } from "src/core/cryptoCache";
import { globalEventEmitter } from "src/utils/EventEmitter";
import { formatError } from "src/utils/error";
import { promptForPassword } from "src/ui/passwordPrompt";
import { parseFrontmatter, extractCapabilitiesBlock, upsertCapabilitiesBlock, writeSkillMd } from "src/core/skillsLoader";
import { extractInputVariables } from "src/workflow/inputVariables";

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
  sleep: t("workflow.nodeType.sleep"),
  script: t("workflow.nodeType.script"),
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
  "sleep",
  "script",
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
      return { prompt: "", model: "", ragSetting: "__none__", enableThinking: "true", attachments: "", saveTo: "" };
    case "http":
      return { url: "", method: "GET", saveTo: "" };
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
      return { path: "", input: "", output: "", prefix: "" };
    case "rag-sync":
      return { path: "", oldPath: "", ragSetting: "", saveTo: "" };
    case "file-save":
      return { source: "", path: "", savePathTo: "" };
    case "mcp":
      return { url: "", tool: "", args: "", headers: "", saveTo: "" };
    case "obsidian-command":
      return { command: "", path: "", saveTo: "" };
    case "sleep":
      return { duration: "1000" };
    case "script":
      return { code: "", saveTo: "", timeout: "10000" };
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
      return node.properties["path"] || "(no path)";
    case "rag-sync":
      return `${node.properties["path"]} → ${node.properties["ragSetting"]}`;
    case "file-save":
      return `${node.properties["source"]} → ${node.properties["path"]}`;
    case "mcp":
      return `${node.properties["tool"]} @ ${node.properties["url"]}`;
    case "obsidian-command":
      return node.properties["command"] || "(no command)";
    case "sleep":
      return `${node.properties["duration"] || "0"}ms`;
    case "script": {
      const code = node.properties["code"] || "";
      const truncated = code.length > 30 ? code.substring(0, 30) + "..." : code;
      return truncated || "(no code)";
    }
  }
}

// Find the minimum number of backticks needed to safely wrap content
function getCodeFenceBackticks(content: string): string {
  // Find the longest sequence of backticks in the content
  const matches = content.match(/`+/g);
  const maxBackticks = matches ? Math.max(...matches.map(m => m.length)) : 0;
  // Use at least 3, or 1 more than the longest sequence found
  return '`'.repeat(Math.max(3, maxBackticks + 1));
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
      const fence = getCodeFenceBackticks(mention.content);
      entry += `\n>   > [!note]- ${mention.original}\n>   > ${fence}\n>   > ${escapedContent}\n>   > ${fence}`;
    }
  }

  return entry;
}

// Build workflow YAML code block from AI result
function buildWorkflowCodeBlock(result: { name: string; nodes: SidebarNode[] }): string {
  const backticks = getCodeFenceBackticks(
    result.nodes.map(n => Object.values(n.properties).join("\n")).join("\n")
  );
  return `${backticks}workflow
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
${backticks}
`;
}

/**
 * Keep SKILL.md's `inputVariables` in sync with the workflow the panel just
 * saved. Looks for a SKILL.md in either the same folder as the workflow file
 * or its parent (skills/X/SKILL.md vs skills/X/workflows/Y.md), finds the
 * workflow entry that points to this file, and rewrites its inputVariables
 * based on the current node graph. Silently no-ops if no matching skill is
 * found — regular non-skill workflows don't have a SKILL.md to update.
 */
async function syncSkillInputVariables(
  app: App,
  workflowFile: TFile,
  nodes: SidebarNode[],
): Promise<void> {
  const parent = workflowFile.parent;
  if (!parent) return;

  let skillFile: TFile | null = null;
  let relPath = workflowFile.name;
  const sameFolderSkill = app.vault.getAbstractFileByPath(`${parent.path}/SKILL.md`);
  if (sameFolderSkill instanceof TFile && sameFolderSkill.path !== workflowFile.path) {
    skillFile = sameFolderSkill;
  } else if (parent.parent) {
    const parentSkill = app.vault.getAbstractFileByPath(`${parent.parent.path}/SKILL.md`);
    if (parentSkill instanceof TFile) {
      skillFile = parentSkill;
      relPath = `${parent.name}/${workflowFile.name}`;
    }
  }
  // Inline skill workflow (the SKILL.md itself IS the workflow file)
  if (!skillFile && workflowFile.name === "SKILL.md") {
    skillFile = workflowFile;
    relPath = "SKILL.md";
  }
  if (!skillFile) return;

  const content = await app.vault.read(skillFile);
  const { frontmatter, body } = parseFrontmatter(content);

  // Capabilities live in the embedded fenced block; fall back to frontmatter
  // for legacy skills, but migrate the result into the block on write.
  const fromBlock = extractCapabilitiesBlock(body);
  const fromFrontmatter = Array.isArray(frontmatter.workflows)
    ? { workflows: frontmatter.workflows }
    : null;
  const capabilities = fromBlock ?? fromFrontmatter;
  if (!capabilities) return;

  const rawWorkflows = Array.isArray(capabilities.workflows)
    ? (capabilities.workflows as Record<string, unknown>[])
    : null;
  if (!rawWorkflows) return;

  const targetIndex = rawWorkflows.findIndex(w => typeof w.path === "string" && w.path === relPath);
  if (targetIndex < 0) return;

  const derivedInputs = extractInputVariables(nodes);
  const existing = rawWorkflows[targetIndex].inputVariables;
  const existingArr = Array.isArray(existing)
    ? (existing as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const changed = !fromBlock
    || existingArr.length !== derivedInputs.length
    || existingArr.some((v, i) => v !== derivedInputs[i]);
  if (!changed) return;

  const nextEntry = { ...rawWorkflows[targetIndex] };
  if (derivedInputs.length > 0) {
    nextEntry.inputVariables = derivedInputs;
  } else {
    delete nextEntry.inputVariables;
  }
  const nextWorkflows = rawWorkflows.map((w, i) => (i === targetIndex ? nextEntry : w));
  const nextCapabilities: Record<string, unknown> = { ...capabilities, workflows: nextWorkflows };
  const nextFrontmatter: Record<string, unknown> = { ...frontmatter };
  delete nextFrontmatter.workflows;

  const nextBody = upsertCapabilitiesBlock(body, nextCapabilities);
  await app.vault.modify(skillFile, writeSkillMd(nextFrontmatter, nextBody));
}

// Create skill folder structure from AI workflow result
async function createSkillFromResult(
  app: App,
  result: AIWorkflowResult,
): Promise<TFile> {
  const skillFolderPath = result.outputPath || `skills/${result.name}`;
  const workflowsFolderPath = `${skillFolderPath}/workflows`;
  const skillFilePath = `${skillFolderPath}/SKILL.md`;
  const workflowFilePath = `${workflowsFolderPath}/workflow.md`;

  // Create folders
  for (const folderPath of [skillFolderPath, workflowsFolderPath]) {
    if (!app.vault.getAbstractFileByPath(folderPath)) {
      await app.vault.createFolder(folderPath);
    }
  }

  const skillProse = result.skillInstructions || result.description || "";
  const inputVariables = extractInputVariables(result.nodes);
  const workflowEntry: Record<string, unknown> = {
    path: "workflows/workflow.md",
    description: result.name,
  };
  if (inputVariables.length > 0) {
    workflowEntry.inputVariables = inputVariables;
  }
  const frontmatterObj: Record<string, unknown> = {
    name: result.name,
    description: result.description || result.name,
  };
  const capabilities: Record<string, unknown> = { workflows: [workflowEntry] };
  const body = upsertCapabilitiesBlock(skillProse, capabilities);
  const skillContent = writeSkillMd(frontmatterObj, body);

  // Build workflow file content
  const historyLine = buildHistoryEntry("Created", result.description || "", result.resolvedMentions);
  const historyEntry = `> [!info] AI Workflow History\n${historyLine}\n\n`;
  const workflowBody = result.rawMarkdown || buildWorkflowCodeBlock(result);
  const workflowContent = historyEntry + workflowBody;

  // Create files
  await app.vault.create(workflowFilePath, workflowContent);
  return await app.vault.create(skillFilePath, skillContent);
}

// Create or append workflow file from AI result (non-skill path).
// Under "1 file = 1 workflow" we only append to an existing file when it does
// not yet contain a workflow block; otherwise we throw and let the caller
// reopen the create modal so the user can pick a different name. AIWorkflowModal
// validates up front, so this guard is defense-in-depth for future callers.
async function createWorkflowFile(
  app: App,
  result: AIWorkflowResult,
): Promise<{ targetFile: TFile; notice: string }> {
  const filePath = result.outputPath!.endsWith(".md")
    ? result.outputPath!
    : `${result.outputPath!}.md`;

  const folderPath = filePath.substring(0, filePath.lastIndexOf("/"));
  if (folderPath && !app.vault.getAbstractFileByPath(folderPath)) {
    await app.vault.createFolder(folderPath);
  }

  const historyLine = buildHistoryEntry("Created", result.description || "", result.resolvedMentions);
  const historyEntry = `> [!info] AI Workflow History\n${historyLine}\n\n`;
  const workflowBody = result.rawMarkdown || buildWorkflowCodeBlock(result);
  const workflowContent = historyEntry + workflowBody;

  const existingFile = app.vault.getAbstractFileByPath(filePath);
  if (existingFile instanceof TFile) {
    const existingContent = await app.vault.read(existingFile);
    if (findWorkflowBlocks(existingContent).length > 0) {
      throw new Error(t("workflow.generation.outputPathTaken", { path: filePath }));
    }
    const separator = existingContent.endsWith("\n") ? "\n" : "\n\n";
    await app.vault.modify(existingFile, existingContent + separator + workflowContent);
    return { targetFile: existingFile, notice: t("workflow.appendedTo", { name: result.name, path: filePath }) };
  }
  const targetFile = await app.vault.create(filePath, workflowContent);
  return { targetFile, notice: t("workflow.createdAt", { name: result.name, path: filePath }) };
}

export default function WorkflowPanel({ plugin }: WorkflowPanelProps) {
  const [workflowFile, setWorkflowFile] = useState<TFile | null>(null);
  // True when the active file is a SKILL.md — enables "Modify Skill with AI"
  const [isSkillFile, setIsSkillFile] = useState(false);
  // `hasWorkflowBlock` distinguishes "file has no workflow block" (show empty
  // state with Create buttons) from "file has a block but it's empty/broken"
  // (show the editor with an error banner).
  const [hasWorkflowBlock, setHasWorkflowBlock] = useState(false);
  const [multiBlockCount, setMultiBlockCount] = useState<number>(0);
  const [nodes, setNodes] = useState<SidebarNode[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ index: number; position: "above" | "below" } | null>(null);
  const [enabledHotkeys, setEnabledHotkeys] = useState<string[]>(plugin.settings.enabledWorkflowHotkeys);
  const [eventTriggers, setEventTriggers] = useState<WorkflowEventTrigger[]>(plugin.settings.enabledWorkflowEventTriggers);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const executionModalRef = useRef<WorkflowExecutionModal | null>(null);

  // Workflow name is derived from the filename (1 file = 1 workflow).
  const workflowName = workflowFile ? workflowFile.basename : null;

  // Load workflow from active file
  const loadWorkflow = useCallback(async () => {
    const activeFile = plugin.app.workspace.getActiveFile();
    if (!activeFile || activeFile.extension !== "md") {
      setWorkflowFile(null);
      setIsSkillFile(false);
      setHasWorkflowBlock(false);
      setMultiBlockCount(0);
      setNodes([]);
      setLoadError(null);
      return;
    }

    setIsSkillFile(activeFile.basename === "SKILL");
    setWorkflowFile(activeFile);

    const content = await plugin.app.vault.read(activeFile);
    const blockCount = findWorkflowBlocks(content).length;
    setMultiBlockCount(blockCount);
    const result = loadFromCodeBlock(content);

    if (!result.data && !result.error) {
      // No workflow block at all
      setHasWorkflowBlock(false);
      setNodes([]);
      setLoadError(null);
      return;
    }

    setHasWorkflowBlock(true);
    if (result.error) {
      setLoadError(result.error);
      setNodes([]);
    } else if (result.data) {
      setLoadError(null);
      setNodes(result.data.nodes);
    }
  }, [plugin.app]);

  // Watch active file changes and file restored events
  useEffect(() => {
    void loadWorkflow();

    const leafChangeHandler = () => {
      void loadWorkflow();
    };

    plugin.app.workspace.on("active-leaf-change", leafChangeHandler);

    return () => {
      plugin.app.workspace.off("active-leaf-change", leafChangeHandler);
    };
  }, [loadWorkflow, plugin.app.workspace]);

  // Watch for file restored events (from edit history revert)
  useEffect(() => {
    const restoredHandler = (path: string) => {
      if (workflowFile && path === workflowFile.path) {
        void loadWorkflow();
      }
    };

    globalEventEmitter.on("file-restored", restoredHandler);

    return () => {
      globalEventEmitter.off("file-restored", restoredHandler);
    };
  }, [loadWorkflow, workflowFile]);

  // Save workflow
  const saveWorkflow = useCallback(async (newNodes: SidebarNode[]) => {
    if (!workflowFile) return;

    await saveToCodeBlock(plugin.app, workflowFile, {
      name: workflowName || "default",
      nodes: newNodes,
    });

    await syncSkillInputVariables(plugin.app, workflowFile, newNodes);
  }, [plugin.app, workflowFile, workflowName]);

  // Split a multi-block workflow file into individual "1 file = 1 workflow"
  // files. The original file keeps the first block plus any surrounding prose;
  // blocks 2..N are written to sibling files whose basename is derived from
  // each block's YAML `name:` (falling back to an indexed slug).
  const migrateMultiBlockFile = async () => {
    if (!workflowFile) return;

    const content = await plugin.app.vault.read(workflowFile);
    const blocks = findWorkflowBlocks(content);
    if (blocks.length < 2) {
      new Notice(t("workflow.migrateNothingToDo"));
      return;
    }

    const slugify = (raw: string): string =>
      raw
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "workflow";

    const parent = workflowFile.parent;
    const folderPath = parent ? parent.path : "";
    const existingPaths = new Set(
      plugin.app.vault.getMarkdownFiles().map(f => f.path)
    );

    // Plan target paths for blocks[1..N]. We skip blocks[0] — it stays in the
    // original file. Collision handling: append -2, -3, ... until the path
    // is unique against both the vault and the in-flight plan.
    const plan: { block: typeof blocks[number]; path: string }[] = [];
    for (let i = 1; i < blocks.length; i++) {
      const base = slugify(blocks[i].name || `workflow-${i + 1}`);
      let candidate = folderPath ? `${folderPath}/${base}.md` : `${base}.md`;
      let counter = 2;
      while (existingPaths.has(candidate) || plan.some(p => p.path === candidate)) {
        candidate = folderPath ? `${folderPath}/${base}-${counter}.md` : `${base}-${counter}.md`;
        counter++;
      }
      plan.push({ block: blocks[i], path: candidate });
    }

    const confirmed = await new ConfirmModal(
      plugin.app,
      t("workflow.migrateConfirm", {
        count: String(plan.length),
        files: plan.map(p => p.path).join("\n"),
      }),
      t("workflow.migrate"),
    ).openAndWait();
    if (!confirmed) return;

    // Create the split files first. If any write fails, surface the error and
    // DO NOT touch the original file — partial state is easier to recover from
    // when the source of truth is still intact.
    for (const entry of plan) {
      await plugin.app.vault.create(entry.path, `${entry.block.raw}\n`);
    }

    // Remove blocks[1..N] from the original content. Walk right-to-left so
    // earlier block offsets remain valid while we splice.
    let stripped = content;
    for (let i = blocks.length - 1; i >= 1; i--) {
      const b = blocks[i];
      stripped = stripped.slice(0, b.start) + stripped.slice(b.end);
    }
    // Collapse runs of 3+ blank lines that the block removal may have
    // introduced, and trim any trailing whitespace we added.
    stripped = stripped.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "\n");
    await plugin.app.vault.modify(workflowFile, stripped);

    new Notice(t("workflow.migrateSuccess", { count: String(plan.length) }));
    await loadWorkflow();
  };

  // Open browse all workflows modal
  const openBrowseAllModal = () => {
    new WorkflowSelectorModal(
      plugin.app,
      plugin,
      (filePath) => {
        void plugin.executeWorkflowFromHotkey(filePath);
      }
    ).open();
  };

  // Handle toolbar action dropdown (open/create/reload shortcuts). Replaces the
  // former per-workflow selector since 1 file = 1 workflow removes the need to
  // pick which block within a file.
  const handleActionSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    e.target.value = "__self__";

    if (value === "__reload__") {
      await loadWorkflow();
      new Notice(t("workflow.reloaded"));
      return;
    }

    if (value === "__browse_all__") {
      openBrowseAllModal();
      return;
    }

    if (value === "__new_ai__") {
      const defaultOutputPath = workflowFile?.path?.replace(/\.md$/, "");
      const result = await promptForAIWorkflow(plugin.app, plugin, "create", undefined, undefined, defaultOutputPath);

      if (result && result.outputPath) {
        let targetFile: TFile;
        if (result.createAsSkill) {
          targetFile = await createSkillFromResult(plugin.app, result);
          new Notice(t("aiWorkflow.skillCreated", { name: result.name, path: targetFile.path }));
          plugin.settingsEmitter.emit("skills-changed");
        } else {
          const created = await createWorkflowFile(plugin.app, result);
          targetFile = created.targetFile;
          new Notice(created.notice);
        }
        await plugin.app.workspace.getLeaf().openFile(targetFile);
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

      await saveToCodeBlock(plugin.app, workflowFile, {
        name: result.name,
        nodes: result.nodes,
      });
      new Notice(t("workflow.modifiedSuccessfully"));
    }
  };

  // Modify skill (SKILL.md + related workflow) with AI
  const handleModifySkillWithAI = async () => {
    if (!workflowFile || workflowFile.basename !== "SKILL") {
      new Notice(t("workflow.noWorkflowToModify"));
      return;
    }

    // Parse existing SKILL.md: frontmatter + instructions body
    const skillContent = await plugin.app.vault.read(workflowFile);
    const { frontmatter, body: instructions } = parseFrontmatter(skillContent);
    const skillName = typeof frontmatter.name === "string" ? frontmatter.name : workflowFile.parent?.name || "skill";
    const skillDescription = typeof frontmatter.description === "string" ? frontmatter.description : "";

    // Capabilities (workflow list) live in the embedded `skill-capabilities`
    // fenced block; fall back to frontmatter for legacy skills (the write path
    // re-emits them into the block).
    const capabilitiesBlock = extractCapabilitiesBlock(instructions);
    const folder = workflowFile.parent;
    const declaredWorkflows: Array<Record<string, unknown>> = Array.isArray(capabilitiesBlock?.workflows)
      ? (capabilitiesBlock.workflows as Array<Record<string, unknown>>)
      : Array.isArray(frontmatter.workflows)
        ? (frontmatter.workflows as Array<Record<string, unknown>>)
        : [];
    const declaredFirst = declaredWorkflows[0];
    const declaredFirstPath = declaredFirst && typeof declaredFirst.path === "string"
      ? declaredFirst.path
      : null;

    let workflowTargetFile: TFile | null = null;
    if (folder && declaredFirstPath) {
      const candidate = plugin.app.vault.getAbstractFileByPath(`${folder.path}/${declaredFirstPath}`);
      if (candidate instanceof TFile) workflowTargetFile = candidate;
    }
    if (!workflowTargetFile && folder) {
      const workflowsFolder = plugin.app.vault.getAbstractFileByPath(`${folder.path}/workflows`);
      if (workflowsFolder && "children" in workflowsFolder) {
        const children = (workflowsFolder as { children: { path: string }[] }).children;
        for (const child of children) {
          const f = plugin.app.vault.getAbstractFileByPath(child.path);
          if (f instanceof TFile && f.extension === "md") {
            workflowTargetFile = f;
            break;
          }
        }
      }
    }

    // Read current YAML from the target file (each file holds exactly one
    // workflow), falling back to an inline workflow block in SKILL.md.
    let currentYaml = "";
    if (workflowTargetFile) {
      const wfContent = await plugin.app.vault.read(workflowTargetFile);
      const loaded = loadFromCodeBlock(wfContent);
      if (loaded.data) {
        currentYaml = buildWorkflowYaml(loaded.data.nodes, loaded.data.name ?? null);
      }
    }
    if (!currentYaml) {
      const loaded = loadFromCodeBlock(skillContent);
      if (loaded.data) {
        currentYaml = buildWorkflowYaml(loaded.data.nodes, loaded.data.name ?? null);
      }
    }

    // Modify flow presupposes an existing workflow. If the skill has neither a
    // declared workflow nor a workflow file on disk (e.g. an instructions-only
    // skill), fabricating one here would silently add a workflow capability
    // the author never declared.
    if (declaredWorkflows.length === 0 && !workflowTargetFile && !currentYaml) {
      new Notice(t("workflow.noWorkflowToModify"));
      return;
    }

    const result = await promptForAIWorkflow(
      plugin.app,
      plugin,
      "modify",
      currentYaml,
      skillName,
      undefined,
      { isSkill: true, existingInstructions: instructions.trim() }
    );
    if (!result) return;

    // Write back: update SKILL.md (instructions body + name) and the workflow file.
    // IMPORTANT: Preserve the existing skill description — result.description holds
    // the user's modification request, NOT the skill's overall description.
    // If the original description is missing (empty string / unset), fall back to
    // the skill's name so the frontmatter isn't left with an empty `description:`
    // (which would weaken skill triggering and fail downstream readers).
    const newInstructions = (result.skillInstructions ?? instructions).trim();
    const newName = result.name || skillName;
    const effectiveDescription = skillDescription.trim() || newName;

    const derivedInputs = extractInputVariables(result.nodes);
    // If declaredWorkflows is empty we got here because a workflow was
    // discovered on disk or inlined into SKILL.md itself (the empty-empty
    // case returned early above). Use the actual target's path relative to
    // the skill folder so the new capability entry points at the real file.
    const fabricatedPath = workflowTargetFile && folder
      ? workflowTargetFile.path.slice(folder.path.length + 1)
      : currentYaml
        ? "SKILL.md"
        : null;
    const preservedWorkflows: Record<string, unknown>[] = declaredWorkflows.length > 0
      ? declaredWorkflows.map((w, i) => {
        if (i !== 0) return w;
        const next: Record<string, unknown> = { ...w };
        if (derivedInputs.length > 0) {
          next.inputVariables = derivedInputs;
        } else {
          delete next.inputVariables;
        }
        return next;
      })
      : fabricatedPath
        ? [{
          path: fabricatedPath,
          description: newName,
          ...(derivedInputs.length > 0 ? { inputVariables: derivedInputs } : {}),
        }]
        : [];

    const updatedCapabilities: Record<string, unknown> = { workflows: preservedWorkflows };

    const updatedFrontmatter: Record<string, unknown> = {
      ...frontmatter,
      name: newName,
      description: effectiveDescription,
    };
    // Strip legacy workflows from frontmatter on save; they now live
    // exclusively in the embedded skill-capabilities block.
    delete updatedFrontmatter.workflows;

    const updatedBody = upsertCapabilitiesBlock(newInstructions, updatedCapabilities);
    await plugin.app.vault.modify(workflowFile, writeSkillMd(updatedFrontmatter, updatedBody));

    // Write workflow YAML to the target file (1 file = 1 workflow).
    if (workflowTargetFile) {
      await saveToCodeBlock(plugin.app, workflowTargetFile, {
        name: result.name,
        nodes: result.nodes,
      });
    } else {
      // No existing workflow file — write inline into SKILL.md.
      await saveToCodeBlock(plugin.app, workflowFile, {
        name: result.name,
        nodes: result.nodes,
      });
    }

    new Notice(t("workflow.modifiedSuccessfully"));
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

    // Open editor for new node
    const modal = new NodeEditorModal(plugin.app, newNode, (updatedNode) => {
      const updatedNodes = newNodes.map((n) => (n.id === updatedNode.id ? updatedNode : n));
      setNodes(updatedNodes);
      void saveWorkflow(updatedNodes);
    }, plugin);
    modal.open();
  };

  // Edit node
  const editNode = (index: number) => {
    const node = nodes[index];
    if (!node) return;

    const modal = new NodeEditorModal(plugin.app, node, (updatedNode) => {
      const newNodes = nodes.map((n, i) => (i === index ? updatedNode : n));
      setNodes(newNodes);
      void saveWorkflow(newNodes);
    }, plugin);
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

  // Build prompt callbacks for workflow execution
  const buildPromptCallbacks = (): PromptCallbacks => ({
    promptForFile: (defaultPath?: string) => promptForFile(plugin.app, defaultPath || "Select a file"),
    promptForAnyFile: (extensions?: string[], defaultPath?: string) =>
      promptForAnyFile(plugin.app, extensions, defaultPath || "Select a file"),
    promptForNewFilePath: (extensions?: string[], defaultPath?: string) =>
      promptForNewFilePath(plugin.app, extensions, defaultPath),
    promptForSelection: () => promptForSelection(plugin.app, "Select text"),
    promptForValue: (prompt: string, defaultValue?: string, multiline?: boolean) =>
      promptForValue(plugin.app, prompt, defaultValue || "", multiline || false),
    promptForConfirmation: (filePath: string, content: string, mode: string, originalContent?: string) =>
      promptForConfirmation(plugin.app, filePath, content, mode, originalContent),
    promptForDialog: (title: string, message: string, options: string[], multiSelect: boolean, button1: string, button2?: string, markdown?: boolean, inputTitle?: string, defaults?: { input?: string; selected?: string[] }, multiline?: boolean) =>
      promptForDialog(plugin.app, title, message, options, multiSelect, button1, button2, markdown, inputTitle, defaults, multiline),
    openFile: async (notePath: string) => {
      const noteFile = plugin.app.vault.getAbstractFileByPath(notePath);
      if (noteFile instanceof TFile) {
        await plugin.app.workspace.getLeaf().openFile(noteFile);
      }
    },
    promptForPassword: async () => {
      const cached = cryptoCache.getPassword();
      if (cached) return cached;
      return promptForPassword(plugin.app);
    },
    showMcpApp: async (mcpApp) => {
      if (executionModalRef.current) {
        await showMcpApp(plugin.app, mcpApp);
      }
    },
    onThinking: (nodeId, thinking) => {
      executionModalRef.current?.updateThinking(nodeId, thinking);
    },
  });

  // Run workflow
  const runWorkflow = async () => {
    if (!workflowFile || nodes.length === 0) {
      new Notice(t("workflow.noWorkflowToRun"));
      return;
    }

    setIsRunning(true);

    // Create abort controller for stopping workflow
    const abortController = new AbortController();

    try {
      const content = await plugin.app.vault.read(workflowFile);
      const workflow = parseWorkflowFromMarkdown(content);

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
      executionModalRef.current = new WorkflowExecutionModal(
        plugin.app,
        workflow,
        workflowName || workflowFile.basename,
        abortController,
        () => {
          // onAbort callback
          setIsRunning(false);
        }
      );
      executionModalRef.current.open();

      await executor.execute(
        workflow,
        input,
        (log) => {
          // Update execution modal with progress
          executionModalRef.current?.updateFromLog(log);
        },
        {
          workflowPath: workflowFile.path,
          workflowName: workflowName || undefined,
          recordHistory: true,
          abortSignal: abortController.signal,
        },
        buildPromptCallbacks()
      );

      // Mark execution as complete
      executionModalRef.current?.setComplete(true);
      new Notice(t("workflow.completedSuccessfully"));
    } catch (error) {
      const message = formatError(error);
      // Always mark modal as complete (failed state)
      executionModalRef.current?.setComplete(false);
      // Don't show error notice if it was just stopped
      if (message !== "Workflow execution was stopped") {
        new Notice(t("workflow.failed", { message }));
      }
    } finally {
      setIsRunning(false);
      executionModalRef.current = null;
    }
  };

  // Retry workflow from error node
  const retryFromError = async (
    retryWorkflowPath: string,
    retryWorkflowName: string | undefined,
    errorNodeId: string,
    variablesSnapshot: Record<string, string | number>
  ) => {
    setIsRunning(true);

    const abortController = new AbortController();

    try {
      const file = plugin.app.vault.getAbstractFileByPath(retryWorkflowPath);
      if (!file || !(file instanceof TFile)) {
        throw new Error(`Workflow file not found: ${retryWorkflowPath}`);
      }

      const content = await plugin.app.vault.read(file);
      const workflow = parseWorkflowFromMarkdown(content);

      const executor = new WorkflowExecutor(plugin.app, plugin);

      const input: WorkflowInput = {
        variables: new Map(),
      };

      const initialVariables = new Map<string, string | number>();
      for (const [key, value] of Object.entries(variablesSnapshot)) {
        initialVariables.set(key, value);
      }

      executionModalRef.current = new WorkflowExecutionModal(
        plugin.app,
        workflow,
        retryWorkflowName || file.basename,
        abortController,
        () => {
          setIsRunning(false);
        }
      );
      executionModalRef.current.open();

      await executor.execute(
        workflow,
        input,
        (log) => {
          executionModalRef.current?.updateFromLog(log);
        },
        {
          workflowPath: retryWorkflowPath,
          workflowName: retryWorkflowName,
          recordHistory: true,
          abortSignal: abortController.signal,
          startNodeId: errorNodeId,
          initialVariables,
        },
        buildPromptCallbacks()
      );

      executionModalRef.current?.setComplete(true);
      new Notice(t("workflow.completedSuccessfully"));
    } catch (error) {
      const message = formatError(error);
      executionModalRef.current?.setComplete(false);
      if (message !== "Workflow execution was stopped") {
        new Notice(t("workflow.failed", { message }));
      }
    } finally {
      setIsRunning(false);
      executionModalRef.current = null;
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
      encryptionConfig,
      (retryPath, retryName, errorNodeId, variablesSnapshot) => {
        void retryFromError(retryPath, retryName, errorNodeId, variablesSnapshot);
      },
      plugin.settings.workspaceFolder
    );
    modal.open();
  };

  // Create workflow with AI (workflow-only: modal shows workflow-focused UI)
  const handleCreateWorkflowWithAI = async () => {
    const result = await promptForAIWorkflow(
      plugin.app, plugin, "create", undefined, undefined, undefined, { isSkill: false }
    );
    if (!result || !result.outputPath) return;
    const created = await createWorkflowFile(plugin.app, result);
    new Notice(created.notice);
    await plugin.app.workspace.getLeaf().openFile(created.targetFile);
  };

  // Create skill with AI (skill-only: modal pins output to skills/, generates SKILL.md + workflow)
  const handleCreateSkillWithAI = async () => {
    const result = await promptForAIWorkflow(
      plugin.app, plugin, "create", undefined, undefined, undefined, { isSkill: true }
    );
    if (!result || !result.outputPath) return;
    const targetFile = await createSkillFromResult(plugin.app, result);
    new Notice(t("aiWorkflow.skillCreated", { name: result.name, path: targetFile.path }));
    plugin.settingsEmitter.emit("skills-changed");
    await plugin.app.workspace.getLeaf().openFile(targetFile);
  };

  // Render a hint line such as "**Workflow**: description" where the bold segment
  // between **...** becomes a <strong> element.
  const renderMarkdownHint = (text: string) => {
    const parts = text.split(/\*\*(.+?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
    );
  };

  // Short explainer shown under the create buttons so users know which to pick.
  const createHint = (
    <div className="workflow-empty-create-hint">
      <p>{renderMarkdownHint(t("workflow.createHintWorkflow"))}</p>
      <p>{renderMarkdownHint(t("workflow.createHintSkill"))}</p>
    </div>
  );

  // Open workflow selector modal
  const handleOpenWorkflowSelector = () => {
    openBrowseAllModal();
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
              onClick={() => void handleCreateWorkflowWithAI()}
            >
              <Sparkles size={14} />
              <span>{t("workflow.createWithAI")}</span>
            </button>
            <button
              className="workflow-sidebar-ai-btn"
              onClick={() => void handleCreateSkillWithAI()}
            >
              <Sparkles size={14} />
              <span>{t("workflow.createSkillWithAI")}</span>
            </button>
            {createHint}
          </div>
        </div>
      </div>
    );
  }

  // Workflowコードブロックがない場合
  if (!hasWorkflowBlock) {
    return (
      <div className="workflow-sidebar">
        <div className="workflow-sidebar-content">
          <div className="workflow-empty-state">
            <p>{isSkillFile ? t("workflow.skillNoInlineWorkflow") : t("workflow.noWorkflowInFile")}</p>
            <button
              className="workflow-sidebar-run-btn"
              onClick={handleOpenWorkflowSelector}
            >
              <FolderOpen size={14} />
              <span>{t("workflowSelector.listButton")}</span>
            </button>
            {isSkillFile && (
              <button
                className="workflow-sidebar-ai-btn mod-cta"
                onClick={() => void handleModifySkillWithAI()}
              >
                <Sparkles size={14} />
                <span>{t("workflow.modifySkillWithAI")}</span>
              </button>
            )}
            <button
              className={`workflow-sidebar-ai-btn${isSkillFile ? "" : " mod-cta"}`}
              onClick={() => void handleCreateWorkflowWithAI()}
            >
              <Sparkles size={14} />
              <span>{t("workflow.createWithAI")}</span>
            </button>
            <button
              className="workflow-sidebar-ai-btn"
              onClick={() => void handleCreateSkillWithAI()}
            >
              <Sparkles size={14} />
              <span>{t("workflow.createSkillWithAI")}</span>
            </button>
            {createHint}
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
          value="__self__"
          onChange={(e) => void handleActionSelect(e)}
        >
          <option value="__self__">{workflowName || workflowFile.basename}</option>
          <option value="__browse_all__">{t("workflow.browseAllWorkflows")}</option>
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
            onClick={() => void (isSkillFile ? handleModifySkillWithAI() : handleModifyWithAI())}
            disabled={!workflowFile}
            title={isSkillFile ? t("workflow.modifySkillWithAI") : t("workflow.modifyWithAI")}
          >
            <Sparkles size={14} />
            <span className="gemini-helper-workflow-btn-label">
              {isSkillFile ? t("workflow.modifySkillWithAI") : t("workflow.modifyWithAI")}
            </span>
          </button>
          {isSkillFile && (
            <button
              className="workflow-sidebar-ai-btn"
              onClick={() => void handleCreateSkillWithAI()}
              title={t("workflow.createSkillWithAI")}
            >
              <Sparkles size={14} />
              <span className="gemini-helper-workflow-btn-label">
                {t("workflow.createSkillWithAI")}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Error display */}
      {loadError && (
        <div className="workflow-error-banner">
          <span className="workflow-error-icon">⚠</span>
          <span className="workflow-error-message">{loadError}</span>
          {multiBlockCount > 1 && (
            <button
              className="workflow-error-migrate-btn"
              onClick={() => void migrateMultiBlockFile()}
            >
              {t("workflow.migrate")}
            </button>
          )}
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

                    {/* Comment */}
                    {node.properties["comment"] && (() => {
                      const comment = node.properties["comment"];
                      const isMultiLine = comment.includes("\n");
                      const isExpanded = expandedComments.has(node.id);
                      return (
                        <div
                          className={`workflow-node-comment${isMultiLine ? " is-multiline" : ""}${isExpanded ? " is-expanded" : ""}`}
                          onClick={isMultiLine ? (e) => {
                            e.stopPropagation();
                            setExpandedComments(prev => {
                              const next = new Set(prev);
                              if (next.has(node.id)) next.delete(node.id);
                              else next.add(node.id);
                              return next;
                            });
                          } : undefined}
                        >
                          {isMultiLine && <span className="workflow-node-comment-toggle">{isExpanded ? "▼" : "▶"}</span>}
                          <span className="workflow-node-comment-text">{comment}</span>
                        </div>
                      );
                    })()}

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
          onClick={() => {
            if (isRunning && executionModalRef.current) {
              executionModalRef.current.open();
            } else {
              void runWorkflow();
            }
          }}
          disabled={nodes.length === 0}
        >
          {isRunning ? t("workflow.showProgress") : t("workflow.run")}
        </button>
        <button
          className="workflow-sidebar-history-btn"
          onClick={showHistory}
        >
          {t("workflow.history")}
        </button>
        {(() => {
          const workflowId = workflowFile.path;
          const displayName = workflowName || workflowFile.basename;
          const isHotkeyEnabled = enabledHotkeys.includes(workflowId);
          const currentEventTrigger = eventTriggers.find(t => t.workflowId === workflowId);
          const hasEventTrigger = !!currentEventTrigger;
          return (
            <>
              <button
                className={`workflow-sidebar-hotkey-btn ${isHotkeyEnabled ? "gemini-helper-hotkey-enabled" : ""}`}
                onClick={() => {
                  let newEnabledHotkeys: string[];
                  if (isHotkeyEnabled) {
                    newEnabledHotkeys = enabledHotkeys.filter(id => id !== workflowId);
                    new Notice(t("workflow.hotkeyDisabled"));
                  } else {
                    newEnabledHotkeys = [...enabledHotkeys, workflowId];
                    new Notice(t("workflow.hotkeyEnabled", { name: displayName }));
                  }
                  setEnabledHotkeys(newEnabledHotkeys);
                  plugin.settings.enabledWorkflowHotkeys = newEnabledHotkeys;
                  void plugin.saveSettings();
                }}
                title={isHotkeyEnabled ? t("workflow.hotkeyEnabledClick") : t("workflow.enableHotkey")}
              >
                {isHotkeyEnabled ? <Keyboard size={16} /> : <KeyboardOff size={16} />}
              </button>
              <button
                className={`workflow-sidebar-event-btn ${hasEventTrigger ? "gemini-helper-event-enabled" : ""}`}
                onClick={() => {
                  const modal = new EventTriggerModal(
                    plugin.app,
                    workflowId,
                    displayName,
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
                        new Notice(t("workflow.eventTriggersEnabled", { name: displayName }));
                      }
                      setEventTriggers(newTriggers);
                      plugin.settings.enabledWorkflowEventTriggers = newTriggers;
                      void plugin.saveSettings();
                    }
                  );
                  modal.open();
                }}
                title={hasEventTrigger ? t("workflow.eventTriggersActive", { events: currentEventTrigger?.events.join(", ") || "" }) : t("workflow.configureEventTriggers")}
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
