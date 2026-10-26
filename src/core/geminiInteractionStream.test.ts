import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiClient } from "./gemini";
import { DEFAULT_WEB_SEARCH_SETTINGS } from "./webSearch";
import { requestUrl } from "obsidian";
vi.mock("obsidian", async importOriginal => ({ ...await importOriginal<typeof import("obsidian")>(), requestUrl: vi.fn() }));
const searchSettings = { ...DEFAULT_WEB_SEARCH_SETTINGS, provider: "tavily" as const, tavilyApiKey: "search-key" };
import type { StreamChunk, ModelType, ReasoningEffort } from "src/types";

const { create, generateContent, generateContentStream, sendMessageStream, createChat } = vi.hoisted(() => ({
  create: vi.fn(), generateContent: vi.fn(), generateContentStream: vi.fn(), sendMessageStream: vi.fn(), createChat: vi.fn(),
}));
vi.mock("@google/genai", async importOriginal => ({
  ...await importOriginal<typeof import("@google/genai")>(),
  GoogleGenAI: class {
    interactions = { create };
    models = { generateContent, generateContentStream };
    chats = { create: createChat };
  },
}));

async function* events(values: unknown[]) { yield* values; }
async function consume(client: GeminiClient) {
  const chunks: StreamChunk[] = [];
  for await (const chunk of client.chatWithToolsStream([
    { role: "user", content: "hello", timestamp: 0 },
  ], [])) chunks.push(chunk);
  return chunks;
}

beforeEach(() => {
  vi.clearAllMocks();
  create.mockReset();
  generateContent.mockReset();
  generateContentStream.mockReset();
  vi.mocked(requestUrl).mockReset();
  createChat.mockReturnValue({ sendMessageStream });
});
describe("Interactions stream integration", () => {
  it("yields thinking/text and retains usage, interaction ID and deduplicated web sources", async () => {
    create.mockResolvedValue(events([
      { event_type: "interaction.created", interaction: { id: "interaction-1" } },
      { event_type: "step.delta", delta: { type: "thought_summary", content: { text: "thinking" } } },
      { event_type: "step.delta", delta: { type: "text", text: "answer" } },
      ...[1, 2].map(() => ({ event_type: "step.delta", delta: { type: "google_search_result", result: [{ title: "Source", url: "https://example.com" }] } })),
      { event_type: "interaction.status_update", metadata: { total_usage: { total_input_tokens: 3, total_output_tokens: 2, total_tokens: 5 } } },
      { event_type: "interaction.completed", interaction: { status: "completed" } },
    ]));
    const chunks = await consume(new GeminiClient("test-key"));
    expect(chunks.slice(0, 3)).toEqual([
      { type: "thinking", content: "thinking" }, { type: "text", content: "answer" }, { type: "web_search_used" },
    ]);
    expect(chunks.at(-1)).toMatchObject({ type: "done", interactionId: "interaction-1", usage: { totalTokens: 5 }, webSearchSources: [{ title: "Source", url: "https://example.com" }] });
  });

  it("does not emit success after a failed completion", async () => {
    create.mockResolvedValue(events([{ event_type: "interaction.completed", interaction: { status: "failed" } }]));
    const chunks = await consume(new GeminiClient("test-key"));
    expect(chunks).toEqual([{ type: "error", error: "Response failed (possibly blocked by safety filters)" }]);
  });

  it("reports empty streams as errors", async () => {
    create.mockResolvedValue(events([]));
    expect(await consume(new GeminiClient("test-key"))).toEqual([{ type: "error", error: "No response received from API (possible server error)" }]);
  });
});


describe("Gemini shared runner wiring", () => {
  const messages = [{ role: "user" as const, content: "question", timestamp: 0 }];
  async function all(stream: AsyncIterable<StreamChunk>) {
    const chunks: StreamChunk[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return chunks;
  }
  it("passes model, contents and system prompt to nonstreaming chat", async () => {
    generateContent.mockResolvedValue({ text: "answer" });
    expect(await new GeminiClient("key").chat(messages, "instructions")).toBe("answer");
    expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-3.8-flash", contents: [{ role: "user", parts: [{ text: "question" }] }], config: expect.objectContaining({ systemInstruction: "instructions" }) }));
  });
  it("routes workflow summaries and rejects a missing user turn", async () => {
    sendMessageStream.mockResolvedValue(events([{ text: "workflow", candidates: [{ content: { parts: [{ thought: true, text: "plan" }] } }] }]));
    const client = new GeminiClient("key");
    expect((await all(client.generateWorkflowStream(messages))).map(chunk => chunk.type)).toEqual(["thinking", "text", "done"]);
    expect(await all(client.generateWorkflowStream([]))).toEqual([{ type: "error", error: "No user message to send" }]);
    expect(createChat).toHaveBeenCalledTimes(1);
  });
  it("generates images without native search tools", async () => {
    generateContent.mockResolvedValue({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "abc" } }] } }] });
    const chunks = await all(new GeminiClient("key").generateImageStream(messages, "gemini-3.1-flash-image", "instructions", false));
    expect(chunks.map(chunk => chunk.type)).toEqual(["image_generated", "done"]);
    expect(generateContent.mock.calls[0][0].config).toMatchObject({ responseModalities: ["TEXT", "IMAGE"] });
    expect(generateContent.mock.calls[0][0].config.tools).toBeUndefined();
  });
  it("resolves image references through external function calling", async () => {
    vi.mocked(requestUrl).mockResolvedValue({ status: 200, json: { results: [{ title: "Reference", url: "https://example.com", content: "Facts" }] } } as never);
    create.mockResolvedValueOnce(events([
      { event_type: "step.start", index: 0, step: { type: "function_call", id: "search", name: "web_search", arguments: { query: "reference" } } },
      { event_type: "step.stop", index: 0 },
      { event_type: "interaction.completed", interaction: { status: "completed" } },
    ])).mockResolvedValueOnce(events([
      { event_type: "step.delta", delta: { type: "text", text: "Reference facts https://example.com" } },
      { event_type: "interaction.completed", interaction: { status: "completed" } },
    ]));
    generateContent.mockResolvedValue({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "abc" } }] } }] });
    const chunks = await all(new GeminiClient("key", "gemini-3.1-flash-image", searchSettings)
      .generateImageStream(messages, "gemini-3.1-flash-image", "instructions", true));
    expect(vi.mocked(requestUrl)).toHaveBeenCalledOnce();
    expect(chunks.filter(chunk => chunk.type === "done")).toHaveLength(1);
    expect(chunks.at(-1)?.webSearchSources).toEqual([{ title: "Reference", url: "https://example.com" }]);
    expect(generateContent.mock.calls.at(-1)?.[0].config.tools).toBeUndefined();
    expect(generateContent.mock.calls.at(-1)?.[0].config.systemInstruction).toContain("Reference facts");
  });
});


describe("shared thinking and final-round SDK requests", () => {
  const messages = [{ role: "user" as const, content: "question", timestamp: 0 }];
  async function all(stream: AsyncIterable<StreamChunk>) { for await (const _chunk of stream) { /* consume */ } }
  it.each([
    ["gemini-3.8-flash", undefined, undefined, undefined],
    ["gemini-3.8-flash", false, undefined, "low"],
    ["gemini-3.5-flash-lite", false, undefined, "minimal"],
    ["gemini-3-pro-preview", false, undefined, "high"],
    ["gemini-3.1-pro-preview", false, undefined, "high"],
    ["gemini-3.1-pro-preview", undefined, undefined, undefined],
    ["gemini-3.1-pro-preview", false, "default", undefined],
    ["gemini-3.8-flash", true, "default", undefined],
    ["gemini-3.8-flash", false, "high", "high"],
    ["gemma-4-31b-it", true, undefined, undefined],
  ] as const)("resolves %s thinking=%s effort=%s", async (model, enableThinking, effort, expected) => {
    create.mockResolvedValue(events([{ event_type: "interaction.completed", interaction: { status: "completed" } }]));
    await all(new GeminiClient("key", model as ModelType).chatWithToolsStream(messages, [], undefined, undefined, undefined, false,
      { enableThinking, reasoningEffort: effort as ReasoningEffort | undefined }));
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][0].generation_config?.thinking_level).toBe(expected);
  });
  it.each([0, 1, 2])("removes all function tools including external search in the final Interactions request for budget %i", async maxFunctionCalls => {
    create.mockResolvedValueOnce(events([...["1", "2"].flatMap(id => [
      { event_type: "step.start", index: Number(id), step: { type: "function_call", id, name: "read", arguments: {} } },
      { event_type: "step.stop", index: Number(id) },
    ]), { event_type: "interaction.completed", interaction: { status: "completed" } }]))
      .mockResolvedValueOnce(events([{ event_type: "interaction.completed", interaction: { status: "completed" } }]));
    const execute = vi.fn().mockResolvedValue({});
    await all(new GeminiClient("key", "gemini-3.5-flash-lite", searchSettings).chatWithToolsStream(messages,
      [{ name: "read", description: "read", parameters: { type: "object", properties: {} } }], undefined,
      execute, undefined, true, { functionCallLimits: { maxFunctionCalls } }));
    expect(execute).toHaveBeenCalledTimes(maxFunctionCalls);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].tools.some((tool: { type: string }) => tool.type === "function")).toBe(true);
    expect(create.mock.calls[1][0].tools).toBeUndefined();
    expect(create.mock.calls[1][0].generation_config?.tool_choice).toBeUndefined();
  });
});


describe("external Web search integration", () => {
  const messages = [{ role: "user" as const, content: "news", timestamp: 0 }];
  async function all(stream: AsyncIterable<StreamChunk>) {
    const chunks: StreamChunk[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return chunks;
  }
  it("fails before calling Gemini when the selected search provider is unconfigured", async () => {
    const chunks = await all(new GeminiClient("key").chatWithToolsStream(messages, [], undefined, undefined, undefined, true));
    expect(chunks[0].type).toBe("error");
    expect(create).not.toHaveBeenCalled();
    expect(requestUrl).not.toHaveBeenCalled();
  });
  it.each(["gemini-3.8-flash", "gemini-3.1-pro-preview", "gemma-4-31b-it"] as const)("uses search only on a function call for %s", async model => {
    vi.mocked(requestUrl).mockResolvedValue({ status: 200, json: { results: [{ title: "Source", url: "https://example.com", content: "Facts" }] } } as never);
    create.mockResolvedValueOnce(events([
      { event_type: "step.start", index: 0, step: { type: "function_call", id: "search", name: "web_search", arguments: { query: "news" } } },
      { event_type: "step.stop", index: 0 },
      { event_type: "interaction.completed", interaction: { status: "completed" } },
    ])).mockResolvedValueOnce(events([
      { event_type: "step.delta", delta: { type: "text", text: "answer" } },
      { event_type: "interaction.completed", interaction: { status: "completed" } },
    ]));
    const chunks = await all(new GeminiClient("key", model, searchSettings).chatWithToolsStream(messages, [], undefined, undefined, undefined, true));
    expect(requestUrl).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][0].tools).toEqual([expect.objectContaining({ type: "function", name: "web_search" })]);
    expect(create.mock.calls[1][0].input).toEqual(expect.arrayContaining([expect.objectContaining({ type: "function_result", name: "web_search" })]));
    expect(chunks.filter(chunk => chunk.type === "web_search_used")).toHaveLength(1);
    expect(chunks.at(-1)?.webSearchSources).toEqual([{ title: "Source", url: "https://example.com" }]);
  });
  it("makes no search request or search-used claim when the model does not call it", async () => {
    create.mockResolvedValue(events([{ event_type: "interaction.completed", interaction: { status: "completed" } }]));
    const chunks = await all(new GeminiClient("key", "gemini-3.8-flash", searchSettings).chatWithToolsStream(messages, [], undefined, undefined, undefined, true));
    expect(requestUrl).not.toHaveBeenCalled();
    expect(chunks.some(chunk => chunk.type === "web_search_used")).toBe(false);
  });
  it("counts external searches toward the call budget and removes search after exhaustion", async () => {
    vi.mocked(requestUrl).mockResolvedValue({ status: 200, json: { results: [] } } as never);
    create.mockResolvedValueOnce(events([
      ...[0, 1].flatMap(index => [
        { event_type: "step.start", index, step: { type: "function_call", id: String(index), name: "web_search", arguments: { query: "news" } } },
        { event_type: "step.stop", index },
      ]),
      { event_type: "interaction.completed", interaction: { status: "completed" } },
    ])).mockResolvedValueOnce(events([{ event_type: "interaction.completed", interaction: { status: "completed" } }]));
    await all(new GeminiClient("key", "gemini-3.8-flash", searchSettings).chatWithToolsStream(messages, [], undefined, undefined, undefined, true,
      { disableTools: true, functionCallLimits: { maxFunctionCalls: 1 } }));
    expect(requestUrl).toHaveBeenCalledOnce();
    expect(create.mock.calls[1][0].tools).toBeUndefined();
  });
});


describe("native Google Search display contract", () => {
  const messages = [{ role: "user" as const, content: "latest news", timestamp: 0 }];
  const html = '<style>.google{color:blue}</style><a href="https://www.google.com/search?q=news">Google</a>';
  async function all(stream: AsyncIterable<StreamChunk>) { const chunks: StreamChunk[] = []; for await (const chunk of stream) chunks.push(chunk); return chunks; }
  it("enables native Interactions search only for a consented display-capable Chat and retains its HTML", async () => {
    create.mockResolvedValue(events([
      { event_type: "step.delta", delta: { type: "text", text: "grounded answer" } },
      { event_type: "step.delta", delta: { type: "google_search_result", result: [{ search_suggestions: html }] } },
      { event_type: "interaction.completed", interaction: { status: "completed" } },
    ]));
    const chunks = await all(new GeminiClient("key", "gemini-3.5-flash-lite", undefined, "google")
      .chatWithToolsStream(messages, [], undefined, undefined, undefined, true, { googleSearchAllowed: true }));
    expect(create.mock.calls[0][0].tools).toEqual([{ type: "google_search" }]);
    expect(chunks.findIndex(chunk => chunk.type === "search_suggestions")).toBeLessThan(chunks.findIndex(chunk => chunk.type === "text"));
    expect(chunks.at(-1)?.searchSuggestions).toEqual([html]);
    expect(chunks.at(-1)?.googleSearchGrounding).toBe(true);
  });
  it("preserves Search Suggestions across GenerateContent function calling rounds", async () => {
    generateContentStream.mockResolvedValueOnce(events([{ candidates: [{ content: { parts: [
      { functionCall: { id: "call", name: "read", args: {} }, thoughtSignature: "signature" },
    ] }, groundingMetadata: { webSearchQueries: ["news"], searchEntryPoint: { renderedContent: html } } }] }]))
      .mockResolvedValueOnce(events([{ candidates: [{ content: { parts: [{ text: "answer" }] } }] }]));
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const chunks = await all(new GeminiClient("key", "gemini-3.8-flash", undefined, "google").chatWithToolsStream(messages,
      [{ name: "read", description: "read", parameters: { type: "object", properties: {} } }], undefined, execute, undefined, true,
      { googleSearchAllowed: true, functionCallLimits: { maxFunctionCalls: 1 } }));
    expect(execute).toHaveBeenCalledOnce();
    expect(generateContentStream.mock.calls[0][0].config.tools).toContainEqual({ googleSearch: {} });
    expect(generateContentStream.mock.calls[1][0].config.tools).toEqual([{ googleSearch: {} }]);
    expect(chunks.find(chunk => chunk.type === "search_suggestions")?.searchSuggestions).toEqual([html]);
    expect(chunks.at(-1)?.type).toBe("done");
  });
  it("fails closed before calling an API when the caller cannot display the required UI", async () => {
    const chunks = await all(new GeminiClient("key", "gemini-3.8-flash", undefined, "google")
      .chatWithToolsStream(messages, [], undefined, undefined, undefined, true));
    expect(chunks[0].type).toBe("error"); expect(create).not.toHaveBeenCalled(); expect(generateContentStream).not.toHaveBeenCalled();
  });
  it("does not display a grounded result that has no Search Suggestions", async () => {
    create.mockResolvedValue(events([
      { event_type: "step.delta", delta: { type: "text", text: "hidden answer" } },
      { event_type: "step.delta", delta: { type: "google_search_result", result: [] } },
      { event_type: "interaction.completed", interaction: { status: "completed" } },
    ]));
    const chunks = await all(new GeminiClient("key", "gemini-3.5-flash-lite", undefined, "google")
      .chatWithToolsStream(messages, [], undefined, undefined, undefined, true, { googleSearchAllowed: true }));
    expect(chunks.some(chunk => chunk.type === "text")).toBe(false);
    expect(chunks.at(-1)?.type).toBe("error");
  });
  it("uses the same required display data for native image generation", async () => {
    generateContent.mockResolvedValue({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "abc" } }] },
      groundingMetadata: { webSearchQueries: ["news"], searchEntryPoint: { renderedContent: html } } }] });
    const chunks = await all(new GeminiClient("key", "gemini-3.1-flash-image", undefined, "google")
      .generateImageStream(messages, "gemini-3.1-flash-image", undefined, true, undefined, null, { googleSearchAllowed: true }));
    expect(chunks.find(chunk => chunk.type === "search_suggestions")?.searchSuggestions).toEqual([html]);
    expect(chunks.findIndex(chunk => chunk.type === "search_suggestions")).toBeLessThan(chunks.findIndex(chunk => chunk.type === "image_generated"));
  });
});
