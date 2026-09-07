import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiClient } from "./gemini";
import type { StreamChunk } from "src/types";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@google/genai", async importOriginal => ({
  ...await importOriginal<typeof import("@google/genai")>(),
  GoogleGenAI: class { interactions = { create }; },
}));

async function* events(values: unknown[]) { yield* values; }
async function consume(client: GeminiClient) {
  const chunks: StreamChunk[] = [];
  for await (const chunk of client.chatWithToolsStream([
    { role: "user", content: "hello", timestamp: 0 },
  ], [])) chunks.push(chunk);
  return chunks;
}

beforeEach(() => create.mockReset());
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
