import {
  GoogleGenAI,
  Type,
  type Content,
  type Part,
  type Tool,
  type Schema,
  type Chat,
} from "@google/genai";
import type {
  Message,
  ToolDefinition,
  StreamChunk,
  ToolCall,
  ModelType,
  GeneratedImage,
} from "src/types";

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
    return messages.map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }] as Part[],
    }));
  }

  // Convert tool definitions to Gemini format
  private toolsToGeminiFormat(tools: ToolDefinition[]): Tool[] {
    const functionDeclarations = tools.map((tool) => {
      const properties: Record<string, Schema> = {};
      for (const [key, value] of Object.entries(tool.parameters.properties)) {
        properties[key] = {
          type: value.type.toUpperCase() as Type,
          description: value.description,
          enum: value.enum,
        };
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

    const response = await this.ai.models.generateContentStream({
      model: this.model,
      contents,
      config: {
        systemInstruction: systemPrompt,
      },
    });

    for await (const chunk of response) {
      const text = chunk.text;
      if (text) {
        yield { type: "text", content: text };
      }
    }

    yield { type: "done" };
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
    ragTopK?: number
  ): AsyncGenerator<StreamChunk> {
    let geminiTools: Tool[];

    // Google Search cannot be used with function calling tools
    if (webSearchEnabled) {
      geminiTools = [{ googleSearch: {} } as Tool];
    } else {
      geminiTools = this.toolsToGeminiFormat(tools);
      // Add File Search RAG if store IDs are provided
      if (ragStoreIds && ragStoreIds.length > 0) {
        geminiTools.push({
          fileSearch: {
            fileSearchStoreNames: ragStoreIds,
            topK: ragTopK ?? 5,  // Limit retrieved chunks (default: 5)
          },
        } as Tool);
      }
    }

    // Build history from all messages except the last one
    const historyMessages = messages.slice(0, -1);
    const history = this.messagesToHistory(historyMessages);

    // Create a chat session with history
    const chat: Chat = this.ai.chats.create({
      model: this.model,
      history,
      config: {
        systemInstruction: systemPrompt,
        tools: geminiTools,
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

    // Send initial message
    let response = await chat.sendMessageStream({ message: messageParts });

    while (continueLoop) {
      const functionCallsToProcess: Array<{ name: string; args: Record<string, unknown> }> = [];
      let groundingEmitted = false;

      for await (const chunk of response) {
        // Check for function calls
        if (chunk.functionCalls && chunk.functionCalls.length > 0) {
          for (const fc of chunk.functionCalls) {
            functionCallsToProcess.push({
              name: fc.name ?? "",
              args: (fc.args as Record<string, unknown>) ?? {},
            });
          }
        }

        // Check for grounding metadata (File Search or Web Search usage)
        // Access candidates via type assertion for grounding metadata
        const chunkWithCandidates = chunk as {
          candidates?: Array<{
            groundingMetadata?: {
              groundingChunks?: Array<{
                retrievedContext?: { uri?: string; title?: string };
              }>;
            };
          }>;
        };
        const candidates = chunkWithCandidates.candidates;
        if (!groundingEmitted && candidates && candidates.length > 0) {
          const groundingMetadata = candidates[0]?.groundingMetadata;
          if (groundingMetadata) {
            if (webSearchEnabled) {
              // Web Search was used
              yield { type: "web_search_used" };
            } else {
              // RAG/File Search was used
              const sources: string[] = [];
              // Extract source file names from grounding chunks
              if (groundingMetadata.groundingChunks) {
                for (const gc of groundingMetadata.groundingChunks) {
                  if (gc.retrievedContext?.uri) {
                    sources.push(gc.retrievedContext.uri);
                  } else if (gc.retrievedContext?.title) {
                    sources.push(gc.retrievedContext.title);
                  }
                }
              }
              yield { type: "rag_used", ragSources: sources };
            }
            groundingEmitted = true;
          }
        }

        // Yield text chunks
        const text = chunk.text;
        if (text) {
          yield { type: "text", content: text };
        }
      }

      // Process function calls if any
      if (functionCallsToProcess.length > 0 && executeToolCall) {
        const functionResponseParts: Part[] = [];

        for (const fc of functionCallsToProcess) {
          const toolCall: ToolCall = {
            id: `${fc.name}_${Date.now()}`,
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
              response: { result } as Record<string, unknown>,
            },
          });
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
  }

  // Chat with File Search RAG
  async chatWithFileSearch(
    messages: Message[],
    storeIds: string[],
    systemPrompt?: string
  ): Promise<string> {
    const contents = this.messagesToContents(messages);

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents,
      config: {
        systemInstruction: systemPrompt,
        tools: [
          {
            retrieval: {
              vertexRagStore: {
                ragCorpora: storeIds,
              },
            },
          },
        ],
      },
    });

    return response.text ?? "";
  }

  // Image generation using Gemini
  async *generateImageStream(
    messages: Message[],
    imageModel: ModelType,
    systemPrompt?: string,
    webSearchEnabled?: boolean,
    ragStoreIds?: string[]
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
