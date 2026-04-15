import { describe, it, expect, vi } from "vitest";

// Override the obsidian mock's `parseYaml` for this suite so `findWorkflowBlocks`
// can pick up `name:` keys and the planner can slug-ify them. The production
// parser uses the real obsidian `parseYaml`, but the test environment ships a
// stub that throws; without this, every block's `name` would be undefined and
// the planner would always fall back to `workflow-<n>`.
vi.mock("obsidian", async () => {
  const actual = await vi.importActual<typeof import("obsidian")>("obsidian");
  return {
    ...actual,
    parseYaml: (text: string): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      const m = text.match(/^\s*name:\s*(.+?)\s*$/m);
      if (m) out.name = m[1].replace(/^['"]|['"]$/g, "");
      return out;
    },
  };
});

import { planMultiBlockMigration } from "./multiBlockMigration";

const block = (name: string | null) => {
  const header = name !== null ? `name: ${name}\n` : "";
  return `\`\`\`workflow\n${header}nodes:\n  - id: a\n    type: command\n    prompt: hi\n\`\`\``;
};

describe("planMultiBlockMigration", () => {
  it("returns null when the file has fewer than two workflow blocks", () => {
    expect(planMultiBlockMigration("prose only", "skills/x", new Set())).toBeNull();
    expect(planMultiBlockMigration(block("first"), "skills/x", new Set())).toBeNull();
  });

  it("keeps block[0] in place and splits block[1..N] into sibling files", () => {
    const content = `${block("first")}\n\n${block("second")}\n\n${block("third")}\n`;
    const plan = planMultiBlockMigration(content, "workflows", new Set());
    expect(plan).not.toBeNull();
    expect(plan!.entries.map(e => e.path)).toEqual([
      "workflows/second.md",
      "workflows/third.md",
    ]);
    // Stripped original keeps block[0] only.
    expect(plan!.stripped.match(/```workflow/g)).toHaveLength(1);
    expect(plan!.stripped).toContain("name: first");
    expect(plan!.stripped).not.toContain("name: second");
    expect(plan!.stripped).not.toContain("name: third");
  });

  it("falls back to workflow-<index> when a block has no name", () => {
    const content = `${block("first")}\n\n${block(null)}\n`;
    const plan = planMultiBlockMigration(content, "", new Set());
    expect(plan!.entries[0].path).toBe("workflow-2.md");
  });

  it("suffixes -2, -3, ... on collision against existing vault paths", () => {
    const content = `${block("first")}\n\n${block("second")}\n\n${block("second")}\n`;
    const existing = new Set(["workflows/second.md"]);
    const plan = planMultiBlockMigration(content, "workflows", existing);
    expect(plan!.entries.map(e => e.path)).toEqual([
      "workflows/second-2.md",
      "workflows/second-3.md", // collides with in-flight -2, bumps again
    ]);
  });

  it("slugs non-ASCII / special chars into a safe basename", () => {
    const content = `${block("first")}\n\n${block("My Fancy Workflow!")}\n`;
    const plan = planMultiBlockMigration(content, "", new Set());
    expect(plan!.entries[0].path).toBe("my-fancy-workflow.md");
  });

  it("collapses runs of blank lines introduced by splicing", () => {
    const content = `${block("first")}\n\n\n\n${block("second")}\n\n\n\n`;
    const plan = planMultiBlockMigration(content, "", new Set());
    // After removing block "second", we should not leave 4+ consecutive newlines.
    expect(plan!.stripped).not.toMatch(/\n{3,}/);
    // File ends with a single trailing newline.
    expect(plan!.stripped.endsWith("\n")).toBe(true);
  });

  it("stores each block's raw text for re-creation", () => {
    const content = `${block("first")}\n\n${block("second")}\n`;
    const plan = planMultiBlockMigration(content, "", new Set());
    expect(plan!.entries[0].raw).toContain("name: second");
    expect(plan!.entries[0].raw.startsWith("```workflow")).toBe(true);
    expect(plan!.entries[0].raw.trimEnd().endsWith("```")).toBe(true);
  });

  it("handles empty folderPath (root of vault)", () => {
    const content = `${block("first")}\n\n${block("second")}\n`;
    const plan = planMultiBlockMigration(content, "", new Set());
    expect(plan!.entries[0].path).toBe("second.md");
  });
});
