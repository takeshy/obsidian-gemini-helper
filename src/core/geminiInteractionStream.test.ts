import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiClient } from "./gemini";
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
  it("routes image modalities and emits generated image parts", async () => {
    generateContent.mockResolvedValue({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "abc" } }] } }] });
    const chunks = await all(new GeminiClient("key").generateImageStream(messages, "gemini-3.1-flash-image", "instructions", true));
    expect(chunks.map(chunk => chunk.type)).toEqual(["web_search_used", "image_generated", "done"]);
    expect(generateContent.mock.calls[0][0].config).toMatchObject({ responseModalities: ["TEXT", "IMAGE"], tools: [{ googleSearch: {} }] });
  });
  it("executes a GenerateContent tool round and keeps grounding without function tools for the final request", async () => {
    generateContentStream.mockResolvedValueOnce(events([{ candidates: [{ content: { parts: [{ functionCall: { id: "call", name: "read", args: { path: "note" } }, thoughtSignature: "signature" }] } }] }]))
      .mockResolvedValueOnce(events([{ candidates: [{ content: { parts: [{ text: "answer" }] } }] }]));
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const chunks = await all(new GeminiClient("key").chatWithToolsStream(messages, [{ name: "read", description: "read", parameters: { type: "object", properties: {} } }], "instructions", execute, undefined, true, { functionCallLimits: { maxFunctionCalls: 1 } }));
    expect(execute).toHaveBeenCalledWith("read", { path: "note" });
    expect(generateContentStream).toHaveBeenCalledTimes(2);
    expect(generateContentStream.mock.calls[0][0].config.thinkingConfig).toBeUndefined();
    expect(generateContentStream.mock.calls[1][0].config.tools).toEqual([{ googleSearch: {} }]);
    expect(generateContentStream.mock.calls[1][0].contents[1].parts[0].thoughtSignature).toBe("signature");
    expect(chunks.at(-1)?.type).toBe("done");
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
  it.each([0, 1, 2])("keeps only native search in the final Interactions request for budget %i", async maxFunctionCalls => {
    create.mockResolvedValueOnce(events([...["1", "2"].flatMap(id => [
      { event_type: "step.start", index: Number(id), step: { type: "function_call", id, name: "read", arguments: {} } },
      { event_type: "step.stop", index: Number(id) },
    ]), { event_type: "interaction.completed", interaction: { status: "completed" } }]))
      .mockResolvedValueOnce(events([{ event_type: "interaction.completed", interaction: { status: "completed" } }]));
    const execute = vi.fn().mockResolvedValue({});
    await all(new GeminiClient("key", "gemini-3.5-flash-lite").chatWithToolsStream(messages,
      [{ name: "read", description: "read", parameters: { type: "object", properties: {} } }], undefined,
      execute, undefined, true, { functionCallLimits: { maxFunctionCalls } }));
    expect(execute).toHaveBeenCalledTimes(maxFunctionCalls);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].tools.some((tool: { type: string }) => tool.type === "function")).toBe(true);
    expect(create.mock.calls[1][0].tools).toEqual([{ type: "google_search" }]);
    expect(create.mock.calls[1][0].generation_config?.tool_choice).toBeUndefined();
  });
});
