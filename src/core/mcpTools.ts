// MCP Tools integration for Chat
// Fetches tools from configured MCP servers and executes them

import { McpClient } from "./mcpClient";
import type { McpServerConfig, McpToolInfo, ToolDefinition, ToolPropertyDefinition } from "../types";

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

/**
 * Get a unique key for an MCP server config
 */
function getServerKey(server: McpServerConfig): string {
  return `${server.url}:${JSON.stringify(server.headers || {})}`;
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
      properties[key] = {
        type: (prop.type as string) || "string",
        description: (prop.description as string) || "",
      };
      if (prop.enum) {
        properties[key].enum = prop.enum as string[];
      }
    }
  }

  // Process required fields
  if (inputSchema.required && Array.isArray(inputSchema.required)) {
    required.push(...(inputSchema.required as string[]));
  }

  // Create a unique tool name by prefixing with server name
  // This avoids conflicts between tools from different servers
  const uniqueName = `mcp_${server.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${tool.name}`;

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

  const allTools: McpToolDefinition[] = [];
  const now = Date.now();

  for (const server of servers) {
    const cacheKey = getServerKey(server);
    const cached = toolsCache.get(cacheKey);

    // Use cache if available and not expired
    if (!forceRefresh && cached && (now - cached.fetchedAt) < CACHE_TTL_MS) {
      allTools.push(...cached.tools);
      continue;
    }

    // Fetch fresh tools
    const tools = await fetchToolsFromServer(server);

    // Update cache
    toolsCache.set(cacheKey, {
      tools,
      fetchedAt: now,
    });

    allTools.push(...tools);
  }

  return allTools;
}

/**
 * Check if a tool is an MCP tool
 */
export function isMcpTool(tool: ToolDefinition): tool is McpToolDefinition {
  return "mcpServer" in tool && "mcpToolName" in tool;
}

/**
 * Create an MCP tool executor
 * Returns a function that executes MCP tools by name
 */
export function createMcpToolExecutor(
  mcpTools: McpToolDefinition[]
): (toolName: string, args: Record<string, unknown>) => Promise<unknown> {
  // Create a map for quick lookup
  const toolMap = new Map<string, McpToolDefinition>();
  for (const tool of mcpTools) {
    toolMap.set(tool.name, tool);
  }

  return async (toolName: string, args: Record<string, unknown>): Promise<unknown> => {
    const tool = toolMap.get(toolName);
    if (!tool) {
      return { error: `MCP tool not found: ${toolName}` };
    }

    const client = new McpClient(tool.mcpServer);

    try {
      await client.initialize();
      const result = await client.callTool(tool.mcpToolName, args);
      await client.close();

      return { result };
    } catch (error) {
      await client.close().catch(() => {});

      const errorMessage = error instanceof Error ? error.message : String(error);
      return { error: `MCP tool execution failed: ${errorMessage}` };
    }
  };
}

/**
 * Clear the MCP tools cache
 */
export function clearMcpToolsCache(): void {
  toolsCache.clear();
}
