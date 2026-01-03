import { parseYaml, stringifyYaml } from "obsidian";
import { Workflow, WorkflowEdge, WorkflowNode, WorkflowNodeType } from "./types";

// Workflow code block types
export interface WorkflowCodeBlock {
  name?: string;
  yaml: Record<string, unknown>;
  start: number;
  end: number;
  raw: string;
}

// Match workflow code blocks - end marker must be at start of line
const BLOCK_REGEX = /^```workflow[^\n]*\r?\n([\s\S]*?)\r?\n```\s*$/gm;

export function findWorkflowBlocks(content: string): WorkflowCodeBlock[] {
  const blocks: WorkflowCodeBlock[] = [];
  let match: RegExpExecArray | null;
  // Reset regex lastIndex to ensure we start from the beginning
  BLOCK_REGEX.lastIndex = 0;

  while ((match = BLOCK_REGEX.exec(content))) {
    const raw = match[0];
    const yamlText = match[1];
    const parsed = (parseYaml(yamlText) as Record<string, unknown>) || {};
    const name = typeof parsed.name === "string" ? parsed.name : undefined;

    blocks.push({
      name,
      yaml: parsed,
      start: match.index,
      end: match.index + raw.length,
      raw,
    });
  }

  return blocks;
}

export function serializeWorkflowBlock(data: Record<string, unknown>): string {
  const yamlText = stringifyYaml(data).trimEnd();
  return `\`\`\`workflow\n${yamlText}\n\`\`\``;
}

export function replaceWorkflowBlock(
  content: string,
  block: WorkflowCodeBlock,
  newData: Record<string, unknown>
): string {
  const serialized = serializeWorkflowBlock(newData);
  return content.slice(0, block.start) + serialized + content.slice(block.end);
}

// Parser types
interface FrontmatterWorkflowNode {
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
    value === "workflow" ||
    value === "rag-sync"
  );
}

export interface WorkflowOption {
  label: string;
  name?: string;
  index: number;
  startLine: number;  // 0-based line number
  endLine: number;    // 0-based line number
  startOffset: number;
  endOffset: number;
}

// Convert character offset to line number (0-based)
function offsetToLine(content: string, offset: number): number {
  let line = 0;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === "\n") {
      line++;
    }
  }
  return line;
}

export function listWorkflowOptions(content: string): WorkflowOption[] {
  return findWorkflowBlocks(content).map((block, index) => {
    const workflowObj =
      block.yaml.workflow && typeof block.yaml.workflow === "object"
        ? (block.yaml.workflow as Record<string, unknown>)
        : undefined;
    const name =
      block.name ||
      (typeof workflowObj?.name === "string" ? workflowObj.name : undefined);
    return {
      label: name || `unnamed #${index + 1}`,
      name,
      index,
      startLine: offsetToLine(content, block.start),
      endLine: offsetToLine(content, block.end),
      startOffset: block.start,
      endOffset: block.end,
    };
  });
}

export function parseWorkflowFromMarkdown(
  content: string,
  name?: string,
  index?: number
): Workflow {
  const blocks = findWorkflowBlocks(content);
  if (blocks.length === 0) {
    throw new Error("No workflow code block found");
  }

  let block = blocks[0];
  if (name) {
    const match = blocks.find((b) => b.name === name);
    if (!match) {
      throw new Error(`Workflow '${name}' not found`);
    }
    block = match;
  } else if (index !== undefined) {
    if (index < 0 || index >= blocks.length) {
      throw new Error("Workflow index out of range");
    }
    block = blocks[index];
  } else if (blocks.length > 1) {
    throw new Error("Multiple workflows found. Specify a workflow name.");
  }

  const workflowContainer =
    block.yaml.workflow && typeof block.yaml.workflow === "object"
      ? (block.yaml.workflow as Record<string, unknown>)
      : block.yaml;
  const workflowData = workflowContainer as {
    nodes?: FrontmatterWorkflowNode[];
  };

  if (!workflowData || !Array.isArray(workflowData.nodes)) {
    throw new Error("Invalid workflow block");
  }

  const nodesList: FrontmatterWorkflowNode[] = workflowData.nodes;
  const workflow: Workflow = {
    nodes: new Map(),
    edges: [],
    startNode: null,
  };

  for (let i = 0; i < nodesList.length; i++) {
    const rawNode = nodesList[i];
    if (!rawNode || typeof rawNode !== "object") {
      continue;
    }

    const id = normalizeValue(rawNode.id) || `node-${i + 1}`;
    const typeRaw = rawNode.type;
    if (!isWorkflowNodeType(typeRaw)) {
      continue;
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

    const workflowNode: WorkflowNode = {
      id,
      type: typeRaw,
      canvasNodeId: id,
      properties,
    };

    workflow.nodes.set(id, workflowNode);
    if (workflow.startNode === null) {
      workflow.startNode = id;
    }
  }

  const nodeIds = new Set<string>(workflow.nodes.keys());

  const addEdge = (from: string, to: string, label?: "true" | "false") => {
    if (!nodeIds.has(from) || !nodeIds.has(to)) {
      throw new Error(`Invalid edge reference: ${from} -> ${to}`);
    }
    const edge: WorkflowEdge = { from, to, label };
    workflow.edges.push(edge);
  };

  // Special value to explicitly terminate workflow (no edge added)
  const isTerminator = (value: string) => value === "end";

  for (let i = 0; i < nodesList.length; i++) {
    const rawNode = nodesList[i];
    if (!rawNode || typeof rawNode !== "object") {
      continue;
    }

    const id = normalizeValue(rawNode.id) || `node-${i + 1}`;
    const typeRaw = rawNode.type;
    if (!isWorkflowNodeType(typeRaw) || !workflow.nodes.has(id)) {
      continue;
    }

    if (typeRaw === "if" || typeRaw === "while") {
      const trueNext = normalizeValue(rawNode.trueNext);
      const falseNext = normalizeValue(rawNode.falseNext);

      if (!trueNext) {
        throw new Error(`Node ${id} (${typeRaw}) missing trueNext`);
      }

      // "end" terminates the workflow (no edge)
      if (!isTerminator(trueNext)) {
        addEdge(id, trueNext, "true");
      }

      if (falseNext) {
        if (!isTerminator(falseNext)) {
          addEdge(id, falseNext, "false");
        }
      } else if (i < nodesList.length - 1) {
        const fallbackId =
          normalizeValue(nodesList[i + 1]?.id) || `node-${i + 2}`;
        if (fallbackId !== id && nodeIds.has(fallbackId)) {
          addEdge(id, fallbackId, "false");
        }
      }
    } else {
      const next = normalizeValue(rawNode.next);
      if (next) {
        // "end" terminates the workflow (no edge)
        if (!isTerminator(next)) {
          addEdge(id, next);
        }
      } else if (i < nodesList.length - 1) {
        const fallbackId =
          normalizeValue(nodesList[i + 1]?.id) || `node-${i + 2}`;
        if (fallbackId !== id && nodeIds.has(fallbackId)) {
          addEdge(id, fallbackId);
        }
      }
    }
  }

  if (!workflow.startNode) {
    throw new Error("Workflow has no nodes");
  }

  return workflow;
}

export function getNextNodes(
  workflow: Workflow,
  currentNodeId: string,
  conditionResult?: boolean
): string[] {
  const nextNodes: string[] = [];
  const currentNode = workflow.nodes.get(currentNodeId);

  if (!currentNode) {
    return nextNodes;
  }

  const outgoingEdges = workflow.edges.filter(
    (edge) => edge.from === currentNodeId
  );

  if (currentNode.type === "if" || currentNode.type === "while") {
    if (conditionResult !== undefined) {
      const expectedLabel = conditionResult ? "true" : "false";
      for (const edge of outgoingEdges) {
        if (edge.label === expectedLabel) {
          nextNodes.push(edge.to);
        }
      }
    }
  } else {
    for (const edge of outgoingEdges) {
      nextNodes.push(edge.to);
    }
  }

  return nextNodes;
}
