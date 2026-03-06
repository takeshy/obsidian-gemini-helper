/**
 * Local LLM Provider
 * Connects to local LLM servers via OpenAI-compatible API
 * Supports: Ollama, LM Studio, llama.cpp, vLLM, LocalAI, etc.
 *
 * Uses Obsidian's requestUrl for non-streaming requests (bypasses CORS)
 * and Node.js http/https for streaming (bypasses CORS).
 */

import { requestUrl } from "obsidian";
import type { Message, StreamChunk, LocalLlmConfig } from "../types";

// OpenAI-compatible API types
interface OpenAiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAiModel {
  id: string;
  object?: string;
}

interface OpenAiModelsResponse {
  data: OpenAiModel[];
}

/**
 * Verify connection to local LLM server and check available models
 */
export async function verifyLocalLlm(config: LocalLlmConfig): Promise<{
  success: boolean;
  error?: string;
  models?: string[];
}> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    let response;
    try {
      response = await requestUrl({
        url: `${config.baseUrl}/v1/models`,
        method: "GET",
        headers,
      });
    } catch {
      // requestUrl throws on non-2xx; try Ollama's /api/tags
      try {
        const ollamaResponse = await requestUrl({
          url: `${config.baseUrl}/api/tags`,
          method: "GET",
        });
        const ollamaData = ollamaResponse.json as { models?: { name: string }[] };
        const models = ollamaData.models?.map((m: { name: string }) => m.name) || [];
        return { success: true, models };
      } catch {
        return { success: false, error: `Cannot connect to ${config.baseUrl}. Is the server running?` };
      }
    }

    const data = response.json as OpenAiModelsResponse;
    const models = data.data?.map((m: OpenAiModel) => m.id) || [];
    return { success: true, models };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Fetch available models from the local LLM server
 */
export async function fetchLocalLlmModels(config: LocalLlmConfig): Promise<string[]> {
  const result = await verifyLocalLlm(config);
  return result.models || [];
}

/**
 * Stream chat completion from a local LLM server using OpenAI-compatible API
 */
export async function* localLlmChatStream(
  config: LocalLlmConfig,
  messages: Message[],
  systemPrompt: string,
  signal?: AbortSignal,
  enableThinking?: boolean,
): AsyncGenerator<StreamChunk> {
  const openaiMessages: OpenAiMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of messages) {
    openaiMessages.push({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const requestBody: Record<string, unknown> = {
    model: config.model,
    messages: openaiMessages,
    stream: true,
    ...(config.temperature != null && { temperature: config.temperature }),
    ...(config.maxTokens != null && { max_tokens: config.maxTokens }),
  };
  // When thinking is disabled, send chat_template_kwargs to tell the server
  // (works with vLLM; LM Studio may ignore this but will work when supported)
  if (enableThinking === false) {
    requestBody.chat_template_kwargs = { enable_thinking: false };
  }
  const body = JSON.stringify(requestBody);

  // Use Node.js http/https to bypass CORS (Electron renderer blocks cross-origin fetch)
  const url = new URL(`${config.baseUrl}/v1/chat/completions`);
  const httpModule = getHttpModule(url.protocol);

  // Wrap Node.js streaming into an async iterator
  const chunks: StreamChunk[] = [];
  let streamResolve: (() => void) | null = null;
  let streamDone = false;
  let streamError: Error | null = null;

  const CONNECTION_TIMEOUT_MS = 30_000;

  const req = httpModule.request(
    {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers,
      timeout: CONNECTION_TIMEOUT_MS,
    },
    (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        let errorBody = "";
        res.on("data", (chunk: Buffer) => { errorBody += chunk.toString(); });
        res.on("end", () => {
          chunks.push({ type: "error", error: `HTTP ${res.statusCode}: ${errorBody.slice(0, 200) || res.statusMessage}` });
          streamDone = true;
          streamResolve?.();
        });
        return;
      }

      let buffer = "";
      let inThinkTag = false;
      let tagBuffer = "";

      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") {
            chunks.push({ type: "done" });
            streamDone = true;
            streamResolve?.();
            return;
          }

          try {
            const parsed = JSON.parse(data) as {
              choices?: { delta?: { content?: string; reasoning_content?: string } }[];
              usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
            };
            const delta = parsed.choices?.[0]?.delta;

            if (delta?.reasoning_content) {
              if (enableThinking !== false) {
                chunks.push({ type: "thinking", content: delta.reasoning_content });
              }
            }

            if (delta?.content) {
              const thinkParsed = parseThinkTags(delta.content, inThinkTag, tagBuffer);
              inThinkTag = thinkParsed.inThinkTag;
              tagBuffer = thinkParsed.tagBuffer;
              for (const item of thinkParsed.items) {
                // Drop thinking chunks when thinking is disabled
                if (item.type === "thinking" && enableThinking === false) continue;
                chunks.push(item);
              }
            }

            if (parsed.usage) {
              chunks.push({
                type: "done",
                usage: {
                  inputTokens: parsed.usage.prompt_tokens,
                  outputTokens: parsed.usage.completion_tokens,
                  totalTokens: parsed.usage.total_tokens,
                },
              });
              streamDone = true;
              streamResolve?.();
              return;
            }
          } catch {
            // Skip unparseable lines
          }
        }
        streamResolve?.();
      });

      res.on("end", () => {
        if (!streamDone) {
          chunks.push({ type: "done" });
          streamDone = true;
        }
        streamResolve?.();
      });

      res.on("error", (err: Error) => {
        streamError = err;
        streamResolve?.();
      });
    },
  );

  req.on("error", (err: Error) => {
    streamError = err;
    streamDone = true;
    streamResolve?.();
  });

  req.on("timeout", () => {
    req.destroy(new Error("Connection timed out"));
  });

  // Abort handling
  const onAbort = () => {
    req.destroy();
    streamDone = true;
    streamResolve?.();
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  req.write(body);
  req.end();

  // Yield chunks as they arrive
  try {
    while (!streamDone || chunks.length > 0) {
      if (chunks.length > 0) {
        yield chunks.shift()!;
        continue;
      }
      if (streamDone) break;
      if (streamError !== null) {
        yield { type: "error", error: `Connection failed: ${(streamError as Error).message}` };
        return;
      }
      if (signal?.aborted) return;
      // Wait for more data
      await new Promise<void>((resolve) => { streamResolve = resolve; });
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Load Node.js http or https module (desktop only, bypasses CORS). */
function getHttpModule(protocol: string): typeof import("http") {
  const loader =
    (globalThis as unknown as { require?: (id: string) => unknown }).require ||
    (globalThis as unknown as { module?: { require?: (id: string) => unknown } }).module?.require;
  if (!loader) {
    throw new Error("Node.js http module is not available in this environment");
  }
  const moduleName = protocol === "https:" ? "https" : "http";
  return loader(moduleName) as typeof import("http");
}

/**
 * Parse <think>...</think> tags from streaming content.
 * Tags may be split across chunks, so we track state and buffer partial tags.
 */
function parseThinkTags(
  content: string,
  inThinkTag: boolean,
  tagBuffer: string,
): { items: StreamChunk[]; inThinkTag: boolean; tagBuffer: string } {
  const items: StreamChunk[] = [];
  let text = tagBuffer + content;
  tagBuffer = "";

  while (text.length > 0) {
    if (!inThinkTag) {
      const openIdx = text.indexOf("<think>");
      if (openIdx !== -1) {
        if (openIdx > 0) {
          items.push({ type: "text", content: text.slice(0, openIdx) });
        }
        inThinkTag = true;
        text = text.slice(openIdx + 7);
      } else {
        const partial = getPartialTagMatch(text, "<think>");
        if (partial > 0) {
          const safe = text.slice(0, text.length - partial);
          if (safe) items.push({ type: "text", content: safe });
          tagBuffer = text.slice(text.length - partial);
          text = "";
        } else {
          items.push({ type: "text", content: text });
          text = "";
        }
      }
    } else {
      const closeIdx = text.indexOf("</think>");
      if (closeIdx !== -1) {
        if (closeIdx > 0) {
          items.push({ type: "thinking", content: text.slice(0, closeIdx) });
        }
        inThinkTag = false;
        text = text.slice(closeIdx + 8);
      } else {
        const partial = getPartialTagMatch(text, "</think>");
        if (partial > 0) {
          const safe = text.slice(0, text.length - partial);
          if (safe) items.push({ type: "thinking", content: safe });
          tagBuffer = text.slice(text.length - partial);
          text = "";
        } else {
          items.push({ type: "thinking", content: text });
          text = "";
        }
      }
    }
  }

  return { items, inThinkTag, tagBuffer };
}

/** Check if the end of `text` is a prefix of `tag`. Returns match length (0 if none). */
function getPartialTagMatch(text: string, tag: string): number {
  const maxCheck = Math.min(text.length, tag.length - 1);
  for (let len = maxCheck; len > 0; len--) {
    if (text.endsWith(tag.slice(0, len))) {
      return len;
    }
  }
  return 0;
}
