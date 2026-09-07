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
  type ModelType,
  type RagContext,
  type ReasoningEffort,
  isImageGenerationModel,
} from "src/types";
import { tracing } from "src/core/tracingHooks";
import {
  buildGeminiGenerateContentTools,
  buildGeminiHistoryReplayInput,
  buildGeminiInteractionTools,
  buildGeminiInteractionInput,
  buildGeminiMessageParts,
  buildGeminiRagRequest,
  buildGeminiThinkingConfig,
  extractGeminiRagContexts,
  formatError,
  geminiCorsFetch as corsFetch,
  getGeminiReasoningEffortOptions,
  isGeminiThinkingRequired,
  messagesToGeminiContents,
  resolveGeminiThinkingLevel,
  runGeminiInteractions,
  runGeminiChat,
  runGeminiTextStream,
  runGeminiDeepResearch,
  runGeminiImageGeneration,
  GEMINI_DEEP_RESEARCH_AGENT,
  runGeminiGenerateContentTools,
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
    const warningThreshold = Math.min(
      options?.functionCallLimits?.functionCallWarningThreshold ?? DEFAULT_SETTINGS.functionCallWarningThreshold,
      maxFunctionCalls,
    );
    const traceId = options?.traceId ?? null;
    const lastMsg = messages[messages.length - 1];
    const generationId = tracing.generationStart(traceId, "chatWithToolsStreamGenerateContent", {
      model: this.model,
      input: lastMsg?.content,
      metadata: { useGenerateContentApi: true, toolCount: tools.length, webSearchEnabled: !!webSearchEnabled },
    });
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

    const contents = this.messagesToContents(messages);
    const generationTools = this.buildGenerateContentTools(tools, webSearchEnabled);
    const thinkingConfig = this.buildThinkingConfig(options?.enableThinking, options?.reasoningEffort);
    // Gemini rejects mixing a built-in/server-side tool (googleSearch) with
    // function-calling declarations unless this flag is set.
    const mixesBuiltInWithFunctionCalling = !options?.disableTools && tools.length > 0 && !!webSearchEnabled;

    yield* runGeminiGenerateContentTools({
      contents, model: this.model, traceId, generationId,
      maxFunctionCalls, warningThreshold, limitPolicy: { kind: "extendable", options: options?.functionCallLimits, defaultExtensionAmount: DEFAULT_SETTINGS.maxFunctionCalls },
      executeToolCall,
      create: (roundContents, finalRound) => this.ai.models.generateContentStream({
        model: this.model, contents: roundContents as Content[],
        config: {
          systemInstruction: ragSystemPrompt,
          tools: finalRound ? undefined : (generationTools),
          toolConfig: !finalRound && mixesBuiltInWithFunctionCalling ? { includeServerSideToolInvocations: true } : undefined,
          safetySettings: DEFAULT_SAFETY_SETTINGS, thinkingConfig,
        },
      }),
    });
  }

  // Simple chat without streaming
  async chat(
    messages: Message[],
    systemPrompt?: string,
    traceId?: string | null
  ): Promise<string> {
    const contents = this.messagesToContents(messages);
    const lastMsg = messages[messages.length - 1];

    return runGeminiChat({
      model: this.model, input: lastMsg?.content, traceId,
      generate: () => this.ai.models.generateContent({
        model: this.model, contents,
        config: { systemInstruction: systemPrompt, safetySettings: DEFAULT_SAFETY_SETTINGS },
      }),
    });
  }

  // Streaming chat
  async *chatStream(
    messages: Message[],
    systemPrompt?: string,
    traceId?: string | null
  ): AsyncGenerator<StreamChunk> {
    const contents = this.messagesToContents(messages);
    const lastMsg = messages[messages.length - 1];

    yield* runGeminiTextStream({
      kind: "chatStream", model: this.model, input: lastMsg?.content, traceId,
      generate: () => this.ai.models.generateContentStream({
        model: this.model, contents,
        config: { systemInstruction: systemPrompt, safetySettings: DEFAULT_SAFETY_SETTINGS },
      }),
    });
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
    const warningThreshold = Math.min(
      options?.functionCallLimits?.functionCallWarningThreshold ?? DEFAULT_SETTINGS.functionCallWarningThreshold,
      maxFunctionCalls
    );
    const rawTopK = options?.ragTopK ?? DEFAULT_SETTINGS.ragTopK;
    const clampedTopK = Number.isFinite(rawTopK)
      ? Math.min(20, Math.max(1, rawTopK))
      : DEFAULT_SETTINGS.ragTopK;

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
    // Build the initial input.
    // When chaining via previous_interaction_id the server already knows the conversation,
    // so we only send the latest user message.  Otherwise replay local history as context.
    const input = previousInteractionId
      ? GeminiClient.buildInteractionInput(lastMessage)
      : GeminiClient.buildHistoryReplayInput(messages);

    yield* runGeminiInteractions({
      input, previousInteractionId, model: interactionModel, traceId, generationId,
      searchPolicy: "native", ragAlreadyEmitted: false,
      maxFunctionCalls, warningThreshold, limitPolicy: { kind: "extendable", options: options?.functionCallLimits, defaultExtensionAmount: DEFAULT_SETTINGS.maxFunctionCalls },
      executeToolCall,
      create: request => this.ai.interactions.create({
        model: interactionModel,
        input: request.input as string | Interactions.Content[] | Interactions.Step[],
        stream: true, store: true,
        previous_interaction_id: request.previousInteractionId,
        tools: request.includeTools ? interactionTools : undefined,
        system_instruction: systemPrompt, generation_config: generationConfig,
      }),
    });
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

    yield* runGeminiTextStream({
      kind: "generateWorkflowStream", model: this.model, input: lastMessage.content, traceId,
      generate: () => chat.sendMessageStream({ message: messageParts }),
    });
  }

  // Deep Research using Interactions API agent
  async *deepResearchStream(
    query: string,
    previousInteractionId?: string | null,
    traceId?: string | null
  ): AsyncGenerator<StreamChunk> {
    yield* runGeminiDeepResearch({
      query, traceId,
      create: () => this.ai.interactions.create({
        agent: GEMINI_DEEP_RESEARCH_AGENT, input: query, background: true,
        previous_interaction_id: previousInteractionId ?? undefined, store: true,
      }),
      get: id => this.ai.interactions.get(id),
      delay: milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds)),
    });
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

    yield* runGeminiImageGeneration({
      model: imageModel, input: lastMessage.content, traceId, webSearchEnabled: !!webSearchEnabled,
      generate: () => this.ai.models.generateContent({
        model: imageModel, contents: [...history, { role: "user", parts: messageParts }],
        config: {
          systemInstruction: systemPrompt, safetySettings: DEFAULT_SAFETY_SETTINGS,
          responseModalities: ["TEXT", "IMAGE"], tools: tools.length > 0 ? tools : undefined,
        },
      }),
    });
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
