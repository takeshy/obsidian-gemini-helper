import { App } from "obsidian";
import type { GeminiHelperPlugin } from "../../plugin";
import { getGeminiClient } from "../../core/gemini";
import { CliProviderManager } from "../../core/cliProvider";
import { isImageGenerationModel, type ToolDefinition, type McpAppInfo, type StreamChunkUsage } from "../../types";
import { getEnabledTools } from "../../core/tools";
import { fetchMcpTools, createMcpToolExecutor, type McpToolDefinition } from "../../core/mcpTools";
import { createToolExecutor } from "../../vault/toolExecutor";
import { WorkflowNode, ExecutionContext, PromptCallbacks, FileExplorerData } from "../types";
import { replaceVariables } from "./utils";
import { tracing } from "../../core/tracingHooks";
import { formatError } from "../../utils/error";

// Result type for command node execution
export interface CommandNodeResult {
  mcpAppInfo?: McpAppInfo;
  usedModel: string;
  usage?: StreamChunkUsage;
  elapsedMs?: number;
}

// Handle command node - execute LLM with prompt directly
export async function handleCommandNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App,
  plugin: GeminiHelperPlugin,
  promptCallbacks?: PromptCallbacks,
  traceId?: string | null
): Promise<CommandNodeResult> {
  // Track collected MCP App info from tool executions
  let collectedMcpAppInfo: McpAppInfo | undefined;
  const promptTemplate = node.properties["prompt"];
  if (!promptTemplate) {
    throw new Error("Command node missing 'prompt' property");
  }

  // Replace variables in prompt
  let prompt = replaceVariables(promptTemplate, context);
  const originalPrompt = prompt; // Save for potential regeneration

  // Check if this is a regeneration request for this node
  if (context.regenerateInfo?.commandNodeId === node.id) {
    const info = context.regenerateInfo;
    prompt = `${info.originalPrompt}

[Previous output]
${info.previousOutput}

[User feedback]
${info.additionalRequest}

Please revise the output based on the user's feedback above.`;
    // Clear regenerate info after using it
    context.regenerateInfo = undefined;
  }

  // Get model (use node's model or current selection)
  const modelName = node.properties["model"] || "";
  let model = (modelName || plugin.getSelectedModel()) as import("../../types").ModelType;

  // Check if this is a CLI model
  let isCliModel = model === "gemini-cli" || model === "claude-cli" || model === "codex-cli";

  // If resolved model requires API key but none is configured, fall back to a verified CLI model
  // Only when the node didn't explicitly specify a non-CLI model
  if (!isCliModel && !plugin.settings.googleApiKey && !modelName) {
    const cliConfig = plugin.settings.cliConfig;
    if (cliConfig?.cliVerified) {
      model = "gemini-cli";
    } else if (cliConfig?.claudeCliVerified) {
      model = "claude-cli";
    } else if (cliConfig?.codexCliVerified) {
      model = "codex-cli";
    } else {
      throw new Error("No API key or verified CLI configured. Please set up a Google API key or verify a CLI provider in settings.");
    }
    isCliModel = true;
  }

  if (isCliModel) {
    // Use CLI provider for CLI models
    const cliManager = new CliProviderManager();
    const providerName = model === "claude-cli" ? "claude-cli" : model === "codex-cli" ? "codex-cli" : "gemini-cli";
    const provider = cliManager.getProvider(providerName);

    if (!provider) {
      throw new Error(`CLI provider ${providerName} not available`);
    }

    // Build messages
    const messages = [
      {
        role: "user" as const,
        content: prompt,
        timestamp: Date.now(),
      },
    ];

    // Get vault path as working directory
    const vaultPath = (app.vault.adapter as { basePath?: string }).basePath || "";

    // Execute CLI call
    const genId = tracing.generationStart(traceId ?? null, "cli-command", {
      model,
      input: prompt,
      metadata: { provider: providerName },
    });

    let fullResponse = "";
    const cliStartTime = Date.now();
    const stream = provider.chatStream(messages, "", vaultPath);

    try {
      for await (const chunk of stream) {
        if (chunk.type === "text") {
          fullResponse += chunk.content;
        } else if (chunk.type === "error") {
          throw new Error(chunk.error);
        }
      }
      tracing.generationEnd(genId, { output: fullResponse });
    } catch (error) {
      tracing.generationEnd(genId, {
        error: formatError(error),
      });
      throw error;
    }

    // Save response to variable if specified
    const saveTo = node.properties["saveTo"];
    if (saveTo) {
      context.variables.set(saveTo, fullResponse);
      // Save command info for potential regeneration
      context.lastCommandInfo = {
        nodeId: node.id,
        originalPrompt,
        saveTo,
      };
    }
    return { usedModel: model, elapsedMs: Date.now() - cliStartTime };
  }

  // Non-CLI model: use GeminiClient
  // Get RAG setting
  // undefined/"" = use current, "__none__" = no RAG, "__websearch__" = web search, other = setting name
  const ragSettingName = node.properties["ragSetting"];
  let storeIds: string[] = [];
  let useWebSearch = false;

  if (ragSettingName === "__websearch__") {
    // Web search mode
    useWebSearch = true;
  } else if (ragSettingName === "__none__") {
    // Explicitly no RAG - storeIds stays empty
  } else if (ragSettingName && ragSettingName !== "") {
    // Specific RAG setting
    const ragSetting = plugin.workspaceState.ragSettings[ragSettingName];
    if (ragSetting) {
      if (ragSetting.isExternal && ragSetting.storeIds.length > 0) {
        storeIds = ragSetting.storeIds;
      } else if (ragSetting.storeId) {
        storeIds = [ragSetting.storeId];
      }
    }
  } else if (ragSettingName === undefined) {
    // Use current RAG setting
    const currentSetting = plugin.getSelectedRagSetting();
    if (currentSetting) {
      if (currentSetting.isExternal && currentSetting.storeIds.length > 0) {
        storeIds = currentSetting.storeIds;
      } else if (currentSetting.storeId) {
        storeIds = [currentSetting.storeId];
      }
    }
  }
  // If ragSettingName === "", use no RAG (storeIds stays empty)

  // Image generation models don't support RAG (File Search)
  // gemini-2.5-flash-image: no tools at all
  // gemini-3+ image models: Web Search only
  if (isImageGenerationModel(model)) {
    storeIds = []; // Disable RAG
    if (model === "gemini-2.5-flash-image") {
      useWebSearch = false; // No tools supported
    }
  }

  // Get GeminiClient
  const client = getGeminiClient();
  if (!client) {
    throw new Error("GeminiClient not initialized");
  }
  client.setModel(model);

  // Parse attachments property (comma-separated variable names containing FileExplorerData)
  const attachmentsStr = node.properties["attachments"] || "";
  const attachments: import("../../types").Attachment[] = [];

  if (attachmentsStr) {
    const varNames = attachmentsStr.split(",").map((s) => s.trim()).filter((s) => s);
    for (const varName of varNames) {
      const varValue = context.variables.get(varName);
      if (varValue && typeof varValue === "string") {
        try {
          const fileData: FileExplorerData = JSON.parse(varValue);
          if (fileData.contentType === "binary" && fileData.data) {
            // Determine attachment type from MIME type
            let attachmentType: "image" | "pdf" | "text" = "text";
            if (fileData.mimeType.startsWith("image/")) {
              attachmentType = "image";
            } else if (fileData.mimeType === "application/pdf") {
              attachmentType = "pdf";
            }
            attachments.push({
              name: fileData.basename,
              type: attachmentType,
              mimeType: fileData.mimeType,
              data: fileData.data,
            });
          }
          // Text files are already included via variable substitution in the prompt
        } catch {
          // Not valid FileExplorerData JSON, skip
        }
      }
    }
  }

  // Build messages
  const messages = [
    {
      role: "user" as const,
      content: prompt,
      timestamp: Date.now(),
      attachments: attachments.length > 0 ? attachments : undefined,
    },
  ];

  // Get vault tools mode (default: "all")
  // "all" = all vault tools, "noSearch" = exclude search_notes/list_notes, "none" = no vault tools
  const vaultToolMode = (node.properties["vaultTools"] || "all") as "all" | "noSearch" | "none";

  // Get MCP server names to enable (comma-separated)
  const mcpServersStr = node.properties["mcpServers"] || "";
  const enabledMcpServerNames = mcpServersStr
    ? mcpServersStr.split(",").map((s: string) => s.trim()).filter((s: string) => s)
    : [];

  // Prepare tools and executors for non-image models
  let tools: ToolDefinition[] = [];
  let toolExecutor: ((name: string, args: Record<string, unknown>) => Promise<unknown>) | undefined;
  let mcpToolExecutor: ReturnType<typeof createMcpToolExecutor> | null = null;

  const isImageModel = isImageGenerationModel(model);

  if (!isImageModel && vaultToolMode !== "none") {
    // Get vault tools based on RAG setting
    const allowRag = ragSettingName !== "__websearch__" && ragSettingName !== "__none__" && ragSettingName !== "";
    const vaultTools = getEnabledTools({
      allowWrite: true,
      allowDelete: true,
      ragEnabled: allowRag,
    });

    // Filter vault tools based on mode
    const searchToolNames = ["search_notes", "list_notes"];

    tools = vaultTools.filter(tool => {
      if (vaultToolMode === "noSearch") {
        return !searchToolNames.includes(tool.name);
      }
      return true; // "all" mode - keep all vault tools
    });

    // Create vault tool executor
    const obsidianToolExecutor = createToolExecutor(app, {
      listNotesLimit: plugin.settings.listNotesLimit,
      maxNoteChars: plugin.settings.maxNoteChars,
    });

    // Fetch MCP tools from specified servers
    let mcpTools: McpToolDefinition[] = [];
    if (enabledMcpServerNames.length > 0 && plugin.settings.mcpServers) {
      const enabledServers = plugin.settings.mcpServers.filter(
        server => enabledMcpServerNames.includes(server.name)
      );
      if (enabledServers.length > 0) {
        try {
          mcpTools = await fetchMcpTools(enabledServers);
          // Add MCP tools to the tools array
          tools = [...tools, ...mcpTools];
          // Create MCP tool executor
          mcpToolExecutor = createMcpToolExecutor(mcpTools, traceId);
        } catch (error) {
          console.error("Failed to fetch MCP tools:", error);
          // Continue without MCP tools
        }
      }
    }

    // Create combined tool executor
    if (tools.length > 0) {
      toolExecutor = async (name: string, args: Record<string, unknown>) => {
        // MCP tools start with "mcp_"
        if (name.startsWith("mcp_") && mcpToolExecutor) {
          const mcpResult = await mcpToolExecutor.execute(name, args);
          // Show MCP App UI if available and collect the info
          if (mcpResult.mcpApp) {
            collectedMcpAppInfo = mcpResult.mcpApp;
            if (promptCallbacks?.showMcpApp) {
              await promptCallbacks.showMcpApp(mcpResult.mcpApp);
            }
          }
          if (mcpResult.error) {
            return { error: mcpResult.error };
          }
          return { result: mcpResult.result };
        }
        // Otherwise use Obsidian tool executor
        return await obsidianToolExecutor(name, args);
      };
    }
  } else if (!isImageModel && enabledMcpServerNames.length > 0 && plugin.settings.mcpServers) {
    // vaultToolMode is "none" but MCP servers are specified
    const enabledServers = plugin.settings.mcpServers.filter(
      server => enabledMcpServerNames.includes(server.name)
    );
    if (enabledServers.length > 0) {
      try {
        const mcpTools = await fetchMcpTools(enabledServers);
        tools = mcpTools;
        mcpToolExecutor = createMcpToolExecutor(mcpTools, traceId);
        toolExecutor = async (name: string, args: Record<string, unknown>) => {
          if (mcpToolExecutor) {
            const mcpResult = await mcpToolExecutor.execute(name, args);
            // Show MCP App UI if available and collect the info
            if (mcpResult.mcpApp) {
              collectedMcpAppInfo = mcpResult.mcpApp;
              if (promptCallbacks?.showMcpApp) {
                await promptCallbacks.showMcpApp(mcpResult.mcpApp);
              }
            }
            if (mcpResult.error) {
              return { error: mcpResult.error };
            }
            return { result: mcpResult.result };
          }
          return { error: `Unknown tool: ${name}` };
        };
      } catch (error) {
        console.error("Failed to fetch MCP tools:", error);
      }
    }
  }

  // Execute LLM call - use generateImageStream for image models
  let fullResponse = "";
  const generatedImages: Array<{ mimeType: string; data: string }> = [];

  const stream = isImageModel
    ? client.generateImageStream(
        messages,
        model,
        undefined, // No system prompt for image generation
        useWebSearch,
        storeIds.length > 0 ? storeIds : undefined,
        traceId
      )
    : client.chatWithToolsStream(
        messages,
        tools,
        undefined, // No system prompt
        toolExecutor,
        storeIds.length > 0 ? storeIds : undefined, // RAG store IDs
        useWebSearch, // Web search mode
        { enableThinking: node.properties["enableThinking"] !== "false", traceId }
      );

  let thinkingContent = "";
  let streamUsage: StreamChunkUsage | undefined;
  const apiStartTime = Date.now();
  for await (const chunk of stream) {
    if (chunk.type === "text") {
      fullResponse += chunk.content;
    } else if (chunk.type === "thinking") {
      thinkingContent += chunk.content || "";
      // Stream thinking content to the progress modal
      promptCallbacks?.onThinking?.(node.id, thinkingContent);
    } else if (chunk.type === "image_generated" && chunk.generatedImage) {
      generatedImages.push(chunk.generatedImage);
    } else if (chunk.type === "error") {
      throw new Error(chunk.error || chunk.content || "Unknown API error");
    } else if (chunk.type === "done") {
      streamUsage = chunk.usage;
      break;
    }
  }

  // Cleanup MCP executor
  if (mcpToolExecutor) {
    try {
      await mcpToolExecutor.cleanup();
    } catch (error) {
      console.error("Failed to cleanup MCP executor:", error);
    }
  }

  // Save response to variable if specified
  const saveTo = node.properties["saveTo"];
  if (saveTo) {
    context.variables.set(saveTo, fullResponse);
    // Save command info for potential regeneration (used when note node requests changes)
    context.lastCommandInfo = {
      nodeId: node.id,
      originalPrompt,
      saveTo,
    };
  }

  // Save generated images to variable if specified
  const saveImageTo = node.properties["saveImageTo"];
  if (saveImageTo && generatedImages.length > 0) {
    // Convert to FileExplorerData format for consistency with file-explorer node
    const imageDataList: FileExplorerData[] = generatedImages.map((img, index) => {
      const extension = img.mimeType.split("/")[1] || "png";
      const filename = `generated-image-${index + 1}.${extension}`;
      return {
        path: filename,
        basename: filename,
        name: `generated-image-${index + 1}`,
        extension,
        mimeType: img.mimeType,
        contentType: "binary" as const,
        data: img.data,
      };
    });

    // If single image, save as single object; if multiple, save as array
    if (imageDataList.length === 1) {
      context.variables.set(saveImageTo, JSON.stringify(imageDataList[0]));
    } else {
      context.variables.set(saveImageTo, JSON.stringify(imageDataList));
    }
  }

  // Return collected MCP App info and used model
  return { mcpAppInfo: collectedMcpAppInfo, usedModel: model, usage: streamUsage, elapsedMs: Date.now() - apiStartTime };
}
