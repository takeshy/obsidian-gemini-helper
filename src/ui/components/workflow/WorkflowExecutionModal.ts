import { App, Modal } from "obsidian";
import type { Workflow, WorkflowNode, ExecutionLog } from "src/workflow/types";
import { t } from "src/i18n";

type NodeStatus = "pending" | "running" | "completed" | "error";

interface NodeDisplayInfo {
  id: string;
  type: string;
  label: string;
  status: NodeStatus;
  next: string[];
  trueNext?: string;
  falseNext?: string;
}

interface NodeLogData {
  input?: Record<string, unknown>;
  output?: unknown;
  message?: string;
  timestamp?: Date;
}

/**
 * Modal that displays workflow execution progress with a flow diagram
 */
export class WorkflowExecutionModal extends Modal {
  private workflow: Workflow;
  private workflowName: string;
  private nodeStatuses: Map<string, NodeStatus> = new Map();
  private nodeLogs: Map<string, NodeLogData> = new Map();
  private nodeElements: Map<string, HTMLElement> = new Map();
  private expandedNodes: Set<string> = new Set();
  private abortController: AbortController;
  private onAbort: () => void;
  private flowContainer: HTMLElement | null = null;
  private currentNodeId: string | null = null;
  private stopBtn: HTMLButtonElement | null = null;

  constructor(
    app: App,
    workflow: Workflow,
    workflowName: string,
    abortController: AbortController,
    onAbort: () => void
  ) {
    super(app);
    this.workflow = workflow;
    this.workflowName = workflowName;
    this.abortController = abortController;
    this.onAbort = onAbort;

    // Initialize all nodes as pending
    for (const [nodeId] of workflow.nodes) {
      this.nodeStatuses.set(nodeId, "pending");
    }
  }

  onOpen(): void {
    const { contentEl, modalEl, containerEl } = this;
    contentEl.empty();
    contentEl.addClass("workflow-execution-modal-content");
    modalEl.addClass("workflow-execution-modal");

    // Prevent closing on outside click during execution
    containerEl.addEventListener("click", (e) => {
      if (e.target === containerEl) {
        e.stopPropagation();
        e.preventDefault();
      }
    });

    // Header
    const header = contentEl.createDiv({ cls: "workflow-execution-header" });
    header.createEl("h2", { text: t("workflow.execution.title") });
    const nameEl = header.createDiv({ cls: "workflow-execution-name" });
    nameEl.textContent = this.workflowName;

    // Flow diagram container
    this.flowContainer = contentEl.createDiv({ cls: "workflow-execution-flow" });
    this.renderFlowDiagram();

    // Status
    const statusEl = contentEl.createDiv({ cls: "workflow-execution-status" });
    statusEl.textContent = t("workflow.execution.running");

    // Stop button
    const buttonContainer = contentEl.createDiv({ cls: "workflow-execution-buttons" });
    this.stopBtn = buttonContainer.createEl("button", {
      text: t("workflow.execution.stop"),
      cls: "mod-warning",
    });
    this.stopBtn.addEventListener("click", () => {
      this.handleStop();
    });
  }

  private renderFlowDiagram(): void {
    if (!this.flowContainer) return;
    this.flowContainer.empty();
    this.nodeElements.clear();

    // Build node display info
    const nodes: NodeDisplayInfo[] = [];
    const nodeOrder = this.getExecutionOrder();

    for (const nodeId of nodeOrder) {
      const node = this.workflow.nodes.get(nodeId);
      if (!node) continue;

      const info: NodeDisplayInfo = {
        id: node.id,
        type: node.type,
        label: this.getNodeLabel(node),
        status: this.nodeStatuses.get(node.id) || "pending",
        next: [],
      };

      // Get connections from workflow edges
      const nodeEdges = this.workflow.edges.filter(e => e.from === node.id);
      if (node.type === "if" || node.type === "while") {
        const trueEdge = nodeEdges.find(e => e.label === "true");
        const falseEdge = nodeEdges.find(e => e.label === "false");
        if (trueEdge) info.trueNext = trueEdge.to;
        if (falseEdge) info.falseNext = falseEdge.to;
      } else if (nodeEdges.length > 0) {
        info.next = nodeEdges.map(e => e.to);
      }

      nodes.push(info);
    }

    // Render each node
    for (const nodeInfo of nodes) {
      const nodeWrapper = this.flowContainer.createDiv({
        cls: "workflow-execution-node-wrapper",
      });

      const nodeEl = nodeWrapper.createDiv({
        cls: `workflow-execution-node workflow-execution-node-${nodeInfo.status}`,
      });
      this.nodeElements.set(nodeInfo.id, nodeWrapper);

      // Make node clickable
      nodeEl.addClass("clickable");
      nodeEl.addEventListener("click", () => this.toggleNodeDetail(nodeInfo.id, nodeWrapper));

      // Node header row
      const headerRow = nodeEl.createDiv({ cls: "workflow-execution-node-header" });

      // Node type badge
      const typeBadge = headerRow.createSpan({ cls: "workflow-execution-node-type" });
      typeBadge.textContent = nodeInfo.type;

      // Node ID
      const idEl = headerRow.createSpan({ cls: "workflow-execution-node-id" });
      idEl.textContent = nodeInfo.id;

      // Status indicator
      const statusIndicator = headerRow.createSpan({ cls: "workflow-execution-node-status" });
      this.updateStatusIndicator(statusIndicator, nodeInfo.status);

      // Expand indicator
      const expandIndicator = headerRow.createSpan({ cls: "workflow-execution-node-expand" });
      expandIndicator.textContent = this.expandedNodes.has(nodeInfo.id) ? "▼" : "▶";

      // Node label/summary
      if (nodeInfo.label) {
        const labelEl = nodeEl.createDiv({ cls: "workflow-execution-node-label" });
        labelEl.textContent = nodeInfo.label;
      }

      // Connection arrows
      if (nodeInfo.trueNext || nodeInfo.falseNext) {
        const connEl = nodeEl.createDiv({ cls: "workflow-execution-node-connections" });
        if (nodeInfo.trueNext) {
          connEl.createSpan({ text: `T: ${nodeInfo.trueNext}`, cls: "conn-true" });
        }
        if (nodeInfo.falseNext) {
          connEl.createSpan({ text: `F: ${nodeInfo.falseNext}`, cls: "conn-false" });
        }
      } else if (nodeInfo.next.length > 0) {
        const connEl = nodeEl.createDiv({ cls: "workflow-execution-node-connections" });
        connEl.textContent = `→ ${nodeInfo.next.join(", ")}`;
      }

      // Detail section (initially hidden unless expanded)
      if (this.expandedNodes.has(nodeInfo.id)) {
        this.renderNodeDetail(nodeInfo.id, nodeWrapper);
      }
    }
  }

  private toggleNodeDetail(nodeId: string, wrapper: HTMLElement): void {
    if (this.expandedNodes.has(nodeId)) {
      this.expandedNodes.delete(nodeId);
      // Remove detail section
      const detail = wrapper.querySelector(".workflow-execution-node-detail");
      if (detail) detail.remove();
      // Update expand indicator
      const expandIndicator = wrapper.querySelector(".workflow-execution-node-expand");
      if (expandIndicator) expandIndicator.textContent = "▶";
    } else {
      this.expandedNodes.add(nodeId);
      this.renderNodeDetail(nodeId, wrapper);
      // Update expand indicator
      const expandIndicator = wrapper.querySelector(".workflow-execution-node-expand");
      if (expandIndicator) expandIndicator.textContent = "▼";
    }
  }

  private renderNodeDetail(nodeId: string, wrapper: HTMLElement): void {
    // Remove existing detail if any
    const existingDetail = wrapper.querySelector(".workflow-execution-node-detail");
    if (existingDetail) existingDetail.remove();

    const logData = this.nodeLogs.get(nodeId);
    const status = this.nodeStatuses.get(nodeId) || "pending";

    const detailEl = wrapper.createDiv({ cls: "workflow-execution-node-detail" });
    detailEl.addClass(`workflow-step-${status === "completed" ? "success" : status}`);

    if (!logData && status === "pending") {
      detailEl.createDiv({
        cls: "workflow-execution-detail-empty",
        text: t("workflow.execution.notExecutedYet"),
      });
      return;
    }

    if (!logData) {
      detailEl.createDiv({
        cls: "workflow-execution-detail-empty",
        text: t("workflow.execution.noData"),
      });
      return;
    }

    // Input section
    if (logData.input !== undefined) {
      const inputSection = detailEl.createDiv({ cls: "workflow-step-section" });
      inputSection.createEl("strong", { text: t("workflowModal.input") });
      const inputPre = inputSection.createEl("pre", { cls: "workflow-step-pre-scrollable" });
      inputPre.textContent = this.formatValue(logData.input);
    }

    // Output section
    if (logData.output !== undefined) {
      const outputSection = detailEl.createDiv({ cls: "workflow-step-section" });
      outputSection.createEl("strong", { text: t("workflowModal.output") });
      const outputPre = outputSection.createEl("pre", { cls: "workflow-step-pre-scrollable" });
      outputPre.textContent = this.formatValue(logData.output);
    }

    // If no input or output, show message
    if (logData.input === undefined && logData.output === undefined) {
      if (logData.message) {
        const msgEl = detailEl.createDiv({ cls: "workflow-execution-detail-message" });
        msgEl.textContent = logData.message;
      } else {
        detailEl.createDiv({
          cls: "workflow-execution-detail-empty",
          text: t("workflow.execution.noData"),
        });
      }
    }
  }

  private formatValue(value: unknown): string {
    if (value === undefined || value === null) {
      return t("workflowModal.empty");
    }
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return t("workflowModal.circularReference");
    }
  }

  private updateStatusIndicator(el: HTMLElement, status: NodeStatus): void {
    el.empty();
    el.removeClass("status-running", "status-completed", "status-error");
    switch (status) {
      case "pending":
        el.textContent = "○";
        break;
      case "running":
        el.textContent = "◉";
        el.addClass("status-running");
        break;
      case "completed":
        el.textContent = "✓";
        el.addClass("status-completed");
        break;
      case "error":
        el.textContent = "✗";
        el.addClass("status-error");
        break;
    }
  }

  private getNodeLabel(node: WorkflowNode): string {
    const props = node.properties;
    switch (node.type) {
      case "variable":
        return props.name ? `${props.name} = ${props.value || '""'}` : "";
      case "set":
        return props.name ? `${props.name} = ...` : "";
      case "if":
      case "while":
        return props.condition || "";
      case "command":
        return props.prompt?.substring(0, 30) + (props.prompt?.length > 30 ? "..." : "") || "";
      case "http":
        return props.url || "";
      case "note":
      case "note-read":
        return props.path || "";
      case "dialog":
        return props.title || "";
      default:
        return "";
    }
  }

  private getExecutionOrder(): string[] {
    // Simple BFS from start node
    const order: string[] = [];
    const visited = new Set<string>();
    const queue: string[] = [];

    if (this.workflow.startNode) {
      queue.push(this.workflow.startNode);
    }

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      order.push(nodeId);

      // Get edges from this node
      const nodeEdges = this.workflow.edges.filter(e => e.from === nodeId);
      for (const edge of nodeEdges) {
        if (!visited.has(edge.to)) {
          queue.push(edge.to);
        }
      }
    }

    return order;
  }

  /**
   * Update node status based on execution log
   */
  updateFromLog(log: ExecutionLog): void {
    // Extract base node ID (remove sub-workflow prefix if present)
    const nodeId = log.nodeId.includes("/") ? log.nodeId.split("/")[0] : log.nodeId;

    // Update status based on log status
    let newStatus: NodeStatus;
    if (log.status === "error") {
      newStatus = "error";
    } else if (log.status === "success") {
      newStatus = "completed";
    } else {
      newStatus = "running";
    }

    // If this is a new node starting, mark previous as completed (if it was running)
    if (newStatus === "running" && this.currentNodeId && this.currentNodeId !== nodeId) {
      const prevStatus = this.nodeStatuses.get(this.currentNodeId);
      if (prevStatus === "running") {
        this.nodeStatuses.set(this.currentNodeId, "completed");
        this.updateNodeElement(this.currentNodeId);
      }
    }

    this.nodeStatuses.set(nodeId, newStatus);
    this.currentNodeId = nodeId;

    // Store log data (input/output) - only update if we have data
    if (log.input !== undefined || log.output !== undefined || log.status === "success" || log.status === "error") {
      this.nodeLogs.set(nodeId, {
        input: log.input,
        output: log.output,
        message: log.message,
        timestamp: log.timestamp,
      });
    }

    this.updateNodeElement(nodeId);

    // Scroll to current node
    const nodeEl = this.nodeElements.get(nodeId);
    if (nodeEl) {
      nodeEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  private updateNodeElement(nodeId: string): void {
    const wrapper = this.nodeElements.get(nodeId);
    if (!wrapper) return;

    const nodeEl = wrapper.querySelector(".workflow-execution-node");
    if (!nodeEl) return;

    const status = this.nodeStatuses.get(nodeId) || "pending";

    // Update class
    nodeEl.removeClass("workflow-execution-node-pending");
    nodeEl.removeClass("workflow-execution-node-running");
    nodeEl.removeClass("workflow-execution-node-completed");
    nodeEl.removeClass("workflow-execution-node-error");
    nodeEl.addClass(`workflow-execution-node-${status}`);

    // Update status indicator
    const statusIndicator = nodeEl.querySelector(".workflow-execution-node-status");
    if (statusIndicator instanceof HTMLElement) {
      this.updateStatusIndicator(statusIndicator, status);
    }

    // Update detail section if expanded
    if (this.expandedNodes.has(nodeId)) {
      this.renderNodeDetail(nodeId, wrapper);
    }
  }

  /**
   * Mark execution as complete
   */
  setComplete(success: boolean): void {
    // Mark any remaining running nodes as completed or error
    if (this.currentNodeId) {
      const status = this.nodeStatuses.get(this.currentNodeId);
      if (status === "running") {
        this.nodeStatuses.set(this.currentNodeId, success ? "completed" : "error");
        this.updateNodeElement(this.currentNodeId);
      }
    }

    // Update status text
    const statusEl = this.contentEl.querySelector(".workflow-execution-status");
    if (statusEl) {
      statusEl.textContent = success
        ? t("workflow.execution.completed")
        : t("workflow.execution.failed");
      statusEl.addClass(success ? "status-success" : "status-error");
    }

    // Change stop button to close
    if (this.stopBtn) {
      this.stopBtn.textContent = t("common.close");
      this.stopBtn.removeClass("mod-warning");
      this.stopBtn.onclick = () => this.close();
    }
  }

  private handleStop(): void {
    this.abortController.abort();
    this.onAbort();

    // Update status
    const statusEl = this.contentEl.querySelector(".workflow-execution-status");
    if (statusEl) {
      statusEl.textContent = t("workflow.execution.stopped");
      statusEl.addClass("status-stopped");
    }

    // Change button to close
    if (this.stopBtn) {
      this.stopBtn.textContent = t("common.close");
      this.stopBtn.removeClass("mod-warning");
      this.stopBtn.onclick = () => this.close();
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
