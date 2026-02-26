import { App, TFile } from "obsidian";
import { ExecutionRecord, ExecutionStep } from "./types";

interface CanvasNode {
  id: string;
  type: "text" | "file";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide: "top" | "right" | "bottom" | "left";
  toNode: string;
  toSide: "top" | "right" | "bottom" | "left";
  label?: string;
}

interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

const NODE_WIDTH = 400;
const NODE_MIN_HEIGHT = 180;
const NODE_SPACING_Y = 80;
const SOURCE_NODE_WIDTH = 200;
const SOURCE_NODE_HEIGHT = 100;
const CHARS_PER_LINE = 50; // Approximate characters per line
const LINE_HEIGHT = 20; // Approximate pixels per line

function normalizeText(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function buildNodeText(step: ExecutionStep, index: number): string {
  const header = `[${index + 1}] ${step.nodeType} (${step.nodeId})`;
  const status = `status: ${step.status}`;
  const input = step.input
    ? `input: ${normalizeText(step.input)}`
    : "input: (none)";
  const output =
    step.output !== undefined
      ? `output: ${normalizeText(step.output)}`
      : "output: (none)";
  const error = step.error ? `error: ${step.error}` : "";

  let usageLine = "";
  if (step.usage || step.elapsedMs) {
    const parts: string[] = [];
    if (step.elapsedMs !== undefined) {
      parts.push(step.elapsedMs < 1000 ? `${step.elapsedMs}ms` : `${(step.elapsedMs / 1000).toFixed(1)}s`);
    }
    if (step.usage?.inputTokens !== undefined && step.usage?.outputTokens !== undefined) {
      let tokens = `${step.usage.inputTokens} → ${step.usage.outputTokens} tokens`;
      if (step.usage.thinkingTokens) {
        tokens += ` (thinking ${step.usage.thinkingTokens})`;
      }
      parts.push(tokens);
    }
    if (step.usage?.totalCost !== undefined) {
      parts.push(`$${step.usage.totalCost.toFixed(4)}`);
    }
    if (parts.length > 0) {
      usageLine = `usage: ${parts.join(" | ")}`;
    }
  }

  return [header, status, input, output, error, usageLine].filter(Boolean).join("\n");
}

function calculateNodeHeight(text: string): number {
  // Estimate wrapped lines based on character count
  const lines = text.split("\n");
  let totalLines = 0;
  for (const line of lines) {
    totalLines += Math.max(1, Math.ceil(line.length / CHARS_PER_LINE));
  }
  // Add padding
  const estimatedHeight = totalLines * LINE_HEIGHT + 40;
  return Math.max(NODE_MIN_HEIGHT, estimatedHeight);
}

function buildCanvas(
  record: ExecutionRecord,
  includeSourceLink: boolean = true
): CanvasData {
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  // Add source markdown file node if path exists
  const startY = 0;
  if (includeSourceLink && record.workflowPath) {
    const sourceNodeId = "source-file";
    nodes.push({
      id: sourceNodeId,
      type: "file",
      x: -SOURCE_NODE_WIDTH - 100,
      y: 0,
      width: SOURCE_NODE_WIDTH,
      height: SOURCE_NODE_HEIGHT,
      file: record.workflowPath,
    });

    // Add edge from source to first step
    if (record.steps.length > 0) {
      edges.push({
        id: "edge-source",
        fromNode: sourceNodeId,
        fromSide: "right",
        toNode: "step-1",
        toSide: "left",
        label: "source",
      });
    }
  }

  let currentY = startY;
  for (let index = 0; index < record.steps.length; index++) {
    const step = record.steps[index];
    const nodeId = `step-${index + 1}`;
    const nodeText = buildNodeText(step, index);
    const nodeHeight = calculateNodeHeight(nodeText);

    nodes.push({
      id: nodeId,
      type: "text",
      x: 0,
      y: currentY,
      width: NODE_WIDTH,
      height: nodeHeight,
      text: nodeText,
    });

    currentY += nodeHeight + NODE_SPACING_Y;

    if (index < record.steps.length - 1) {
      const nextNodeId = `step-${index + 2}`;
      const label =
        (step.nodeType === "if" || step.nodeType === "while") &&
        typeof step.output === "boolean"
          ? step.output
            ? "true"
            : "false"
          : undefined;

      edges.push({
        id: `edge-${index + 1}`,
        fromNode: nodeId,
        fromSide: "bottom",
        toNode: nextNodeId,
        toSide: "top",
        label,
      });

      if (step.status === "error") {
        break;
      }
    }
  }

  return { nodes, edges };
}

async function ensureHistoryCanvasFolder(
  app: App,
  workspaceFolder: string
): Promise<string> {
  const folderPath = `${workspaceFolder}/workflow-history-canvas`;
  const exists = await app.vault.adapter.exists(folderPath);
  if (!exists) {
    await app.vault.adapter.mkdir(folderPath);
  }
  return folderPath;
}

function canvasFileName(record: ExecutionRecord): string {
  const safeId = record.id.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `history-${safeId}.canvas`;
}

export async function openHistoryCanvas(
  app: App,
  record: ExecutionRecord,
  workspaceFolder: string
): Promise<void> {
  const canvasFolder = await ensureHistoryCanvasFolder(app, workspaceFolder);

  const canvasData = buildCanvas(record, true);
  const filePath = `${canvasFolder}/${canvasFileName(record)}`;
  const content = JSON.stringify(canvasData, null, 2);

  const existing = app.vault.getAbstractFileByPath(filePath);
  let file: TFile;
  if (existing && existing instanceof TFile) {
    await app.vault.modify(existing, content);
    file = existing;
  } else {
    file = await app.vault.create(filePath, content);
  }

  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(file);
}
