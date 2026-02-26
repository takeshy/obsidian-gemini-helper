import {
  GoogleGenAI,
  Type,
  type Content,
  type Part,
  type Tool,
  type Schema,
  type Chat,
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

// Model pricing per token (USD)
// Source: https://ai.google.dev/pricing
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash":       { input: 0.30 / 1e6, output: 2.50 / 1e6 },
  "gemini-2.5-flash-lite":  { input: 0.10 / 1e6, output: 0.40 / 1e6 },
  "gemini-2.5-pro":         { input: 1.25 / 1e6, output: 10.00 / 1e6 },
  "gemini-3-flash-preview": { input: 0.50 / 1e6, output: 3.00 / 1e6 },
  "gemini-3-pro-preview":   { input: 2.00 / 1e6, output: 12.00 / 1e6 },
  "gemini-3.1-pro-preview": { input: 2.00 / 1e6, output: 12.00 / 1e6 },
  "gemini-3.1-pro-preview-customtools": { input: 2.00 / 1e6, output: 12.00 / 1e6 },
  "gemini-2.5-flash-image":    { input: 0.30 / 1e6, output: 30.00 / 1e6 },
  "gemini-3-pro-image-preview": { input: 2.00 / 1e6, output: 120.00 / 1e6 },
};

// Grounding with Google Search cost per prompt (USD)
// Gemini 3 models: $14/1K queries, Gemini 2.x: $35/1K prompts
// Approximated as per-prompt since exact query count is not exposed by the API
const SEARCH_GROUNDING_COST: Record<string, number> = {
  "gemini-3-flash-preview": 14 / 1000,
  "gemini-3-pro-preview":   14 / 1000,
  "gemini-3.1-pro-preview": 14 / 1000,
  "gemini-3.1-pro-preview-customtools": 14 / 1000,
  "gemini-3-pro-image-preview": 14 / 1000,
  "gemini-2.5-flash":       35 / 1000,
  "gemini-2.5-flash-lite":  35 / 1000,
  "gemini-2.5-pro":         35 / 1000,
  "gemini-2.5-flash-image": 35 / 1000,
};

// Extract usage metadata from Gemini API response and calculate cost
interface ExtractUsageOptions {
  model?: string;
  webSearchUsed?: boolean;
}

function extractUsage(usageMetadata: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number; thoughtsTokenCount?: number } | undefined, options?: ExtractUsageOptions): TracingUsage | undefined {
  if (!usageMetadata) return undefined;
  const model = options?.model;
  const inputTokens = usageMetadata.promptTokenCount ?? 0;
  const outputTokens = usageMetadata.candidatesTokenCount ?? 0;
  const thinkingTokens = usageMetadata.thoughtsTokenCount ?? 0;
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
    total: usageMetadata.totalTokenCount,
    inputCost,
    outputCost,
    totalCost,
  };
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
}

export class GeminiClient {
  private ai: GoogleGenAI;
  private model: ModelType;

  constructor(apiKey: string, model: ModelType = "gemini-3-flash-preview") {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  setModel(model: ModelType): void {
    this.model = model;
  }

  // Convert our Message format to Gemini Content format
  private messagesToContents(messages: Message[]): Content[] {
    return messages.map((msg) => {
      const parts: Part[] = [];

      // Add attachments first if present
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

      // Add text content
      if (msg.content) {
        parts.push({ text: msg.content });
      }

      return {
        role: msg.role === "user" ? "user" : "model",
        parts,
      };
    });
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
        },
      });

      const text = response.text ?? "";
      tracing.generationEnd(genId, {
        output: text,
        usage: extractUsage(response.usageMetadata, { model: this.model }),
      });
      return text;
    } catch (error) {
      tracing.generationEnd(genId, {
        error: error instanceof Error ? error.message : "API call failed",
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
        },
      });

      let hasReceivedChunk = false;
      let accumulatedText = "";
      let lastUsage: TracingUsage | undefined;
      for await (const chunk of response) {
        hasReceivedChunk = true;
        if (chunk.usageMetadata) lastUsage = extractUsage(chunk.usageMetadata, { model: this.model });
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
        error: error instanceof Error ? error.message : "API call failed",
      });
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "API call failed",
      };
    }
  }

  // Convert messages to Gemini history format (for chat sessions)
  private messagesToHistory(messages: Message[]): Content[] {
    return messages.map((msg) => {
      const parts: Part[] = [];

      // Add attachments if present
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

      // Add text content
      if (msg.content) {
        parts.push({ text: msg.content });
      }

      return {
        role: msg.role === "user" ? "user" : "model",
        parts,
      };
    });
  }

  // Streaming chat with Function Calling using SDK Chat (handles thought_signature automatically)
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
    let geminiTools: Tool[] | undefined;

    // Google Search cannot be used with function calling tools
    // fileSearch cannot be combined with functionDeclarations (API returns INVALID_ARGUMENT)
    const ragEnabled = ragStoreIds && ragStoreIds.length > 0;

    if (!options?.disableTools) {
      if (webSearchEnabled) {
        geminiTools = [{ googleSearch: {} } as Tool];
      } else {
        // Only add function tools if there are any defined
        // Skip function calling when RAG is enabled (fileSearch + functionDeclarations not supported)
        if (tools.length > 0 && !ragEnabled) {
          geminiTools = this.toolsToGeminiFormat(tools);
        }
        // Add File Search RAG if store IDs are provided
        if (ragEnabled) {
          if (!geminiTools) {
            geminiTools = [];
          }
          geminiTools.push({
            fileSearch: {
              fileSearchStoreNames: ragStoreIds,
              topK: clampedTopK,
            },
          } as Tool);
        }
      }
    }

    // Build history from all messages except the last one
    const historyMessages = messages.slice(0, -1);
    const history = this.messagesToHistory(historyMessages);

    // Get the last user message (needed for keyword-based thinking)
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") {
      yield { type: "error", error: "No user message to send" };
      return;
    }

    // Check if model supports thinking (Gemma models don't support it)
    const supportsThinking = !this.model.toLowerCase().includes("gemma");

    // Enable thinking: explicit option overrides keyword detection
    const enableThinking = supportsThinking &&
      (options?.enableThinking !== undefined
        ? options.enableThinking
        : shouldEnableThinkingByKeyword(lastMessage.content || ""));

    // Build thinking config based on model
    // - When thinking disabled: set thinkingBudget: 0 to override model default
    //   (Gemini 2.5+/3 models have thinking enabled by default)
    // - Gemini 2.5 Flash Lite requires thinkingBudget: -1 to enable thinking
    // - Other models work with just includeThoughts: true
    const getThinkingConfig = () => {
      // gemini-3-pro models require thinking — cannot set thinkingBudget: 0
      const modelLower = this.model.toLowerCase();
      const thinkingRequired = modelLower.includes("gemini-3-pro") || modelLower.includes("gemini-3.1-pro");
      if (!enableThinking && !thinkingRequired) return { thinkingBudget: 0 };
      if (modelLower.includes("flash-lite")) {
        return { includeThoughts: true, thinkingBudget: -1 };
      }
      return { includeThoughts: true };
    };

    const thinkingConfig = getThinkingConfig();

    // Create a chat session with history
    const chat: Chat = this.ai.chats.create({
      model: this.model,
      history,
      config: {
        systemInstruction: systemPrompt,
        ...(geminiTools ? { tools: geminiTools } : {}),
        ...(thinkingConfig ? { thinkingConfig } : {}),
      },
    });

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
      },
    });
    let toolCallTraceCount = 0;
    let accumulatedOutput = "";
    // Accumulate usage across multiple streaming rounds (tool-call loop)
    const totalUsage: TracingUsage = { input: 0, output: 0, total: 0 };
    // Track per-round usage (last chunk in each stream has the round's total)
    let roundUsage: TracingUsage | undefined;

    let continueLoop = true;

    // Build message parts with attachments
    const messageParts: Part[] = [];

    // Add attachments first if present
    if (lastMessage.attachments && lastMessage.attachments.length > 0) {
      for (const attachment of lastMessage.attachments) {
        messageParts.push({
          inlineData: {
            mimeType: attachment.mimeType,
            data: attachment.data,
          },
        });
      }
    }

    // Add text content
    if (lastMessage.content) {
      messageParts.push({ text: lastMessage.content });
    }

    try {
      // Send initial message
      let response = await chat.sendMessageStream({ message: messageParts });

      while (continueLoop) {
        const functionCallsToProcess: Array<{ name: string; args: Record<string, unknown> }> = [];
        let groundingEmitted = false;
        const accumulatedSources: string[] = [];
        let hasReceivedChunk = false;

        roundUsage = undefined;
        for await (const chunk of response) {
          hasReceivedChunk = true;
          // Last chunk in each stream round has the round's total usage
          if (chunk.usageMetadata) roundUsage = extractUsage(chunk.usageMetadata, { model: this.model });
          // Check for function calls
          if (chunk.functionCalls && chunk.functionCalls.length > 0) {
            for (const fc of chunk.functionCalls) {
              functionCallsToProcess.push({
                name: fc.name ?? "",
                args: (fc.args as Record<string, unknown>) ?? {},
              });
            }
          }

          // Check for grounding metadata and thinking parts
          // Access candidates via type assertion for grounding metadata and thought parts
          const chunkWithCandidates = chunk as {
            candidates?: Array<{
              content?: {
                parts?: Array<{
                  text?: string;
                  thought?: boolean;
                }>;
              };
              groundingMetadata?: {
                groundingChunks?: Array<{
                  retrievedContext?: { uri?: string; title?: string };
                }>;
              };
            }>;
          };
          const candidates = chunkWithCandidates.candidates;

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
          if (!groundingEmitted && candidates && candidates.length > 0) {
            const groundingMetadata = candidates[0]?.groundingMetadata;
            if (groundingMetadata) {
              if (webSearchEnabled) {
                // Web Search was used
                yield { type: "web_search_used" };
                groundingEmitted = true;
              } else {
                // RAG/File Search was used - accumulate sources from all chunks
                // Extract source file names from grounding chunks
                // Prefer title (actual file name) over uri (internal reference)
                if (groundingMetadata.groundingChunks) {
                  for (const gc of groundingMetadata.groundingChunks) {
                    const source = gc.retrievedContext?.title || gc.retrievedContext?.uri;
                    if (source && !accumulatedSources.includes(source)) {
                      accumulatedSources.push(source);
                    }
                  }
                }
              }
            }
          }

          // Yield text chunks
          const text = chunk.text;
          if (text) {
            accumulatedOutput += text;
            yield { type: "text", content: text };
          }
        }

        // Sum this round's usage into total
        if (roundUsage) {
          totalUsage.input = (totalUsage.input ?? 0) + (roundUsage.input ?? 0);
          totalUsage.output = (totalUsage.output ?? 0) + (roundUsage.output ?? 0);
          if (roundUsage.thinking !== undefined) totalUsage.thinking = (totalUsage.thinking ?? 0) + roundUsage.thinking;
          totalUsage.total = (totalUsage.total ?? 0) + (roundUsage.total ?? 0);
          if (roundUsage.inputCost !== undefined) totalUsage.inputCost = (totalUsage.inputCost ?? 0) + roundUsage.inputCost;
          if (roundUsage.outputCost !== undefined) totalUsage.outputCost = (totalUsage.outputCost ?? 0) + roundUsage.outputCost;
          if (roundUsage.totalCost !== undefined) totalUsage.totalCost = (totalUsage.totalCost ?? 0) + roundUsage.totalCost;
        }

        // Add search grounding cost if web search was used in this round
        if (groundingEmitted && webSearchEnabled && this.model && SEARCH_GROUNDING_COST[this.model] !== undefined) {
          totalUsage.totalCost = (totalUsage.totalCost ?? 0) + SEARCH_GROUNDING_COST[this.model];
        }

        // Emit accumulated RAG sources after processing all chunks
        if (accumulatedSources.length > 0 && !groundingEmitted) {
          yield { type: "rag_used", ragSources: accumulatedSources };
          groundingEmitted = true;
        }

        // If no chunks received at all, likely an API error (e.g., 503)
        if (!hasReceivedChunk && functionCallsToProcess.length === 0) {
          yield { type: "error", error: "No response received from API (possible server error)" };
          return;
        }

        // Process function calls if any
        if (functionCallsToProcess.length > 0 && executeToolCall) {
          // Calculate how many calls we can still execute
          const remainingBefore = maxFunctionCalls - functionCallCount;

          // If already at limit, request final answer without executing any more
          if (remainingBefore <= 0) {
            yield {
              type: "text",
              content: "\n\n[Function call limit reached. Summarizing with available information...]",
            };
            response = await chat.sendMessageStream({
              message: [{ text: "You have reached the function call limit. Please provide a final answer based on the information gathered so far." }],
            });
            roundUsage = undefined;
            for await (const chunk of response) {
              if (chunk.usageMetadata) roundUsage = extractUsage(chunk.usageMetadata, { model: this.model });
              const text = chunk.text;
              if (text) {
                accumulatedOutput += text;
                yield { type: "text", content: text };
              }
            }
            if (roundUsage) {
              totalUsage.input = (totalUsage.input ?? 0) + (roundUsage.input ?? 0);
              totalUsage.output = (totalUsage.output ?? 0) + (roundUsage.output ?? 0);
              totalUsage.total = (totalUsage.total ?? 0) + (roundUsage.total ?? 0);
              if (roundUsage.inputCost !== undefined) totalUsage.inputCost = (totalUsage.inputCost ?? 0) + roundUsage.inputCost;
              if (roundUsage.outputCost !== undefined) totalUsage.outputCost = (totalUsage.outputCost ?? 0) + roundUsage.outputCost;
              if (roundUsage.totalCost !== undefined) totalUsage.totalCost = (totalUsage.totalCost ?? 0) + roundUsage.totalCost;
            }
            continueLoop = false;
            continue;
          }

          // Execute only up to remaining allowed calls
          const callsToExecute = functionCallsToProcess.slice(0, remainingBefore);
          const skippedCount = functionCallsToProcess.length - callsToExecute.length;

          // Emit warning when approaching limit
          const remainingAfter = remainingBefore - callsToExecute.length;
          if (!warningEmitted && remainingAfter <= warningThreshold) {
            warningEmitted = true;
            yield {
              type: "text",
              content: `\n\n[Note: ${remainingAfter} function calls remaining. Please work efficiently.]`,
            };
          }

          const functionResponseParts: Part[] = [];

          for (const fc of callsToExecute) {
            const toolCall: ToolCall = {
              id: (fc as { id?: string }).id ?? `${fc.name}_${Date.now()}`,
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

            // Record tool call interaction in output (truncate large results)
            const resultStr = typeof result === "string" ? result : JSON.stringify(result);
            const truncatedResult = resultStr.length > 500 ? resultStr.substring(0, 500) + "..." : resultStr;
            accumulatedOutput += `\n[tool_call: ${fc.name}(${JSON.stringify(fc.args)})]\n`;
            accumulatedOutput += `[tool_result: ${truncatedResult}]\n`;

            yield {
              type: "tool_result",
              toolResult: { toolCallId: toolCall.id, result },
            };

            functionResponseParts.push({
              functionResponse: {
                name: fc.name,
                id: toolCall.id,
                response: { result } as Record<string, unknown>,
              },
            });
          }

          // Update count after execution
          functionCallCount += callsToExecute.length;

          // If we hit the limit (including skipped calls), request final answer
          if (skippedCount > 0 || functionCallCount >= maxFunctionCalls) {
            const skippedMsg = skippedCount > 0
              ? ` (${skippedCount} additional calls were skipped)`
              : "";
            yield {
              type: "text",
              content: `\n\n[Function call limit reached${skippedMsg}. Summarizing with available information...]`,
            };

            // Send results so far, then request final answer
            if (functionResponseParts.length > 0) {
              functionResponseParts.push({
                text: "[System: Function call limit reached. Please provide a final answer based on the information gathered so far.]",
              } as Part);
              response = await chat.sendMessageStream({
                message: functionResponseParts,
              });
            } else {
              response = await chat.sendMessageStream({
                message: [{ text: "You have reached the function call limit. Please provide a final answer based on the information gathered so far." }],
              });
            }

            // Get final response without processing more function calls
            roundUsage = undefined;
            for await (const chunk of response) {
              if (chunk.usageMetadata) roundUsage = extractUsage(chunk.usageMetadata, { model: this.model });
              const text = chunk.text;
              if (text) {
                accumulatedOutput += text;
                yield { type: "text", content: text };
              }
            }
            if (roundUsage) {
              totalUsage.input = (totalUsage.input ?? 0) + (roundUsage.input ?? 0);
              totalUsage.output = (totalUsage.output ?? 0) + (roundUsage.output ?? 0);
              totalUsage.total = (totalUsage.total ?? 0) + (roundUsage.total ?? 0);
              if (roundUsage.inputCost !== undefined) totalUsage.inputCost = (totalUsage.inputCost ?? 0) + roundUsage.inputCost;
              if (roundUsage.outputCost !== undefined) totalUsage.outputCost = (totalUsage.outputCost ?? 0) + roundUsage.outputCost;
              if (roundUsage.totalCost !== undefined) totalUsage.totalCost = (totalUsage.totalCost ?? 0) + roundUsage.totalCost;
            }
            continueLoop = false;
            continue;
          }

          // Add warning message to Gemini if approaching limit
          if (warningEmitted && remainingAfter <= warningThreshold) {
            functionResponseParts.push({
              text: `[System: You have ${remainingAfter} function calls remaining. Please complete your task efficiently or provide a summary.]`,
            } as Part);
          }

          // Send function responses back to the chat
          response = await chat.sendMessageStream({
            message: functionResponseParts,
          });
        } else {
          continueLoop = false;
        }
      }

      tracing.generationEnd(generationId, {
        output: accumulatedOutput,
        usage: totalUsage.total ? totalUsage : undefined,
        metadata: { toolCallCount: toolCallTraceCount },
      });

      yield { type: "done", usage: toStreamChunkUsage(totalUsage.total ? totalUsage : undefined) };
    } catch (error) {
      tracing.generationEnd(generationId, {
        error: error instanceof Error ? error.message : "API call failed",
        usage: totalUsage.total ? totalUsage : undefined,
        metadata: { toolCallCount: toolCallTraceCount },
      });

      yield {
        type: "error",
        error: error instanceof Error ? error.message : "API call failed",
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
    const history = this.messagesToHistory(historyMessages);

    // Get the last user message (needed for keyword-based thinking)
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") {
      yield { type: "error", error: "No user message to send" };
      return;
    }

    // Workflow generation always enables thinking (unless model doesn't support it)
    const supportsThinking = !this.model.toLowerCase().includes("gemma");

    const getThinkingConfig = () => {
      if (!supportsThinking) return undefined;
      const modelLower = this.model.toLowerCase();
      if (modelLower.includes("flash-lite")) {
        return { includeThoughts: true, thinkingBudget: -1 };
      }
      return { includeThoughts: true };
    };

    // Create a chat session with history (no tools for workflow generation)
    const chat: Chat = this.ai.chats.create({
      model: this.model,
      history,
      config: {
        systemInstruction: systemPrompt,
        thinkingConfig: getThinkingConfig(),
      },
    });

    // Build message parts with attachments
    const messageParts: Part[] = [];

    // Add attachments first if present
    if (lastMessage.attachments && lastMessage.attachments.length > 0) {
      for (const attachment of lastMessage.attachments) {
        messageParts.push({
          inlineData: {
            mimeType: attachment.mimeType,
            data: attachment.data,
          },
        });
      }
    }

    // Add text content
    if (lastMessage.content) {
      messageParts.push({ text: lastMessage.content });
    }

    const genId = tracing.generationStart(traceId ?? null, "generateWorkflowStream", {
      model: this.model,
      input: lastMessage.content,
      metadata: { enableThinking: supportsThinking },
    });

    try {
      const response = await chat.sendMessageStream({ message: messageParts });
      let accumulatedText = "";
      let lastUsage: TracingUsage | undefined;

      for await (const chunk of response) {
        if (chunk.usageMetadata) lastUsage = extractUsage(chunk.usageMetadata, { model: this.model });
        // Access candidates via type assertion for thought parts
        const chunkWithCandidates = chunk as {
          candidates?: Array<{
            content?: {
              parts?: Array<{
                text?: string;
                thought?: boolean;
              }>;
            };
          }>;
        };
        const candidates = chunkWithCandidates.candidates;

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
        error: error instanceof Error ? error.message : "Workflow generation failed",
      });
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Workflow generation failed",
      };
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
    const history = this.messagesToHistory(historyMessages);

    // Get the last user message
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") {
      yield { type: "error", error: "No user message to send" };
      return;
    }

    // Build message parts with attachments
    const messageParts: Part[] = [];

    // Add attachments first if present
    if (lastMessage.attachments && lastMessage.attachments.length > 0) {
      for (const attachment of lastMessage.attachments) {
        messageParts.push({
          inlineData: {
            mimeType: attachment.mimeType,
            data: attachment.data,
          },
        });
      }
    }

    // Add text content
    if (lastMessage.content) {
      messageParts.push({ text: lastMessage.content });
    }

    // Build tools array
    // - Gemini 2.5 Flash Image: no tools supported
    // - Gemini 3 Pro Image: Web Search only (no RAG)
    const tools: Tool[] = [];

    if (imageModel === "gemini-3-pro-image-preview" && webSearchEnabled) {
      tools.push({ googleSearch: {} } as Tool);
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
          responseModalities: ["TEXT", "IMAGE"],
          tools: tools.length > 0 ? tools : undefined,
        },
      });

      // Emit web search used if enabled (only for 3 Pro)
      if (imageModel === "gemini-3-pro-image-preview" && webSearchEnabled) {
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

      const imageWebSearchUsed = imageModel === "gemini-3-pro-image-preview" && !!webSearchEnabled;
      const imageUsage = extractUsage(response.usageMetadata, { model: imageModel, webSearchUsed: imageWebSearchUsed });
      tracing.generationEnd(genId, {
        output: "[image generation completed]",
        usage: imageUsage,
      });
      yield { type: "done", usage: toStreamChunkUsage(imageUsage) };
    } catch (error) {
      tracing.generationEnd(genId, {
        error: error instanceof Error ? error.message : "Image generation failed",
      });
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Image generation failed",
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
