import { describe, expect, it } from "vitest";
import { AGENT_PLUGIN_MCP_SCHEMA, AGENT_PLUGIN_SCHEMA, normalizeAgentPluginRepo, parseAgentPluginManifest, parseAgentPluginMcp, resolveAgentPluginMcpServers } from "./agentPlugins";

describe("Agent Plugins v1", () => {
  it("validates manifests", () => {
    expect(parseAgentPluginManifest(JSON.stringify({ $schema: AGENT_PLUGIN_SCHEMA, name: "demo-plugin", version: "1.0.0" })).name).toBe("demo-plugin");
    expect(() => parseAgentPluginManifest(JSON.stringify({ $schema: AGENT_PLUGIN_SCHEMA, name: "../demo" }))).toThrow();
  });
  it("accepts supported GitHub repository forms", () => {
    expect(normalizeAgentPluginRepo("https://github.com/owner/repo.git")).toBe("owner/repo");
    expect(normalizeAgentPluginRepo("https://example.com/owner/repo")).toBeNull();
  });
  it("parses safe HTTP MCP servers and skips stdio", () => {
    const result = parseAgentPluginMcp(JSON.stringify({ $schema: AGENT_PLUGIN_MCP_SCHEMA, mcpServers: { remote: { type: "streamable-http", url: "https://example.com/mcp" }, local: { type: "stdio", command: "server" } } }), "demo");
    expect(result.servers[0]).toMatchObject({ name: "demo.remote", enabled: false, agentPlugin: { pluginName: "demo", serverName: "remote" } });
    expect(result.warnings).toHaveLength(1);
  });
  it("temporarily enables tested MCP servers for an active plugin skill", () => {
    const server = { name: "demo.remote", url: "https://example.com/mcp", enabled: false, toolHints: [], agentPlugin: { pluginName: "demo", serverName: "remote" } };
    const installs = [{ name: "demo", repo: "owner/repo", version: "1", sourceType: "branch" as const, sourceRef: "main", commitSha: "a".repeat(40), enabled: true, skillNames: ["review"] }];
    expect(resolveAgentPluginMcpServers([server], [".gemini-helper/agent-plugins/demo/skills/review"], installs)[0].enabled).toBe(true);
    expect(resolveAgentPluginMcpServers([{ ...server, toolHints: undefined }], [".gemini-helper/agent-plugins/demo/skills/review"], installs)[0].enabled).toBe(false);
  });
});
