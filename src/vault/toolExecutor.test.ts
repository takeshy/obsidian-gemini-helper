import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, TFile, TFolder } from "obsidian";
import { executeToolCall } from "./toolExecutor";

const mockGetFileSearchManager = vi.hoisted(() => vi.fn());

vi.mock("src/core/fileSearch", () => ({
  getFileSearchManager: mockGetFileSearchManager,
}));

function makeFolder(path: string): TFolder {
  const folder = new TFolder();
  folder.path = path;
  folder.name = path.split("/").pop() ?? path;
  return folder;
}

function makeFile(path: string, content = ""): TFile {
  const file = new TFile();
  const name = path.split("/").pop() ?? path;
  const lastDot = name.lastIndexOf(".");
  file.path = path;
  file.name = name;
  file.basename = lastDot > 0 ? name.slice(0, lastDot) : name;
  file.extension = lastDot > 0 ? name.slice(lastDot + 1) : "";
  file.parent = path.includes("/") ? makeFolder(path.slice(0, path.lastIndexOf("/"))) : null;
  file.stat = { ctime: 1, mtime: 1, size: content.length };
  (file as TFile & { _content: string })._content = content;
  return file;
}

function makeApp(files: TFile[], activeFile: TFile | null = null): App {
  const folders = [
    makeFolder("Public"),
    makeFolder("Private"),
    makeFolder("Public/Nested"),
  ];
  return {
    vault: {
      getFiles: () => files,
      getMarkdownFiles: () => files.filter((file) => file.extension === "md"),
      getAllLoadedFiles: () => [...folders, ...files],
      getAbstractFileByPath: (path: string) => files.find((file) => file.path === path) ?? null,
      read: async (file: TFile) => (file as TFile & { _content: string })._content,
      cachedRead: async (file: TFile) => (file as TFile & { _content: string })._content,
    },
    workspace: {
      getActiveFile: () => activeFile,
    },
  } as unknown as App;
}

describe("AI vault tool folder scope", () => {
  beforeEach(() => {
    mockGetFileSearchManager.mockReset();
  });

  it("reads Dashboard Hub Timeline activity through the dedicated AI tool", async () => {
    const app = makeApp([
      makeFile("Dashboards/Timeline/Timeline/2026-07-23.md", "2026-07-23T01:00:00.000Z\nid: memo-1\n\nMemo created"),
      makeFile("Dashboards/Timeline/Timeline/2026-07-30.md", "2026-07-23T02:00:00.000Z\nid: event-1\n\n<!-- calendar-event: 2026-07-30 -->\n> Planned review"),
    ]);

    const result = await executeToolCall(app, "read_timeline", { date: "2026-07-23" });

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
    expect(String(result.content)).toContain("Memo created");
    expect(String(result.content)).toContain("Planned review");
  });

  it("allows the whole vault when no allowed folders are configured", async () => {
    const app = makeApp([makeFile("Private/Secret.md", "secret")]);

    const result = await executeToolCall(app, "read_note", { fileName: "Private/Secret.md" }, {
      limitAiVaultToolScope: true,
      aiVaultToolAllowedFolders: [],
    });

    expect(result.success).toBe(true);
    expect(result.path).toBe("Private/Secret.md");
  });

  it("blocks direct note reads outside configured folders", async () => {
    const app = makeApp([
      makeFile("Public/Note.md", "public"),
      makeFile("Private/Secret.md", "secret"),
    ]);

    const result = await executeToolCall(app, "read_note", { fileName: "Private/Secret.md" }, {
      limitAiVaultToolScope: true,
      aiVaultToolAllowedFolders: ["Public"],
    });

    expect(result.success).toBe(false);
    expect(String(result.error)).toContain("Access denied");
  });

  it("blocks traversal paths that would escape configured folders", async () => {
    const app = makeApp([
      makeFile("Public/Note.md", "public"),
      makeFile("Private/Secret.md", "secret"),
    ]);

    const result = await executeToolCall(app, "create_note", {
      name: "../Private/Secret.md",
      folder: "Public",
      content: "leak",
    }, {
      limitAiVaultToolScope: true,
      aiVaultToolAllowedFolders: ["Public"],
    });

    expect(result.success).toBe(false);
    expect(String(result.error)).toContain("Access denied");
  });

  it("does not treat invalid configured folders as whole-vault access", async () => {
    const app = makeApp([makeFile("Private/Secret.md", "secret")]);

    const result = await executeToolCall(app, "read_note", { fileName: "Private/Secret.md" }, {
      limitAiVaultToolScope: true,
      aiVaultToolAllowedFolders: [".."],
    });

    expect(result.success).toBe(false);
    expect(String(result.error)).toContain("Access denied");
  });

  it("filters search and list results to configured folders", async () => {
    const app = makeApp([
      makeFile("Public/Plan.md", "shared roadmap"),
      makeFile("Private/Plan.md", "private roadmap"),
      makeFile("Private/Other.md", "other"),
    ]);
    const context = {
      limitAiVaultToolScope: true,
      aiVaultToolAllowedFolders: ["Public"],
    };

    const searchResult = await executeToolCall(app, "search_notes", { query: "Plan" }, context);
    const listResult = await executeToolCall(app, "list_notes", {}, context);

    expect(searchResult.results).toEqual([{ name: "Plan", path: "Public/Plan.md" }]);
    expect(listResult.notes).toEqual([{ name: "Plan", path: "Public/Plan.md" }]);
  });

  it("filters folder listing to configured folders", async () => {
    const app = makeApp([]);

    const result = await executeToolCall(app, "list_folders", {}, {
      limitAiVaultToolScope: true,
      aiVaultToolAllowedFolders: ["Public"],
    });

    expect(result.folders).toEqual(["Public", "Public/Nested"]);
  });

  it("does not restrict callers that do not opt into AI vault scope", async () => {
    const app = makeApp([makeFile("Private/Secret.md", "secret")]);

    const result = await executeToolCall(app, "read_note", { fileName: "Private/Secret.md" }, {
      limitAiVaultToolScope: false,
      aiVaultToolAllowedFolders: ["Public"],
    });

    expect(result.success).toBe(true);
    expect(result.path).toBe("Private/Secret.md");
  });

  it("blocks root RAG sync status queries when folders are configured", async () => {
    const getUnsyncedFilesInDirectory = vi.fn();
    mockGetFileSearchManager.mockReturnValue({ getUnsyncedFilesInDirectory });
    const app = makeApp([]);

    const result = await executeToolCall(app, "get_rag_sync_status", { directory: "" }, {
      limitAiVaultToolScope: true,
      aiVaultToolAllowedFolders: ["Public"],
      ragSyncState: { files: {}, lastFullSync: null },
      ragFilterConfig: { includeFolders: [], excludePatterns: [] },
    });

    expect(result.success).toBe(false);
    expect(String(result.error)).toContain("Access denied");
    expect(getUnsyncedFilesInDirectory).not.toHaveBeenCalled();
  });

  it("rejects bulk operations when any item is outside configured folders", async () => {
    const app = makeApp([
      makeFile("Public/Note.md", "public"),
      makeFile("Private/Secret.md", "secret"),
    ]);

    const result = await executeToolCall(app, "bulk_propose_delete", {
      fileNames: ["Public/Note.md", "Private/Secret.md"],
    }, {
      limitAiVaultToolScope: true,
      aiVaultToolAllowedFolders: ["Public"],
    });

    expect(result.success).toBe(false);
    expect(String(result.error)).toContain("Access denied");
    expect(result.rejectedPaths).toEqual(["Private/Secret.md"]);
  });
});
