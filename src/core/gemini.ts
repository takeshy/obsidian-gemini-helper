import {
  GoogleGenAI,
  Type,
  FinishReason,
  HarmCategory,
  HarmBlockThreshold,
  type Content,
  type Part,
  type Tool,
  type SafetySetting,
  type Schema,
  type Chat,
  type ThinkingLevel,
  type Interactions,
} from "@google/genai";
import {
  DEFAULT_SETTINGS,
  type Message,
  type ToolDefinition,
  type ToolPropertyDefinition,
  type StreamChunk,
  type StreamChunkUsage,
  type ToolCall,
  type ModelType,
  type GeneratedImage,
} from "src/types";
import { tracing, type TracingUsage } from "src/core/tracingHooks";
import { formatError } from "src/utils/error";
import { Platform, requestUrl } from "obsidian";

// ---------------------------------------------------------------------------
// CORS-free fetch implementations for the Interactions API.
// The endpoint doesn't return CORS headers, so browser fetch rejects preflight.
// ---------------------------------------------------------------------------

// Desktop (Electron / Node.js): streaming via https module
// globalThis.require loads Node.js builtins without triggering the ESM loader (which
// cannot resolve Node builtins in Electron's renderer process).
async function nodeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const https = (globalThis as unknown as { require: (id: string) => typeof import("https") }).require("https");
  const url = typeof input === "string" ? new globalThis.URL(input) : input instanceof globalThis.URL ? input : new globalThis.URL(input.url);
  const method = init?.method ?? "GET";
  const headers: Record<string, string> = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => { headers[k] = v; });
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) headers[k] = v;
    } else {
      Object.assign(headers, init.headers);
    }
  }

  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers }, (res: import("http").IncomingMessage) => {
      const responseHeaders = new Headers();
      for (const [k, v] of Object.entries(res.headers)) {
        if (v) responseHeaders.set(k, Array.isArray(v) ? v.join(", ") : v);
      }

      const body = new ReadableStream({
        start(controller) {
          res.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
          res.on("end", () => controller.close());
          res.on("error", (err) => controller.error(err));
        },
        cancel() {
          res.destroy();
        },
      });

      resolve(new Response(body, {
        status: res.statusCode ?? 200,
        statusText: res.statusMessage ?? "",
        headers: responseHeaders,
      }));
    });

    req.on("error", reject);

    if (init?.signal) {
      init.signal.addEventListener("abort", () => req.destroy());
    }

    if (init?.body) {
      if (typeof init.body === "string") {
        req.end(init.body);
      } else if (init.body instanceof ArrayBuffer || ArrayBuffer.isView(init.body)) {
        req.end(Buffer.from(init.body as ArrayBuffer));
      } else {
        const readable = init.body as ReadableStream<Uint8Array>;
        const reader = readable.getReader();
        const pump = (): void => {
          reader.read().then(({ done, value }) => {
            if (done) { req.end(); return; }
            req.write(value);
            pump();
          }).catch((err: Error) => req.destroy(err));
        };
        pump();
      }
    } else {
      req.end();
    }
  });
}

// Mobile: buffered fetch via Obsidian's requestUrl (bypasses CORS, no streaming)
async function mobileFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof globalThis.URL ? input.toString() : input.url;
  const method = init?.method ?? "GET";
  const headers: Record<string, string> = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => { headers[k] = v; });
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) headers[k] = v;
    } else {
      Object.assign(headers, init.headers);
    }
  }

  let body: string | undefined;
  if (init?.body) {
    body = typeof init.body === "string" ? init.body : JSON.stringify(init.body);
  }

  const res = await requestUrl({ url, method, headers, body, throw: false });

  const responseHeaders = new Headers();
  for (const [k, v] of Object.entries(res.headers)) {
    if (v) responseHeaders.set(k, v);
  }

  // Wrap the buffered response as a ReadableStream so the SDK's SSE parser works
  const encoder = new TextEncoder();
  const encoded = encoder.encode(res.text);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  });

  return new Response(stream, {
    status: res.status,
    headers: responseHeaders,
  });
}

// Pick the right CORS-free fetch for the current platform
function corsFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (Platform.isMobile) {
    return mobileFetch(input, init);
  }
  return nodeFetch(input, init);
}

// Model pricing per token (USD)
// Source: https://ai.google.dev/pricing
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash":       { input: 0.30 / 1e6, output: 2.50 / 1e6 },
  "gemini-2.5-flash-lite":  { input: 0.10 / 1e6, output: 0.40 / 1e6 },
  "gemini-2.5-pro":         { input: 1.25 / 1e6, output: 10.00 / 1e6 },
  "gemini-3-flash-preview": { input: 0.50 / 1e6, output: 3.00 / 1e6 },
  "gemini-3.1-flash-lite-preview": { input: 0.25 / 1e6, output: 1.50 / 1e6 },
  "gemini-3.1-pro-preview": { input: 2.00 / 1e6, output: 12.00 / 1e6 },
  "gemini-3.1-pro-preview-customtools": { input: 2.00 / 1e6, output: 12.00 / 1e6 },
  "gemini-3-pro-image-preview": { input: 2.00 / 1e6, output: 120.00 / 1e6 },
  "gemini-3.1-flash-image-preview": { input: 0.25 / 1e6, output: 60.00 / 1e6 },
};

// Grounding with Google Search cost per prompt (USD)
// Gemini 3 models: $14/1K queries, Gemini 2.x: $35/1K prompts
// Approximated as per-prompt since exact query count is not exposed by the API
const SEARCH_GROUNDING_COST: Record<string, number> = {
  "gemini-3-flash-preview": 14 / 1000,
  "gemini-3.1-pro-preview": 14 / 1000,
  "gemini-3.1-pro-preview-customtools": 14 / 1000,
  "gemini-3-pro-image-preview": 14 / 1000,
  "gemini-3.1-flash-image-preview": 14 / 1000,
  "gemini-3.1-flash-lite-preview": 14 / 1000,
  "gemini-2.5-flash":       35 / 1000,
  "gemini-2.5-flash-lite":  35 / 1000,
  "gemini-2.5-pro":         35 / 1000,
};

// Extract usage metadata from Gemini API response and calculate cost
interface ExtractUsageOptions {
  model?: string;
  webSearchUsed?: boolean;
}

function extractUsage(usageMetadata: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number; thoughtsTokenCount?: number; toolUsePromptTokenCount?: number } | undefined, options?: ExtractUsageOptions): TracingUsage | undefined {
  if (!usageMetadata) return undefined;
  const model = options?.model;
  const inputTokens = usageMetadata.promptTokenCount ?? 0;
  const outputTokens = usageMetadata.candidatesTokenCount ?? 0;
  const thinkingTokens = usageMetadata.thoughtsTokenCount ?? 0;
  const toolUseTokens = usageMetadata.toolUsePromptTokenCount ?? 0;
  const pricing = model ? MODEL_PRICING[model] : undefined;
  const inputCost = pricing ? inputTokens * pricing.input : undefined;
  // candidatesTokenCount already includes thinking tokens in Gemini's accounting
  const outputCost = pricing ? outputTokens * pricing.output : undefined;
  let totalCost = inputCost !== undefined && outputCost !== undefined ? inputCost + outputCost : undefined;

  // Add search grounding cost per prompt
  if (options?.webSearchUsed && model && SEARCH_GROUNDING_COST[model] !== undefined) {
    totalCost = (totalCost ?? 0) + SEARCH_GROUNDING_COST[model];
  }

  return {
    input: usageMetadata.promptTokenCount,
    output: usageMetadata.candidatesTokenCount,
    thinking: thinkingTokens > 0 ? thinkingTokens : undefined,
    toolUsePromptTokens: toolUseTokens > 0 ? toolUseTokens : undefined,
    total: usageMetadata.totalTokenCount,
    inputCost,
    outputCost,
    totalCost,
  };
}

// Accumulate per-round usage into a running total
function accumulateUsage(total: TracingUsage, round: TracingUsage): void {
  total.input = (total.input ?? 0) + (round.input ?? 0);
  total.output = (total.output ?? 0) + (round.output ?? 0);
  if (round.thinking !== undefined) total.thinking = (total.thinking ?? 0) + round.thinking;
  if (round.toolUsePromptTokens !== undefined) total.toolUsePromptTokens = (total.toolUsePromptTokens ?? 0) + round.toolUsePromptTokens;
  total.total = (total.total ?? 0) + (round.total ?? 0);
  if (round.inputCost !== undefined) total.inputCost = (total.inputCost ?? 0) + round.inputCost;
  if (round.outputCost !== undefined) total.outputCost = (total.outputCost ?? 0) + round.outputCost;
  if (round.totalCost !== undefined) total.totalCost = (total.totalCost ?? 0) + round.totalCost;
}

// Convert TracingUsage to StreamChunkUsage for yielding to the UI
function toStreamChunkUsage(usage: TracingUsage | undefined): StreamChunkUsage | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.input,
    outputTokens: usage.output,
    thinkingTokens: usage.thinking,
    totalTokens: usage.total,
    totalCost: usage.totalCost,
  };
}

// Keywords that trigger thinking mode
// Latin-script keywords use word-boundary regex to avoid false positives (e.g. "reason" in "no reason")
const THINKING_KEYWORDS_REGEX = [
  // English
  /\bthink\b/, /\banalyze\b/, /\bconsider\b/, /\breason about\b/, /\breflect\b/,
  // German
  /\bnachdenken\b/, /\banalysieren\b/, /\büberlegen\b/,
  // Spanish
  /\bpiensa\b/, /\banaliza\b/, /\breflexiona\b/,
  // French
  /\bréfléchis\b/, /\banalyse\b/, /\bconsidère\b/,
  // Italian
  /\bpensa\b/, /\banalizza\b/, /\brifletti\b/,
  // Portuguese
  /\bpense\b/, /\banalise\b/, /\breflita\b/,
];

// CJK keywords use substring matching (word boundaries don't apply)
const THINKING_KEYWORDS_CJK = [
  // Japanese
  "考えて", "考察", "分析して", "検討して", "深く考", "じっくり", "よく考えて",
  // Korean
  "생각해", "분석해", "고려해",
  // Chinese
  "思考", "分析一下", "考虑",
];

function shouldEnableThinkingByKeyword(message: string): boolean {
  const lower = message.toLowerCase();
  return THINKING_KEYWORDS_REGEX.some(re => re.test(lower))
    || THINKING_KEYWORDS_CJK.some(kw => lower.includes(kw));
}

// Default safety settings per Gemini best practices
// Using BLOCK_MEDIUM_AND_ABOVE as a balanced default
const DEFAULT_SAFETY_SETTINGS: SafetySetting[] = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// Check finishReason for blocked/filtered responses (best practice: always inspect why generation stopped)
function checkFinishReason(candidates: Array<{ finishReason?: string }> | undefined): string | null {
  if (!candidates || candidates.length === 0) return null;
  const reason = candidates[0].finishReason;
  if (reason === FinishReason.SAFETY) {
    return "Response blocked by safety filters. Please rephrase your message.";
  }
  if (reason === FinishReason.RECITATION) {
    return "Response blocked due to potential recitation of copyrighted content.";
  }
  return null;
}

// Function call limit options
export interface FunctionCallLimitOptions {
  maxFunctionCalls?: number;           // 最大function call回数 (default: 20)
  functionCallWarningThreshold?: number; // 残りこの回数で警告 (default: 5)
}

export interface ChatWithToolsOptions {
  ragTopK?: number;
  functionCallLimits?: FunctionCallLimitOptions;
  disableTools?: boolean;
  enableThinking?: boolean;
  traceId?: string | null;
  previousInteractionId?: string | null;  // For Interactions API conversation chaining
}

// Interactions API usage → TracingUsage converter
function extractInteractionsUsage(usage: Interactions.Usage | undefined, model?: string): TracingUsage | undefined {
  if (!usage) return undefined;
  const inputTokens = usage.total_input_tokens ?? 0;
  const outputTokens = usage.total_output_tokens ?? 0;
  const thinkingTokens = usage.total_thought_tokens ?? 0;
  const toolUseTokens = usage.total_tool_use_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? (inputTokens + outputTokens);
  const pricing = model ? MODEL_PRICING[model] : undefined;
  const inputCost = pricing ? inputTokens * pricing.input : undefined;
  const outputCost = pricing ? outputTokens * pricing.output : undefined;
  const totalCost = inputCost !== undefined && outputCost !== undefined ? inputCost + outputCost : undefined;

  return {
    input: inputTokens || undefined,
    output: outputTokens || undefined,
    thinking: thinkingTokens > 0 ? thinkingTokens : undefined,
    toolUsePromptTokens: toolUseTokens > 0 ? toolUseTokens : undefined,
    total: totalTokens || undefined,
    inputCost,
    outputCost,
    totalCost,
  };
}

export class GeminiClient {
  private ai: GoogleGenAI;
  private model: ModelType;

  constructor(apiKey: string, model: ModelType = "gemini-3-flash-preview") {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;

    // Patch Interactions API client to bypass CORS.
    // The Interactions API endpoint doesn't return CORS headers, so browser/Electron
    // fetch blocks the request. Desktop uses Node.js https, mobile uses Obsidian's requestUrl.
    try {
      const interactions = this.ai.interactions;
      const client = (interactions as unknown as { _client: { fetch: typeof fetch } })._client;
      if (client) {
        client.fetch = corsFetch as typeof fetch;
      }
    } catch {
      // Fallback: global fetch
    }
  }

  setModel(model: ModelType): void {
    this.model = model;
  }

  // Build thinking config based on model capabilities (shared across streaming methods)
  private buildThinkingConfig(enableThinking: boolean): Record<string, unknown> | undefined {
    const supportsThinking = !this.model.toLowerCase().includes("gemma");
    if (!supportsThinking) return undefined;

    const modelLower = this.model.toLowerCase();

    // gemini-3.1-flash-lite: uses thinkingLevel instead of thinkingBudget
    if (modelLower.includes("gemini-3.1-flash-lite")) {
      if (!enableThinking) return undefined;
      return { includeThoughts: true, thinkingLevel: "HIGH" as ThinkingLevel };
    }

    // gemini-3-pro / gemini-3.1-pro models require thinking — cannot disable
    const thinkingRequired = modelLower.includes("gemini-3-pro") || modelLower.includes("gemini-3.1-pro");
    if (!enableThinking && !thinkingRequired) return { thinkingBudget: 0 };

    // gemini-2.5-flash-lite requires thinkingBudget: -1 to enable
    if (modelLower === "gemini-2.5-flash-lite") {
      return { includeThoughts: true, thinkingBudget: -1 };
    }

    return { includeThoughts: true };
  }

  // Check if model supports thinking
  private supportsThinking(): boolean {
    return !this.model.toLowerCase().includes("gemma");
  }

  // Build Gemini Part[] from a Message's attachments and text content
  private static buildMessageParts(msg: Message): Part[] {
    const parts: Part[] = [];
    if (msg.attachments && msg.attachments.length > 0) {
      for (const attachment of msg.attachments) {
        parts.push({
          inlineData: {
            mimeType: attachment.mimeType,
            data: attachment.data,
          },
        });
      }
    }
    if (msg.content) {
      parts.push({ text: msg.content });
    }
    return parts;
  }

  // Convert our Message format to Gemini Content format
  private messagesToContents(messages: Message[]): Content[] {
    return messages.map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: GeminiClient.buildMessageParts(msg),
    }));
  }

  // Convert ToolDefinition parameters to a plain JSON Schema object for Interactions API
  private static toJsonSchema(params: ToolDefinition["parameters"]): unknown {
    const convertProp = (p: ToolPropertyDefinition): Record<string, unknown> => {
      const s: Record<string, unknown> = { type: p.type, description: p.description };
      if (p.enum) s.enum = p.enum;
      if (p.type === "array" && p.items) {
        const items = p.items as ToolPropertyDefinition | { type: string; properties?: Record<string, ToolPropertyDefinition>; required?: string[] };
        if (items.type === "object" && items.properties) {
          const nested: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(items.properties)) nested[k] = convertProp(v);
          s.items = { type: "object", properties: nested, required: items.required };
        } else {
          s.items = { type: items.type };
        }
      }
      if (p.type === "object" && p.properties) {
        const nested: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(p.properties)) nested[k] = convertProp(v);
        s.properties = nested;
        if (p.required && p.required.length > 0) s.required = p.required;
      }
      return s;
    };

    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params.properties)) {
      properties[key] = convertProp(value);
    }
    return { type: "object", properties, required: params.required };
  }

  // Convert tool definitions to Interactions API format (Tool_2[])
  // Each function is an individual tool with { type: 'function', name, description, parameters }
  private toolsToInteractionsFormat(
    tools: ToolDefinition[],
    ragStoreIds?: string[],
    ragTopK?: number,
    webSearchEnabled?: boolean,
  ): Interactions.Tool[] {
    const result: Interactions.Tool[] = [];

    // Function tools — Interactions API allows function tools + file search together
    for (const tool of tools) {
      result.push({
        type: "function" as const,
        name: tool.name,
        description: tool.description,
        parameters: GeminiClient.toJsonSchema(tool.parameters),
      } as Interactions.Tool);
    }

    // File Search RAG
    if (ragStoreIds && ragStoreIds.length > 0) {
      result.push({
        type: "file_search" as const,
        file_search_store_names: ragStoreIds,
        top_k: ragTopK,
      } as Interactions.Tool);
    }

    // Google Search
    if (webSearchEnabled) {
      result.push({
        type: "google_search" as const,
      } as Interactions.Tool);
    }

    return result;
  }

  // Build Interactions API input from a Message (supports text + attachments)
  private static buildInteractionInput(msg: Message): string | Interactions.Content[] {
    // Simple text-only message
    if (!msg.attachments || msg.attachments.length === 0) {
      return msg.content || "";
    }

    // Multimodal: build Content_2 array
    const contents: Interactions.Content[] = [];
    for (const attachment of msg.attachments) {
      if (attachment.type === "image") {
        contents.push({
          type: "image" as const,
          data: attachment.data,
          mime_type: attachment.mimeType,
        } as Interactions.Content);
      } else if (attachment.type === "audio") {
        contents.push({
          type: "audio" as const,
          data: attachment.data,
          mime_type: attachment.mimeType,
        } as Interactions.Content);
      } else if (attachment.type === "video") {
        contents.push({
          type: "video" as const,
          data: attachment.data,
          mime_type: attachment.mimeType,
        } as Interactions.Content);
      } else if (attachment.type === "pdf") {
        contents.push({
          type: "document" as const,
          data: attachment.data,
          mime_type: attachment.mimeType,
        } as Interactions.Content);
      } else {
        // Text files — include as text
        if (attachment.data) {
          try {
            const decoded = atob(attachment.data);
            contents.push({ type: "text" as const, text: `[File: ${attachment.name}]\n${decoded}` } as Interactions.Content);
          } catch {
            contents.push({ type: "text" as const, text: `[File: ${attachment.name}]` } as Interactions.Content);
          }
        }
      }
    }
    if (msg.content) {
      contents.push({ type: "text" as const, text: msg.content } as Interactions.Content);
    }
    return contents;
  }

  // Convert tool definitions to Gemini format
  private toolsToGeminiFormat(tools: ToolDefinition[]): Tool[] {
    const convertProperty = (value: ToolPropertyDefinition): Schema => {
      const schema: Schema = {
        type: value.type.toUpperCase() as Type,
        description: value.description,
        enum: value.enum,
      };

      // Handle array items
      if (value.type === "array" && value.items) {
        const items = value.items as ToolPropertyDefinition | {
          type: string;
          properties?: Record<string, ToolPropertyDefinition>;
          required?: string[];
        };

        if (items.type === "object" && items.properties) {
          // Nested object in array
          const nestedProperties: Record<string, Schema> = {};
          for (const [propKey, propValue] of Object.entries(items.properties)) {
            nestedProperties[propKey] = convertProperty(propValue);
          }
          schema.items = {
            type: Type.OBJECT,
            properties: nestedProperties,
            required: items.required,
          };
        } else {
          // Simple type in array (e.g., string[])
          schema.items = {
            type: items.type.toUpperCase() as Type,
          };
        }
      }

      if (value.type === "object" && value.properties) {
        const nestedProperties: Record<string, Schema> = {};
        for (const [propKey, propValue] of Object.entries(value.properties)) {
          nestedProperties[propKey] = convertProperty(propValue);
        }
        schema.properties = nestedProperties;
        if (value.required && value.required.length > 0) {
          schema.required = value.required;
        }
      }

      return schema;
    };

    const functionDeclarations = tools.map((tool) => {
      const properties: Record<string, Schema> = {};
      for (const [key, value] of Object.entries(tool.parameters.properties)) {
        properties[key] = convertProperty(value);
      }

      return {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: Type.OBJECT,
          properties,
          required: tool.parameters.required,
        },
      };
    });

    return [{ functionDeclarations }];
  }

  // Simple chat without streaming
  async chat(
    messages: Message[],
    systemPrompt?: string,
    traceId?: string | null
  ): Promise<string> {
    const contents = this.messagesToContents(messages);
    const lastMsg = messages[messages.length - 1];

    const genId = tracing.generationStart(traceId ?? null, "chat", {
      model: this.model,
      input: lastMsg?.content,
    });

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents,
        config: {
          systemInstruction: systemPrompt,
          safetySettings: DEFAULT_SAFETY_SETTINGS,
        },
      });

      // Check for blocked responses (best practice: always check finishReason)
      const blockReason = checkFinishReason(response.candidates);
      if (blockReason) throw new Error(blockReason);

      const text = response.text ?? "";
      tracing.generationEnd(genId, {
        output: text,
        usage: extractUsage(response.usageMetadata, { model: this.model }),
      });
      return text;
    } catch (error) {
      tracing.generationEnd(genId, {
        error: formatError(error),
      });
      throw error;
    }
  }

  // Streaming chat
  async *chatStream(
    messages: Message[],
    systemPrompt?: string,
    traceId?: string | null
  ): AsyncGenerator<StreamChunk> {
    const contents = this.messagesToContents(messages);
    const lastMsg = messages[messages.length - 1];

    const genId = tracing.generationStart(traceId ?? null, "chatStream", {
      model: this.model,
      input: lastMsg?.content,
    });

    try {
      const response = await this.ai.models.generateContentStream({
        model: this.model,
        contents,
        config: {
          systemInstruction: systemPrompt,
          safetySettings: DEFAULT_SAFETY_SETTINGS,
        },
      });

      let hasReceivedChunk = false;
      let accumulatedText = "";
      let lastUsage: TracingUsage | undefined;
      for await (const chunk of response) {
        hasReceivedChunk = true;
        if (chunk.usageMetadata) lastUsage = extractUsage(chunk.usageMetadata, { model: this.model });
        const chunkWithCandidates = chunk as {
          candidates?: Array<{
            finishReason?: string;
          }>;
        };
        const blockReason = checkFinishReason(chunkWithCandidates.candidates);
        if (blockReason) {
          tracing.generationEnd(genId, { error: blockReason, usage: lastUsage });
          yield { type: "error", error: blockReason };
          return;
        }
        const text = chunk.text;
        if (text) {
          accumulatedText += text;
          yield { type: "text", content: text };
        }
      }

      if (!hasReceivedChunk) {
        tracing.generationEnd(genId, { error: "No response received from API" });
        yield { type: "error", error: "No response received from API (possible server error)" };
        return;
      }

      tracing.generationEnd(genId, { output: accumulatedText, usage: lastUsage });
      yield { type: "done", usage: toStreamChunkUsage(lastUsage) };
    } catch (error) {
      tracing.generationEnd(genId, {
        error: formatError(error),
      });
      yield {
        type: "error",
        error: formatError(error),
      };
    }
  }


  // Streaming chat with Function Calling using Interactions API (SSE-based streaming)
  // Supports: function calling + RAG + Google Search simultaneously, server-side conversation state
  async *chatWithToolsStream(
    messages: Message[],
    tools: ToolDefinition[],
    systemPrompt?: string,
    executeToolCall?: (name: string, args: Record<string, unknown>) => Promise<unknown>,
    ragStoreIds?: string[],
    webSearchEnabled?: boolean,
    options?: ChatWithToolsOptions
  ): AsyncGenerator<StreamChunk> {
    // Function call limit settings
    const maxFunctionCalls = options?.functionCallLimits?.maxFunctionCalls ?? DEFAULT_SETTINGS.maxFunctionCalls;
    const warningThreshold = Math.min(
      options?.functionCallLimits?.functionCallWarningThreshold ?? DEFAULT_SETTINGS.functionCallWarningThreshold,
      maxFunctionCalls
    );
    const rawTopK = options?.ragTopK ?? DEFAULT_SETTINGS.ragTopK;
    const clampedTopK = Number.isFinite(rawTopK)
      ? Math.min(20, Math.max(1, rawTopK))
      : DEFAULT_SETTINGS.ragTopK;
    let functionCallCount = 0;
    let warningEmitted = false;

    const ragEnabled = ragStoreIds && ragStoreIds.length > 0;

    // Build tools for Interactions API
    // Unlike Chat API, Interactions API allows function tools + file search + Google search together
    let interactionTools: Interactions.Tool[] | undefined;
    if (!options?.disableTools) {
      const functionTools = tools.length > 0 ? tools : [];
      interactionTools = this.toolsToInteractionsFormat(
        functionTools,
        ragEnabled ? ragStoreIds : undefined,
        ragEnabled ? clampedTopK : undefined,
        webSearchEnabled,
      );
      if (interactionTools.length === 0) interactionTools = undefined;
    }

    // Get the last user message
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") {
      yield { type: "error", error: "No user message to send" };
      return;
    }

    // Enable thinking: explicit option overrides keyword detection
    const enableThinking = this.supportsThinking() &&
      (options?.enableThinking !== undefined
        ? options.enableThinking
        : shouldEnableThinkingByKeyword(lastMessage.content || ""));

    // Build generation config for Interactions API
    const getThinkingLevel = (): "minimal" | "low" | "medium" | "high" | undefined => {
      if (!this.supportsThinking()) return undefined;
      const modelLower = this.model.toLowerCase();
      // Pro models require thinking — always return high
      const thinkingRequired = modelLower.includes("gemini-3-pro") || modelLower.includes("gemini-3.1-pro");
      if (thinkingRequired) return "high";
      if (!enableThinking) return "minimal";
      return "high";
    };

    const thinkingLevel = getThinkingLevel();
    const generationConfig = thinkingLevel
      ? { thinking_level: thinkingLevel, thinking_summaries: "auto" as const }
      : undefined;

    // Resolve previous_interaction_id for conversation chaining
    const previousInteractionId = options?.previousInteractionId ?? undefined;

    // Tracing
    const traceId = options?.traceId ?? null;
    const generationId = tracing.generationStart(traceId, "chatWithToolsStream", {
      model: this.model,
      input: lastMessage.content,
      metadata: {
        ragEnabled: !!ragEnabled,
        webSearchEnabled: !!webSearchEnabled,
        toolCount: tools.length,
        enableThinking,
        useInteractionsApi: true,
        hasPreviousInteractionId: !!previousInteractionId,
      },
    });
    let toolCallTraceCount = 0;
    let accumulatedOutput = "";
    const totalUsage: TracingUsage = { input: 0, output: 0, total: 0 };
    let roundNumber = 0;
    let currentInteractionId: string | undefined;
    let streamErrored = false;

    // Build the initial input
    const input = GeminiClient.buildInteractionInput(lastMessage);

    try {
      let continueLoop = true;
      let nextInput: string | Interactions.Content[] = input;

      while (continueLoop) {
        roundNumber++;
        const roundSpanId = tracing.spanStart(traceId, `round-${roundNumber}`, {
          parentId: generationId ?? undefined,
          metadata: { roundNumber },
        });

        // Create streaming interaction
        const stream = await this.ai.interactions.create({
          model: this.model,
          input: nextInput,
          stream: true,
          tools: interactionTools,
          system_instruction: systemPrompt,
          previous_interaction_id: roundNumber === 1 ? previousInteractionId : currentInteractionId,
          store: true,
          generation_config: generationConfig,
        });

        const functionCallsToProcess: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
        const accumulatedSources: string[] = [];
        let groundingEmitted = false;
        let webSearchUsedInRound = false;
        let roundUsage: TracingUsage | undefined;
        let hasReceivedEvent = false;

        // Process SSE events
        for await (const event of stream) {
          hasReceivedEvent = true;

          switch (event.event_type) {
            case "interaction.start": {
              currentInteractionId = event.interaction?.id;
              break;
            }

            case "content.delta": {
              const delta = event.delta;
              if (!delta) break;

              switch (delta.type) {
                case "text":
                  if ("text" in delta && delta.text) {
                    accumulatedOutput += delta.text;
                    yield { type: "text", content: delta.text };
                  }
                  break;

                case "thought_summary":
                  // Thinking content via summary
                  if ("content" in delta && delta.content) {
                    const thought = delta.content;
                    if ("text" in thought && thought.text) {
                      yield { type: "thinking", content: thought.text };
                    }
                  }
                  break;

                case "function_call":
                  if ("name" in delta && "arguments" in delta && "id" in delta) {
                    functionCallsToProcess.push({
                      id: delta.id,
                      name: delta.name,
                      args: delta.arguments ?? {},
                    });
                  }
                  break;

                case "file_search_result":
                  // RAG results come through file_search_result deltas
                  if ("result" in delta && Array.isArray(delta.result)) {
                    for (const r of delta.result) {
                      const title = (r as { title?: string }).title;
                      if (title && !accumulatedSources.includes(title)) {
                        accumulatedSources.push(title);
                      }
                    }
                  }
                  break;

                case "google_search_result":
                  if (!webSearchUsedInRound) {
                    webSearchUsedInRound = true;
                    yield { type: "web_search_used" };
                    groundingEmitted = true;
                  }
                  break;

                default:
                  break;
              }
              break;
            }

            case "interaction.complete": {
              const interaction = event.interaction;
              if (interaction?.usage) {
                roundUsage = extractInteractionsUsage(interaction.usage, this.model);
              }
              // Check for blocked/failed/incomplete status
              const status = interaction?.status;
              if (status && status !== "completed" && status !== "requires_action") {
                const statusMsg = `Response ${status}${status === "failed" ? " (possibly blocked by safety filters)" : ""}`;
                tracing.spanEnd(roundSpanId, { error: statusMsg, metadata: { usage: roundUsage } });
                streamErrored = true;
                yield { type: "error", error: statusMsg };
                continueLoop = false;
              }
              break;
            }

            case "error": {
              const errMsg = (event as { error?: { message?: string } }).error?.message ?? "Unknown interaction error";
              tracing.spanEnd(roundSpanId, { error: errMsg, metadata: { usage: roundUsage } });
              streamErrored = true;
              continueLoop = false;
              yield { type: "error", error: errMsg };
              break;
            }

            default:
              break;
          }
        }

        // Sum round usage into total
        if (roundUsage) accumulateUsage(totalUsage, roundUsage);

        // Add search grounding cost
        if (webSearchUsedInRound && this.model && SEARCH_GROUNDING_COST[this.model] !== undefined) {
          totalUsage.totalCost = (totalUsage.totalCost ?? 0) + SEARCH_GROUNDING_COST[this.model];
        }

        // Emit RAG sources
        if (accumulatedSources.length > 0 && !groundingEmitted) {
          yield { type: "rag_used", ragSources: accumulatedSources };
          groundingEmitted = true;

          // Retriever tracing span
          const retrieverSpanId = tracing.spanStart(traceId, "retriever:file-search", {
            parentId: roundSpanId ?? undefined,
            metadata: { sourceCount: accumulatedSources.length },
          });
          tracing.spanEnd(retrieverSpanId, {
            output: accumulatedSources,
            metadata: { toolUsePromptTokens: roundUsage?.toolUsePromptTokens },
          });
        }

        if (!hasReceivedEvent && functionCallsToProcess.length === 0) {
          tracing.spanEnd(roundSpanId, { error: "No response received from API" });
          yield { type: "error", error: "No response received from API (possible server error)" };
          return;
        }

        if (streamErrored) {
          break;
        }

        // Process function calls
        if (functionCallsToProcess.length > 0 && executeToolCall) {
          const remainingBefore = maxFunctionCalls - functionCallCount;

          if (remainingBefore <= 0) {
            yield {
              type: "text",
              content: "\n\n[Function call limit reached. Summarizing with available information...]",
            };
            // Request final answer
            nextInput = "You have reached the function call limit. Please provide a final answer based on the information gathered so far.";
            tracing.spanEnd(roundSpanId, { metadata: { reason: "function_call_limit", usage: roundUsage } });
            // One more round to get the final answer, then stop
            roundNumber++;
            const finalStream = await this.ai.interactions.create({
              model: this.model,
              input: nextInput,
              stream: true,
              system_instruction: systemPrompt,
              previous_interaction_id: currentInteractionId,
              store: true,
              generation_config: generationConfig,
            });
            let finalUsage: TracingUsage | undefined;
            for await (const event of finalStream) {
              if (event.event_type === "content.delta" && event.delta?.type === "text" && "text" in event.delta) {
                const text = event.delta.text;
                accumulatedOutput += text;
                yield { type: "text", content: text };
              }
              if (event.event_type === "interaction.start" && event.interaction?.id) {
                currentInteractionId = event.interaction.id;
              }
              if (event.event_type === "interaction.complete" && event.interaction?.usage) {
                finalUsage = extractInteractionsUsage(event.interaction.usage, this.model);
              }
            }
            if (finalUsage) accumulateUsage(totalUsage, finalUsage);
            continueLoop = false;
            continue;
          }

          const callsToExecute = functionCallsToProcess.slice(0, remainingBefore);
          const skippedCount = functionCallsToProcess.length - callsToExecute.length;

          const remainingAfter = remainingBefore - callsToExecute.length;
          if (!warningEmitted && remainingAfter <= warningThreshold) {
            warningEmitted = true;
            yield {
              type: "text",
              content: `\n\n[Note: ${remainingAfter} function calls remaining. Please work efficiently.]`,
            };
          }

          // Execute function calls and build FunctionResultContent inputs
          const functionResults: Interactions.Content[] = [];

          for (const fc of callsToExecute) {
            const toolCall: ToolCall = {
              id: fc.id,
              name: fc.name,
              args: fc.args,
            };

            yield { type: "tool_call", toolCall };

            toolCallTraceCount++;
            const toolSpanId = tracing.spanStart(traceId, `tool:${fc.name}`, {
              parentId: generationId ?? undefined,
              input: fc.args,
              metadata: { toolName: fc.name },
            });

            const result = await executeToolCall(fc.name, fc.args);

            tracing.spanEnd(toolSpanId, { output: result });

            const resultForTrace = typeof result === "string" ? result : JSON.stringify(result);
            const truncatedResult = resultForTrace.length > 500 ? resultForTrace.substring(0, 500) + "..." : resultForTrace;
            accumulatedOutput += `\n[tool_call: ${fc.name}(${JSON.stringify(fc.args)})]\n`;
            accumulatedOutput += `[tool_result: ${truncatedResult}]\n`;

            yield {
              type: "tool_result",
              toolResult: { toolCallId: toolCall.id, result },
            };

            // Build FunctionResultContent for Interactions API
            // Preserve original result structure (object/array) so the model can consume fields directly
            functionResults.push({
              type: "function_result",
              call_id: fc.id,
              name: fc.name,
              result: result,
            } as Interactions.Content);
          }

          functionCallCount += callsToExecute.length;

          if (skippedCount > 0 || functionCallCount >= maxFunctionCalls) {
            const skippedMsg = skippedCount > 0
              ? ` (${skippedCount} additional calls were skipped)`
              : "";
            yield {
              type: "text",
              content: `\n\n[Function call limit reached${skippedMsg}. Summarizing with available information...]`,
            };

            // Send results + limit message
            functionResults.push({
              type: "text",
              text: "[System: Function call limit reached. Please provide a final answer based on the information gathered so far.]",
            } as Interactions.Content);
            nextInput = functionResults;
            tracing.spanEnd(roundSpanId, { metadata: { reason: "function_call_limit_with_skipped", usage: roundUsage } });

            // Final round
            roundNumber++;
            const finalStream = await this.ai.interactions.create({
              model: this.model,
              input: nextInput,
              stream: true,
              tools: interactionTools,
              system_instruction: systemPrompt,
              previous_interaction_id: currentInteractionId,
              store: true,
              generation_config: generationConfig,
            });
            let finalUsage: TracingUsage | undefined;
            for await (const event of finalStream) {
              if (event.event_type === "content.delta" && event.delta?.type === "text" && "text" in event.delta) {
                const text = event.delta.text;
                accumulatedOutput += text;
                yield { type: "text", content: text };
              }
              if (event.event_type === "interaction.start" && event.interaction?.id) {
                currentInteractionId = event.interaction.id;
              }
              if (event.event_type === "interaction.complete" && event.interaction?.usage) {
                finalUsage = extractInteractionsUsage(event.interaction.usage, this.model);
              }
            }
            if (finalUsage) accumulateUsage(totalUsage, finalUsage);
            continueLoop = false;
            continue;
          }

          // Add warning if approaching limit
          if (warningEmitted && remainingAfter <= warningThreshold) {
            functionResults.push({
              type: "text",
              text: `[System: You have ${remainingAfter} function calls remaining. Please complete your task efficiently or provide a summary.]`,
            } as Interactions.Content);
          }

          // Send function results back — next iteration creates a new interaction chained via previous_interaction_id
          nextInput = functionResults;
          tracing.spanEnd(roundSpanId, { metadata: { toolCalls: callsToExecute.map(c => c.name), usage: roundUsage } });
        } else {
          tracing.spanEnd(roundSpanId, { metadata: { final: true, usage: roundUsage } });
          continueLoop = false;
        }
      }

      if (streamErrored) {
        tracing.generationEnd(generationId, {
          error: "Interaction stream failed",
          usage: totalUsage.total ? totalUsage : undefined,
          metadata: { toolCallCount: toolCallTraceCount, roundCount: roundNumber },
        });
        return;
      }


      const generationMetadata: Record<string, unknown> = { toolCallCount: toolCallTraceCount, roundCount: roundNumber };
      if (totalUsage.toolUsePromptTokens) {
        generationMetadata.toolUsePromptTokens = totalUsage.toolUsePromptTokens;
        if (totalUsage.total) {
          generationMetadata.ragTokenRatio = totalUsage.toolUsePromptTokens / totalUsage.total;
        }
      }
      tracing.generationEnd(generationId, {
        output: accumulatedOutput,
        usage: totalUsage.total ? totalUsage : undefined,
        metadata: generationMetadata,
      });

      yield {
        type: "done",
        usage: toStreamChunkUsage(totalUsage.total ? totalUsage : undefined),
        interactionId: currentInteractionId,
      };
    } catch (error) {
      tracing.generationEnd(generationId, {
        error: formatError(error),
        usage: totalUsage.total ? totalUsage : undefined,
        metadata: { toolCallCount: toolCallTraceCount, roundCount: roundNumber },
      });

      yield {
        type: "error",
        error: formatError(error),
      };
    }
  }

  // Streaming workflow generation with thinking
  async *generateWorkflowStream(
    messages: Message[],
    systemPrompt?: string,
    traceId?: string | null
  ): AsyncGenerator<StreamChunk> {
    // Build history from all messages except the last one
    const historyMessages = messages.slice(0, -1);
    const history = this.messagesToContents(historyMessages);

    // Get the last user message (needed for keyword-based thinking)
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") {
      yield { type: "error", error: "No user message to send" };
      return;
    }

    // Workflow generation always enables thinking (unless model doesn't support it)
    const thinkingConfig = this.buildThinkingConfig(true);

    // Create a chat session with history (no tools for workflow generation)
    const chat: Chat = this.ai.chats.create({
      model: this.model,
      history,
      config: {
        systemInstruction: systemPrompt,
        safetySettings: DEFAULT_SAFETY_SETTINGS,
        thinkingConfig,
      },
    });

    const messageParts = GeminiClient.buildMessageParts(lastMessage);

    const genId = tracing.generationStart(traceId ?? null, "generateWorkflowStream", {
      model: this.model,
      input: lastMessage.content,
      metadata: { enableThinking: this.supportsThinking() },
    });

    try {
      const response = await chat.sendMessageStream({ message: messageParts });
      let accumulatedText = "";
      let lastUsage: TracingUsage | undefined;

      for await (const chunk of response) {
        if (chunk.usageMetadata) lastUsage = extractUsage(chunk.usageMetadata, { model: this.model });
        // Access candidates via type assertion for thought parts and finishReason
        const chunkWithCandidates = chunk as {
          candidates?: Array<{
            finishReason?: string;
            content?: {
              parts?: Array<{
                text?: string;
                thought?: boolean;
              }>;
            };
          }>;
        };
        const candidates = chunkWithCandidates.candidates;

        // Check finishReason for blocked responses (best practice)
        const blockReason = checkFinishReason(candidates);
        if (blockReason) {
          tracing.generationEnd(genId, { error: blockReason, usage: lastUsage });
          yield { type: "error", error: blockReason };
          return;
        }

        // Extract and yield thinking parts
        if (candidates && candidates.length > 0) {
          const parts = candidates[0]?.content?.parts;
          if (parts) {
            for (const part of parts) {
              if (part.thought && part.text) {
                yield { type: "thinking", content: part.text };
              }
            }
          }
        }

        // Yield text chunks
        const text = chunk.text;
        if (text) {
          accumulatedText += text;
          yield { type: "text", content: text };
        }
      }

      tracing.generationEnd(genId, { output: accumulatedText, usage: lastUsage });
      yield { type: "done", usage: toStreamChunkUsage(lastUsage) };
    } catch (error) {
      tracing.generationEnd(genId, {
        error: formatError(error),
      });
      yield {
        type: "error",
        error: formatError(error),
      };
    }
  }

  // Deep Research using Interactions API agent
  async *deepResearchStream(
    query: string,
    previousInteractionId?: string | null,
    traceId?: string | null
  ): AsyncGenerator<StreamChunk> {
    const genId = tracing.generationStart(traceId ?? null, "deepResearch", {
      model: "deep-research-pro-preview-12-2025",
      input: query,
    });

    try {
      // Create a background interaction with the Deep Research agent
      const interaction = await this.ai.interactions.create({
        agent: "deep-research-pro-preview-12-2025",
        input: query,
        background: true,
        previous_interaction_id: previousInteractionId ?? undefined,
        store: true,
      });

      const interactionId = interaction.id;
      yield { type: "text", content: "Deep Research started. Polling for results...\n\n" };

      // Poll for completion
      const maxPolls = 180;  // 30 min max (10s intervals)
      for (let i = 0; i < maxPolls; i++) {
        await new Promise(resolve => setTimeout(resolve, 10000));

        const result = await this.ai.interactions.get(interactionId);

        if (result.status === "completed") {
          // Extract text from outputs
          const outputs = result.outputs ?? [];
          let fullText = "";
          for (const output of outputs) {
            if ("text" in output && output.text) {
              fullText += output.text;
            }
          }

          if (fullText) {
            yield { type: "text", content: fullText };
          }

          const usage = extractInteractionsUsage(result.usage, "deep-research-pro-preview-12-2025");
          tracing.generationEnd(genId, { output: fullText, usage });
          yield {
            type: "done",
            usage: toStreamChunkUsage(usage),
            interactionId,
          };
          return;
        }

        if (result.status === "failed" || result.status === "cancelled") {
          const errMsg = `Deep Research ${result.status}`;
          tracing.generationEnd(genId, { error: errMsg });
          yield { type: "error", error: errMsg };
          return;
        }

        // Still in progress
        if (i % 3 === 0 && i > 0) {
          yield { type: "text", content: "." };
        }
      }

      tracing.generationEnd(genId, { error: "Deep Research timed out" });
      yield { type: "error", error: "Deep Research timed out after 30 minutes" };
    } catch (error) {
      tracing.generationEnd(genId, { error: formatError(error) });
      yield { type: "error", error: formatError(error) };
    }
  }

  // Image generation using Gemini
  async *generateImageStream(
    messages: Message[],
    imageModel: ModelType,
    systemPrompt?: string,
    webSearchEnabled?: boolean,
    _ragStoreIds?: string[],  // Reserved for future RAG support in image generation
    traceId?: string | null
  ): AsyncGenerator<StreamChunk> {
    // Build history from all messages except the last one
    const historyMessages = messages.slice(0, -1);
    const history = this.messagesToContents(historyMessages);

    // Get the last user message
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") {
      yield { type: "error", error: "No user message to send" };
      return;
    }

    const messageParts = GeminiClient.buildMessageParts(lastMessage);

    // Build tools array
    // Image models: Web Search only (no RAG)
    const tools: Tool[] = [];

    if (webSearchEnabled) {
      tools.push({ googleSearch: {} });
    }

    const genId = tracing.generationStart(traceId ?? null, "generateImageStream", {
      model: imageModel,
      input: lastMessage.content,
      metadata: { webSearchEnabled: !!webSearchEnabled },
    });

    try {
      const response = await this.ai.models.generateContent({
        model: imageModel,
        contents: [...history, { role: "user", parts: messageParts }],
        config: {
          systemInstruction: systemPrompt,
          safetySettings: DEFAULT_SAFETY_SETTINGS,
          responseModalities: ["TEXT", "IMAGE"],
          tools: tools.length > 0 ? tools : undefined,
        },
      });

      // Check for blocked responses (best practice: always check finishReason)
      const blockReason = checkFinishReason(response.candidates);
      if (blockReason) {
        tracing.generationEnd(genId, { error: blockReason });
        yield { type: "error", error: blockReason };
        return;
      }

      // Emit web search used if enabled
      if (webSearchEnabled) {
        yield { type: "web_search_used" };
      }

      // Process response parts
      if (response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        if (candidate.content?.parts) {
          for (const part of candidate.content.parts) {
            // Handle text parts
            if ("text" in part && part.text) {
              yield { type: "text", content: part.text };
            }
            // Handle image parts
            if ("inlineData" in part && part.inlineData) {
              const imageData = part.inlineData as { mimeType?: string; data?: string };
              if (imageData.mimeType && imageData.data) {
                const generatedImage: GeneratedImage = {
                  mimeType: imageData.mimeType,
                  data: imageData.data,
                };
                yield { type: "image_generated", generatedImage };
              }
            }
          }
        }
      }

      const imageWebSearchUsed = !!webSearchEnabled;
      const imageUsage = extractUsage(response.usageMetadata, { model: imageModel, webSearchUsed: imageWebSearchUsed });
      tracing.generationEnd(genId, {
        output: "[image generation completed]",
        usage: imageUsage,
      });
      yield { type: "done", usage: toStreamChunkUsage(imageUsage) };
    } catch (error) {
      tracing.generationEnd(genId, {
        error: formatError(error),
      });
      yield {
        type: "error",
        error: formatError(error),
      };
    }
  }
}

// Singleton instance
let geminiClientInstance: GeminiClient | null = null;

export function getGeminiClient(): GeminiClient | null {
  return geminiClientInstance;
}

export function initGeminiClient(apiKey: string, model: ModelType): GeminiClient {
  geminiClientInstance = new GeminiClient(apiKey, model);
  return geminiClientInstance;
}

export function resetGeminiClient(): void {
  geminiClientInstance = null;
}
