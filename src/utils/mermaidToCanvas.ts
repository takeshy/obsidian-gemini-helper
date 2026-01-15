import { App } from "obsidian";

/**
 * Mermaid flowchart to Obsidian Canvas converter
 */

interface CanvasTextNode {
  id: string;
  type: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color?: string;
}

interface CanvasFileNode {
  id: string;
  type: "file";
  x: number;
  y: number;
  width: number;
  height: number;
  file: string;
}

type CanvasNode = CanvasTextNode | CanvasFileNode;

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

interface ParsedNode {
  id: string;
  label: string;
  shape: "rect" | "round" | "diamond" | "circle" | "stadium" | "parallelogram" | "trapezoid" | "hexagon" | "subroutine" | "cylinder" | "asymmetric";
}

interface ParsedEdge {
  from: string;
  to: string;
  label?: string;
  arrowType: "arrow" | "open" | "dotted" | "thick";
}

// Canvas layout constants
const NODE_MIN_WIDTH = 180;
const NODE_MAX_WIDTH = 400;
const NODE_MIN_HEIGHT = 60;
const NODE_SPACING_X = 120;
const NODE_SPACING_Y = 120;
const LINE_HEIGHT = 24;
const CHAR_WIDTH = 10; // Approximate character width in pixels (accounts for various fonts)

// Node shape colors
const SHAPE_COLORS: Record<string, string> = {
  diamond: "3",   // Yellow for decision
  circle: "4",    // Pink for start/end
  stadium: "4",   // Pink for terminals
  hexagon: "5",   // Purple for preparation
  subroutine: "6", // Cyan for subroutine
};

/**
 * Extract Mermaid code block from markdown content
 */
export function extractMermaidFromCodeBlock(content: string): string | null {
  // Match mermaid code block with optional language specifier
  const mermaidRegex = /```mermaid\s*\n([\s\S]*?)```/i;
  const match = content.match(mermaidRegex);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

/**
 * Check if content contains a valid Mermaid flowchart
 */
export function hasMermaidFlowchart(content: string): boolean {
  const mermaid = extractMermaidFromCodeBlock(content);
  if (!mermaid) return false;

  // Check if it starts with flowchart/graph directive
  const flowchartRegex = /^\s*(flowchart|graph)\s+(TB|TD|BT|RL|LR)/i;
  return flowchartRegex.test(mermaid);
}

/**
 * Parse a node definition from Mermaid syntax
 * Examples:
 *   A[Rectangle]
 *   B(Round)
 *   C{Diamond}
 *   D((Circle))
 *   E([Stadium])
 *   F[/Parallelogram/]
 *   G[\Trapezoid/]
 *   H{{Hexagon}}
 *   I[[Subroutine]]
 *   J[(Cylinder)]
 *   K>Asymmetric]
 */
function parseNodeDefinition(text: string): ParsedNode | null {
  // Patterns for different node shapes
  // Using [\w-]+ to support hyphenated node IDs like "init-index"
  const patterns: Array<{ regex: RegExp; shape: ParsedNode["shape"] }> = [
    { regex: /^([\w-]+)\(\((.+)\)\)$/, shape: "circle" },       // ((Circle))
    { regex: /^([\w-]+)\(\[(.+)\]\)$/, shape: "stadium" },      // ([Stadium])
    { regex: /^([\w-]+)\[\[(.+)\]\]$/, shape: "subroutine" },   // [[Subroutine]]
    { regex: /^([\w-]+)\[\((.+)\)\]$/, shape: "cylinder" },     // [(Cylinder)]
    { regex: /^([\w-]+)\{\{(.+)\}\}$/, shape: "hexagon" },      // {{Hexagon}}
    { regex: /^([\w-]+)\{(.+)\}$/, shape: "diamond" },          // {Diamond}
    { regex: /^([\w-]+)\((.+)\)$/, shape: "round" },            // (Round)
    { regex: /^([\w-]+)\[\/(.+)\/\]$/, shape: "parallelogram" }, // [/Parallelogram/]
    { regex: /^([\w-]+)\[\\(.+)\/\]$/, shape: "trapezoid" },    // [\Trapezoid/]
    { regex: /^([\w-]+)>(.+)\]$/, shape: "asymmetric" },        // >Asymmetric]
    { regex: /^([\w-]+)\[(.+)\]$/, shape: "rect" },             // [Rectangle]
  ];

  for (const { regex, shape } of patterns) {
    const match = text.match(regex);
    if (match) {
      return {
        id: match[1],
        label: match[2].trim(),
        shape,
      };
    }
  }

  // Just an ID without shape
  const idOnly = text.match(/^([\w-]+)$/);
  if (idOnly) {
    return {
      id: idOnly[1],
      label: idOnly[1],
      shape: "rect",
    };
  }

  return null;
}

/**
 * Parse edge connections from Mermaid syntax
 * Examples:
 *   A --> B
 *   A --text--> B
 *   A --- B
 *   A -.- B
 *   A -.text.- B
 *   A ==> B
 *   A ==text==> B
 *   A -->|text| B
 */
function parseEdgeConnection(line: string): { fromNode: string; toNode: string; label?: string; remaining: string } | null {
  // Common edge patterns
  // Using [\w-]+ to support hyphenated node IDs like "init-index"
  const edgePatterns = [
    // Arrow with label in |text| format: --> |text|
    /^([\w-]+)\s*-->\s*\|([^|]*)\|\s*/,
    // Dotted arrow with label in |text| format: -.-> |text|
    /^([\w-]+)\s*-\.->\s*\|([^|]*)\|\s*/,
    // Arrow with label in --text--> format
    /^([\w-]+)\s*--([^-]+)-->\s*/,
    // Dotted with label: -.text.->
    /^([\w-]+)\s*-\.([^.]+)\.->\s*/,
    // Thick with label: ==text==>
    /^([\w-]+)\s*==([^=]+)==>\s*/,
    // Simple arrows
    /^([\w-]+)\s*-->\s*/,      // Arrow
    /^([\w-]+)\s*---\s*/,      // Open (no arrow)
    /^([\w-]+)\s*-\.->\s*/,    // Dotted arrow
    /^([\w-]+)\s*-\.-\s*/,     // Dotted open
    /^([\w-]+)\s*==>\s*/,      // Thick arrow
    /^([\w-]+)\s*===\s*/,      // Thick open
  ];

  for (const pattern of edgePatterns) {
    const match = line.match(pattern);
    if (match) {
      const fromNode = match[1];
      const label = match[2]?.trim();
      const remaining = line.slice(match[0].length);

      // Now find the target node
      const targetMatch = remaining.match(/^([\w-]+)(\[.*?\]|\(.*?\)|\{.*?\}|>.*?\])?/);
      if (targetMatch) {
        return {
          fromNode,
          toNode: targetMatch[1],
          label: label || undefined,
          remaining: remaining.slice(targetMatch[0].length).trim(),
        };
      }
    }
  }

  return null;
}

/**
 * Parse Mermaid flowchart content
 */
function parseMermaidFlowchart(mermaidContent: string): { nodes: Map<string, ParsedNode>; edges: ParsedEdge[]; direction: string } {
  const lines = mermaidContent.split("\n");
  const nodes = new Map<string, ParsedNode>();
  const edges: ParsedEdge[] = [];
  let direction = "TB"; // Default: Top to Bottom

  for (let lineContent of lines) {
    // Remove comments
    const commentIndex = lineContent.indexOf("%%");
    if (commentIndex !== -1) {
      lineContent = lineContent.slice(0, commentIndex);
    }

    const line = lineContent.trim();
    if (!line) continue;

    // Check for direction directive
    const directionMatch = line.match(/^\s*(flowchart|graph)\s+(TB|TD|BT|RL|LR)/i);
    if (directionMatch) {
      direction = directionMatch[2].toUpperCase();
      if (direction === "TD") direction = "TB"; // TD is alias for TB
      continue;
    }

    // Skip subgraph, end, style, class directives
    if (/^\s*(subgraph|end|style|class|classDef|linkStyle|click)/i.test(line)) {
      continue;
    }

    // Process the line for connections and node definitions
    // A line can have multiple connections: A --> B --> C
    let workingLine = line;

    while (workingLine.length > 0) {
      // Try to parse an edge connection
      const edgeResult = parseEdgeConnection(workingLine);

      if (edgeResult) {
        // Found a connection
        const { fromNode, toNode, label, remaining } = edgeResult;

        // Add source node if not exists
        if (!nodes.has(fromNode)) {
          // Check if there's a node definition inline (handling all bracket types)
          const shapePattern = `(\\(\\[.*?\\]\\)|\\[\\[.*?\\]\\]|\\[\\(.*?\\)\\]|\\{\\{.*?\\}\\}|\\(\\(.*?\\)\\)|\\[\\/.*?\\/\\]|\\[\\\\.*?\\/\\]|>.*?\\]|\\{.*?\\}|\\(.*?\\)|\\[.*?\\])`;
          const nodeDefMatch = workingLine.match(new RegExp(`^${fromNode}${shapePattern}?`));
          if (nodeDefMatch && nodeDefMatch[1]) {
            const parsed = parseNodeDefinition(nodeDefMatch[0]);
            if (parsed) {
              nodes.set(fromNode, parsed);
            } else {
              nodes.set(fromNode, { id: fromNode, label: fromNode, shape: "rect" });
            }
          } else {
            nodes.set(fromNode, { id: fromNode, label: fromNode, shape: "rect" });
          }
        }

        // Check if target has inline definition (handling all bracket types)
        const targetWithDef = remaining.match(/^(\(\[.*?\]\)|\[\[.*?\]\]|\[\(.*?\)\]|\{\{.*?\}\}|\(\(.*?\)\)|>.*?\]|\{.*?\}|\(.*?\)|\[.*?\])/);
        if (targetWithDef) {
          const parsed = parseNodeDefinition(toNode + targetWithDef[1]);
          if (parsed) {
            nodes.set(toNode, parsed);
          }
        } else if (!nodes.has(toNode)) {
          nodes.set(toNode, { id: toNode, label: toNode, shape: "rect" });
        }

        edges.push({
          from: fromNode,
          to: toNode,
          label,
          arrowType: "arrow",
        });

        // Continue with remaining content
        workingLine = remaining;

        // Check for chained arrows (e.g., --> C)
        if (remaining.startsWith("-->") || remaining.startsWith("---")) {
          // Reprocess with toNode as the new fromNode
          workingLine = toNode + remaining;
        } else {
          workingLine = remaining;
        }
      } else {
        // No edge found, try to parse as standalone node definition
        // Match ID followed by optional shape brackets (handling nested brackets properly)
        const nodeDefMatch = workingLine.match(/^([\w-]+)(\(\[.*?\]\)|\[\[.*?\]\]|\[\(.*?\)\]|\{\{.*?\}\}|\(\(.*?\)\)|\[\/.*?\/\]|\[\\.*?\/\]|>.*?\]|\{.*?\}|\(.*?\)|\[.*?\])?/);
        if (nodeDefMatch) {
          const nodeDef = parseNodeDefinition(nodeDefMatch[0]);
          if (nodeDef) {
            nodes.set(nodeDef.id, nodeDef);
          }
        }
        break;
      }
    }
  }

  return { nodes, edges, direction };
}

/**
 * Calculate node dimensions based on text content
 */
function calculateNodeDimensions(text: string): { width: number; height: number } {
  const lines = text.split("\n");

  // Find the longest line to determine width
  let maxLineLength = 0;
  for (const line of lines) {
    // Remove markdown formatting for length calculation
    const plainLine = line.replace(/\*\*/g, "").replace(/<br\/?>/g, "");
    maxLineLength = Math.max(maxLineLength, plainLine.length);
  }

  // Calculate width based on longest line (with padding)
  const PADDING = 60; // Horizontal padding for text
  const calculatedWidth = maxLineLength * CHAR_WIDTH + PADDING;
  const width = Math.min(NODE_MAX_WIDTH, Math.max(NODE_MIN_WIDTH, calculatedWidth));

  // Calculate how many visual lines we need based on the width
  const charsPerLine = Math.floor((width - PADDING) / CHAR_WIDTH);
  let totalLines = 0;
  for (const line of lines) {
    const plainLine = line.replace(/\*\*/g, "").replace(/<br\/?>/g, "");
    totalLines += Math.max(1, Math.ceil(plainLine.length / charsPerLine));
  }

  const height = Math.max(NODE_MIN_HEIGHT, totalLines * LINE_HEIGHT + 30);

  return { width, height };
}

/**
 * Layout nodes using a layered approach (Sugiyama-style simplified)
 * Returns positions and accumulated Y offsets for variable height nodes
 */
function layoutNodes(
  nodes: Map<string, ParsedNode>,
  edges: ParsedEdge[],
  direction: string,
  nodeDimensions: Map<string, { width: number; height: number }>
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  if (nodes.size === 0) return positions;

  // Build adjacency list
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  for (const node of nodes.keys()) {
    outgoing.set(node, []);
    incoming.set(node, []);
  }

  for (const edge of edges) {
    outgoing.get(edge.from)?.push(edge.to);
    incoming.get(edge.to)?.push(edge.from);
  }

  // Find root nodes (no incoming edges)
  const roots = [...nodes.keys()].filter(id => incoming.get(id)?.length === 0);
  if (roots.length === 0) {
    // Cycle detected, pick first node
    roots.push([...nodes.keys()][0]);
  }

  // Assign layers using BFS
  const layers = new Map<string, number>();
  const queue: string[] = [...roots];
  const visited = new Set<string>();

  for (const root of roots) {
    layers.set(root, 0);
    visited.add(root);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLayer = layers.get(current) || 0;

    for (const next of outgoing.get(current) || []) {
      if (!visited.has(next)) {
        visited.add(next);
        layers.set(next, currentLayer + 1);
        queue.push(next);
      }
    }
  }

  // Handle unvisited nodes (disconnected)
  for (const node of nodes.keys()) {
    if (!layers.has(node)) {
      layers.set(node, 0);
    }
  }

  // Group nodes by layer
  const layerGroups = new Map<number, string[]>();
  for (const [nodeId, layer] of layers) {
    if (!layerGroups.has(layer)) {
      layerGroups.set(layer, []);
    }
    layerGroups.get(layer)!.push(nodeId);
  }

  // Calculate max height per layer for proper vertical spacing
  const layerMaxHeight = new Map<number, number>();
  for (const [layer, nodeIds] of layerGroups) {
    let maxHeight = NODE_MIN_HEIGHT;
    for (const nodeId of nodeIds) {
      const dims = nodeDimensions.get(nodeId);
      if (dims) {
        maxHeight = Math.max(maxHeight, dims.height);
      }
    }
    layerMaxHeight.set(layer, maxHeight);
  }

  // Calculate positions based on direction
  const isVertical = direction === "TB" || direction === "BT";
  const isReversed = direction === "BT" || direction === "RL";

  // Calculate cumulative Y positions based on variable heights
  const layerYPositions = new Map<number, number>();
  let cumulativeY = 0;
  const sortedLayers = [...layerGroups.keys()].sort((a, b) => a - b);

  for (const layer of sortedLayers) {
    layerYPositions.set(layer, cumulativeY);
    const maxHeight = layerMaxHeight.get(layer) || NODE_MIN_HEIGHT;
    cumulativeY += maxHeight + NODE_SPACING_Y;
  }

  for (const [layer, nodeIds] of layerGroups) {
    const yPos = layerYPositions.get(layer) || 0;
    const adjustedY = isReversed ? -yPos : yPos;

    for (let i = 0; i < nodeIds.length; i++) {
      const nodeId = nodeIds[i];

      // Center nodes within layer, using max width for spacing
      const offset = (i - (nodeIds.length - 1) / 2) * (NODE_MAX_WIDTH + NODE_SPACING_X);

      if (isVertical) {
        positions.set(nodeId, {
          x: offset,
          y: adjustedY,
        });
      } else {
        positions.set(nodeId, {
          x: adjustedY,
          y: offset,
        });
      }
    }
  }

  return positions;
}

/**
 * Detect back-edges (loops) - edges where target is above source
 */
function detectBackEdges(
  edges: ParsedEdge[],
  positions: Map<string, { x: number; y: number }>,
  direction: string
): Set<number> {
  const backEdgeIndices = new Set<number>();
  const isVertical = direction === "TB" || direction === "BT";

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const fromPos = positions.get(edge.from);
    const toPos = positions.get(edge.to);

    if (fromPos && toPos) {
      if (isVertical) {
        // Back-edge if target is above source (going up)
        if (toPos.y < fromPos.y) {
          backEdgeIndices.add(i);
        }
      } else {
        // Back-edge if target is to the left of source
        if (toPos.x < fromPos.x) {
          backEdgeIndices.add(i);
        }
      }
    }
  }

  return backEdgeIndices;
}

/**
 * Convert parsed Mermaid to Canvas data
 * Handles loop back-edges by routing them through waypoint nodes on the left
 */
function mermaidToCanvasData(mermaidContent: string): CanvasData {
  const { nodes, edges, direction } = parseMermaidFlowchart(mermaidContent);

  // Pre-calculate dimensions for all nodes
  const nodeDimensions = new Map<string, { width: number; height: number }>();
  for (const [nodeId, node] of nodes) {
    nodeDimensions.set(nodeId, calculateNodeDimensions(node.label));
  }

  const positions = layoutNodes(nodes, edges, direction, nodeDimensions);

  const isVertical = direction === "TB" || direction === "BT";

  const canvasNodes: CanvasNode[] = [];
  const canvasEdges: CanvasEdge[] = [];

  // Detect back-edges for loop handling
  const backEdgeIndices = detectBackEdges(edges, positions, direction);

  // Calculate left margin for loop waypoints
  let minX = Infinity;
  for (const [nodeId, pos] of positions) {
    const dims = nodeDimensions.get(nodeId);
    const width = dims?.width || NODE_MIN_WIDTH;
    minX = Math.min(minX, pos.x - width / 2);
  }
  const loopWaypointX = minX - 100 - NODE_SPACING_X;

  // Create canvas nodes
  for (const [nodeId, node] of nodes) {
    const pos = positions.get(nodeId) || { x: 0, y: 0 };
    const dims = nodeDimensions.get(nodeId) || { width: NODE_MIN_WIDTH, height: NODE_MIN_HEIGHT };

    const canvasNode: CanvasNode = {
      id: `node-${nodeId}`,
      type: "text",
      x: pos.x - dims.width / 2, // Center node on position
      y: pos.y,
      width: dims.width,
      height: dims.height,
      text: node.label,
    };

    // Add color based on shape
    const color = SHAPE_COLORS[node.shape];
    if (color) {
      canvasNode.color = color;
    }

    canvasNodes.push(canvasNode);
  }

  // Create canvas edges, handling back-edges specially
  let waypointCounter = 0;

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const isBackEdge = backEdgeIndices.has(i);

    const fromPos = positions.get(edge.from);
    const toPos = positions.get(edge.to);

    if (isBackEdge && fromPos && toPos && isVertical) {
      // Create single "Loop" waypoint node for back-edge routing
      const waypointId = `loop-${waypointCounter++}`;

      // Position waypoint at the midpoint height, on the left
      const midY = (fromPos.y + toPos.y) / 2;
      canvasNodes.push({
        id: waypointId,
        type: "text",
        x: loopWaypointX,
        y: midY,
        width: 80,
        height: 50,
        text: "**Loop**",
        color: "3", // Yellow for loop indicator
      });

      // Edge 1: Source -> Loop waypoint (from left side, no label - waypoint shows "Loop")
      canvasEdges.push({
        id: `edge-${i}-a`,
        fromNode: `node-${edge.from}`,
        fromSide: "left",
        toNode: waypointId,
        toSide: "bottom",
      });

      // Edge 2: Loop waypoint -> Target (into left side)
      canvasEdges.push({
        id: `edge-${i}-b`,
        fromNode: waypointId,
        fromSide: "top",
        toNode: `node-${edge.to}`,
        toSide: "left",
      });
    } else {
      // Normal edge
      let fromSide: CanvasEdge["fromSide"] = isVertical ? "bottom" : "right";
      let toSide: CanvasEdge["toSide"] = isVertical ? "top" : "left";

      if (fromPos && toPos) {
        if (isVertical) {
          if (toPos.y < fromPos.y) {
            fromSide = "top";
            toSide = "bottom";
          }
        } else {
          if (toPos.x < fromPos.x) {
            fromSide = "left";
            toSide = "right";
          }
        }
      }

      canvasEdges.push({
        id: `edge-${i}`,
        fromNode: `node-${edge.from}`,
        fromSide,
        toNode: `node-${edge.to}`,
        toSide,
        label: edge.label,
      });
    }
  }

  return { nodes: canvasNodes, edges: canvasEdges };
}

/**
 * Create or update canvas file and open it
 */
export async function openMermaidAsCanvas(
  app: App,
  mermaidContent: string,
  workspaceFolder: string,
  baseName?: string,
  sourceFilePath?: string
): Promise<void> {
  // Ensure folder exists
  const folderPath = `${workspaceFolder}/diagrams`;
  const exists = await app.vault.adapter.exists(folderPath);
  if (!exists) {
    await app.vault.adapter.mkdir(folderPath);
  }

  // Generate canvas data
  const canvasData = mermaidToCanvasData(mermaidContent);

  // Add source file link node if provided
  if (sourceFilePath) {
    // Find the leftmost and topmost position to place the link node above the diagram
    let minY = 0;
    let centerX = 0;
    if (canvasData.nodes.length > 0) {
      minY = Math.min(...canvasData.nodes.map(n => n.y));
      const minX = Math.min(...canvasData.nodes.map(n => n.x));
      const maxX = Math.max(...canvasData.nodes.map(n => n.x + n.width));
      centerX = (minX + maxX) / 2 - 150; // Center the link node
    }

    const sourceNode: CanvasFileNode = {
      id: "source-file",
      type: "file",
      x: centerX,
      y: minY - 100,
      width: 300,
      height: 60,
      file: sourceFilePath,
    };
    canvasData.nodes.unshift(sourceNode);
  }

  // Generate filename
  const timestamp = Date.now();
  const safeName = baseName
    ? baseName.replace(/[^a-zA-Z0-9\u3040-\u30ff\u4e00-\u9faf_-]/g, "").slice(0, 30)
    : "diagram";
  const fileName = `${safeName}-${timestamp}.canvas`;
  const filePath = `${folderPath}/${fileName}`;

  // Create canvas file
  const content = JSON.stringify(canvasData, null, 2);
  const file = await app.vault.create(filePath, content);

  // Open in workspace
  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(file);
}

/**
 * Convert Mermaid from message content and open as canvas
 */
export async function convertMessageMermaidToCanvas(
  app: App,
  messageContent: string,
  workspaceFolder: string,
  baseName?: string
): Promise<boolean> {
  const mermaid = extractMermaidFromCodeBlock(messageContent);
  if (!mermaid) {
    return false;
  }

  // Verify it's a flowchart
  if (!hasMermaidFlowchart(messageContent)) {
    return false;
  }

  await openMermaidAsCanvas(app, mermaid, workspaceFolder, baseName);
  return true;
}
