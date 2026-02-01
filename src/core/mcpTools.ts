// MCP Tools integration for Chat
// Fetches tools from configured MCP servers and executes them

import { McpClient } from "./mcpClient";
import { isTokenExpired, refreshAccessToken, type OAuthTokens } from "./oauth";
import type { McpServerConfig, McpToolInfo, ToolDefinition, ToolPropertyDefinition, McpAppInfo } from "../types";

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
 * Normalize headers for cache/pool key generation.
 * Optionally strips Authorization to avoid token churn in keys.
 */
function normalizeHeadersForKey(
  headers?: Record<string, string>,
  ignoreAuthorization = false
): string {
  if (!headers) {
    return "";
  }

  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (ignoreAuthorization && lowerKey === "authorization") {
      continue;
    }
    normalized.set(lowerKey, value);
  }

  const sortedEntries = Array.from(normalized.entries()).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(Object.fromEntries(sortedEntries));
}

function getAuthorizationHeader(headers?: Record<string, string>): string | undefined {
  if (!headers) {
    return undefined;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "authorization") {
      return value;
    }
  }
  return undefined;
}

/**
 * Get a unique key for an MCP server config (for caching/pooling).
 * Includes base headers and OAuth token identifier to ensure cache invalidation on token change.
 */
function getServerKey(server: McpServerConfig): string {
  const ignoreAuthorization = Boolean(server.oauthTokens?.accessToken);
  const headersKey = normalizeHeadersForKey(server.headers, ignoreAuthorization);
  // Include OAuth token identifier to invalidate cache when token changes (e.g., different account)
  const tokenId = server.oauthTokens?.accessToken
    ? server.oauthTokens.accessToken.slice(0, 16)
    : "";
  return `${server.url}:${server.name}:${headersKey}:${tokenId}`;
}

/**
 * Callback for token refresh - allows callers to persist updated tokens
 * Can be sync or async
 */
export type OnTokenRefreshCallback = (serverName: string, tokens: OAuthTokens) => void | Promise<void>;

/**
 * Prepare server config with OAuth Authorization header if tokens are available.
 * Handles token refresh if expired.
 * @param server - MCP server configuration
 * @param onTokenRefresh - Optional callback when tokens are refreshed
 * @returns Server config with Authorization header added if OAuth tokens exist
 */
export async function prepareServerConfigWithAuth(
  server: McpServerConfig,
  onTokenRefresh?: OnTokenRefreshCallback
): Promise<McpServerConfig> {
  if (!server.oauthTokens?.accessToken) {
    return server;
  }

  let tokens = server.oauthTokens;

  // Check if token is expired
  if (isTokenExpired(tokens)) {
    // Try to refresh if we have a refresh token and OAuth config
    if (tokens.refreshToken && server.oauth) {
      try {
        tokens = await refreshAccessToken(server.oauth, tokens.refreshToken);
        // Notify caller so they can persist the new tokens (save error should not break auth)
        if (onTokenRefresh) {
          try {
            await onTokenRefresh(server.name, tokens);
          } catch (saveError) {
            console.warn(`Failed to persist refreshed tokens for MCP server ${server.name}:`, saveError);
            // Continue with the refreshed tokens even if save failed
          }
        }
      } catch {
        // Token refresh failed - return without auth, let server return 401
        console.warn(`OAuth token refresh failed for MCP server ${server.name}`);
        return server;
      }
    } else {
      // Token expired but no refresh token available - return without auth to trigger re-auth
      console.warn(`OAuth token expired and no refresh token for MCP server ${server.name}`);
      return server;
    }
  }

  // Return config with Authorization header
  return {
    ...server,
    headers: {
      ...server.headers,
      Authorization: `${tokens.tokenType || "Bearer"} ${tokens.accessToken}`,
    },
  };
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
 * @param server - MCP server configuration
 * @param onTokenRefresh - Optional callback when OAuth tokens are refreshed
 */
async function fetchToolsFromServer(
  server: McpServerConfig,
  onTokenRefresh?: OnTokenRefreshCallback
): Promise<McpToolDefinition[]> {
  // Prepare server config with OAuth headers if available
  const serverWithAuth = await prepareServerConfigWithAuth(server, onTokenRefresh);
  const client = new McpClient(serverWithAuth);

  try {
    await client.initialize();
    const mcpTools = await client.listTools();
    await client.close();

    // Store original server config (without injected auth header) in tool definition
    // This ensures mcpServer in tool definitions has the persistent config
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
 * @param onTokenRefresh - Optional callback when OAuth tokens are refreshed
 */
export async function fetchMcpTools(
  servers: McpServerConfig[],
  forceRefresh = false,
  onTokenRefresh?: OnTokenRefreshCallback
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
      const tools = await fetchToolsFromServer(server, onTokenRefresh);
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
 * @param mcpTools - Array of MCP tool definitions
 * @param onTokenRefresh - Optional callback when OAuth tokens are refreshed
 */
export function createMcpToolExecutor(
  mcpTools: McpToolDefinition[],
  onTokenRefresh?: OnTokenRefreshCallback
): McpToolExecutor {
  // Create a map for quick lookup
  const toolMap = new Map<string, McpToolDefinition>();
  for (const tool of mcpTools) {
    toolMap.set(tool.name, tool);
  }

  // Client pool keyed by server key (URL + name)
  // Store both client and the auth-enriched config for mcpApp headers
  interface PoolEntry {
    client: McpClient;
    serverWithAuth: McpServerConfig;
  }
  const clientPool = new Map<string, PoolEntry>();

  const getClientEntry = async (server: McpServerConfig): Promise<PoolEntry> => {
    const key = getServerKey(server);
    const keyPrefix = `${server.url}:${server.name}:`;

    // Prepare server config with OAuth headers
    const serverWithAuth = await prepareServerConfigWithAuth(server, onTokenRefresh);

    // Remove stale entries for the same server if headers changed
    for (const [existingKey, entry] of clientPool) {
      if (existingKey.startsWith(keyPrefix) && existingKey !== key) {
        await entry.client.close().catch(() => {});
        clientPool.delete(existingKey);
      }
    }

    let entry = clientPool.get(key);
    if (entry) {
      const previousAuth = getAuthorizationHeader(entry.serverWithAuth.headers);
      const nextAuth = getAuthorizationHeader(serverWithAuth.headers);

      if (previousAuth !== nextAuth) {
        await entry.client.close().catch(() => {});
        clientPool.delete(key);
        entry = undefined;
      }
    }

    if (!entry) {
      const client = new McpClient(serverWithAuth);
      await client.initialize();
      entry = { client, serverWithAuth };
      clientPool.set(key, entry);
    } else {
      // Keep latest headers for UI operations
      entry.serverWithAuth = serverWithAuth;
    }

    return entry;
  };

  const execute = async (toolName: string, args: Record<string, unknown>): Promise<McpToolResult> => {
    const tool = toolMap.get(toolName);
    if (!tool) {
      return { error: `MCP tool not found: ${toolName}` };
    }

    const key = getServerKey(tool.mcpServer);

    try {
      const { client, serverWithAuth } = await getClientEntry(tool.mcpServer);
      // Use callToolWithUi to get full result including UI metadata
      const appResult = await client.callToolWithUi(tool.mcpToolName, args);

      // Extract text content for the result
      const textContents = appResult.content
        .filter(c => c.type === "text" && c.text)
        .map(c => c.text!);

      if (appResult.isError) {
        return { error: `MCP tool execution failed: ${textContents.join("\n")}` };
      }

      const result: McpToolResult = {
        result: textContents.join("\n"),
      };

      // If the tool returned UI metadata, include it in the result
      if (appResult._meta?.ui?.resourceUri) {
        // Pre-fetch the UI resource
        const uiResource = await client.readResource(appResult._meta.ui.resourceUri);

        result.mcpApp = {
          serverUrl: serverWithAuth.url,
          // Include OAuth Authorization header for MCP App UI operations
          serverHeaders: serverWithAuth.headers,
          toolResult: appResult,
          uiResource,
        };
      }

      return result;
    } catch (error) {
      // On error, remove the client from pool to force reconnection on next call
      const entry = clientPool.get(key);
      if (entry) {
        await entry.client.close().catch(() => {});
        clientPool.delete(key);
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      return { error: `MCP tool execution failed: ${errorMessage}` };
    }
  };

  const cleanup = async (): Promise<void> => {
    const closePromises = Array.from(clientPool.values()).map(entry =>
      entry.client.close().catch(() => {})
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
