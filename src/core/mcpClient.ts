// MCP (Model Context Protocol) client for Streamable HTTP transport
// Reference: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http

import { requestUrl } from "obsidian";
import type { McpServerConfig, McpToolInfo, McpAppResult, McpAppUiResource } from "../types";

// JSON-RPC types
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// MCP Protocol types
interface McpInitializeResult {
  protocolVersion: string;
  capabilities: {
    tools?: Record<string, unknown>;
  };
  serverInfo: {
    name: string;
    version: string;
  };
}

interface McpToolsListResult {
  tools: McpToolInfo[];
}

interface McpToolCallResult {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
    resource?: {
      uri: string;
      mimeType?: string;
      text?: string;
    };
  }>;
  isError?: boolean;
  _meta?: {
    ui?: {
      resourceUri: string;
    };
  };
}

// MCP resource read result
interface McpResourceReadResult {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;  // Base64 encoded binary
  }>;
}

/**
 * MCP Client for communicating with external MCP servers via Streamable HTTP transport
 */
export class McpClient {
  private config: McpServerConfig;
  private sessionId: string | null = null;
  private requestId = 0;
  private initialized = false;

  constructor(config: McpServerConfig) {
    this.config = config;
  }

  /**
   * Send a JSON-RPC request to the MCP server
   */
  private async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: ++this.requestId,
      method,
      params,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      ...this.config.headers,
    };

    // Add session ID if we have one
    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    try {
      const response = await requestUrl({
        url: this.config.url,
        method: "POST",
        headers,
        body: JSON.stringify(request),
      });

      // Extract session ID from response header if present
      const newSessionId = response.headers["mcp-session-id"];
      if (newSessionId) {
        this.sessionId = newSessionId;
      }

      // Check content type for SSE vs JSON
      const contentType = response.headers["content-type"] || "";

      if (contentType.includes("text/event-stream")) {
        // Handle SSE response - parse event stream
        return this.parseSSEResponse(response.text);
      } else {
        // Regular JSON response
        const jsonResponse: JsonRpcResponse = response.json;

        if (jsonResponse.error) {
          throw new Error(`MCP Error ${jsonResponse.error.code}: ${jsonResponse.error.message}`);
        }

        return jsonResponse.result;
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`MCP request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Parse SSE (Server-Sent Events) response to extract JSON-RPC result
   */
  private parseSSEResponse(sseText: string): unknown {
    const lines = sseText.split("\n");
    let lastData = "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        lastData = line.substring(6);
      }
    }

    if (!lastData) {
      throw new Error("No data received in SSE response");
    }

    const jsonResponse: JsonRpcResponse = JSON.parse(lastData);

    if (jsonResponse.error) {
      throw new Error(`MCP Error ${jsonResponse.error.code}: ${jsonResponse.error.message}`);
    }

    return jsonResponse.result;
  }

  /**
   * Initialize the MCP session
   */
  async initialize(): Promise<McpInitializeResult> {
    if (this.initialized) {
      return {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: this.config.name, version: "unknown" },
      };
    }

    const result = await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "obsidian-gemini-helper",
        version: "1.0.0",
      },
    }) as McpInitializeResult;

    // Send initialized notification
    await this.sendNotification("notifications/initialized");

    this.initialized = true;
    return result;
  }

  /**
   * Send a notification (no response expected)
   */
  private async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.config.headers,
    };

    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    // Notifications don't have an id
    const notification = {
      jsonrpc: "2.0",
      method,
      params,
    };

    try {
      await requestUrl({
        url: this.config.url,
        method: "POST",
        headers,
        body: JSON.stringify(notification),
      });
    } catch {
      // Notifications may not return anything, ignore errors
    }
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<McpToolInfo[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const result = await this.sendRequest("tools/list") as McpToolsListResult;
    return result.tools || [];
  }

  /**
   * Call a tool on the MCP server (returns text content only)
   */
  async callTool(toolName: string, args?: Record<string, unknown>): Promise<string> {
    const result = await this.callToolRaw(toolName, args);

    // Extract text content from the result (handle missing content)
    const content = result?.content || [];
    const textContents = content
      .filter(c => c.type === "text" && c.text)
      .map(c => c.text!);

    if (result?.isError) {
      throw new Error(`Tool execution failed: ${textContents.join("\n")}`);
    }

    return textContents.join("\n");
  }

  /**
   * Call a tool on the MCP server (returns full result with UI metadata)
   */
  async callToolRaw(toolName: string, args?: Record<string, unknown>): Promise<McpToolCallResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const result = await this.sendRequest("tools/call", {
      name: toolName,
      arguments: args || {},
    }) as McpToolCallResult;

    return result;
  }

  /**
   * Call a tool and return MCP Apps result if available
   */
  async callToolWithUi(toolName: string, args?: Record<string, unknown>): Promise<McpAppResult> {
    const result = await this.callToolRaw(toolName, args);

    const appResult: McpAppResult = {
      content: result.content?.map(c => ({
        type: c.type,
        text: c.text,
        data: c.data,
        mimeType: c.mimeType,
        resource: c.resource,
      })) || [],
      isError: result.isError,
      _meta: result._meta,
    };

    return appResult;
  }

  /**
   * Read a resource from the MCP server (for ui:// resources)
   */
  async readResource(uri: string): Promise<McpAppUiResource | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const result = await this.sendRequest("resources/read", {
        uri,
      }) as McpResourceReadResult;

      if (result.contents && result.contents.length > 0) {
        const content = result.contents[0];
        return {
          uri: content.uri,
          mimeType: content.mimeType || "text/html",
          text: content.text,
          blob: content.blob,
        };
      }

      return null;
    } catch (error) {
      console.error(`Failed to read resource ${uri}:`, error);
      return null;
    }
  }

  /**
   * Close the MCP session
   */
  async close(): Promise<void> {
    if (this.sessionId) {
      try {
        const headers: Record<string, string> = {
          ...this.config.headers,
        };
        headers["Mcp-Session-Id"] = this.sessionId;

        await requestUrl({
          url: this.config.url,
          method: "DELETE",
          headers,
        });
      } catch {
        // Ignore close errors
      }
      this.sessionId = null;
      this.initialized = false;
    }
  }
}
