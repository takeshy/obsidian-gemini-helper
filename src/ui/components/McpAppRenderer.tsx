import { useEffect, useRef, useState, useCallback } from "react";
import type { McpAppResult, McpAppUiResource } from "src/types";
import { McpClient } from "src/core/mcpClient";
import { t } from "src/i18n";
import { prepareMcpAppHtml } from "src/core/mcpAppCsp";

// JSON-RPC message types for postMessage communication
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string;
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

interface McpAppRendererProps {
  // The MCP server URL for callbacks
  serverUrl: string;
  // Optional headers for the MCP server
  serverHeaders?: Record<string, string>;
  // The tool result containing UI metadata
  toolResult: McpAppResult;
  // Pre-fetched UI resource content (if available)
  uiResource?: McpAppUiResource | null;
  // Callback when the UI requests a tool call
  onToolCall?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  // Callback when the UI updates model context
  onContextUpdate?: (context: Record<string, unknown>) => void;
  // Height of the iframe (default: 400px)
  height?: number;
  // Whether the app is expanded
  expanded?: boolean;
  // Toggle expand callback
  onToggleExpand?: () => void;
}

/**
 * MCP Apps Renderer Component
 *
 * Renders MCP Apps in a sandboxed iframe with JSON-RPC over postMessage
 * for bidirectional communication.
 */
export function McpAppRenderer({
  serverUrl,
  serverHeaders,
  toolResult,
  uiResource: initialUiResource,
  onToolCall,
  onContextUpdate,
  height = 400,
  expanded = false,
  onToggleExpand,
}: McpAppRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(!initialUiResource);
  const [error, setError] = useState<string | null>(null);
  const [uiResource, setUiResource] = useState<McpAppUiResource | null>(initialUiResource || null);
  const [iframeHtml, setIframeHtml] = useState<string | null>(null);
  const clientRef = useRef<McpClient | null>(null);

  // Get the UI resource URI from the tool result
  const resourceUri = toolResult._meta?.ui?.resourceUri;

  // Fetch UI resource if not provided
  useEffect(() => {
    if (!resourceUri || initialUiResource) return;

    const fetchResource = async () => {
      try {
        setLoading(true);
        setError(null);

        // Create MCP client
        const client = new McpClient({
          name: "mcp-app",
          url: serverUrl,
          headers: serverHeaders,
          enabled: true,
        });
        clientRef.current = client;

        // Fetch the UI resource
        const resource = await client.readResource(resourceUri);
        if (resource) {
          setUiResource(resource);
        } else {
          setError(t("mcpApp.resourceNotFound"));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("mcpApp.fetchError"));
      } finally {
        setLoading(false);
      }
    };

    void fetchResource();

    return () => {
      // Cleanup client on unmount
      if (clientRef.current) {
        void clientRef.current.close();
        clientRef.current = null;
      }
    };
  }, [resourceUri, serverUrl, serverHeaders, initialUiResource]);

  // Handle messages from iframe
  const handleMessage = useCallback(async (event: MessageEvent) => {
    // Only handle messages from our iframe
    if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) {
      return;
    }

    const message = event.data as JsonRpcRequest;

    if (message.jsonrpc !== "2.0") return;

    const sendResponse = (response: JsonRpcResponse) => {
      // Using "*" origin is required for srcdoc iframes as they have null origin
      iframeRef.current?.contentWindow?.postMessage(response, "*");
    };

    try {
      switch (message.method) {
        case "ui/initialize": {
          if (typeof message.id === "undefined") return;
          sendResponse({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              protocolVersion: "2026-01-26",
              hostInfo: { name: "obsidian-gemini-helper", version: "1.21.0" },
              hostCapabilities: { serverTools: {} },
              hostContext: {
                theme: document.body.classList.contains("theme-dark") ? "dark" : "light",
                platform: "desktop",
                displayMode: "inline",
              },
            },
          });
          return;
        }

        case "ui/notifications/initialized": {
          iframeRef.current?.contentWindow?.postMessage({
            jsonrpc: "2.0",
            method: "ui/notifications/tool-result",
            params: toolResult,
          }, "*");
          return;
        }

        case "tools/call": {
          if (typeof message.id === "undefined") return;
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

          if (onToolCall) {
            const result = await onToolCall(params.name, params.arguments || {});
            sendResponse({
              jsonrpc: "2.0",
              id: message.id,
              result,
            });
          } else {
            // Default: call tool via MCP client
            const client = clientRef.current || new McpClient({
              name: "mcp-app",
              url: serverUrl,
              headers: serverHeaders,
              enabled: true,
            });

            const result = await client.callToolWithUi(params.name, params.arguments || {});
            sendResponse({
              jsonrpc: "2.0",
              id: message.id,
              result,
            });
          }
          break;
        }

        case "context/update": {
          if (typeof message.id === "undefined") return;
          // UI is updating the model context
          if (message.params && onContextUpdate) {
            onContextUpdate(message.params);
          }
          sendResponse({
            jsonrpc: "2.0",
            id: message.id,
            result: { success: true },
          });
          break;
        }

        default:
          if (typeof message.id === "undefined") return;
          sendResponse({
            jsonrpc: "2.0",
            id: message.id,
            error: { code: -32601, message: `Method not found: ${message.method}` },
          });
      }
    } catch (err) {
      if (typeof message.id === "undefined") return;
      sendResponse({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : "Internal error",
        },
      });
    }
  }, [serverUrl, serverHeaders, onToolCall, onContextUpdate]);

  // Set up message listener
  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      void handleMessage(event);
    };
    window.addEventListener("message", messageHandler);
    return () => window.removeEventListener("message", messageHandler);
  }, [handleMessage]);

  // The MCP App receives its tool result after the ui/initialize handshake.
  const handleIframeLoad = useCallback(() => {
    setLoading(false);
  }, []);

  // Generate iframe content (server-provided HTML should already contain SDK per MCP Apps spec)
  const getIframeContent = (): string => {
    if (!uiResource) return "";

    // Get the HTML content
    let html = uiResource.text || "";

    // If it's binary data, decode it
    if (uiResource.blob && !uiResource.text) {
      try {
        html = atob(uiResource.blob);
      } catch {
        // Return error page
        return `<html><body><p>${t("mcpApp.decodeError")}</p></body></html>`;
      }
    }

    return html;
  };

  useEffect(() => {
    if (!uiResource) { setIframeHtml(null); return; }
    let cancelled = false;
    void prepareMcpAppHtml(getIframeContent(), uiResource).then(html => {
      if (!cancelled) setIframeHtml(html);
    }).catch(err => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    });
    return () => { cancelled = true; };
  }, [uiResource]);

  // Render loading state
  if (loading) {
    return (
      <div className="gemini-helper-mcp-app-loading">
        <span className="gemini-helper-mcp-app-spinner" />
        <span>{t("mcpApp.loading")}</span>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="gemini-helper-mcp-app-error">
        <span>{t("mcpApp.error")}: {error}</span>
      </div>
    );
  }

  // No UI resource available
  if (!uiResource) {
    return null;
  }

  if (!iframeHtml) {
    return (
      <div className="gemini-helper-mcp-app-loading">
        <span className="gemini-helper-mcp-app-spinner" />
        <span>{t("mcpApp.loading")}</span>
      </div>
    );
  }

  return (
    <div className={`gemini-helper-mcp-app ${expanded ? "gemini-helper-mcp-app-expanded" : ""}`}>
      <div className="gemini-helper-mcp-app-header">
        <span className="gemini-helper-mcp-app-indicator">
          🖥️ {t("mcpApp.title")}
        </span>
        {onToggleExpand && (
          <button
            className="gemini-helper-mcp-app-expand-btn"
            onClick={onToggleExpand}
            title={expanded ? t("mcpApp.collapse") : t("mcpApp.expand")}
          >
            {expanded ? "⊖" : "⊕"}
          </button>
        )}
      </div>
      <iframe
        key={uiResource.uri}
        ref={iframeRef}
        srcDoc={iframeHtml}
        sandbox="allow-scripts allow-forms"
        onLoad={handleIframeLoad}
        className={`gemini-helper-mcp-app-iframe ${expanded ? "gemini-helper-mcp-app-iframe-expanded" : ""}`}
        data-height={height}
        title="MCP App"
      />
    </div>
  );
}

export default McpAppRenderer;
