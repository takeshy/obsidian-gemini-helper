import { App, Modal } from "obsidian";
import type { McpAppInfo, McpAppUiResource } from "src/types";
import { McpClient } from "src/core/mcpClient";
import { t } from "src/i18n";

// JSON-RPC message types for postMessage communication
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Modal for displaying MCP App interactive UI during workflow execution
 */
export class McpAppModal extends Modal {
  private mcpApp: McpAppInfo;
  private resolve: () => void;
  private iframe: HTMLIFrameElement | null = null;
  private client: McpClient | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  constructor(app: App, mcpApp: McpAppInfo) {
    super(app);
    this.mcpApp = mcpApp;
    this.resolve = () => {};
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("gemini-helper-mcp-app-modal");
    modalEl.addClass("gemini-helper-modal-resizable");

    // Drag handle with header
    const dragHandle = contentEl.createDiv({ cls: "modal-drag-handle" });
    dragHandle.createEl("h2", { text: `🖥️ ${t("mcpApp.title")}` });
    this.setupDragHandle(dragHandle, modalEl);

    // Content container
    const container = contentEl.createDiv({ cls: "gemini-helper-mcp-app-modal-content" });

    // Check if we have UI resource
    if (this.mcpApp.uiResource) {
      this.renderIframe(container, this.mcpApp.uiResource);
    } else if (this.mcpApp.toolResult._meta?.ui?.resourceUri) {
      // Need to fetch the UI resource
      void this.fetchAndRenderResource(container, this.mcpApp.toolResult._meta.ui.resourceUri);
    } else {
      container.createEl("p", { text: t("mcpApp.resourceNotFound") });
    }

    // Close button
    const buttonContainer = contentEl.createDiv({ cls: "gemini-helper-mcp-app-modal-buttons" });
    const closeBtn = buttonContainer.createEl("button", { text: t("common.close") });
    closeBtn.addEventListener("click", () => {
      this.close();
    });
  }

  private setupDragHandle(dragHandle: HTMLElement, modalEl: HTMLElement): void {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = modalEl.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      // Set position to fixed for dragging
      modalEl.setCssStyles({
        position: "fixed",
        left: `${startLeft}px`,
        top: `${startTop}px`,
        transform: "none",
        margin: "0",
      });

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      modalEl.setCssStyles({
        left: `${startLeft + dx}px`,
        top: `${startTop + dy}px`,
      });
    };

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    dragHandle.addEventListener("mousedown", onMouseDown);
  }

  private async fetchAndRenderResource(container: HTMLElement, resourceUri: string) {
    const loadingDiv = container.createDiv({ cls: "gemini-helper-mcp-app-loading" });
    loadingDiv.createSpan({ cls: "gemini-helper-mcp-app-spinner" });
    loadingDiv.createSpan({ text: t("mcpApp.loading") });

    try {
      this.client = new McpClient({
        name: "mcp-app-modal",
        url: this.mcpApp.serverUrl,
        headers: this.mcpApp.serverHeaders,
        enabled: true,
      });

      const resource = await this.client.readResource(resourceUri);
      loadingDiv.remove();

      if (resource) {
        this.renderIframe(container, resource);
      } else {
        container.createEl("p", { text: t("mcpApp.resourceNotFound") });
      }
    } catch (error) {
      loadingDiv.remove();
      container.createEl("p", {
        text: `${t("mcpApp.fetchError")}: ${error instanceof Error ? error.message : String(error)}`,
        cls: "gemini-helper-mcp-app-error"
      });
    }
  }

  private renderIframe(container: HTMLElement, uiResource: McpAppUiResource) {
    // Get the HTML content (server-provided HTML should already contain SDK per MCP Apps spec)
    let html = uiResource.text || "";

    // If it's binary data, decode it
    if (uiResource.blob && !uiResource.text) {
      try {
        html = atob(uiResource.blob);
      } catch {
        container.createEl("p", { text: "Error: failed to decode binary content" });
        return;
      }
    }

    // Create iframe
    this.iframe = container.createEl("iframe", {
      attr: {
        sandbox: "allow-scripts allow-forms",
        srcdoc: html,
      },
      cls: "gemini-helper-mcp-app-iframe"
    });

    // Set up message listener
    this.messageHandler = (event: MessageEvent) => {
      void this.handleMessage(event);
    };
    window.addEventListener("message", this.messageHandler);

    // Send initial tool result when iframe loads
    this.iframe.addEventListener("load", () => {
      if (this.iframe?.contentWindow) {
        // Using "*" origin is required for srcdoc iframes as they have null origin
        this.iframe.contentWindow.postMessage({
          jsonrpc: "2.0",
          method: "toolResult",
          params: {
            content: this.mcpApp.toolResult.content,
            isError: this.mcpApp.toolResult.isError,
          },
        }, "*");
      }
    });
  }

  private async handleMessage(event: MessageEvent) {
    // Only handle messages from our iframe
    if (!this.iframe || event.source !== this.iframe.contentWindow) {
      return;
    }

    const message = event.data as JsonRpcRequest;

    // Validate JSON-RPC format
    if (message.jsonrpc !== "2.0" || typeof message.id === "undefined") {
      return;
    }

    const sendResponse = (response: JsonRpcResponse) => {
      // Using "*" origin is required for srcdoc iframes as they have null origin
      this.iframe?.contentWindow?.postMessage(response, "*");
    };

    try {
      switch (message.method) {
        case "tools/call": {
          // UI is requesting to call a tool
          const params = message.params as { name: string; arguments?: Record<string, unknown> } | undefined;
          if (!params?.name) {
            sendResponse({
              jsonrpc: "2.0",
              id: message.id,
              error: { code: -32602, message: "Invalid params: missing tool name" },
            });
            return;
          }

          // Call tool via MCP client
          const client = this.client || new McpClient({
            name: "mcp-app-modal",
            url: this.mcpApp.serverUrl,
            headers: this.mcpApp.serverHeaders,
            enabled: true,
          });

          const result = await client.callToolWithUi(params.name, params.arguments || {});
          sendResponse({
            jsonrpc: "2.0",
            id: message.id,
            result,
          });
          break;
        }

        case "context/update": {
          // UI is updating the model context (just acknowledge for workflow)
          sendResponse({
            jsonrpc: "2.0",
            id: message.id,
            result: { success: true },
          });
          break;
        }

        default:
          sendResponse({
            jsonrpc: "2.0",
            id: message.id,
            error: { code: -32601, message: `Method not found: ${message.method}` },
          });
      }
    } catch (err) {
      sendResponse({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : "Internal error",
        },
      });
    }
  }

  onClose() {
    // Clean up
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }
    if (this.client) {
      void this.client.close();
      this.client = null;
    }
    this.iframe = null;
    this.contentEl.empty();
    this.resolve();
  }

  waitForClose(): Promise<void> {
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }
}

/**
 * Show MCP App modal and wait for user to close it
 */
export async function showMcpApp(app: App, mcpApp: McpAppInfo): Promise<void> {
  const modal = new McpAppModal(app, mcpApp);
  modal.open();
  await modal.waitForClose();
}
