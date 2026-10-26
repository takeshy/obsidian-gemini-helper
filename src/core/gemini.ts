import { DEFAULT_WEB_SEARCH_SETTINGS, supportsGoogleSearch, type WebSearchSettings } from "./webSearch";
import {
  GoogleGenAI,
  HarmCategory,
  HarmBlockThreshold,
  type SafetySetting,
  type Content,
  type Tool,
  type Interactions,
} from "@google/genai";
import {
  DEFAULT_SETTINGS,
  type Message,
  type ToolDefinition,
  type StreamChunk,
  type ModelType,
  type ReasoningEffort,
  isImageGenerationModel,
} from "src/types";
import { tracing } from "src/core/tracingHooks";
import {
  withGoogleSearchSuggestions,
  runGeminiGenerateContentTools,
  runGeminiImageGeneration,
  selectGeminiGenerationTools,
  messagesToGeminiContents,
  createWebSearchSession,
  generateWithWebReferences,
  buildGeminiHistoryReplayInput,
  buildGeminiInteractionTools,
  buildGeminiInteractionInput,
  buildGeminiThinkingConfig,
  formatError,
  geminiCorsFetch as corsFetch,
  getGeminiReasoningEffortOptions,
  isGeminiThinkingRequired,
  resolveGeminiThinkingLevel,
  GeminiGenerationClient,
  selectGeminiInteractionTools,
  runGeminiInteractions,
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
  /** Set only by a consented Chat view that renders Search Suggestions. */
  googleSearchAllowed?: boolean;
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

export class GeminiClient extends GeminiGenerationClient<ModelType> {
  private ai: GoogleGenAI;

  constructor(private readonly apiKey: string, model: ModelType = "gemini-3.8-flash",
    private readonly webSearchSettings: WebSearchSettings = DEFAULT_WEB_SEARCH_SETTINGS,
    private readonly webSearchMode: "google" | "external" | "none" = "external") {
    const ai = new GoogleGenAI({ apiKey });
    super(model, {
      generate: request => ai.models.generateContent(request),
      stream: request => ai.models.generateContentStream(request),
      chat: request => ai.chats.create(request),
      createResearch: request => ai.interactions.create(request),
      getResearch: id => ai.interactions.get(id),
      delay: milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds)),
      safetySettings: DEFAULT_SAFETY_SETTINGS,
      supportsThinking: () => true,
    });
    this.ai = ai;

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

  private getInteractionsModel(hasFunctionTools: boolean): ModelType {
    if (this.model === "gemini-3.1-pro-preview" && hasFunctionTools) {
      return "gemini-3.1-pro-preview-customtools";
    }
    return this.model;
  }

  // Build Interactions API input from a Message (supports text + attachments)
  private static buildInteractionInput(msg: Message): string | Interactions.Content[] {
    return buildGeminiInteractionInput(msg);
  }

  // Build Interactions API input with local history replay.
  // Used when there is no previous_interaction_id (old chats, after non-Interactions responses).
  // Prepends conversation history as a text block, then appends the last user message
  // (with attachments preserved) so the model has full context.
  private static buildHistoryReplayInput(
    messages: Message[],
  ): string | Interactions.Content[] {
    return buildGeminiHistoryReplayInput(messages);
  }

  // External Web search uses the same function-call budget as vault and MCP tools.
  async *chatWithToolsStream(messages: Message[], tools: ToolDefinition[], systemPrompt?: string,
    executeToolCall?: (name: string, args: Record<string, unknown>) => Promise<unknown>,
    ragStoreIds?: string[], webSearchEnabled?: boolean, options?: ChatWithToolsOptions): AsyncGenerator<StreamChunk> {
    if (!webSearchEnabled) {
      yield* this.chatWithToolsStreamInternal(messages, tools, systemPrompt, executeToolCall, ragStoreIds, false, options);
      return;
    }
    if (this.webSearchMode === "none") { yield { type: "error", error: "Web search is disabled in Settings." }; return; }
    if (this.webSearchMode === "google") {
      if (!options?.googleSearchAllowed || !supportsGoogleSearch(this.model)) {
        yield { type: "error", error: "Google Search requires a consented Chat view with Search Suggestions. Use external Web search for this operation." };
        return;
      }
      yield* withGoogleSearchSuggestions(this.chatWithToolsStreamInternal(messages, tools, systemPrompt, executeToolCall, ragStoreIds, true, options));
      return;
    }
    try {
      const session = createWebSearchSession({ settings: this.webSearchSettings }, options?.disableTools ? [] : tools, systemPrompt, executeToolCall);
      yield* session.wrap(this.chatWithToolsStreamInternal(messages, session.tools, session.systemPrompt, session.execute,
        ragStoreIds, true, { ...options, disableTools: false }));
    } catch (error) { yield { type: "error", error: formatError(error) }; }
  }

  private async *chatWithToolsStreamInternal(
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

    const useGoogleSearch = !!webSearchEnabled && this.webSearchMode === "google" && options?.googleSearchAllowed === true;
    if (useGoogleSearch && this.model.includes("gemini-3.8-flash") && !options?.disableTools && tools.length > 0) {
      yield* this.chatWithGoogleSearchGenerateContent(messages, tools, systemPrompt, executeToolCall, options);
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

    tools = options?.disableTools ? [] : tools;
    const ragEnabled = ragStoreIds && ragStoreIds.length > 0;

    const effectiveRagEnabled = ragEnabled && !this.model.toLowerCase().includes("gemma-4");
    const interactionModel = this.getInteractionsModel(tools.length > 0);
    const builtTools = buildGeminiInteractionTools(tools, {
      ragStoreIds: effectiveRagEnabled ? ragStoreIds : undefined,
      ragTopK: effectiveRagEnabled ? clampedTopK : undefined,
      ragMetadataFilter: effectiveRagEnabled ? options?.ragMetadataFilter : undefined,
      webSearchEnabled: useGoogleSearch,
    });
    const interactionTools = builtTools.length ? builtTools : undefined;

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
        input: request.input,
        stream: true, store: true,
        previous_interaction_id: request.previousInteractionId,
        tools: selectGeminiInteractionTools(interactionTools, request.toolMode),
        system_instruction: systemPrompt, generation_config: useGoogleSearch && tools.length > 0
          ? { ...generationConfig, tool_choice: "validated" } : generationConfig,
      }),
    });
  }

  private async *chatWithGoogleSearchGenerateContent(messages: Message[], tools: ToolDefinition[], systemPrompt?: string,
    executeToolCall?: (name: string, args: Record<string, unknown>) => Promise<unknown>, options?: ChatWithToolsOptions): AsyncGenerator<StreamChunk> {
    const generationTools: Tool[] = [
      { functionDeclarations: tools.map(tool => ({ name: tool.name, description: tool.description, parametersJsonSchema: tool.parameters })) },
      { googleSearch: {} },
    ];
    yield* runGeminiGenerateContentTools({
      contents: messagesToGeminiContents(messages), model: this.model, traceId: options?.traceId ?? null, generationId: null,
      maxFunctionCalls: options?.functionCallLimits?.maxFunctionCalls ?? DEFAULT_SETTINGS.maxFunctionCalls,
      warningThreshold: options?.functionCallLimits?.functionCallWarningThreshold ?? DEFAULT_SETTINGS.functionCallWarningThreshold,
      limitPolicy: { kind: "extendable", options: options?.functionCallLimits, defaultExtensionAmount: DEFAULT_SETTINGS.maxFunctionCalls },
      executeToolCall,
      create: (contents, toolMode) => this.ai.models.generateContentStream({ model: this.model, contents: contents as Content[],
        config: { systemInstruction: systemPrompt, safetySettings: DEFAULT_SAFETY_SETTINGS,
          thinkingConfig: buildGeminiThinkingConfig(this.model, options?.enableThinking, options?.reasoningEffort),
          tools: selectGeminiGenerationTools(generationTools, toolMode),
          toolConfig: toolMode === "all" ? { includeServerSideToolInvocations: true } : undefined,
        },
      }),
    });
  }

  // Image models cannot call functions. Resolve references with a text model,
  // then pass that context to image generation without any native search tools.
  async *generateImageStream(messages: Message[], imageModel: ModelType, systemPrompt?: string,
    webSearchEnabled?: boolean, ragStoreIds?: string[], traceId?: string | null, options?: Pick<ChatWithToolsOptions, "googleSearchAllowed">): AsyncGenerator<StreamChunk> {
    if (!webSearchEnabled) {
      yield* super.generateImageStream(messages, imageModel, systemPrompt, false, ragStoreIds, traceId);
      return;
    }
    if (this.webSearchMode === "none") { yield { type: "error", error: "Web search is disabled in Settings." }; return; }
    if (this.webSearchMode === "google") {
      if (!options?.googleSearchAllowed || !supportsGoogleSearch(imageModel)) {
        yield { type: "error", error: "Google Search requires a consented Chat view with Search Suggestions. Use external Web search for this operation." };
        return;
      }
      yield* withGoogleSearchSuggestions(runGeminiImageGeneration({ model: imageModel, traceId, webSearchEnabled: true, requireSearchSuggestions: true,
        generate: () => this.ai.models.generateContent({ model: imageModel, contents: messagesToGeminiContents(messages) as Content[],
          config: { systemInstruction: systemPrompt, safetySettings: DEFAULT_SAFETY_SETTINGS,
            responseModalities: ["TEXT", "IMAGE"], tools: [{ googleSearch: {} }],
          },
        }),
      }));
      return;
    }
    const planner = new GeminiClient(this.apiKey, "gemini-3.8-flash", this.webSearchSettings, "external");
    yield* generateWithWebReferences({ systemPrompt,
      search: () => planner.chatWithToolsStream(messages, [],
        "Use web_search to find references relevant to the image request. Summarize useful facts and cite URLs.",
        undefined, undefined, true, { traceId, functionCallLimits: { maxFunctionCalls: 3 } }),
      generate: prompt => super.generateImageStream(messages, imageModel, prompt, false, ragStoreIds, traceId),
    });
  }
}


// Singleton instance
let geminiClientInstance: GeminiClient | null = null;

export function getGeminiClient(): GeminiClient | null {
  return geminiClientInstance;
}

export function initGeminiClient(apiKey: string, model: ModelType, webSearchSettings?: WebSearchSettings, webSearchMode: "google" | "external" | "none" = "external"): GeminiClient {
  geminiClientInstance = new GeminiClient(apiKey, model, webSearchSettings, webSearchMode);
  return geminiClientInstance;
}

export function resetGeminiClient(): void {
  geminiClientInstance = null;
}
