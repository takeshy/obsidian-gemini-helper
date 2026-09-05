import type { McpServerConfig } from "../types";

export type McpApprovalDecision = "once" | "always" | "deny";
export interface McpApprovalHandler {
  getServer: (server: McpServerConfig) => McpServerConfig | undefined;
  request: (server: McpServerConfig, tool: string, args: Record<string, unknown>, canRemember: boolean) => Promise<McpApprovalDecision>;
  remember: (server: McpServerConfig, tool: string) => Promise<void>;
}

let handler: McpApprovalHandler | undefined;
let pending: Promise<unknown> = Promise.resolve();

export function setMcpApprovalHandler(value: McpApprovalHandler | undefined): void {
  handler = value;
}

// Include connection details so permission never transfers to a different endpoint.
export function sameMcpConnection(a: McpServerConfig, b: McpServerConfig): boolean {
  const recordKey = (value?: Record<string, string>) => JSON.stringify(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)));
  return a.url === b.url && recordKey(a.headers) === recordKey(b.headers);
}

export function requireMcpApproval(server: McpServerConfig, tool: string, args: Record<string, unknown>): Promise<void> {
  const current = handler;
  const run = async () => {
    if (!current || current !== handler) throw new Error("MCP tool approval is unavailable");
    const saved = current.getServer(server);
    if (saved?.autoApprove || saved?.allowedTools?.includes(tool)) return;
    const decision = await current.request(saved ?? server, tool, args, !!saved);
    if (current !== handler || decision === "deny") throw new Error(`MCP tool call denied by user: ${tool}`);
    if (decision === "always") {
      const latest = current.getServer(server);
      if (!latest) throw new Error("MCP server settings changed during approval");
      await current.remember(latest, tool);
    }
  };
  const result = pending.then(run);
  pending = result.catch(() => {});
  return result;
}
