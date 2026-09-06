// The HTTP transport, the approval gate and the client factory live in the shared library.
// This plugin has no stdio transport, so the factory refuses a locally spawned server.
export {
  McpHttpClient,
  McpHttpClient as McpClient,
  createMcpClient,
  configureMcpClientInfo,
  MCP_APPS_CLIENT_CAPABILITIES,
  type IMcpClient,
  type McpInitializeResult,
  type McpToolsListResult,
  type McpToolCallResult,
  type McpResourceReadResult,
} from "obsidian-llm-hub-common/mcp";
