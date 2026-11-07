import { beforeEach, describe, expect, it, vi } from "vitest";
import { TFile, type App } from "obsidian";
import { FileSearchManager } from "./fileSearch";

const { list, upload, remove } = vi.hoisted(() => ({
  list: vi.fn(), upload: vi.fn(), remove: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    fileSearchStores = {
      documents: { list, delete: remove },
      uploadToFileSearchStore: upload,
    };
  },
}));

beforeEach(() => vi.resetAllMocks());

function vaultFile(path: string): TFile {
  return Object.assign(new TFile(), {
    path, name: path.split("/").pop()!, extension: path.split(".").pop()!,
    basename: path.split("/").pop()!.replace(/\.[^.]+$/, ""),
    stat: { ctime: 1, mtime: 2, size: 100 },
  });
}

describe("Text File Search sync", () => {
  const html = "<!doctype html><html><body><h1>予定</h1><p>金曜日に公開します。</p></body></html>";
  const formats = [
    { name: "HTML", extensions: ["html", "htm", "HTML", "HTM"], mime: "text/html", content: html },
    { name: "plain text", extensions: ["txt", "TXT"], mime: "text/plain", content: "予定\n金曜日に公開します。" },
  ];

  it.each(formats)("syncs $name regardless of case, respects filters, and skips unchanged files", async ({ extensions, mime, content }) => {
    const included = extensions.map(extension => vaultFile(`Notes/page.${extension}`));
    const read = vi.fn().mockResolvedValue(content);
    const readBinary = vi.fn();
    const manager = new FileSearchManager("test", { vault: {
      getFiles: () => [...included, vaultFile(`Private/page.${extensions[0]}`), vaultFile(`Notes/excluded.${extensions[0]}`), vaultFile("Notes/unsupported.exe")],
      read, readBinary,
    } } as unknown as App);
    manager.setStoreName("html-store");
    list.mockResolvedValue([]);
    upload.mockResolvedValue({ done: true, response: { documentName: "fileSearchStores/html-store/documents/html" } });
    const filter = { includeFolders: ["Notes"], excludePatterns: ["excluded\\."] };

    const result = await manager.smartSync({ files: {}, lastFullSync: null }, filter);
    expect(result.errors).toEqual([]);
    expect(result.uploaded.sort()).toEqual(included.map(file => file.path).sort());
    expect(upload).toHaveBeenCalledTimes(included.length);
    expect(readBinary).not.toHaveBeenCalled();
    for (const [{ file, config }] of upload.mock.calls) {
      expect(file.type).toBe(mime);
      expect(await file.text()).toBe(content);
      expect(config.customMetadata).toContainEqual({ key: "extension", stringValue: config.displayName.split(".").pop().toLowerCase() });
    }

    upload.mockClear();
    const second = await manager.smartSync(result.newSyncState, filter);
    expect(second.errors).toEqual([]);
    expect(second.skipped.sort()).toEqual(included.map(file => file.path).sort());
    expect(upload).not.toHaveBeenCalled();
  });

  it.each(formats.flatMap(format => format.extensions.map(extension => ({ extension, mime: format.mime, content: format.content }))))("uploads .$extension to an explicitly selected store as $mime", async ({ extension, mime, content }) => {
    const manager = new FileSearchManager("test", { vault: { read: async () => content } } as unknown as App);
    upload.mockResolvedValue({ done: true, response: { documentName: "document" } });
    await expect(manager.uploadFileToStore(vaultFile(`Notes/page.${extension}`), "selected-store")).resolves.toBe("document");
    const request = upload.mock.calls[0][0];
    expect(request.fileSearchStoreName).toBe("fileSearchStores/selected-store");
    expect(request.file.type).toBe(mime);
    expect(await request.file.text()).toBe(content);
  });
});

describe("FileSearchManager sync access failures", () => {
  it("rejects failed listings even with nothing to upload, and allows retry", async () => {
    const manager = new FileSearchManager("test", {
      vault: { getFiles: () => [] },
    } as unknown as App);
    manager.setStoreName("missing-store");
    const state = { files: {}, lastFullSync: null };
    const filter = { includeFolders: [], excludePatterns: [] };
    list.mockRejectedValueOnce(new Error("Permission denied"));

    await expect(manager.smartSync(state, filter)).rejects.toThrow(
      "Cannot sync File Search Store fileSearchStores/missing-store: Permission denied",
    );
    expect(upload).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(state.lastFullSync).toBeNull();

    list.mockResolvedValueOnce([]);
    await expect(manager.smartSync(state, filter)).resolves.toMatchObject({ errors: [] });
  });
});
