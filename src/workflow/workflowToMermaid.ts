// Workflow to Mermaid flowchart converter

import type { SidebarNode } from "./types";

/**
 * Escape text for Mermaid labels (handle quotes and special chars)
 */
function escapeLabel(text: string): string {
  return text
    .replace(/"/g, "'")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\n/g, "<br/>")
    .replace(/[[\]{}()]/g, "");
}

/**
 * Get full label for a sidebar node
 */
function getNodeLabel(node: SidebarNode): string {
  const id = node.id;
  const p = node.properties;

  let label: string;
  switch (node.type) {
    case "variable":
    case "set":
      label = `**${id}**\n${p.name || ""} = ${p.value || ""}`;
      break;
    case "if":
    case "while":
      label = p.condition || "condition";
      break;
    case "command": {
      const prompt = p.prompt || "(no prompt)";
      const saveTo = p.saveTo ? `\n→ ${p.saveTo}` : "";
      label = `**${id}**\n${prompt}${saveTo}`;
      break;
    }
    case "note":
      label = `**${id}**\nWrite: ${p.path || ""}\nMode: ${p.mode || "overwrite"}`;
      break;
    case "note-read":
      label = `**${id}**\nRead: ${p.path || ""}\n→ ${p.saveTo || ""}`;
      break;
    case "note-search":
      label = `**${id}**\nSearch: ${p.query || ""}\n→ ${p.saveTo || ""}`;
      break;
    case "note-list":
      label = `**${id}**\nList: ${p.folder || "/"}\n→ ${p.saveTo || ""}`;
      break;
    case "folder-list":
      label = `**${id}**\nFolders: ${p.folder || "/"}\n→ ${p.saveTo || ""}`;
      break;
    case "open":
      label = `**${id}**\nOpen: ${p.path || ""}`;
      break;
    case "dialog": {
      const title = p.title || "";
      const msg = p.message || "";
      label = `**${id}**\n${title}\n${msg}`.trim();
      break;
    }
    case "prompt-file":
      label = `**${id}**\nFile: ${p.title || ""}\n→ ${p.saveTo || ""}`;
      break;
    case "prompt-selection":
      label = `**${id}**\nSelection: ${p.title || ""}\n→ ${p.saveTo || ""}`;
      break;
    case "file-explorer":
      label = `**${id}**\nExplorer: ${p.title || ""}\n→ ${p.saveTo || ""}`;
      break;
    case "file-save":
      label = `**${id}**\nSave: ${p.source || ""}\n→ ${p.path || ""}`;
      break;
    case "workflow":
      label = `**${id}**\nSub-workflow: ${p.path || ""}`;
      break;
    case "http":
      label = `**${id}**\n${p.method || "GET"} ${p.url || ""}\n→ ${p.saveTo || ""}`;
      break;
    case "json":
      label = `**${id}**\nJSON: ${p.source || ""}\n→ ${p.saveTo || ""}`;
      break;
    case "rag-sync":
      label = `**${id}**\nRAG: ${p.path || ""}\n→ ${p.ragSetting || ""}`;
      break;
    case "mcp":
      label = `**${id}**\nMCP: ${p.command || ""}\n→ ${p.saveTo || ""}`;
      break;
    case "obsidian-command":
      label = `**${id}**\nCmd: ${p.command || ""}\n${p.path || ""}`;
      break;
    case "sleep":
      label = `**${id}**\nSleep ${p.duration || ""}ms`;
      break;
    case "script": {
      const scriptCode = (p.code || "").split("\n")[0];
      label = `**${id}**\nJS: ${scriptCode}\n→ ${p.saveTo || ""}`;
      break;
    }
    default:
      label = `**${id}**\n${String(node.type)}`;
  }

  // Append comment if present
  if (p.comment) {
    label += `\n💬 ${p.comment}`;
  }

  return label;
}

/**
 * Get Mermaid shape for node type
 */
function getMermaidShape(node: SidebarNode, label: string): string {
  const safeId = node.id.replace(/-/g, "_");
  const safeLabel = escapeLabel(label);

  switch (node.type) {
    case "if":
      return `${safeId}{"◇ IF<br/>${safeLabel}"}`;
    case "while":
      return `${safeId}{"◇ WHILE<br/>${safeLabel}"}`;
    case "variable":
    case "set":
      return `${safeId}[/"${safeLabel}"/]`;
    case "command":
      return `${safeId}[["${safeLabel}"]]`;
    case "dialog":
    case "prompt-file":
    case "prompt-selection":
    case "file-explorer":
      return `${safeId}(["${safeLabel}"])`;
    default:
      return `${safeId}["${safeLabel}"]`;
  }
}

/**
 * Convert SidebarNode array to Mermaid flowchart syntax
 */
export function sidebarNodesToMermaid(nodes: SidebarNode[]): string {
  if (nodes.length === 0) {
    return "flowchart TD\n  empty[No nodes]";
  }

  const lines: string[] = ["flowchart TD"];
  const definedNodes = new Set<string>();

  // Build node order map for back-edge detection
  const nodeOrder = new Map<string, number>();
  const whileNodeIds = new Set<string>();
  nodes.forEach((node, idx) => {
    nodeOrder.set(node.id, idx);
    if (node.type === "while") whileNodeIds.add(node.id);
  });

  // Build edges from SidebarNode connections
  interface Edge { from: string; to: string; label?: string }
  const edges: Edge[] = [];
  const nodeIdSet = new Set(nodes.map(n => n.id));

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type === "if" || node.type === "while") {
      if (node.trueNext && (nodeIdSet.has(node.trueNext) || node.trueNext === "end")) {
        edges.push({ from: node.id, to: node.trueNext, label: "true" });
      }
      if (node.falseNext && (nodeIdSet.has(node.falseNext) || node.falseNext === "end")) {
        edges.push({ from: node.id, to: node.falseNext, label: "false" });
      } else if (!node.falseNext && i < nodes.length - 1) {
        edges.push({ from: node.id, to: nodes[i + 1].id, label: "false" });
      }
    } else {
      if (node.next && (nodeIdSet.has(node.next) || node.next === "end")) {
        edges.push({ from: node.id, to: node.next });
      } else if (!node.next && i < nodes.length - 1) {
        edges.push({ from: node.id, to: nodes[i + 1].id });
      }
    }
  }

  // Detect back-edges
  const backEdges = new Set<string>();
  for (const edge of edges) {
    const fromIdx = nodeOrder.get(edge.from);
    const toIdx = nodeOrder.get(edge.to);
    if (fromIdx !== undefined && toIdx !== undefined && toIdx <= fromIdx) {
      if (whileNodeIds.has(edge.to)) {
        backEdges.add(`${edge.from}->${edge.to}`);
      }
    }
  }

  // Find terminal nodes (no outgoing edges)
  const hasOutgoing = new Set<string>();
  for (const edge of edges) {
    hasOutgoing.add(edge.from);
  }

  // Build outgoing edge map
  const outgoing = new Map<string, Edge[]>();
  for (const edge of edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from)!.push(edge);
  }

  // Helper to define a node once
  const defineNode = (nodeId: string) => {
    if (definedNodes.has(nodeId)) return;
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const label = getNodeLabel(node);
    lines.push(`  ${getMermaidShape(node, label)}`);
    definedNodes.add(nodeId);
  };

  // Connect terminal nodes to END
  let hasTerminal = false;

  // Generate node definitions and edges
  for (const node of nodes) {
    const safeId = node.id.replace(/-/g, "_");
    defineNode(node.id);

    const nodeEdges = outgoing.get(node.id) || [];

    if (node.type === "if" || node.type === "while") {
      for (const edge of nodeEdges) {
        if (edge.to === "end") {
          // "end" is a Mermaid reserved word — route to END terminal node
          if (edge.label === "true") {
            const lbl = node.type === "while" ? "Yes ↓" : "Yes";
            lines.push(`  ${safeId} -->|"${lbl}"| FINISH`);
          } else if (edge.label === "false") {
            const lbl = node.type === "while" ? "No →" : "No";
            lines.push(`  ${safeId} -->|"${lbl}"| FINISH`);
          } else {
            lines.push(`  ${safeId} --> FINISH`);
          }
          hasTerminal = true;
          continue;
        }
        defineNode(edge.to);
        const targetId = edge.to.replace(/-/g, "_");
        if (edge.label === "true") {
          const lbl = node.type === "while" ? "Yes ↓" : "Yes";
          lines.push(`  ${safeId} -->|"${lbl}"| ${targetId}`);
        } else if (edge.label === "false") {
          const lbl = node.type === "while" ? "No →" : "No";
          lines.push(`  ${safeId} -->|"${lbl}"| ${targetId}`);
        } else {
          lines.push(`  ${safeId} --> ${targetId}`);
        }
      }
    } else {
      for (const edge of nodeEdges) {
        if (edge.to === "end") {
          // "end" is a Mermaid reserved word — route to END terminal node
          lines.push(`  ${safeId} --> FINISH`);
          hasTerminal = true;
          continue;
        }
        defineNode(edge.to);
        const targetId = edge.to.replace(/-/g, "_");
        const isBackEdge = backEdges.has(`${node.id}->${edge.to}`);
        if (isBackEdge) {
          lines.push(`  ${safeId} -.->|"Loop"| ${targetId}`);
        } else {
          lines.push(`  ${safeId} --> ${targetId}`);
        }
      }
    }
  }

  for (const node of nodes) {
    if (!hasOutgoing.has(node.id)) {
      const safeId = node.id.replace(/-/g, "_");
      lines.push(`  ${safeId} --> FINISH`);
      hasTerminal = true;
    }
  }

  if (hasTerminal) {
    lines.push(`  FINISH(["■ END"])`);
    lines.push("");
    lines.push("  %% Styling");
    lines.push("  style FINISH fill:#FFB6C1,stroke:#DC143C,color:#000");
  }

  return lines.join("\n");
}
