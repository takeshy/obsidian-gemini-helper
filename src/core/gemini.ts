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
  type ToolCall,
  type ModelType,
  type GeneratedImage,
} from "src/types";

// Function call limit options
export interface FunctionCallLimitOptions {
  maxFunctionCalls?: number;           // 最大function call回数 (default: 20)
  functionCallWarningThreshold?: number; // 残りこの回数で警告 (default: 5)
}

export interface ChatWithToolsOptions {
  ragTopK?: number;
  functionCallLimits?: FunctionCallLimitOptions;
  disableTools?: boolean;
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
    systemPrompt?: string
  ): Promise<string> {
    const contents = this.messagesToContents(messages);

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents,
      config: {
        systemInstruction: systemPrompt,
      },
    });

    return response.text ?? "";
  }

  // Streaming chat
  async *chatStream(
    messages: Message[],
    systemPrompt?: string
  ): AsyncGenerator<StreamChunk> {
    const contents = this.messagesToContents(messages);

    try {
      const response = await this.ai.models.generateContentStream({
        model: this.model,
        contents,
        config: {
          systemInstruction: systemPrompt,
        },
      });

      let hasReceivedChunk = false;
      for await (const chunk of response) {
        hasReceivedChunk = true;
        const text = chunk.text;
        if (text) {
          yield { type: "text", content: text };
        }
      }

      if (!hasReceivedChunk) {
        yield { type: "error", error: "No response received from API (possible server error)" };
        return;
      }

      yield { type: "done" };
    } catch (error) {
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
    // Flash Lite model gets confused when combining function calling with fileSearch,
    // trying to call non-existent functions like "default_api.query" or "file_search.query".
    // When RAG is enabled with Flash Lite, we only use fileSearch without function calling.
    const isFlashLite = this.model.toLowerCase().includes("flash-lite");
    const ragEnabled = ragStoreIds && ragStoreIds.length > 0;

    if (!options?.disableTools) {
      if (webSearchEnabled) {
        geminiTools = [{ googleSearch: {} } as Tool];
      } else {
        // Only add function tools if there are any defined
        // Skip function calling for Flash Lite when RAG is enabled to avoid tool confusion
        if (tools.length > 0 && !(isFlashLite && ragEnabled)) {
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

    // Check if model supports thinking (Gemma models don't support it)
    const supportsThinking = !this.model.toLowerCase().includes("gemma");

    // Build thinking config based on model
    // - Gemini 2.5 Flash Lite requires thinkingBudget to enable thinking (default is off)
    // - Other 2.5 models work with just includeThoughts
    // - Gemini 3 models use thinkingLevel (not thinkingBudget)
    const getThinkingConfig = () => {
      if (!supportsThinking) return undefined;
      const modelLower = this.model.toLowerCase();
      if (modelLower.includes("flash-lite")) {
        // Flash Lite requires thinkingBudget to enable thinking (-1 = dynamic)
        return { includeThoughts: true, thinkingBudget: -1 };
      }
      return { includeThoughts: true };
    };

    // Create a chat session with history
    const chat: Chat = this.ai.chats.create({
      model: this.model,
      history,
      config: {
        systemInstruction: systemPrompt,
        ...(geminiTools ? { tools: geminiTools } : {}),
        // Enable thinking for models that support it
        ...(supportsThinking ? { thinkingConfig: getThinkingConfig() } : {}),
      },
    });

    // Get the last user message
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") {
      yield { type: "error", error: "No user message to send" };
      return;
    }

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

        for await (const chunk of response) {
          hasReceivedChunk = true;
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
            yield { type: "text", content: text };
          }
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
            for await (const chunk of response) {
              const text = chunk.text;
              if (text) {
                yield { type: "text", content: text };
              }
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

            const result = await executeToolCall(fc.name, fc.args);

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
            for await (const chunk of response) {
              const text = chunk.text;
              if (text) {
                yield { type: "text", content: text };
              }
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

      yield { type: "done" };
    } catch (error) {
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "API call failed",
      };
    }
  }

  // Streaming workflow generation with thinking
  async *generateWorkflowStream(
    messages: Message[],
    systemPrompt?: string
  ): AsyncGenerator<StreamChunk> {
    // Build history from all messages except the last one
    const historyMessages = messages.slice(0, -1);
    const history = this.messagesToHistory(historyMessages);

    // Check if model supports thinking (Gemma models don't support it)
    const supportsThinking = !this.model.toLowerCase().includes("gemma");

    // Build thinking config based on model
    const getThinkingConfig = () => {
      if (!supportsThinking) return undefined;
      const modelLower = this.model.toLowerCase();
      if (modelLower.includes("flash-lite")) {
        // Flash Lite requires thinkingBudget to enable thinking (-1 = dynamic)
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
        // Enable thinking for models that support it
        ...(supportsThinking ? { thinkingConfig: getThinkingConfig() } : {}),
      },
    });

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

    try {
      const response = await chat.sendMessageStream({ message: messageParts });

      for await (const chunk of response) {
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
          yield { type: "text", content: text };
        }
      }

      yield { type: "done" };
    } catch (error) {
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
    _ragStoreIds?: string[]  // Reserved for future RAG support in image generation
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

      yield { type: "done" };
    } catch (error) {
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
