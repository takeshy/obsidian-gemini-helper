import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MarkdownView, TFile } from "obsidian";
import type { App } from "obsidian";
import { DEFAULT_SETTINGS } from "src/types";
import { createLiveVaultToolRunner, liveTranscriptMessages } from "./live-vault-tools";
import { LiveToolDispatcher, liveToolDefinitions, liveToolInstructions } from "./live-tool-definitions";

const { execute, makeExecutor, searchRag } = vi.hoisted(() => ({ execute: vi.fn(), makeExecutor: vi.fn(), searchRag: vi.fn() }));
vi.mock("src/vault/toolExecutor", () => ({ createToolExecutor: makeExecutor }));
vi.mock("./live-rag", () => ({ searchLiveRag: searchRag }));
vi.mock("obsidian", async original => ({ ...await original<object>(), MarkdownView: class { file: unknown; editor: unknown; } }));
beforeEach(() => { vi.resetAllMocks(); makeExecutor.mockReturnValue(execute); vi.stubGlobal("window", globalThis); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function fixture(path: string) {
  const file = new TFile(); file.path = path;
  const view = new MarkdownView();
  Object.assign(view, { file, editor: { getValue: () => "unsaved editor text" } });
  const app = { workspace: { getMostRecentLeaf: () => ({ view }), getActiveFile: () => file } } as unknown as App;
  const settings = { ...DEFAULT_SETTINGS, aiVaultToolAllowedFolders: ["Shared"] };
  return { app, settings, run: createLiveVaultToolRunner(app, settings, { fileAccess: true }) };
}

describe("Live vault access", () => {
  it("reads unsaved text from an allowed editor file without writing it", async () => {
    const f = fixture("Shared/note.md");
    expect(await f.run({ id: "1", name: "read_current_file", args: {} }, new AbortController().signal)).toMatchObject({ filePath: "Shared/note.md", content: "unsaved editor text", unsavedEditorText: true });
    expect(execute).not.toHaveBeenCalled();
  });
  it("does not expose the active editor text outside allowed folders", async () => {
    const f = fixture("Private/secret.md");
    const result = await f.run({ id: "1", name: "read_current_file", args: {} }, new AbortController().signal);
    expect(JSON.stringify(result)).toContain("Access denied");
    expect(JSON.stringify(result)).not.toContain("unsaved editor text");
    expect(execute).not.toHaveBeenCalled();
  });
  it("passes folder restrictions and text-only PDF handling to shared vault tools", async () => {
    const f = fixture("Shared/note.md");
    expect(makeExecutor).toHaveBeenCalledWith(f.app, expect.objectContaining({ limitVaultToolScope: true, vaultToolAllowedFolders: ["Shared"], pdfInputMode: "extract-text" }));
  });
  it("rejects mutations and calls when file access is disabled", async () => {
    const f = fixture("Shared/note.md");
    const call = { id: "1", name: "create_note", args: { fileName: "Shared/new.md" } };
    expect(await f.run(call, new AbortController().signal)).toEqual({ error: "This tool is unavailable in Live." });
    const disabled = createLiveVaultToolRunner(f.app, f.settings, { fileAccess: false });
    expect(await disabled({ ...call, name: "read_note" }, new AbortController().signal)).toHaveProperty("error");
    expect(execute).not.toHaveBeenCalled();
  });
  it("preserves transcript order and omits empty audio turns", () => {
    expect(liveTranscriptMessages([
      { id: "1", role: "user", text: "Hello" }, { id: "2", role: "assistant", text: " " }, { id: "3", role: "assistant", text: "Hi" },
    ], 100)).toEqual([{ role: "user", content: "Hello", timestamp: 100 }, { role: "assistant", content: "Hi", timestamp: 101 }]);
  });
});

describe("Live RAG tools", () => {
  function ragFixture() {
    const f = fixture("Shared/note.md");
    const rag = { name: "Cloud", storeIds: ["fileSearchStores/test"], metadataFilter: 'tag="work"' };
    const settings = { ...f.settings, googleApiKey: "saved-key", ragTopK: 6 };
    return { ...f, rag, settings, runRag: createLiveVaultToolRunner(f.app, settings, { fileAccess: false, ragEnabled: true }, rag) };
  }
  it("searches the chosen File Search stores independently of direct file access", async () => {
    const f = ragFixture(); searchRag.mockResolvedValue({ resultCount: 1, results: [{ filePath: "Private/indexed.md", text: "indexed text" }] });
    const signal = new AbortController().signal;
    expect(await f.runRag({ id: "r", name: "rag_search", args: { query: "Find it" } }, signal)).toMatchObject({ resultCount: 1 });
    expect(searchRag).toHaveBeenCalledWith("saved-key", f.rag, "Find it", 6, signal);
    expect(execute).not.toHaveBeenCalled();
  });
  it("redacts the Google key from retrieval failures", async () => {
    const f = ragFixture(); searchRag.mockRejectedValue(new Error("Invalid saved-key"));
    expect(await f.runRag({ id: "r", name: "rag_search", args: { query: "Find it" } }, new AbortController().signal)).toEqual({ error: "Invalid [redacted]" });
  });
  it("preserves actual hit counts when large results are truncated", async () => {
    const f = ragFixture(); searchRag.mockResolvedValue({ resultCount: 3, results: [{ text: "a".repeat(50_000) }] });
    expect(await f.runRag({ id: "r", name: "rag_search", args: { query: "Find it" } }, new AbortController().signal)).toMatchObject({ resultCount: 3, truncated: true });
  });
  it("rejects empty queries without sending an API request", async () => {
    const f = ragFixture();
    expect(await f.runRag({ id: "r", name: "rag_search", args: { query: " " } }, new AbortController().signal)).toHaveProperty("error");
    expect(searchRag).not.toHaveBeenCalled();
  });
});

describe("Live tool dispatch", () => {
  it("only advertises read tools, with optional RAG", () => {
    expect(liveToolDefinitions({ fileAccess: false, ragEnabled: false })).toEqual([]);
    expect(liveToolDefinitions({ fileAccess: false, ragEnabled: true }).map(tool => tool.name)).toEqual(["rag_search"]);
    expect(liveToolDefinitions({ fileAccess: true, ragEnabled: false }).map(tool => tool.name)).not.toContain("rag_search");
    const names = liveToolDefinitions({ fileAccess: true, ragEnabled: true }).map(tool => tool.name);
    expect(names).toContain("rag_search");
    expect(names).not.toContain("create_note");
    expect(names).not.toContain("execute_javascript");
  });
  it("describes only the enabled sources in the Live instructions", () => {
    expect(liveToolInstructions({})).toBe("");
    const ragOnly = liveToolInstructions({ fileAccess: false, ragEnabled: true });
    expect(ragOnly).toContain("Direct Vault file access is disabled");
    expect(ragOnly).toContain("rag_search");
    expect(ragOnly).not.toContain("read_current_file");
    const filesOnly = liveToolInstructions({ fileAccess: true, ragEnabled: false });
    expect(filesOnly).toContain("read_current_file");
    expect(filesOnly).not.toContain("rag_search");
  });
  it("deduplicates repeated calls and aborts pending execution on stop", async () => {
    const executeTool = vi.fn((_call, signal: AbortSignal) => new Promise(resolve => signal.addEventListener("abort", () => resolve({ late: true }))));
    const dispatcher = new LiveToolDispatcher({ fileAccess: true }, executeTool);
    const call = { id: "read-1", name: "read_note", args: {} };
    const result = dispatcher.run(call);
    expect(dispatcher.run(call)).toBe(result);
    await Promise.resolve();
    dispatcher.cancel();
    expect(await result).toHaveProperty("error");
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(dispatcher.isCancelled(call.id)).toBe(true);
  });
  it("times out a stalled read without leaving the conversation blocked", async () => {
    vi.useFakeTimers();
    const dispatcher = new LiveToolDispatcher({ fileAccess: true }, () => new Promise(() => {}));
    const result = dispatcher.run({ id: "stall", name: "read_note", args: {} });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toHaveProperty("error");
  });
});
