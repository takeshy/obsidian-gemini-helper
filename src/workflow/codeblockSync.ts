import { App, TFile } from "obsidian";
import { SidebarNode, WorkflowNodeType } from "./types";
import {
  findWorkflowBlocks,
  replaceWorkflowBlock,
  serializeWorkflowBlock,
} from "./parser";
import { getEditHistoryManager } from "../core/editHistory";

interface WorkflowBlockNode {
  id?: unknown;
  type?: unknown;
  next?: unknown;
  trueNext?: unknown;
  falseNext?: unknown;
  [key: string]: unknown;
}

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function isWorkflowNodeType(value: unknown): value is WorkflowNodeType {
  return (
    value === "variable" ||
    value === "set" ||
    value === "if" ||
    value === "while" ||
    value === "command" ||
    value === "http" ||
    value === "json" ||
    value === "note" ||
    value === "note-read" ||
    value === "note-search" ||
    value === "note-list" ||
    value === "folder-list" ||
    value === "open" ||
    value === "dialog" ||
    value === "prompt-file" ||
    value === "prompt-selection" ||
    value === "file-explorer" ||
    value === "file-save" ||
    value === "workflow" ||
    value === "rag-sync" ||
    value === "mcp" ||
    value === "obsidian-command" ||
    value === "sleep"
  );
}

export interface WorkflowBlockData {
  name?: string;
  nodes: SidebarNode[];
}

export interface LoadResult {
  data: WorkflowBlockData | null;
  error?: string;
}

export function loadFromCodeBlock(
  content: string,
  workflowName?: string,
  index?: number
): LoadResult {
  const blocks = findWorkflowBlocks(content);
  if (blocks.length === 0) {
    return { data: null };
  }

  let block = blocks[0];
  if (workflowName) {
    const match = blocks.find((b) => b.name === workflowName);
    if (!match) {
      return { data: null };
    }
    block = match;
  } else if (index !== undefined) {
    if (index < 0 || index >= blocks.length) {
      return { data: null };
    }
    block = blocks[index];
  }
  const workflowContainer =
    block.yaml.workflow && typeof block.yaml.workflow === "object"
      ? (block.yaml.workflow as Record<string, unknown>)
      : block.yaml;
  const workflowData = workflowContainer as {
    nodes?: WorkflowBlockNode[];
    name?: unknown;
  };
  if (!workflowData || !Array.isArray(workflowData.nodes)) {
    return { data: null };
  }

  const nodes: SidebarNode[] = [];
  const nodeIndexMap = new Map<string, number>();
  const whileNodeIds = new Set<string>();

  // First pass: collect node info
  for (let i = 0; i < workflowData.nodes.length; i++) {
    const rawNode = workflowData.nodes[i];
    if (!rawNode || typeof rawNode !== "object") {
      continue;
    }

    const typeRaw = rawNode.type;
    if (!isWorkflowNodeType(typeRaw)) {
      continue;
    }

    const id = normalizeValue(rawNode.id) || `node-${i + 1}`;
    nodeIndexMap.set(id, i);
    if (typeRaw === "while") {
      whileNodeIds.add(id);
    }

    const properties: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawNode)) {
      if (
        key === "id" ||
        key === "type" ||
        key === "next" ||
        key === "trueNext" ||
        key === "falseNext"
      ) {
        continue;
      }
      const normalized = normalizeValue(value);
      if (normalized !== "") {
        properties[key] = normalized;
      }
    }

    nodes.push({
      id,
      type: typeRaw,
      properties,
      next: normalizeValue(rawNode.next) || undefined,
      trueNext: normalizeValue(rawNode.trueNext) || undefined,
      falseNext: normalizeValue(rawNode.falseNext) || undefined,
    });
  }

  // Validate back-references: only while nodes can be loop targets
  for (const node of nodes) {
    if (node.next) {
      const fromIndex = nodeIndexMap.get(node.id);
      const toIndex = nodeIndexMap.get(node.next);
      if (fromIndex !== undefined && toIndex !== undefined && toIndex <= fromIndex) {
        if (!whileNodeIds.has(node.next)) {
          return {
            data: null,
            error: `Invalid back-reference: "${node.id}" -> "${node.next}". Only while nodes can be loop targets.`,
          };
        }
      }
    }
  }

  const name =
    typeof workflowData.name === "string"
      ? workflowData.name
      : typeof block.yaml.name === "string"
        ? block.yaml.name
        : undefined;

  return {
    data: {
      name,
      nodes,
    },
  };
}

export async function saveToCodeBlock(
  app: App,
  file: TFile,
  data: WorkflowBlockData,
  targetIndex?: number
): Promise<void> {
  const content = await app.vault.read(file);
  const blocks = findWorkflowBlocks(content);

  // Ensure snapshot exists before modification (for edit history)
  const historyManager = getEditHistoryManager();
  if (historyManager) {
    await historyManager.ensureSnapshot(file.path);
  }

  const serializedNodes = data.nodes.map((node, index) => {
    const entry: Record<string, unknown> = {
      id: node.id,
      type: node.type,
    };

    for (const [key, value] of Object.entries(node.properties)) {
      if (value !== "") {
        entry[key] = value;
      }
    }

    if (node.type === "if" || node.type === "while") {
      if (node.trueNext) {
        entry.trueNext = node.trueNext;
      }
      if (node.falseNext) {
        entry.falseNext = node.falseNext;
      } else if (!node.falseNext && index < data.nodes.length - 1) {
        entry.falseNext = data.nodes[index + 1].id;
      }
    } else if (node.next) {
      entry.next = node.next;
    }

    return entry;
  });

  const blockData: Record<string, unknown> = {
    name: data.name || "default",
    nodes: serializedNodes,
  };

  let newContent: string;
  if (blocks.length > 0) {
    const indexToUse =
      targetIndex !== undefined &&
      targetIndex >= 0 &&
      targetIndex < blocks.length
        ? targetIndex
        : 0;
    newContent = replaceWorkflowBlock(content, blocks[indexToUse], blockData);
  } else {
    const block = serializeWorkflowBlock(blockData);
    newContent = content.trimEnd()
      ? `${content.trimEnd()}\n\n${block}\n`
      : `${block}\n`;
  }

  await app.vault.modify(file, newContent);

  // Record edit history
  if (historyManager) {
    await historyManager.saveEdit({
      path: file.path,
      modifiedContent: newContent,
      source: "workflow",
    });
  }
}
