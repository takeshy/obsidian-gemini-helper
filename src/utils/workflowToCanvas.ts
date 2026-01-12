import { App } from "obsidian";
import { SidebarNode } from "src/workflow/types";
import { openMermaidAsCanvas } from "./mermaidToCanvas";

/**
 * Workflow to Mermaid flowchart converter
 * Converts workflow nodes to Mermaid format, then to Canvas
 *
 * Mermaid shapes:
 * - Rectangle [text] - normal process
 * - Diamond {text} - decision (if/while)
 * - Stadium ([text]) - start/end
 * - Round (text) - general
 */

/**
 * Escape text for Mermaid labels (handle quotes and special chars)
 */
function escapeLabel(text: string): string {
  return text
    .replace(/"/g, "'")
    .replace(/\n/g, "<br/>")
    .replace(/[[\]{}()]/g, "");
}

/**
 * Get full label for a workflow node (no truncation)
 */
function getNodeLabel(node: SidebarNode): string {
  const id = node.id;

  switch (node.type) {
    case "variable":
    case "set":
      return `**${id}**\n${node.properties.name} = ${node.properties.value}`;
    case "if":
    case "while":
      return node.properties.condition || "condition";
    case "command": {
      const prompt = node.properties.prompt || "(no prompt)";
      const model = node.properties.model ? `\nModel: ${node.properties.model}` : "";
      const saveTo = node.properties.saveTo ? `\n→ ${node.properties.saveTo}` : "";
      return `**${id}**\n${prompt}${model}${saveTo}`;
    }
    case "note":
      return `**${id}**\nWrite: ${node.properties.path}\nMode: ${node.properties.mode || "overwrite"}`;
    case "note-read":
      return `**${id}**\nRead: ${node.properties.path}\n→ ${node.properties.saveTo}`;
    case "note-search":
      return `**${id}**\nSearch: ${node.properties.query}\n→ ${node.properties.saveTo}`;
    case "note-list":
      return `**${id}**\nList: ${node.properties.folder || "/"}\n→ ${node.properties.saveTo}`;
    case "folder-list":
      return `**${id}**\nFolders: ${node.properties.folder || "/"}\n→ ${node.properties.saveTo}`;
    case "dialog": {
      const title = node.properties.title || "";
      const msg = node.properties.message || "";
      return `**${id}**\n${title}\n${msg}`.trim();
    }
    case "workflow":
      return `**${id}**\nSub-workflow: ${node.properties.path || ""}`;
    case "open":
      return `**${id}**\nOpen: ${node.properties.path}`;
    case "http":
      return `**${id}**\n${node.properties.method || "GET"} ${node.properties.url}\n→ ${node.properties.saveTo}`;
    case "json":
      return `**${id}**\nJSON: ${node.properties.source}\n→ ${node.properties.saveTo}`;
    case "prompt-file":
      return `**${id}**\nSelect File\n→ ${node.properties.saveTo}`;
    case "prompt-selection":
      return `**${id}**\nSelect Text\n→ ${node.properties.saveTo}`;
    case "file-explorer":
      return `**${id}**\nFile Explorer\n→ ${node.properties.saveTo}`;
    case "file-save":
      return `**${id}**\nSave: ${node.properties.source}\n→ ${node.properties.path}`;
    case "rag-sync":
      return `**${id}**\nRAG Sync: ${node.properties.path}\n→ ${node.properties.ragSetting}`;
    case "mcp":
      return `**${id}**\nMCP: ${node.properties.tool}\nURL: ${node.properties.url}`;
    case "obsidian-command":
      return `**${id}**\nCommand: ${node.properties.command}`;
    default:
      return `**${id}**\n${node.type}`;
  }
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
      return `${safeId}[/"${safeLabel}"/]`; // parallelogram for data
    case "command":
      return `${safeId}[["${safeLabel}"]]`; // subroutine for AI
    case "dialog":
    case "prompt-file":
    case "prompt-selection":
    case "file-explorer":
      return `${safeId}(["${safeLabel}"])`; // stadium for I/O
    default:
      return `${safeId}["${safeLabel}"]`; // rectangle for process
  }
}

/**
 * Convert workflow nodes to Mermaid flowchart syntax
 */
export function workflowToMermaid(nodes: SidebarNode[]): string {
  if (nodes.length === 0) {
    return "flowchart TD\n  empty[No nodes]";
  }

  const lines: string[] = ["flowchart TD"];
  const nodeMap = new Map<string, SidebarNode>();
  const nodeIndex = new Map<string, number>();

  // Build node map
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    nodeMap.set(node.id, node);
    nodeIndex.set(node.id, i);
  }

  // Track which nodes have been defined
  const definedNodes = new Set<string>();

  // Find while nodes for loop detection
  const whileNodeIds = new Set<string>();
  for (const node of nodes) {
    if (node.type === "while") {
      whileNodeIds.add(node.id);
    }
  }

  // Find back-edges (only loops back to while nodes are valid)
  const backEdges = new Set<string>(); // "fromId->toId"

  // First pass: collect edge information and detect loops
  const hasOutgoing = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const nextNode = i < nodes.length - 1 ? nodes[i + 1] : null;

    if (node.type === "if" || node.type === "while") {
      if (node.trueNext && nodeMap.has(node.trueNext)) {
        hasOutgoing.add(node.id);
      } else if (nextNode) {
        hasOutgoing.add(node.id);
      }
      if (node.falseNext && nodeMap.has(node.falseNext)) {
        hasOutgoing.add(node.id);
      }
    } else if (node.next && nodeMap.has(node.next)) {
      hasOutgoing.add(node.id);
      // Only while nodes can be loop targets
      if (whileNodeIds.has(node.next)) {
        backEdges.add(`${node.id}->${node.next}`);
      }
    } else if (nextNode) {
      hasOutgoing.add(node.id);
    }
  }

  // Find terminal nodes
  const terminalNodes = new Set<string>();
  for (const node of nodes) {
    if (!hasOutgoing.has(node.id)) {
      terminalNodes.add(node.id);
    }
  }

  // Helper to define a node
  const defineNode = (nodeId: string) => {
    if (definedNodes.has(nodeId)) return;
    const node = nodeMap.get(nodeId);
    if (!node) return;
    const label = getNodeLabel(node);
    lines.push(`  ${getMermaidShape(node, label)}`);
    definedNodes.add(nodeId);
  };

  // Generate node definitions and edges
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const nodeId = node.id.replace(/-/g, "_");
    const nextNode = i < nodes.length - 1 ? nodes[i + 1] : null;

    // Define this node
    defineNode(node.id);

    // Generate edges
    if (node.type === "if" || node.type === "while") {
      // Decision node
      const trueTarget = node.trueNext && nodeMap.has(node.trueNext)
        ? node.trueNext
        : nextNode?.id;
      const falseTarget = node.falseNext && nodeMap.has(node.falseNext)
        ? node.falseNext
        : null;

      if (trueTarget) {
        defineNode(trueTarget);
        const targetId = trueTarget.replace(/-/g, "_");

        if (node.type === "while") {
          // For while: Yes continues loop body
          lines.push(`  ${nodeId} -->|"Yes ↓"| ${targetId}`);
        } else {
          lines.push(`  ${nodeId} -->|"Yes"| ${targetId}`);
        }
      }

      if (falseTarget) {
        defineNode(falseTarget);
        const targetId = falseTarget.replace(/-/g, "_");

        if (node.type === "while") {
          // For while: No exits loop
          lines.push(`  ${nodeId} -->|"No →"| ${targetId}`);
        } else {
          lines.push(`  ${nodeId} -->|"No"| ${targetId}`);
        }
      }
    } else {
      // Normal node
      const nextTarget = node.next && nodeMap.has(node.next)
        ? node.next
        : nextNode?.id;

      if (nextTarget) {
        defineNode(nextTarget);
        const targetId = nextTarget.replace(/-/g, "_");

        // Check if this is a loop-back edge (next pointing to earlier node)
        const isBackEdge = backEdges.has(`${node.id}->${nextTarget}`);

        if (isBackEdge) {
          // Loop back - use dotted arrow with "Loop" label
          lines.push(`  ${nodeId} -.->|"Loop"| ${targetId}`);
        } else {
          lines.push(`  ${nodeId} --> ${targetId}`);
        }
      }
    }
  }

  // Connect terminal nodes to END
  let hasTerminal = false;
  for (const termId of terminalNodes) {
    const nodeId = termId.replace(/-/g, "_");
    lines.push(`  ${nodeId} --> END`);
    hasTerminal = true;
  }

  // Define END node only if there are terminal nodes
  if (hasTerminal) {
    lines.push(`  END(["■ END"])`);
    lines.push("");
    lines.push("  %% Styling");
    lines.push("  style END fill:#FFB6C1,stroke:#DC143C,color:#000");
  }

  return lines.join("\n");
}

/**
 * Create canvas file from workflow via Mermaid conversion and open it
 */
export async function openWorkflowAsCanvas(
  app: App,
  nodes: SidebarNode[],
  workspaceFolder: string,
  workflowName?: string
): Promise<void> {
  // Convert workflow to Mermaid
  const mermaid = workflowToMermaid(nodes);

  // Use existing Mermaid to Canvas converter
  await openMermaidAsCanvas(app, mermaid, workspaceFolder, workflowName);
}
