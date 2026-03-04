/**
 * Local LLM Provider
 * Connects to local LLM servers via OpenAI-compatible API
 * Supports: Ollama, LM Studio, llama.cpp, vLLM, LocalAI, etc.
 */

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

    const response = await fetch(`${config.baseUrl}/v1/models`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      // Ollama may not have /v1/models, try /api/tags
      const ollamaResponse = await fetch(`${config.baseUrl}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(10000),
      });

      if (!ollamaResponse.ok) {
        return { success: false, error: `Server returned ${response.status}` };
      }

      const ollamaData = await ollamaResponse.json() as { models?: { name: string }[] };
      const models = ollamaData.models?.map((m: { name: string }) => m.name) || [];
      return { success: true, models };
    }

    const data = await response.json() as OpenAiModelsResponse;
    const models = data.data?.map((m: OpenAiModel) => m.id) || [];
    return { success: true, models };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("fetch") || message.includes("ECONNREFUSED") || message.includes("network")) {
      return { success: false, error: `Cannot connect to ${config.baseUrl}. Is the server running?` };
    }
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

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: openaiMessages,
        stream: true,
      }),
      signal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (signal?.aborted) return;
    yield { type: "error", error: `Connection failed: ${message}` };
    return;
  }

  if (!response.ok) {
    let errorDetail = "";
    try {
      const errorBody = await response.text();
      errorDetail = errorBody.slice(0, 200);
    } catch { /* ignore */ }
    yield { type: "error", error: `HTTP ${response.status}: ${errorDetail || response.statusText}` };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: "error", error: "No response body" };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          yield { type: "done" };
          return;
        }

        try {
          const chunk = JSON.parse(data) as {
            choices?: { delta?: { content?: string; reasoning_content?: string } }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          };
          const delta = chunk.choices?.[0]?.delta;

          // Support thinking/reasoning content (e.g. DeepSeek, QwQ)
          if (delta?.reasoning_content) {
            yield { type: "thinking", content: delta.reasoning_content };
          }

          if (delta?.content) {
            yield { type: "text", content: delta.content };
          }

          // Some servers send usage in the final chunk
          if (chunk.usage) {
            yield {
              type: "done",
              usage: {
                inputTokens: chunk.usage.prompt_tokens,
                outputTokens: chunk.usage.completion_tokens,
                totalTokens: chunk.usage.total_tokens,
              },
            };
            return;
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield { type: "done" };
}
