import { describe, expect, it } from "vitest";
import { getEnabledTools, isVaultToolAllowed } from "./tools";

describe("Vault tool modes", () => {
  const tools = getEnabledTools({ allowWrite: true, allowDelete: true });
  it("exposes only search and read tools in readOnly mode", () => {
    expect(tools.filter(tool => isVaultToolAllowed(tool.name, "readOnly")).map(tool => tool.name).sort()).toEqual([
      "get_active_note_info", "list_folders", "list_notes", "read_note", "read_timeline", "search_notes",
    ]);
  });
  it("preserves existing modes and external tools", () => {
    expect(tools.every(tool => isVaultToolAllowed(tool.name, "all"))).toBe(true);
    expect(tools.some(tool => isVaultToolAllowed(tool.name, "none"))).toBe(false);
    expect(isVaultToolAllowed("create_note", "noSearch")).toBe(true);
    expect(isVaultToolAllowed("search_notes", "noSearch")).toBe(false);
    expect(isVaultToolAllowed("mcp_external_tool", "readOnly")).toBe(true);
    expect(isVaultToolAllowed("run_skill_workflow", "readOnly")).toBe(true);
  });
});
