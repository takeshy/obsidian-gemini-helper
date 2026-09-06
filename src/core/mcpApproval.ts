// The MCP tool approval gate lives in the shared library.
export {
  requireMcpApproval,
  setMcpApprovalHandler,
  sameMcpConnection,
  type McpApprovalDecision,
  type McpApprovalHandler,
} from "obsidian-llm-hub-common/mcp";
