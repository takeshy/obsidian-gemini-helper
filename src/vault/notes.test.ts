import { beforeEach, describe, expect, it } from "vitest";
import { TFile, type App } from "obsidian";
import { initEditHistoryManager, resetEditHistoryManager } from "src/core/editHistory";
import { clearAllHistories } from "src/core/editHistoryStore";
import {
  applyBulkEdit,
  applyEdit,
  clearPendingBulkEdit,
  discardEdit,
  proposeBulkEdit,
  proposeEdit,
} from "./notes";

class MockVault {
  private files = new Map<string, TFile>();
  private contents = new Map<string, string>();

  addMarkdownFile(path: string, content: string): TFile {
    const file = new TFile();
    file.path = path;
    file.name = path.split("/").pop() ?? path;
    file.extension = "md";
    file.basename = file.name.replace(/\.md$/, "");

    this.files.set(path, file);
    this.contents.set(path, content);
    return file;
  }

  getMarkdownFiles(): TFile[] {
    return [...this.files.values()];
  }

  getAbstractFileByPath(path: string): TFile | null {
    return this.files.get(path) ?? null;
  }

  async read(file: TFile): Promise<string> {
    return this.contents.get(file.path) ?? "";
  }

  async modify(file: TFile, content: string): Promise<void> {
    this.contents.set(file.path, content);
  }

  setContent(path: string, content: string): void {
    this.contents.set(path, content);
  }

  getContent(path: string): string {
    return this.contents.get(path) ?? "";
  }
}

function createMockApp(vault: MockVault, activeFile?: TFile): App {
  return {
    vault,
    workspace: {
      getActiveFile: () => activeFile ?? null,
      getLeaf: () => ({
        openFile: async () => undefined,
      }),
    },
  } as unknown as App;
}

describe("notes edit history integration", () => {
  beforeEach(() => {
    clearAllHistories();
    resetEditHistoryManager();
    discardEdit({} as App);
    clearPendingBulkEdit();
  });

  it("records external changes before applyEdit as auto history", async () => {
    const vault = new MockVault();
    const file = vault.addMarkdownFile("daily.md", "v1\n");
    const app = createMockApp(vault, file);
    const historyManager = initEditHistoryManager(app, {
      enabled: true,
      diff: { contextLines: 3 },
    });

    await historyManager.ensureSnapshot(file.path);

    const proposeResult = await proposeEdit(app, undefined, true, "v3\n");
    expect(proposeResult.success).toBe(true);

    vault.setContent(file.path, "v2\n");

    const applyResult = await applyEdit(app);
    expect(applyResult.success).toBe(true);
    expect(vault.getContent(file.path)).toBe("v3\n");

    const entries = historyManager.getHistory(file.path);
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.source)).toEqual(["auto", "propose_edit"]);
    expect(historyManager.getSnapshot(file.path)).toBe("v3\n");
    expect(historyManager.getContentAt(file.path, entries[1].id)).toBe("v2\n");
    expect(historyManager.getContentAt(file.path, entries[0].id)).toBe("v1\n");
  });

  it("records external changes before applyBulkEdit as auto history", async () => {
    const vault = new MockVault();
    vault.addMarkdownFile("bulk.md", "one\n");
    const app = createMockApp(vault);
    const historyManager = initEditHistoryManager(app, {
      enabled: true,
      diff: { contextLines: 3 },
    });

    await historyManager.ensureSnapshot("bulk.md");

    const proposeResult = await proposeBulkEdit(app, [
      { fileName: "bulk", newContent: "three\n", mode: "replace" },
    ]);
    expect(proposeResult.success).toBe(true);

    vault.setContent("bulk.md", "two\n");

    const applyResult = await applyBulkEdit(app, ["bulk.md"]);
    expect(applyResult.success).toBe(true);
    expect(applyResult.applied).toEqual(["bulk.md"]);
    expect(vault.getContent("bulk.md")).toBe("three\n");

    const entries = historyManager.getHistory("bulk.md");
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.source)).toEqual(["auto", "propose_edit"]);
    expect(historyManager.getSnapshot("bulk.md")).toBe("three\n");
    expect(historyManager.getContentAt("bulk.md", entries[1].id)).toBe("two\n");
    expect(historyManager.getContentAt("bulk.md", entries[0].id)).toBe("one\n");
  });
});
