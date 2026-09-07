import {
  GoogleGenAI,
  HarmCategory,
  HarmBlockThreshold,
  type Content,
  type Part,
  type Tool,
  type SafetySetting,
  type Chat,
  type Interactions,
} from "@google/genai";
import {
  DEFAULT_SETTINGS,
  type Message,
  type ToolDefinition,
  type StreamChunk,
  type ToolCall,
  type ModelType,
  type GeneratedImage,
  type RagContext,
  type WebSearchSource,
  type Attachment,
  type ReasoningEffort,
  isImageGenerationModel,
} from "src/types";
import { dedupeAttachments, getToolResultAttachments, withoutToolResultAttachments } from "src/core/toolResultAttachments";
import { tracing, type TracingUsage } from "src/core/tracingHooks";
import {
  accumulateGeminiUsage as accumulateUsage,
  buildGeminiGenerateContentTools,
  buildGeminiHistoryReplayInput,
  buildGeminiInteractionTools,
  buildGeminiInteractionInput,
  buildGeminiMessageParts,
  buildGeminiRagRequest,
  buildGeminiThinkingConfig,
  collectGeminiWebSources as collectWebSources,
  extractGeminiInteractionsUsage as extractInteractionsUsage,
  extractGeminiRagContexts,
  extractGeminiUsage as extractUsage,
  formatError,
  geminiCorsFetch as corsFetch,
  GEMINI_SEARCH_GROUNDING_COST as SEARCH_GROUNDING_COST,
  getGeminiFinishReasonError as checkFinishReason,
  getGeminiReasoningEffortOptions,
  isGeminiThinkingRequired,
  messagesToGeminiContents,
  resolveGeminiThinkingLevel,
  prepareGeminiToolResult,
  planGeminiFunctionCalls,
  requestGeminiFunctionCallLimitExtension,
  toGeminiStreamChunkUsage as toStreamChunkUsage,
} from "obsidian-llm-hub-common/core";

// Default safety settings per Gemini best practices
// Using BLOCK_MEDIUM_AND_ABOVE as a balanced default
const DEFAULT_SAFETY_SETTINGS: SafetySetting[] = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

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
  enableThinking?: boolean;              // Legacy binary toggle (workflow/dashboard callers)
  reasoningEffort?: ReasoningEffort;     // Explicit thinking level selected in Chat; wins over enableThinking
  traceId?: string | null;
  previousInteractionId?: string | null;  // For Interactions API conversation chaining
}

export { buildGeminiThinkingConfig, resolveGeminiThinkingLevel };
export const isThinkingRequired = isGeminiThinkingRequired;

/**
 * Thinking levels selectable in Chat for a model. Empty when the model has no
 * configurable thinking (Gemma 4, image models).
 */
export function getReasoningEffortOptions(model: string): ReasoningEffort[] {
  return getGeminiReasoningEffortOptions(model, isImageGenerationModel(model as ModelType));
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

  constructor(apiKey: string, model: ModelType = "gemini-3.8-flash") {
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
  private buildThinkingConfig(enableThinking: boolean | undefined, reasoningEffort?: ReasoningEffort): Record<string, unknown> | undefined {
    return buildGeminiThinkingConfig(this.model, enableThinking, reasoningEffort);
  }

  private supportsThinking(): boolean {
    return true;
  }

  // Build Gemini Part[] from a Message's attachments and text content
  private static buildMessageParts(msg: Message): Part[] {
    return buildGeminiMessageParts(msg) as Part[];
  }

  // Convert our Message format to Gemini Content format
  private messagesToContents(messages: Message[]): Content[] {
    return messagesToGeminiContents(messages) as Content[];
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
    return buildGeminiInteractionTools(tools, {
      ragStoreIds,
      ragTopK,
      ragMetadataFilter,
      webSearchEnabled,
    }) as Interactions.Tool[];
  }

  // Retrieve RAG context for the GenerateContent fallback path. The normal
  // Interactions path uses its native file_search tool directly.
  private async retrieveRagContext(
    userMessage: string,
    ragStoreIds: string[],
    topK: number,
    metadataFilter?: string,
    attachments?: Message["attachments"],
  ): Promise<{ sources: string[]; contexts: RagContext[] }> {
    const { parts, tools } = buildGeminiRagRequest(userMessage, ragStoreIds, topK, metadataFilter, attachments);

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts }],
      config: {
        tools,
        safetySettings: DEFAULT_SAFETY_SETTINGS,
      },
    });

    return extractGeminiRagContexts(response);
  }

  // Build Interactions API input from a Message (supports text + attachments)
  private static buildInteractionInput(msg: Message): string | Interactions.Content[] {
    return buildGeminiInteractionInput(msg) as string | Interactions.Content[];
  }

  // Build Interactions API input with local history replay.
  // Used when there is no previous_interaction_id (old chats, after non-Interactions responses).
  // Prepends conversation history as a text block, then appends the last user message
  // (with attachments preserved) so the model has full context.
  private static buildHistoryReplayInput(
    messages: Message[],
  ): string | Interactions.Content[] {
    return buildGeminiHistoryReplayInput(messages) as string | Interactions.Content[];
  }

  private shouldUseGenerateContentToolsApi(
    tools: ToolDefinition[],
    webSearchEnabled?: boolean,
  ): boolean {
    const modelLower = this.model.toLowerCase();
    return modelLower.includes("gemini-3.8-flash") && !!webSearchEnabled && tools.length > 0;
  }

  private buildGenerateContentTools(tools: ToolDefinition[], webSearchEnabled?: boolean): Tool[] | undefined {
    return buildGeminiGenerateContentTools(tools, webSearchEnabled) as Tool[] | undefined;
  }

  private async *chatWithToolsStreamGenerateContent(
    messages: Message[],
    tools: ToolDefinition[],
    systemPrompt?: string,
    executeToolCall?: (name: string, args: Record<string, unknown>) => Promise<unknown>,
    ragStoreIds?: string[],
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
    let webSearchUsed = false;
    const webSearchSources: WebSearchSource[] = [];

    let ragSystemPrompt = systemPrompt;
    if (ragStoreIds && ragStoreIds.length > 0 && lastMsg?.role === "user") {
      const rawTopK = options?.ragTopK ?? DEFAULT_SETTINGS.ragTopK;
      const clampedTopK = Number.isFinite(rawTopK)
        ? Math.min(20, Math.max(1, rawTopK))
        : DEFAULT_SETTINGS.ragTopK;
      try {
        const ragResult = await this.retrieveRagContext(
          lastMsg.content || "",
          ragStoreIds,
          clampedTopK,
          options?.ragMetadataFilter,
          lastMsg.attachments,
        );
        if (ragResult.contexts.length > 0) {
          const contextBlock = ragResult.contexts
            .map(context => `--- Source: ${context.source} ---\n${context.text}`)
            .join("\n\n");
          ragSystemPrompt = (systemPrompt || "")
            + `\n\n[Semantic search results — use these retrieved passages as reference context]\n${contextBlock}`;
        }
        yield {
          type: "rag_used",
          ragSources: ragResult.sources,
          ragContexts: ragResult.contexts,
        };
      } catch (ragError) {
        yield { type: "error", error: `RAG retrieval failed: ${formatError(ragError)}` };
        return;
      }
    }

    let contents = this.messagesToContents(messages);
    const generationTools = this.buildGenerateContentTools(tools, webSearchEnabled);
    const thinkingConfig = this.buildThinkingConfig(options?.enableThinking, options?.reasoningEffort);
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
            systemInstruction: ragSystemPrompt,
            tools: generationTools,
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
        let webSearchUsedInRound = false;

        for await (const chunk of response) {
          hasReceivedChunk = true;
          const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
          const groundedWebSources = (groundingMetadata?.groundingChunks ?? [])
            .map(groundingChunk => groundingChunk.web)
            .filter((web): web is NonNullable<typeof web> => !!web?.uri);
          if ((groundingMetadata?.webSearchQueries?.length ?? 0) > 0 || groundedWebSources.length > 0) {
            webSearchUsedInRound = true;
            if (!webSearchUsed) {
              webSearchUsed = true;
              yield { type: "web_search_used" };
            }
            for (const source of groundedWebSources) {
              collectWebSources(source, webSearchSources);
            }
          }
          if (chunk.usageMetadata) {
            roundUsage = extractUsage(chunk.usageMetadata, { model: this.model, webSearchUsed: webSearchUsedInRound });
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
            const toolResponse = part.toolResponse as { toolType?: string; response?: unknown } | undefined;
            if (toolResponse?.toolType === "GOOGLE_SEARCH_WEB") {
              webSearchUsedInRound = true;
              if (!webSearchUsed) {
                webSearchUsed = true;
                yield { type: "web_search_used" };
              }
              collectWebSources(toolResponse.response, webSearchSources);
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
            webSearchSources: webSearchSources.length > 0 ? webSearchSources : undefined,
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
          const extendedLimit = await requestGeminiFunctionCallLimitExtension(
            options?.functionCallLimits,
            DEFAULT_SETTINGS.maxFunctionCalls,
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

        const { callsToExecute } = planGeminiFunctionCalls(
          functionCalls,
          functionCallCount,
          currentFunctionCallLimit,
        );

        const functionResponseParts: Part[] = [];
        const roundAttachments: Attachment[] = [];
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

          const cleanResult = withoutToolResultAttachments(result);
          const { serializedResult, trace } = prepareGeminiToolResult(fc.name, fc.args, cleanResult);
          accumulatedOutput += trace;

          yield { type: "tool_result", toolResult: { toolCallId: toolCall.id, result: cleanResult } };

          functionResponseParts.push({
            functionResponse: {
              id: fc.id,
              name: fc.name,
              response: { output: serializedResult },
            },
          });
          roundAttachments.push(...getToolResultAttachments(result));
        }
        // Keep every functionResponse ahead of the media it produced.
        functionResponseParts.push(...dedupeAttachments(roundAttachments).map((attachment) => ({
          inlineData: { mimeType: attachment.mimeType, data: attachment.data },
        })));
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
    if (webSearchEnabled && ragStoreIds?.length) {
      yield { type: "error", error: "RAG and Web Search cannot be used at the same time. Select one search source." };
      return;
    }

    const enabledFunctionTools = options?.disableTools ? [] : tools;
    if (this.shouldUseGenerateContentToolsApi(enabledFunctionTools, webSearchEnabled)) {
      yield* this.chatWithToolsStreamGenerateContent(
        messages,
        enabledFunctionTools,
        systemPrompt,
        executeToolCall,
        ragStoreIds,
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

    // Build tools for Interactions API. File Search is a native Interactions
    // tool and can run alongside function tools.
    // Gemma 4: cannot combine google_search with function calling
    const modelLower = this.model.toLowerCase();
    const isGemma4Model = modelLower.includes("gemma-4");
    const effectiveRagEnabled = ragEnabled && !isGemma4Model;
    const effectiveWebSearch = webSearchEnabled ?? false;
    const hasFunctionTools = !options?.disableTools && tools.length > 0;
    const combinesBuiltInAndFunctionTools = effectiveWebSearch && hasFunctionTools;
    const interactionModel = this.getInteractionsModel(hasFunctionTools);
    let interactionTools: Interactions.Tool[] | undefined;
    // disableTools only disables client-side function tools. Server-side tools
    // (File Search and Google Search) remain independently available.
    interactionTools = this.toolsToInteractionsFormat(
      options?.disableTools ? [] : tools,
      effectiveRagEnabled ? ragStoreIds : undefined,
      effectiveRagEnabled ? clampedTopK : undefined,
      effectiveRagEnabled ? options?.ragMetadataFilter : undefined,
      effectiveWebSearch,
    );
    if (interactionTools.length === 0) interactionTools = undefined;

    // Get the last user message
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") {
      yield { type: "error", error: "No user message to send" };
      return;
    }

    // Thinking: explicit reasoning effort wins; otherwise the legacy binary toggle;
    // when neither is given the API default is used.
    const enableThinking = this.supportsThinking() ? options?.enableThinking : false;
    const reasoningEffort = this.supportsThinking() ? options?.reasoningEffort : undefined;
    const thinkingLevel = resolveGeminiThinkingLevel(this.model, enableThinking, reasoningEffort);
    const generationConfig = thinkingLevel || combinesBuiltInAndFunctionTools
      ? {
          ...(thinkingLevel
            ? { thinking_level: thinkingLevel, thinking_summaries: "auto" as const }
            : {}),
          ...(combinesBuiltInAndFunctionTools ? { tool_choice: "validated" as const } : {}),
        }
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
        reasoningEffort,
        thinkingLevel,
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

    const webSearchSources: WebSearchSource[] = [];
    let ragEmitted = false;

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
          system_instruction: systemPrompt,
          generation_config: generationConfig,
        });

        const functionCallsToProcess: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
        const accumulatedSources: string[] = [];
        const accumulatedContexts: RagContext[] = [];
        let fileSearchUsedInRound = false;
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
                case "file_search_call":
                  fileSearchUsedInRound = true;
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
                  fileSearchUsedInRound = true;
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
                  collectWebSources(delta, webSearchSources);
                  if (!webSearchUsedInRound) {
                    webSearchUsedInRound = true;
                    yield { type: "web_search_used" };
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
              if (event.metadata?.total_usage) {
                roundUsage = extractInteractionsUsage(event.metadata.total_usage, this.model);
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

        if (fileSearchUsedInRound && !ragEmitted) {
          yield { type: "rag_used", ragSources: accumulatedSources, ragContexts: accumulatedContexts };
          ragEmitted = true;
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

          if (!warningEmitted && remainingBefore <= warningThreshold) {
            warningEmitted = true;
            const extendedLimit = await requestGeminiFunctionCallLimitExtension(
              options?.functionCallLimits,
              DEFAULT_SETTINGS.maxFunctionCalls,
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

          const { callsToExecute, skippedCount } = planGeminiFunctionCalls(
            functionCallsToProcess,
            functionCallCount,
            currentFunctionCallLimit,
          );

          // Execute function calls and build FunctionResultStep inputs (v2 steps schema)
          const functionResults: Interactions.Step[] = [];
          const roundAttachments: Attachment[] = [];

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

            const cleanResult = withoutToolResultAttachments(result);
            const { serializedResult, trace } = prepareGeminiToolResult(fc.name, fc.args, cleanResult);
            accumulatedOutput += trace;

            yield {
              type: "tool_result",
              toolResult: { toolCallId: toolCall.id, result: cleanResult },
            };

            // Build FunctionResultStep for the v2 Interactions API input.
            // Use a JSON string result, matching the SDK README examples and
            // avoiding stricter model-side validation of arbitrary objects.
            functionResults.push({
              type: "function_result",
              call_id: fc.id,
              name: fc.name,
              result: serializedResult,
            });
            roundAttachments.push(...getToolResultAttachments(result));
          }

          // Keep every function_result ahead of the media it produced.
          const roundFiles = dedupeAttachments(roundAttachments);
          if (roundFiles.length > 0) {
            functionResults.push({
              type: "user_input",
              content: roundFiles.map((attachment) => ({
                type: "document" as const,
                data: attachment.data,
                mime_type: attachment.mimeType,
              })),
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
        webSearchSources: webSearchSources.length > 0 ? webSearchSources : undefined,
      };
    } catch (error) {
      const errorMessage = formatError(error);
      tracing.generationEnd(generationId, {
        error: errorMessage,
        usage: totalUsage.total ? totalUsage : undefined,
        metadata: { toolCallCount: toolCallTraceCount, roundCount: roundNumber },
      });

      yield {
        type: "error",
        error: errorMessage,
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
      yield {
        type: "done",
        usage: toStreamChunkUsage(lastUsage),
      };
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
