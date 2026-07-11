import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  parseYaml: (value: string) => JSON.parse(value) as unknown,
  stringifyYaml: (value: unknown) => JSON.stringify(value),
}));

import { kanbanDefinitionFromConfig, parseKanbanFile, serializeKanbanFile } from "./kanbanFile";

describe("kanban files", () => {
  it("round trips a board definition", () => {
    const board = { title: "Tasks", folder: "Projects", columns: [{ value: "todo", label: "To do" }] };
    expect(parseKanbanFile(serializeKanbanFile(board))).toEqual(board);
  });
  it("rejects non-object yaml", () => expect(parseKanbanFile("- item")).toBeNull());
  it("excludes widget-only state from shared definitions", () => {
    expect(kanbanDefinitionFromConfig({
      kanban: "Dashboards/Kanbans/Tasks.kanban",
      cardOrder: ["Tasks/A.md"],
      title: "Tasks",
    })).toEqual({ title: "Tasks" });
  });
});
