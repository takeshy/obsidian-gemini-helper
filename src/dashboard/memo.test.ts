import { describe, expect, it } from "vitest";
import { TFile, type App } from "obsidian";
import { memoPathFor, parseMemoFile, readMemos, serializeMemoFile, writeMemos } from "./memo";

function file(path: string): TFile {
  const f = new TFile();
  f.path = path;
  f.basename = path.replace(/\.md$/, "").split("/").pop() ?? path;
  return f;
}

function makeApp(initialFiles: Record<string, string> = {}) {
  const files = new Map(Object.entries(initialFiles));
  const folders = new Set<string>();
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => (files.has(path) ? file(path) : null),
      createFolder: async (path: string) => {
        folders.add(path);
      },
      cachedRead: async (f: TFile) => files.get(f.path) ?? "",
      create: async (path: string, content: string) => {
        files.set(path, content);
        return file(path);
      },
      modify: async (f: TFile, content: string) => {
        files.set(f.path, content);
      },
    },
  } as unknown as App;
  return { app, files };
}

describe("memo file format", () => {
  it("round-trips memos without quotes", () => {
    const content = serializeMemoFile("Books/sample.epub", [{
      id: "1",
      createdAt: "2026-07-04T12:00:00.000Z",
      text: "読了",
    }]);

    expect(parseMemoFile(content).memos).toEqual([{
      id: "1",
      createdAt: "2026-07-04T12:00:00.000Z",
      text: "読了",
    }]);
  });

  it("round-trips memos with selected quote relations", () => {
    const content = serializeMemoFile("Books/sample.epub", [{
      id: "1",
      createdAt: "2026-07-04T12:00:00.000Z",
      quote: "selected\ntext",
      quoteAnchor: "page=3",
      quotePrefix: "before",
      quoteSuffix: "after",
      text: "note body",
    }]);

    expect(parseMemoFile(content).memos[0]).toMatchObject({
      id: "1",
      createdAt: "2026-07-04T12:00:00.000Z",
      quote: "selected\ntext",
      quoteAnchor: "page=3",
      quotePrefix: "before",
      quoteSuffix: "after",
      text: "note body",
    });
    expect(content).toContain("anchor: page=3");
    expect(content).toContain("quote-prefix: before");
    expect(content).toContain("---\nsource: Books/sample.epub\n---\n");
  });
});

describe("memoPathFor", () => {
  it("keeps short, legal file names as-is", () => {
    expect(memoPathFor("Books/sample.epub")).toBe("Dashboards/Memos/Books_sample.epub.md");
  });

  it("strips characters that are illegal in file names", () => {
    const path = memoPathFor('weird:name*with?illegal"chars<>|.epub');
    expect(path).not.toMatch(/[:*?"<>|]/);
    expect(path.startsWith("Dashboards/Memos/")).toBe(true);
    expect(path.endsWith(".md")).toBe(true);
  });

  it("truncates very long source paths instead of producing an oversized file name", () => {
    const longTitle = "あ".repeat(300) + ".epub";
    const path = memoPathFor(longTitle);
    const baseName = path.slice("Dashboards/Memos/".length, -".md".length);
    expect(baseName.length).toBeLessThanOrEqual(100);
  });
});

describe("read/writeMemos collision handling", () => {
  it("reuses the same file across writes and reads for one source", async () => {
    const { app, files } = makeApp();
    await writeMemos(app, "Books/sample.epub", [
      { id: "1", createdAt: "2026-07-04T12:00:00.000Z", text: "first" },
    ]);
    expect([...files.keys()]).toEqual(["Dashboards/Memos/Books_sample.epub.md"]);

    const memos = await readMemos(app, "Books/sample.epub");
    expect(memos).toEqual([{ id: "1", createdAt: "2026-07-04T12:00:00.000Z", text: "first" }]);
  });

  it("appends a sequence number when two different sources sanitize to the same base name", async () => {
    const { app, files } = makeApp();
    // ":" and "?" both sanitize to "_", so these two distinct sources collide on the same base name.
    await writeMemos(app, "Notes/idea:1.md", [
      { id: "1", createdAt: "2026-07-04T12:00:00.000Z", text: "from colon" },
    ]);
    await writeMemos(app, "Notes/idea?1.md", [
      { id: "2", createdAt: "2026-07-04T12:00:00.000Z", text: "from question mark" },
    ]);

    expect([...files.keys()].sort()).toEqual([
      "Dashboards/Memos/Notes_idea_1.md (1).md",
      "Dashboards/Memos/Notes_idea_1.md.md",
    ]);

    expect(await readMemos(app, "Notes/idea:1.md")).toMatchObject([{ text: "from colon" }]);
    expect(await readMemos(app, "Notes/idea?1.md")).toMatchObject([{ text: "from question mark" }]);

    // Writing again for the first source must not create yet another file.
    await writeMemos(app, "Notes/idea:1.md", [
      { id: "1", createdAt: "2026-07-04T12:00:00.000Z", text: "from colon updated" },
    ]);
    expect(files.size).toBe(2);
  });
});
