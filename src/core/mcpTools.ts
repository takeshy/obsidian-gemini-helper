// MCP tool discovery and execution live in the shared library.
export {
  fetchMcpTools,
  isMcpTool,
  createMcpToolExecutor,
  clearMcpToolsCache,
  getMcpAppResourceUri,
  type McpToolDefinition,
  type McpToolResult,
  type McpToolExecutor,
} from "obsidian-llm-hub-common/mcp";
