import { App, TFile } from "obsidian";
import { SidebarNode, isWorkflowNodeType, normalizeValue } from "./types";
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


export interface WorkflowBlockData {
  name?: string;
  nodes: SidebarNode[];
}

export interface LoadResult {
  data: WorkflowBlockData | null;
  error?: string;
}

export function loadFromCodeBlock(content: string): LoadResult {
  const blocks = findWorkflowBlocks(content);
  if (blocks.length === 0) {
    return { data: null };
  }
  if (blocks.length > 1) {
    return {
      data: null,
      error: "This file contains multiple workflow blocks. Each file may contain only one workflow; split the file manually or use the Migration action.",
    };
  }
  const block = blocks[0];
  if (block.parseError) {
    return { data: null, error: block.parseError };
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
  data: WorkflowBlockData
): Promise<void> {
  const content = await app.vault.read(file);
  const blocks = findWorkflowBlocks(content);
  if (blocks.length > 1) {
    throw new Error(
      "Refusing to save: file contains multiple workflow blocks. Split the file first."
    );
  }

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
  if (blocks.length === 1) {
    newContent = replaceWorkflowBlock(content, blocks[0], blockData);
  } else {
    const block = serializeWorkflowBlock(blockData);
    newContent = content.trimEnd()
      ? `${content.trimEnd()}\n\n${block}\n`
      : `${block}\n`;
  }

  await app.vault.modify(file, newContent);

  // Record edit history
  if (historyManager) {
    historyManager.saveEdit({
      path: file.path,
      modifiedContent: newContent,
      source: "workflow",
    });
  }
}
