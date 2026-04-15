import { describe, it, expect } from "vitest";
import { computeLegacyWorkflowIdMigration } from "./workflowMigration";
import type { WorkflowEventTrigger } from "src/types";

const trigger = (overrides: Partial<WorkflowEventTrigger> = {}): WorkflowEventTrigger => ({
  workflowId: "foo.md",
  events: ["create"],
  filePattern: "",
  ...overrides,
});

describe("computeLegacyWorkflowIdMigration", () => {
  it("strips #name suffix from hotkeys", () => {
    const result = computeLegacyWorkflowIdMigration({
      enabledWorkflowHotkeys: ["foo.md#workflowA", "bar.md"],
      enabledWorkflowEventTriggers: [],
    });
    expect(result.hotkeys).toEqual(["foo.md", "bar.md"]);
    expect(result.hotkeysChanged).toBe(true);
  });

  it("dedups hotkeys that collapse to the same path", () => {
    const result = computeLegacyWorkflowIdMigration({
      enabledWorkflowHotkeys: ["foo.md#a", "foo.md#b", "foo.md"],
      enabledWorkflowEventTriggers: [],
    });
    expect(result.hotkeys).toEqual(["foo.md"]);
  });

  it("leaves hotkeys untouched when no change is needed", () => {
    const input = {
      enabledWorkflowHotkeys: ["a.md", "b.md"],
      enabledWorkflowEventTriggers: [],
    };
    const result = computeLegacyWorkflowIdMigration(input);
    expect(result.hotkeys).toEqual(["a.md", "b.md"]);
    expect(result.hotkeysChanged).toBe(false);
  });

  it("strips #name from trigger workflowIds", () => {
    const result = computeLegacyWorkflowIdMigration({
      enabledWorkflowHotkeys: [],
      enabledWorkflowEventTriggers: [trigger({ workflowId: "foo.md#x" })],
    });
    expect(result.triggers[0].workflowId).toBe("foo.md");
    expect(result.triggersChanged).toBe(true);
  });

  it("preserves triggers that differ only by filePattern", () => {
    const result = computeLegacyWorkflowIdMigration({
      enabledWorkflowHotkeys: [],
      enabledWorkflowEventTriggers: [
        trigger({ workflowId: "foo.md#a", filePattern: "*.md" }),
        trigger({ workflowId: "foo.md#b", filePattern: "*.yaml" }),
      ],
    });
    expect(result.triggers).toHaveLength(2);
    expect(result.triggers.map(t => t.filePattern).sort()).toEqual(["*.md", "*.yaml"]);
  });

  it("dedups triggers that become identical after stripping", () => {
    const result = computeLegacyWorkflowIdMigration({
      enabledWorkflowHotkeys: [],
      enabledWorkflowEventTriggers: [
        trigger({ workflowId: "foo.md#a", events: ["create"], filePattern: "*.md" }),
        trigger({ workflowId: "foo.md#b", events: ["create"], filePattern: "*.md" }),
      ],
    });
    expect(result.triggers).toHaveLength(1);
    expect(result.triggers[0].workflowId).toBe("foo.md");
  });

  it("treats empty-string and undefined filePattern as the same key", () => {
    const result = computeLegacyWorkflowIdMigration({
      enabledWorkflowHotkeys: [],
      enabledWorkflowEventTriggers: [
        trigger({ workflowId: "foo.md#a", filePattern: "" }),
        trigger({ workflowId: "foo.md#b", filePattern: undefined }),
      ],
    });
    expect(result.triggers).toHaveLength(1);
  });

  it("keeps `\"\"` and `\"*\"` as distinct filePatterns", () => {
    const result = computeLegacyWorkflowIdMigration({
      enabledWorkflowHotkeys: [],
      enabledWorkflowEventTriggers: [
        trigger({ workflowId: "foo.md#a", filePattern: "" }),
        trigger({ workflowId: "foo.md#b", filePattern: "*" }),
      ],
    });
    expect(result.triggers).toHaveLength(2);
  });

  it("orders events in dedup key so event order does not matter", () => {
    const result = computeLegacyWorkflowIdMigration({
      enabledWorkflowHotkeys: [],
      enabledWorkflowEventTriggers: [
        trigger({ workflowId: "foo.md#a", events: ["create", "modify"] }),
        trigger({ workflowId: "foo.md#b", events: ["modify", "create"] }),
      ],
    });
    expect(result.triggers).toHaveLength(1);
  });

  it("reports triggersChanged=false when nothing moved", () => {
    const result = computeLegacyWorkflowIdMigration({
      enabledWorkflowHotkeys: [],
      enabledWorkflowEventTriggers: [trigger({ workflowId: "foo.md" })],
    });
    expect(result.triggersChanged).toBe(false);
  });
});
