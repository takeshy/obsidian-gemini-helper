import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchLiveRag } from "./live-rag";

const { generate, createClient } = vi.hoisted(() => ({ generate: vi.fn(), createClient: vi.fn() }));
vi.mock("@google/genai", async original => ({ ...await original<object>(), GoogleGenAI: class {
  models = { generateContent: generate };
  constructor(options: unknown) { createClient(options); }
} }));
const rag = { name: "Notes", storeIds: ["fileSearchStores/first", "fileSearchStores/second"], metadataFilter: 'author="me"' };
beforeEach(() => vi.clearAllMocks());

describe("Live File Search", () => {
  it("uses the selected stores, metadata filter, top K and cancellation signal with safety settings", async () => {
    generate.mockResolvedValue({ candidates: [{ finishReason: "STOP", groundingMetadata: { groundingChunks: [{ retrievedContext: { title: "Notes/plan.md", text: "Launch Friday", pageNumber: 2 } }] } }], text: "Friday", usageMetadata: { totalTokenCount: 21 } });
    const signal = new AbortController().signal;
    const result = await searchLiveRag("key", rag, "Launch date?", 7, signal);
    expect(createClient).toHaveBeenCalledWith({ apiKey: "key" });
    const request = generate.mock.calls[0][0];
    expect(request.config.abortSignal).toBe(signal);
    expect(request.config.safetySettings).toHaveLength(4);
    expect(request.config.tools).toEqual([{ fileSearch: { fileSearchStoreNames: rag.storeIds, topK: 7, metadataFilter: rag.metadataFilter } }]);
    expect(result).toMatchObject({ resultCount: 1, results: [{ filePath: "Notes/plan.md", text: "Launch Friday", pageNumber: 2 }], answer: "Friday", usage: { totalTokenCount: 21 } });
  });
  it("does not present an ungrounded model answer as a search hit", async () => {
    generate.mockResolvedValue({ candidates: [{ finishReason: "STOP" }], text: "invented answer" });
    const result = await searchLiveRag("key", rag, "Unknown?", 5, new AbortController().signal);
    expect(result.resultCount).toBe(0);
    expect(JSON.stringify(result)).not.toContain("invented answer");
  });
  it.each(["SAFETY", "RECITATION", "MAX_TOKENS"])("reports %s as a retrieval failure", async finishReason => {
    generate.mockResolvedValue({ candidates: [{ finishReason }] });
    await expect(searchLiveRag("key", rag, "Question", 5, new AbortController().signal)).rejects.toThrow(finishReason);
  });
  it("fails explicitly for unsynced stores without making an API call", async () => {
    await expect(searchLiveRag("key", { ...rag, storeIds: [] }, "Question", 5, new AbortController().signal)).rejects.toThrow("no File Search store");
    expect(generate).not.toHaveBeenCalled();
  });
  it("discards a late result after the voice session is stopped", async () => {
    const abort = new AbortController();
    generate.mockImplementation(async () => { abort.abort(); return { candidates: [{ finishReason: "STOP" }] }; });
    await expect(searchLiveRag("key", rag, "Question", 5, abort.signal)).rejects.toThrow();
  });
});
