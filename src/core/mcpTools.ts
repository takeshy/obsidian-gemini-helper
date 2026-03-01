// MCP Tools integration for Chat
// Fetches tools from configured MCP servers and executes them

import { McpClient } from "./mcpClient";
import type { McpServerConfig, McpToolInfo, ToolDefinition, ToolPropertyDefinition, McpAppInfo } from "../types";
import { tracing } from "./tracingHooks";
import { formatError } from "../utils/error";

// Extended tool definition with MCP server info
export interface McpToolDefinition extends ToolDefinition {
  mcpServer: McpServerConfig;
  mcpToolName: string;
}

// Cache for MCP tools to avoid repeated fetches
interface McpToolsCache {
  tools: McpToolDefinition[];
  fetchedAt: number;
}

const toolsCache = new Map<string, McpToolsCache>();
const CACHE_TTL_MS = 60000; // 1 minute cache

function sanitizeMcpName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Get a unique key for an MCP server config
 */
function getServerKey(server: McpServerConfig): string {
  return `${server.url}:${JSON.stringify(server.headers || {})}`;
}

/**
 * Convert MCP property schema to Gemini format recursively
 */
function convertPropertySchema(prop: Record<string, unknown>): ToolPropertyDefinition {
  const result: ToolPropertyDefinition = {
    type: (prop.type as string) || "string",
    description: (prop.description as string) || "",
  };

  if (prop.enum) {
    result.enum = prop.enum as string[];
  }

  // Handle array type - must have items for Gemini API
  if (prop.type === "array") {
    if (prop.items) {
      const items = prop.items as Record<string, unknown>;
      if (items.type === "object" && items.properties) {
        // Array of objects
        const nestedProps: Record<string, ToolPropertyDefinition> = {};
        for (const [k, v] of Object.entries(items.properties as Record<string, unknown>)) {
          nestedProps[k] = convertPropertySchema(v as Record<string, unknown>);
        }
        result.items = {
          type: "object",
          properties: nestedProps,
          required: items.required as string[] | undefined,
        };
      } else {
        // Array of primitives
        result.items = {
          type: (items.type as string) || "string",
          description: (items.description as string) || "",
        };
      }
    } else {
      // Default to array of strings if items not specified
      result.items = {
        type: "string",
        description: "",
      };
    }
  }

  if (prop.type === "object" && prop.properties) {
    const nestedProps: Record<string, ToolPropertyDefinition> = {};
    for (const [k, v] of Object.entries(prop.properties as Record<string, unknown>)) {
      nestedProps[k] = convertPropertySchema(v as Record<string, unknown>);
    }
    result.properties = nestedProps;
    if (Array.isArray(prop.required)) {
      result.required = prop.required as string[];
    }
  }

  return result;
}

/**
 * Convert MCP tool schema to Gemini tool format
 */
function convertMcpToolToGemini(
  tool: McpToolInfo,
  server: McpServerConfig
): McpToolDefinition {
  // Convert MCP input schema to Gemini format
  const inputSchema = tool.inputSchema || {};
  const properties: Record<string, ToolPropertyDefinition> = {};
  const required: string[] = [];

  // Process properties from MCP schema
  if (inputSchema.properties && typeof inputSchema.properties === "object") {
    for (const [key, value] of Object.entries(inputSchema.properties)) {
      const prop = value as Record<string, unknown>;
      properties[key] = convertPropertySchema(prop);
    }
  }

  // Process required fields
  if (inputSchema.required && Array.isArray(inputSchema.required)) {
    required.push(...(inputSchema.required as string[]));
  }

  // Create a unique tool name by prefixing with server name
  // This avoids conflicts between tools from different servers
  const uniqueName = `mcp_${sanitizeMcpName(server.name)}_${sanitizeMcpName(tool.name)}`;

  return {
    name: uniqueName,
    description: tool.description || `MCP tool: ${tool.name} from ${server.name}`,
    parameters: {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
    },
    mcpServer: server,
    mcpToolName: tool.name,
  };
}

/**
 * Fetch tools from a single MCP server
 */
async function fetchToolsFromServer(server: McpServerConfig): Promise<McpToolDefinition[]> {
  const client = new McpClient(server);

  try {
    await client.initialize();
    const mcpTools = await client.listTools();
    await client.close();

    return mcpTools.map((tool) => convertMcpToolToGemini(tool, server));
  } catch (error) {
    console.error(`Failed to fetch tools from MCP server ${server.name}:`, error);
    await client.close().catch(() => {});
    // Return empty array on failure - don't block chat functionality
    return [];
  }
}

/**
 * Fetch tools from all configured MCP servers
 * @param servers - Array of MCP server configurations
 * @param forceRefresh - If true, bypasses cache
 */
export async function fetchMcpTools(
  servers: McpServerConfig[],
  forceRefresh = false
): Promise<McpToolDefinition[]> {
  if (!servers || servers.length === 0) {
    return [];
  }

  const now = Date.now();

  // Separate servers into cached and needs-fetch
  const cachedTools: McpToolDefinition[] = [];
  const serversToFetch: McpServerConfig[] = [];

  for (const server of servers) {
    const cacheKey = getServerKey(server);
    const cached = toolsCache.get(cacheKey);

    // Use cache if available and not expired
    if (!forceRefresh && cached && (now - cached.fetchedAt) < CACHE_TTL_MS) {
      cachedTools.push(...cached.tools);
    } else {
      serversToFetch.push(server);
    }
  }

  // Fetch from servers in parallel
  const fetchResults = await Promise.all(
    serversToFetch.map(async (server) => {
      const tools = await fetchToolsFromServer(server);
      // Update cache
      toolsCache.set(getServerKey(server), {
        tools,
        fetchedAt: now,
      });
      return tools;
    })
  );

  // Combine cached and freshly fetched tools
  return [...cachedTools, ...fetchResults.flat()];
}

/**
 * Check if a tool is an MCP tool
 */
export function isMcpTool(tool: ToolDefinition): tool is McpToolDefinition {
  return "mcpServer" in tool && "mcpToolName" in tool;
}

/**
 * Result from MCP tool execution
 */
export interface McpToolResult {
  result?: string;
  error?: string;
  mcpApp?: McpAppInfo;  // MCP Apps UI info if available
}

/**
 * MCP tool executor with session management
 * Reuses MCP client connections for better performance
 */
export interface McpToolExecutor {
  execute: (toolName: string, args: Record<string, unknown>) => Promise<McpToolResult>;
  cleanup: () => Promise<void>;
}

/**
 * Create an MCP tool executor with session reuse
 * Returns an executor object with execute and cleanup methods
 */
export function createMcpToolExecutor(
  mcpTools: McpToolDefinition[],
  traceId?: string | null
): McpToolExecutor {
  // Create a map for quick lookup
  const toolMap = new Map<string, McpToolDefinition>();
  for (const tool of mcpTools) {
    toolMap.set(tool.name, tool);
  }

  // Client pool keyed by server URL
  const clientPool = new Map<string, McpClient>();

  const getClient = async (server: McpServerConfig): Promise<McpClient> => {
    const key = getServerKey(server);
    let client = clientPool.get(key);

    if (!client) {
      client = new McpClient(server);
      await client.initialize();
      clientPool.set(key, client);
    }

    return client;
  };

  const execute = async (toolName: string, args: Record<string, unknown>): Promise<McpToolResult> => {
    const tool = toolMap.get(toolName);
    if (!tool) {
      return { error: `MCP tool not found: ${toolName}` };
    }

    const spanId = tracing.spanStart(traceId ?? null, `mcp:${tool.mcpToolName}`, {
      input: args,
      metadata: {
        serverUrl: tool.mcpServer.url,
        toolName: tool.mcpToolName,
      },
    });

    try {
      const client = await getClient(tool.mcpServer);
      // Use callToolWithUi to get full result including UI metadata
      const appResult = await client.callToolWithUi(tool.mcpToolName, args);

      // Extract text content for the result
      const textContents = appResult.content
        .filter(c => c.type === "text" && c.text)
        .map(c => c.text!);

      if (appResult.isError) {
        const errorMsg = `MCP tool execution failed: ${textContents.join("\n")}`;
        tracing.spanEnd(spanId, { error: errorMsg });
        return { error: errorMsg };
      }

      const result: McpToolResult = {
        result: textContents.join("\n"),
      };

      // If the tool returned UI metadata, include it in the result
      if (appResult._meta?.ui?.resourceUri) {
        // Pre-fetch the UI resource
        const uiResource = await client.readResource(appResult._meta.ui.resourceUri);

        result.mcpApp = {
          serverUrl: tool.mcpServer.url,
          serverHeaders: tool.mcpServer.headers,
          toolResult: appResult,
          uiResource,
        };
      }

      tracing.spanEnd(spanId, { output: result.result });

      return result;
    } catch (error) {
      // On error, remove the client from pool to force reconnection on next call
      const key = getServerKey(tool.mcpServer);
      const client = clientPool.get(key);
      if (client) {
        await client.close().catch(() => {});
        clientPool.delete(key);
      }

      const errorMessage = formatError(error);
      tracing.spanEnd(spanId, { error: `MCP tool execution failed: ${errorMessage}` });
      return { error: `MCP tool execution failed: ${errorMessage}` };
    }
  };

  const cleanup = async (): Promise<void> => {
    const closePromises = Array.from(clientPool.values()).map(client =>
      client.close().catch(() => {})
    );
    await Promise.all(closePromises);
    clientPool.clear();
  };

  return { execute, cleanup };
}

/**
 * Clear the MCP tools cache
 */
export function clearMcpToolsCache(): void {
  toolsCache.clear();
}
