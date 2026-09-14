import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
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
