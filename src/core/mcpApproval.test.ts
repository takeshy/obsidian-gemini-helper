import { afterEach, describe, expect, it, vi } from "vitest";
import { requireMcpApproval, sameMcpConnection, setMcpApprovalHandler, type McpApprovalDecision } from "./mcpApproval";
import type { McpServerConfig } from "../types";

const server: McpServerConfig = { name: "Anki", url: "http://localhost:1234", enabled: true };
afterEach(() => setMcpApprovalHandler(undefined));

function setup(decision: McpApprovalDecision = "once") {
  const saved = { ...server, allowedTools: [] as string[], autoApprove: false };
  const request = vi.fn(async () => decision);
  const remember = vi.fn(async (_server: McpServerConfig, tool: string) => { saved.allowedTools.push(tool); });
  setMcpApprovalHandler({ getServer: () => saved, request, remember });
  return { saved, request, remember };
}

describe("MCP tool approval", () => {
  it("requires approval by default and passes the exact arguments", async () => {
    const { request } = setup();
    await requireMcpApproval(server, "deleteAll", { deck: "Japanese" });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ name: "Anki" }), "deleteAll", { deck: "Japanese" }, true);
    await requireMcpApproval(server, "deleteAll", {});
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("rejects denied calls and calls with no approval handler", async () => {
    setup("deny");
    await expect(requireMcpApproval(server, "deleteAll", {})).rejects.toThrow("denied");
    setMcpApprovalHandler(undefined);
    await expect(requireMcpApproval(server, "deleteAll", {})).rejects.toThrow("unavailable");
  });

  it("remembers only the approved tool and respects later removal", async () => {
    const { saved, request, remember } = setup("always");
    await requireMcpApproval(server, "addCard", {});
    await requireMcpApproval(server, "addCard", {});
    expect(remember).toHaveBeenCalledTimes(1);
    saved.allowedTools = [];
    await requireMcpApproval(server, "addCard", {});
    await requireMcpApproval(server, "deleteAll", {});
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("uses live server settings rather than stale tool config", async () => {
    const { saved, request } = setup();
    saved.autoApprove = true;
    await requireMcpApproval(server, "anything", {});
    expect(request).not.toHaveBeenCalled();
    saved.autoApprove = false;
    await requireMcpApproval({ ...server, autoApprove: true }, "anything", {});
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("serializes simultaneous requests and rechecks the allowed list", async () => {
    const { request } = setup("always");
    await Promise.all([requireMcpApproval(server, "addCard", {}), requireMcpApproval(server, "addCard", {})]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not execute when saving permanent permission fails", async () => {
    setMcpApprovalHandler({ getServer: () => server, request: async () => "always", remember: async () => { throw new Error("Save failed"); } });
    await expect(requireMcpApproval(server, "addCard", {})).rejects.toThrow("Save failed");
  });

  it("rejects queued requests when the plugin unloads", async () => {
    setup();
    const pending = requireMcpApproval(server, "deleteAll", {});
    setMcpApprovalHandler(undefined);
    await expect(pending).rejects.toThrow("unavailable");
  });

  it("does not reuse permissions across different connections", () => {
    expect(sameMcpConnection(server, { ...server, url: "http://other" })).toBe(false);
    expect(sameMcpConnection(server, { ...server, headers: { Authorization: "different" } })).toBe(false);
    expect(sameMcpConnection(server, { ...server })).toBe(true);
  });
});
