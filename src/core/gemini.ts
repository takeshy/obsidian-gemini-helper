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
  type RagContext,
} from "src/types";
import { tracing, type TracingUsage } from "src/core/tracingHooks";
import { formatError } from "src/utils/error";
import { Platform, requestUrl } from "obsidian";

// ---------------------------------------------------------------------------
// CORS-free fetch implementations for the Interactions API.
// The endpoint doesn't return CORS headers, so browser fetch rejects preflight.
// ---------------------------------------------------------------------------

// Desktop (Electron / Node.js): streaming via https module
// window.require loads Node.js builtins without triggering the ESM loader (which
// cannot resolve Node builtins in Electron's renderer process).
async function nodeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const https = (window as unknown as { require: (id: string) => typeof import("https") }).require("https");
  const url = typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(input.url);
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
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
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
  "gemini-3.5-flash": { input: 0.50 / 1e6, output: 3.00 / 1e6 },
  "gemini-3.1-flash-lite": { input: 0.25 / 1e6, output: 1.50 / 1e6 },
  "gemini-3.1-pro-preview": { input: 2.00 / 1e6, output: 12.00 / 1e6 },
  "gemini-3.1-pro-preview-customtools": { input: 2.00 / 1e6, output: 12.00 / 1e6 },
  "gemini-3-pro-image-preview": { input: 2.00 / 1e6, output: 120.00 / 1e6 },
  "gemini-3.1-flash-image-preview": { input: 0.25 / 1e6, output: 60.00 / 1e6 },
};

// Grounding with Google Search cost per prompt (USD)
// Gemini 3 models: $14/1K queries, Gemini 2.x: $35/1K prompts
// Approximated as per-prompt since exact query count is not exposed by the API
const SEARCH_GROUNDING_COST: Record<string, number> = {
  "gemini-3.5-flash": 14 / 1000,
  "gemini-3.1-pro-preview": 14 / 1000,
  "gemini-3.1-pro-preview-customtools": 14 / 1000,
  "gemini-3-pro-image-preview": 14 / 1000,
  "gemini-3.1-flash-image-preview": 14 / 1000,
  "gemini-3.1-flash-lite": 14 / 1000,
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
  requestLimitExtension?: (details: {
    used: number;
    currentLimit: number;
    extensionAmount: number;
    pendingCalls: number;
    remaining: number;
  }) => Promise<boolean | number>;
}

export interface ChatWithToolsOptions {
  ragTopK?: number;
  ragMetadataFilter?: string;
  functionCallLimits?: FunctionCallLimitOptions;
  disableTools?: boolean;
  enableThinking?: boolean;
  traceId?: string | null;
  previousInteractionId?: string | null;  // For Interactions API conversation chaining
}

// Sanitize function call results for Gemini API.
// The API rejects function_response containing empty arrays ([]).
// This recursively replaces empty arrays with null.
function sanitizeFunctionResult(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) {
    return value.length === 0 ? null : value.map(sanitizeFunctionResult);
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = sanitizeFunctionResult(v);
    }
    return result;
  }
  return value;
}

function serializeFunctionResult(value: unknown): string {
  const sanitized = sanitizeFunctionResult(value);
  if (typeof sanitized === "string") return sanitized || "null";
  try {
    return JSON.stringify(sanitized) || "null";
  } catch {
    // Value could not be serialized (e.g. circular reference) — fall back to a
    // safe constant rather than Object's "[object Object]" stringification.
    return "null";
  }
}

async function maybeExtendFunctionCallLimit(
  options: FunctionCallLimitOptions | undefined,
  functionCallCount: number,
  currentLimit: number,
  pendingCalls: number,
  remaining: number,
): Promise<number> {
  const defaultExtensionAmount = options?.maxFunctionCalls ?? DEFAULT_SETTINGS.maxFunctionCalls;
  if (!options?.requestLimitExtension || defaultExtensionAmount <= 0) {
    return currentLimit;
  }

  const requestedExtension = await options.requestLimitExtension({
    used: functionCallCount,
    currentLimit,
    extensionAmount: defaultExtensionAmount,
    pendingCalls,
    remaining,
  });
  const extensionAmount = typeof requestedExtension === "number"
    ? Math.max(0, Math.floor(requestedExtension))
    : requestedExtension ? defaultExtensionAmount : 0;
  return extensionAmount > 0 ? currentLimit + extensionAmount : currentLimit;
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

type FileSearchDeltaResult = {
  title?: string;
  text?: string;
  file_search_store?: string;
};

type FileSearchResultContentLike = {
  type?: string;
  result?: unknown[];
  text?: string;
  annotations?: Array<{ source?: string }>;
};

function formatFileSearchSource(raw: unknown): string | null {
  const result = raw as FileSearchDeltaResult;
  const title = String(result.title ?? "").trim();
  return title || null;
}

function addFileSearchContext(sources: string[], contexts: RagContext[], raw: unknown): void {
  const result = raw as FileSearchDeltaResult;
  const source = formatFileSearchSource(raw);
  if (source && !sources.includes(source)) {
    sources.push(source);
  }

  const text = String(result.text ?? "").replace(/\s+/g, " ").trim();
  if (!source || !text) return;
  const excerpt = text.length > 500 ? text.slice(0, 500) + "..." : text;
  if (!contexts.some((ctx) => ctx.source === source && ctx.text === excerpt)) {
    contexts.push({ source, text: excerpt });
  }
}

// Extract a displayable source string from a v2 Annotation
// (URLCitation.url / FileCitation.file_name / PlaceCitation.name, etc.)
function addAnnotationSources(sources: string[], annotations: unknown): void {
  if (!Array.isArray(annotations)) return;
  for (const annotation of annotations as Array<{
    source?: string;
    url?: string;
    file_name?: string;
    document_uri?: string;
    name?: string;
    place_id?: string;
  }>) {
    const source = String(
      annotation.url ??
      annotation.file_name ??
      annotation.document_uri ??
      annotation.name ??
      annotation.place_id ??
      annotation.source ??
      ""
    ).trim();
    if (source && !sources.includes(source)) {
      sources.push(source);
    }
  }
}

function collectFileSearchSourcesFromContents(contents: unknown, sources: string[], contexts: RagContext[]): void {
  if (!Array.isArray(contents)) return;
  for (const content of contents as FileSearchResultContentLike[]) {
    // v2: file_search_result is a Step type, not a Content type, so this branch
    // only fires for legacy-shaped payloads. Kept for robustness.
    if (content?.type === "file_search_result" && Array.isArray(content.result)) {
      for (const result of content.result) {
        addFileSearchContext(sources, contexts, result);
      }
    }
    if (content?.type === "text") {
      addAnnotationSources(sources, content.annotations);
    }
  }
}

// v2 steps schema: collect sources from a Step[] timeline.
// FileSearchResultStep itself carries no result data (only call_id/signature);
// the actual snippets arrive via step.delta events. Here we extract annotation
// sources from model_output text content as a fallback.
function collectFileSearchSourcesFromSteps(steps: unknown, sources: string[], contexts: RagContext[]): void {
  if (!Array.isArray(steps)) return;
  for (const step of steps as Array<{ type?: string; content?: unknown[]; result?: unknown[] }>) {
    if (step?.type === "file_search_result" && Array.isArray(step.result)) {
      for (const r of step.result) addFileSearchContext(sources, contexts, r);
    }
    if (step?.type === "model_output" && Array.isArray(step.content)) {
      collectFileSearchSourcesFromContents(step.content, sources, contexts);
    }
  }
}

export class GeminiClient {
  private ai: GoogleGenAI;
  private model: ModelType;

  constructor(apiKey: string, model: ModelType = "gemini-3.5-flash") {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;

    // Patch Interactions API client to bypass CORS.
    // The Interactions API endpoint doesn't return CORS headers, so browser/Electron
    // fetch blocks the request. Desktop uses Node.js https, mobile uses Obsidian's requestUrl.
    try {
      const interactions = this.ai.interactions;
      const client = (interactions as unknown as { _client: { fetch: typeof fetch } })._client;
      if (client) {
        client.fetch = corsFetch;
      }
    } catch {
      // Fallback: global fetch
    }
  }

  setModel(model: ModelType): void {
    this.model = model;
  }

  private getInteractionsModel(hasFunctionTools: boolean): ModelType {
    if (this.model === "gemini-3.1-pro-preview" && hasFunctionTools) {
      return "gemini-3.1-pro-preview-customtools";
    }
    return this.model;
  }

  // Build thinking config based on model capabilities (shared across streaming methods)
  private buildThinkingConfig(enableThinking: boolean): Record<string, unknown> | undefined {
    const modelLower = this.model.toLowerCase();

    // Gemma 4: thinking config not supported
    if (modelLower.includes("gemma-4")) return undefined;

    // gemini-3.1-flash-lite: uses thinkingLevel instead of thinkingBudget
    if (modelLower.includes("gemini-3.1-flash-lite")) {
      if (!enableThinking) return undefined;
      return { includeThoughts: true, thinkingLevel: "HIGH" };
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

  private supportsThinking(): boolean {
    return true;
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
        const items = p.items;
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
    ragMetadataFilter?: string,
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
      });
    }

    // File Search RAG
    if (ragStoreIds && ragStoreIds.length > 0) {
      result.push({
        type: "file_search" as const,
        file_search_store_names: ragStoreIds,
        top_k: ragTopK,
        metadata_filter: ragMetadataFilter || undefined,
      });
    }

    // Google Search
    if (webSearchEnabled) {
      result.push({
        type: "google_search" as const,
      });
    }

    return result;
  }

  // Retrieve RAG context via the generateContent API (file_search tool).
  // The Interactions API does not support the file_search tool (returns 501
  // not_implemented), so RAG retrieval is done as a pre-processing step using
  // the generateContent API. The retrieved contexts are injected into the
  // system prompt for the subsequent Interactions API call, preserving both
  // RAG and function calling capabilities.
  private async retrieveRagContext(
    userMessage: string,
    ragStoreIds: string[],
    topK: number,
    metadataFilter?: string,
    attachments?: Message["attachments"],
  ): Promise<{ sources: string[]; contexts: RagContext[] }> {
    const parts: Part[] = [];
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        parts.push({
          inlineData: {
            mimeType: attachment.mimeType,
            data: attachment.data,
          },
        });
      }
      if (userMessage) {
        parts.push({ text: userMessage });
      }
    } else {
      parts.push({ text: userMessage });
    }

    const tools: Tool[] = [{
      fileSearch: {
        fileSearchStoreNames: ragStoreIds,
        topK,
        metadataFilter: metadataFilter || undefined,
      },
    }];

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts }],
      config: {
        tools,
        safetySettings: DEFAULT_SAFETY_SETTINGS,
      },
    });

    const groundingMetadata = (response.candidates?.[0] as {
      groundingMetadata?: {
        groundingChunks?: Array<{
          retrievedContext?: {
            title?: string;
            text?: string;
            uri?: string;
            fileSearchStore?: string;
          };
        }>;
      };
    })?.groundingMetadata;

    const chunks = groundingMetadata?.groundingChunks ?? [];
    const sources: string[] = [];
    const contexts: RagContext[] = [];

    for (const chunk of chunks) {
      const ctx = chunk.retrievedContext;
      if (!ctx) continue;
      const title = String(ctx.title ?? ctx.uri ?? "").trim();
      if (!title) continue;
      if (!sources.includes(title)) {
        sources.push(title);
      }
      const text = String(ctx.text ?? "").replace(/\s+/g, " ").trim();
      if (text) {
        const excerpt = text.length > 500 ? text.slice(0, 500) + "..." : text;
        if (!contexts.some(c => c.source === title && c.text === excerpt)) {
          contexts.push({ source: title, text: excerpt });
        }
      }
    }

    return { sources, contexts };
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
            contents.push({ type: "text" as const, text: `[File: ${attachment.name}]\n${decoded}` });
          } catch {
            contents.push({ type: "text" as const, text: `[File: ${attachment.name}]` });
          }
        }
      }
    }
    if (msg.content) {
      contents.push({ type: "text" as const, text: msg.content });
    }
    return contents;
  }

  // Build Interactions API input with local history replay.
  // Used when there is no previous_interaction_id (old chats, after non-Interactions responses).
  // Prepends conversation history as a text block, then appends the last user message
  // (with attachments preserved) so the model has full context.
  private static buildHistoryReplayInput(
    messages: Message[],
  ): string | Interactions.Content[] {
    const historyMessages = messages.slice(0, -1);
    const lastMessage = messages[messages.length - 1];

    // No history to replay — just send the last message directly
    if (historyMessages.length === 0) {
      return GeminiClient.buildInteractionInput(lastMessage);
    }

    // Build a conversation transcript from history
    const lines: string[] = [];
    for (const msg of historyMessages) {
      const role = msg.role === "user" ? "User" : "Assistant";
      if (msg.content) {
        lines.push(`${role}: ${msg.content}`);
      }
    }
    const historyText = "[Previous conversation]\n" + lines.join("\n\n") + "\n\n[Current message]\n";

    // Simple text-only last message — merge into a single string
    if (!lastMessage.attachments || lastMessage.attachments.length === 0) {
      return historyText + (lastMessage.content || "");
    }

    // Multimodal: history as text prefix, then attachments + text from the last message
    const contents: Interactions.Content[] = [
      { type: "text" as const, text: historyText },
    ];
    const lastParts = GeminiClient.buildInteractionInput(lastMessage);
    if (Array.isArray(lastParts)) {
      contents.push(...lastParts);
    } else {
      contents.push({ type: "text" as const, text: lastParts });
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
        const items = value.items;

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

  private shouldUseGenerateContentToolsApi(tools: ToolDefinition[]): boolean {
    const modelLower = this.model.toLowerCase();
    if (!(modelLower.includes("gemini-3.1-pro") || modelLower.includes("gemini-3-pro"))) {
      return false;
    }
    return tools.length > 0;
  }

  private buildGenerateContentTools(tools: ToolDefinition[], webSearchEnabled?: boolean): Tool[] | undefined {
    const geminiTools = tools.length > 0 ? this.toolsToGeminiFormat(tools) : [];
    if (webSearchEnabled) {
      geminiTools.push({ googleSearch: {} });
    }
    return geminiTools.length > 0 ? geminiTools : undefined;
  }

  private async *chatWithToolsStreamGenerateContent(
    messages: Message[],
    tools: ToolDefinition[],
    systemPrompt?: string,
    executeToolCall?: (name: string, args: Record<string, unknown>) => Promise<unknown>,
    webSearchEnabled?: boolean,
    options?: ChatWithToolsOptions,
  ): AsyncGenerator<StreamChunk> {
    const maxFunctionCalls = options?.functionCallLimits?.maxFunctionCalls ?? DEFAULT_SETTINGS.maxFunctionCalls;
    let currentFunctionCallLimit = maxFunctionCalls;
    const warningThreshold = Math.min(
      options?.functionCallLimits?.functionCallWarningThreshold ?? DEFAULT_SETTINGS.functionCallWarningThreshold,
      maxFunctionCalls,
    );
    let functionCallCount = 0;
    let warningEmitted = false;
    const traceId = options?.traceId ?? null;
    const lastMsg = messages[messages.length - 1];
    const generationId = tracing.generationStart(traceId, "chatWithToolsStreamGenerateContent", {
      model: this.model,
      input: lastMsg?.content,
      metadata: { useGenerateContentApi: true, toolCount: tools.length, webSearchEnabled: !!webSearchEnabled },
    });
    const totalUsage: TracingUsage = { input: 0, output: 0, total: 0 };
    let accumulatedOutput = "";
    let roundNumber = 0;
    let toolCallTraceCount = 0;

    let contents = this.messagesToContents(messages);
    const generationTools = this.buildGenerateContentTools(tools, webSearchEnabled);
    const thinkingConfig = this.buildThinkingConfig(options?.enableThinking ?? true);
    // Gemini rejects mixing a built-in/server-side tool (googleSearch) with
    // function-calling declarations unless this flag is set.
    const mixesBuiltInWithFunctionCalling = !options?.disableTools && tools.length > 0 && !!webSearchEnabled;

    try {
      while (true) {
        roundNumber++;
        const response = await this.ai.models.generateContentStream({
          model: this.model,
          contents,
          config: {
            systemInstruction: systemPrompt,
            tools: options?.disableTools ? undefined : generationTools,
            toolConfig: mixesBuiltInWithFunctionCalling
              ? { includeServerSideToolInvocations: true }
              : undefined,
            safetySettings: DEFAULT_SAFETY_SETTINGS,
            thinkingConfig,
          },
        });

        const modelParts: Part[] = [];
        const functionCalls: Array<{ id?: string; name: string; args: Record<string, unknown> }> = [];
        let roundUsage: TracingUsage | undefined;
        let hasReceivedChunk = false;

        for await (const chunk of response) {
          hasReceivedChunk = true;
          if (chunk.usageMetadata) {
            roundUsage = extractUsage(chunk.usageMetadata, { model: this.model, webSearchUsed: !!webSearchEnabled });
          }

          const blockReason = checkFinishReason(chunk.candidates);
          if (blockReason) {
            tracing.generationEnd(generationId, { error: blockReason, usage: roundUsage });
            yield { type: "error", error: blockReason };
            return;
          }

          const parts = chunk.candidates?.[0]?.content?.parts ?? [];
          for (const part of parts) {
            modelParts.push(part);
            if (part.text) {
              if (part.thought) {
                yield { type: "thinking", content: part.text };
              } else {
                accumulatedOutput += part.text;
                yield { type: "text", content: part.text };
              }
            }
            if (part.functionCall?.name) {
              functionCalls.push({
                id: part.functionCall.id,
                name: part.functionCall.name,
                args: part.functionCall.args ?? {},
              });
            }
          }
        }

        if (roundUsage) accumulateUsage(totalUsage, roundUsage);

        if (!hasReceivedChunk) {
          tracing.generationEnd(generationId, { error: "No response received from API" });
          yield { type: "error", error: "No response received from API (possible server error)" };
          return;
        }

        if (modelParts.length > 0) {
          // Preserve the model's parts exactly, including Gemini 3 thoughtSignature
          // fields required for follow-up function-response turns.
          contents = [...contents, { role: "model", parts: modelParts }];
        }

        if (functionCalls.length === 0 || !executeToolCall) {
          tracing.generationEnd(generationId, {
            output: accumulatedOutput,
            usage: totalUsage.total ? totalUsage : undefined,
            metadata: { toolCallCount: toolCallTraceCount, roundCount: roundNumber, useGenerateContentApi: true },
          });
          yield {
            type: "done",
            usage: toStreamChunkUsage(totalUsage.total ? totalUsage : undefined),
          };
          return;
        }

        let remainingBefore = currentFunctionCallLimit - functionCallCount;
        if (remainingBefore <= 0) {
          contents = [...contents, {
            role: "user",
            parts: [{ text: "Function call limit reached. Please provide a final answer based on the information gathered so far." }],
          }];
          continue;
        }

        if (!warningEmitted && remainingBefore <= warningThreshold) {
          warningEmitted = true;
          const extendedLimit = await maybeExtendFunctionCallLimit(
            options?.functionCallLimits,
            functionCallCount,
            currentFunctionCallLimit,
            functionCalls.length,
            remainingBefore,
          );
          if (extendedLimit > currentFunctionCallLimit) {
            currentFunctionCallLimit = extendedLimit;
            remainingBefore = currentFunctionCallLimit - functionCallCount;
          }
          yield { type: "text", content: `\n\n[Note: ${remainingBefore} function calls remaining. Please work efficiently.]` };
        }

        const callsToExecute = functionCalls.slice(0, remainingBefore);

        const functionResponseParts: Part[] = [];
        for (const fc of callsToExecute) {
          const toolCall: ToolCall = { id: fc.id ?? fc.name, name: fc.name, args: fc.args };
          yield { type: "tool_call", toolCall };

          toolCallTraceCount++;
          const toolSpanId = tracing.spanStart(traceId, `tool:${fc.name}`, {
            parentId: generationId ?? undefined,
            input: fc.args,
            metadata: { toolName: fc.name },
          });

          const result = await executeToolCall(fc.name, fc.args);
          tracing.spanEnd(toolSpanId, { output: result });

          const serializedResult = serializeFunctionResult(result);
          accumulatedOutput += `\n[tool_call: ${fc.name}(${JSON.stringify(fc.args)})]\n`;
          accumulatedOutput += `[tool_result: ${serializedResult.length > 500 ? serializedResult.slice(0, 500) + "..." : serializedResult}]\n`;

          yield { type: "tool_result", toolResult: { toolCallId: toolCall.id, result } };

          functionResponseParts.push({
            functionResponse: {
              id: fc.id,
              name: fc.name,
              response: { output: serializedResult },
            },
          });
        }
        functionCallCount += callsToExecute.length;

        if (functionCalls.length > callsToExecute.length || functionCallCount >= currentFunctionCallLimit) {
          functionResponseParts.push({
            text: "Function call limit reached. Please provide a final answer based on the information gathered so far.",
          });
        }

        contents = [...contents, { role: "user", parts: functionResponseParts }];
      }
    } catch (error) {
      tracing.generationEnd(generationId, {
        error: formatError(error),
        usage: totalUsage.total ? totalUsage : undefined,
        metadata: { toolCallCount: toolCallTraceCount, roundCount: roundNumber, useGenerateContentApi: true },
      });
      yield { type: "error", error: formatError(error) };
    }
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
    if (!options?.disableTools && this.shouldUseGenerateContentToolsApi(tools)) {
      yield* this.chatWithToolsStreamGenerateContent(
        messages,
        tools,
        systemPrompt,
        executeToolCall,
        webSearchEnabled,
        options,
      );
      return;
    }

    // Function call limit settings
    const maxFunctionCalls = options?.functionCallLimits?.maxFunctionCalls ?? DEFAULT_SETTINGS.maxFunctionCalls;
    let currentFunctionCallLimit = maxFunctionCalls;
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
    // The Interactions API does not support the file_search tool (returns 501
    // not_implemented). RAG retrieval is done via generateContent API as a
    // pre-processing step, and the retrieved context is injected into the
    // system prompt. This preserves both RAG and function calling.
    // Gemma 4: cannot combine google_search with function calling
    const modelLower = this.model.toLowerCase();
    const isGemma4Model = modelLower.includes("gemma-4");
    const mustUseWebSearchOnly = modelLower === "gemini-3.1-flash-lite";
    const effectiveRagEnabled = ragEnabled && !isGemma4Model;
    const effectiveWebSearch = webSearchEnabled ?? false;
    const hasFunctionTools = !options?.disableTools && !(mustUseWebSearchOnly && effectiveWebSearch) && tools.length > 0;
    const interactionModel = this.getInteractionsModel(hasFunctionTools);
    let interactionTools: Interactions.Tool[] | undefined;
    if (!options?.disableTools) {
      // Interactions API rejects google_search + function tools for these models.
      const functionTools = mustUseWebSearchOnly && effectiveWebSearch ? [] : (tools.length > 0 ? tools : []);
      interactionTools = this.toolsToInteractionsFormat(
        functionTools,
        undefined,
        undefined,
        undefined,
        effectiveWebSearch,
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
      // Gemma 4: thinking config not supported via Interactions API
      if (modelLower.includes("gemma-4")) return undefined;
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
        interactionModel,
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

    // RAG pre-retrieval via generateContent API.
    // The Interactions API does not support the file_search tool (501
    // not_implemented), so we retrieve relevant contexts beforehand using
    // the generateContent API and inject them into the system prompt.
    let ragSources: string[] = [];
    let ragContexts: RagContext[] = [];
    if (effectiveRagEnabled && ragStoreIds) {
      const retrieverSpanId = tracing.spanStart(traceId, "retriever:file-search", {
        parentId: generationId ?? undefined,
        metadata: { storeCount: ragStoreIds.length, topK: clampedTopK },
      });
      try {
        const ragResult = await this.retrieveRagContext(
          lastMessage.content || "",
          ragStoreIds,
          clampedTopK,
          options?.ragMetadataFilter,
          lastMessage.attachments,
        );
        ragSources = ragResult.sources;
        ragContexts = ragResult.contexts;
        tracing.spanEnd(retrieverSpanId, {
          output: ragSources,
          metadata: { sourceCount: ragSources.length, contextCount: ragContexts.length },
        });
      } catch (ragError) {
        tracing.spanEnd(retrieverSpanId, { error: formatError(ragError) });
        // RAG retrieval failed — continue without RAG context
      }
    }

    // Inject RAG context into system prompt
    let ragSystemPrompt = systemPrompt;
    if (ragContexts.length > 0) {
      const contextBlock = ragContexts
        .map(c => `--- Source: ${c.source} ---\n${c.text}`)
        .join("\n\n");
      ragSystemPrompt = (systemPrompt || "") +
        `\n\n[Semantic search results — use these retrieved passages as reference context]\n${contextBlock}`;
    }

    // Emit RAG sources once (pre-retrieved before the main loop)
    let ragEmitted = false;
    if (ragSources.length > 0) {
      ragEmitted = true;
      yield { type: "rag_used", ragSources, ragContexts };
    }

    // Build the initial input.
    // When chaining via previous_interaction_id the server already knows the conversation,
    // so we only send the latest user message.  Otherwise replay local history as context.
    const input = previousInteractionId
      ? GeminiClient.buildInteractionInput(lastMessage)
      : GeminiClient.buildHistoryReplayInput(messages);

    try {
      let continueLoop = true;
      // v2 input accepts string | Content[] | Step[] (the Interactions API input
      // field is polymorphic). Content[] is used for the initial user turn; Step[]
      // is used when sending function_result + user_input steps back to the model.
      let nextInput: string | Interactions.Content[] | Interactions.Step[] = input;

      while (continueLoop) {
        roundNumber++;
        const roundSpanId = tracing.spanStart(traceId, `round-${roundNumber}`, {
          parentId: generationId ?? undefined,
          metadata: { roundNumber },
        });
        const roundPreviousInteractionId = roundNumber === 1 ? previousInteractionId : currentInteractionId;

        // Create streaming interaction.
        // Tools, system_instruction, and generation_config are passed on every
        // round (including follow-up interactions chained via
        // previous_interaction_id) because the Interactions API does not
        // reliably retain tool declarations across interactions for non-Pro
        // models.  Pro models use the generateContent path instead.
        const stream = await this.ai.interactions.create({
          model: interactionModel,
          input: nextInput,
          stream: true,
          previous_interaction_id: roundPreviousInteractionId,
          store: true,
          tools: interactionTools,
          system_instruction: ragSystemPrompt,
          generation_config: generationConfig,
        });

        const functionCallsToProcess: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
        const accumulatedSources: string[] = [];
        const accumulatedContexts: RagContext[] = [];
        let groundingEmitted = false;
        let webSearchUsedInRound = false;
        let roundUsage: TracingUsage | undefined;
        let hasReceivedEvent = false;

        // v2 steps schema: function call arguments stream as partial JSON via
        // `arguments_delta` events. We accumulate per-step and finalize on step.stop.
        const pendingFunctionCalls = new Map<
          number,
          { id: string; name: string; argsBuffer: string; startArgs: Record<string, unknown> }
        >();

        // Process SSE events (v2 "steps" schema event types)
        for await (const event of stream) {
          hasReceivedEvent = true;

          switch (event.event_type) {
            case "interaction.created": {
              currentInteractionId = event.interaction?.id;
              break;
            }

            case "step.start": {
              const step = event.step;
              if (!step) break;
              switch (step.type) {
                case "function_call":
                  // step.start provides id + name (arguments is {} in streaming;
                  // actual args arrive via arguments_delta deltas).
                  pendingFunctionCalls.set(event.index, {
                    id: step.id,
                    name: step.name,
                    argsBuffer: "",
                    startArgs: step.arguments ?? {},
                  });
                  break;
                default:
                  break;
              }
              break;
            }

            case "step.delta": {
              const delta = event.delta;
              if (!delta) break;

              switch (delta.type) {
                case "text":
                  if ("text" in delta && delta.text) {
                    accumulatedOutput += delta.text;
                    yield { type: "text", content: delta.text };
                  }
                  break;

                case "text_annotation_delta":
                  // v2: annotations are delivered in a dedicated delta type
                  if ("annotations" in delta && delta.annotations) {
                    addAnnotationSources(accumulatedSources, delta.annotations);
                  }
                  break;

                case "thought_summary":
                  // Thinking content via summary
                  if ("content" in delta && delta.content) {
                    const thought = delta.content as { text?: string };
                    if (thought.text) {
                      yield { type: "thinking", content: thought.text };
                    }
                  }
                  break;

                case "arguments_delta": {
                  // Accumulate partial JSON for the pending function call
                  const pending = pendingFunctionCalls.get(event.index);
                  if (pending && "arguments" in delta && typeof delta.arguments === "string") {
                    pending.argsBuffer += delta.arguments;
                  }
                  break;
                }

                case "file_search_call":
                  break;

                case "file_search_result":
                  // RAG results come through file_search_result deltas
                  if ("result" in delta && Array.isArray(delta.result)) {
                    for (const r of delta.result) {
                      addFileSearchContext(accumulatedSources, accumulatedContexts, r);
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

            case "step.stop": {
              // Finalize pending function call: parse accumulated arguments_delta JSON
              const pending = pendingFunctionCalls.get(event.index);
              if (pending) {
                let args = pending.startArgs;
                if (pending.argsBuffer) {
                  try {
                    args = JSON.parse(pending.argsBuffer) as Record<string, unknown>;
                  } catch {
                    args = pending.startArgs;
                  }
                }
                functionCallsToProcess.push({
                  id: pending.id,
                  name: pending.name,
                  args,
                });
                pendingFunctionCalls.delete(event.index);
              }
              break;
            }

            case "interaction.status_update": {
              // Optional progress/status events; usage may appear in metadata.
              if (event.metadata?.usage) {
                roundUsage = extractInteractionsUsage(event.metadata.usage, this.model);
              }
              break;
            }

            case "interaction.completed": {
              const interaction = event.interaction;
              if (interaction?.usage) {
                roundUsage = extractInteractionsUsage(interaction.usage, this.model);
              }
              // v2: interaction.steps in the completed event is empty to reduce payload;
              // sources were collected from step deltas above. Also collect from any
              // steps the server does return (e.g. non-streaming-style responses).
              collectFileSearchSourcesFromSteps(interaction?.steps, accumulatedSources, accumulatedContexts);
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

        // RAG sources were already emitted before the loop (pre-retrieved via
        // generateContent API since Interactions API doesn't support file_search).
        // Web search grounding is still detected within the loop below.
        if (accumulatedSources.length > 0 && !groundingEmitted && !ragEmitted) {
          yield { type: "rag_used", ragSources: accumulatedSources, ragContexts: accumulatedContexts };
          groundingEmitted = true;
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
          let remainingBefore = currentFunctionCallLimit - functionCallCount;

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
              model: interactionModel,
              input: nextInput,
              stream: true,
              system_instruction: ragSystemPrompt,
              previous_interaction_id: currentInteractionId,
              store: true,
              generation_config: generationConfig,
            });
            let finalUsage: TracingUsage | undefined;
            for await (const event of finalStream) {
              if (event.event_type === "step.delta" && event.delta?.type === "text" && "text" in event.delta) {
                const text = event.delta.text;
                accumulatedOutput += text;
                yield { type: "text", content: text };
              }
              if (event.event_type === "interaction.created" && event.interaction?.id) {
                currentInteractionId = event.interaction.id;
              }
              if (event.event_type === "interaction.completed" && event.interaction?.usage) {
                finalUsage = extractInteractionsUsage(event.interaction.usage, this.model);
              }
            }
            if (finalUsage) accumulateUsage(totalUsage, finalUsage);
            continueLoop = false;
            continue;
          }

          if (!warningEmitted && remainingBefore <= warningThreshold) {
            warningEmitted = true;
            const extendedLimit = await maybeExtendFunctionCallLimit(
              options?.functionCallLimits,
              functionCallCount,
              currentFunctionCallLimit,
              functionCallsToProcess.length,
              remainingBefore,
            );
            if (extendedLimit > currentFunctionCallLimit) {
              currentFunctionCallLimit = extendedLimit;
              remainingBefore = currentFunctionCallLimit - functionCallCount;
            }
            yield {
              type: "text",
              content: `\n\n[Note: ${remainingBefore} function calls remaining. Please work efficiently.]`,
            };
          }

          const callsToExecute = functionCallsToProcess.slice(0, remainingBefore);
          const skippedCount = functionCallsToProcess.length - callsToExecute.length;

          // Execute function calls and build FunctionResultStep inputs (v2 steps schema)
          const functionResults: Interactions.Step[] = [];

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

            const serializedResult = serializeFunctionResult(result);

            // Build FunctionResultStep for the v2 Interactions API input.
            // Use a JSON string result, matching the SDK README examples and
            // avoiding stricter model-side validation of arbitrary objects.
            functionResults.push({
              type: "function_result",
              call_id: fc.id,
              name: fc.name,
              result: serializedResult,
            });
          }

          functionCallCount += callsToExecute.length;

          if (skippedCount > 0 || functionCallCount >= currentFunctionCallLimit) {
            const skippedMsg = skippedCount > 0
              ? ` (${skippedCount} additional calls were skipped)`
              : "";
            yield {
              type: "text",
              content: `\n\n[Function call limit reached${skippedMsg}. Summarizing with available information...]`,
            };

            // Send results + limit message (v2: append a user_input step for the system text)
            functionResults.push({
              type: "user_input",
              content: [{ type: "text", text: "[System: Function call limit reached. Please provide a final answer based on the information gathered so far.]" }],
            });
            nextInput = functionResults;
            tracing.spanEnd(roundSpanId, { metadata: { reason: "function_call_limit_with_skipped", usage: roundUsage } });

            // Final round
            roundNumber++;
            const finalStream = await this.ai.interactions.create({
              model: interactionModel,
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
              if (event.event_type === "step.delta" && event.delta?.type === "text" && "text" in event.delta) {
                const text = event.delta.text;
                accumulatedOutput += text;
                yield { type: "text", content: text };
              }
              if (event.event_type === "interaction.created" && event.interaction?.id) {
                currentInteractionId = event.interaction.id;
              }
              if (event.event_type === "interaction.completed" && event.interaction?.usage) {
                finalUsage = extractInteractionsUsage(event.interaction.usage, this.model);
              }
            }
            if (finalUsage) accumulateUsage(totalUsage, finalUsage);
            continueLoop = false;
            continue;
          }

          // Add warning if approaching limit (v2: as a user_input step)
          const remainingForNextRound = currentFunctionCallLimit - functionCallCount;
          if (warningEmitted && remainingForNextRound <= warningThreshold) {
            functionResults.push({
              type: "user_input",
              content: [{ type: "text", text: `[System: You have ${remainingForNextRound} function calls remaining. Please complete your task efficiently or provide a summary.]` }],
            });
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
        await new Promise(resolve => window.setTimeout(resolve, 10000));

        const result = await this.ai.interactions.get(interactionId);

        if (result.status === "completed") {
          // v2 steps schema: prefer the SDK convenience property, then fall back to
          // extracting text from model_output steps' content.
          let fullText = result.output_text ?? "";
          if (!fullText && Array.isArray(result.steps)) {
            for (const step of result.steps) {
              if (step?.type === "model_output" && Array.isArray(step.content)) {
                for (const content of step.content as Array<{ type?: string; text?: string }>) {
                  if (content?.type === "text" && content.text) {
                    fullText += content.text;
                  }
                }
              }
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
