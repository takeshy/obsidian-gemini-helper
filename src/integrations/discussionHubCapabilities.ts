import type { EventRef } from "obsidian";
import { GeminiClient } from "src/core/gemini";
import type { GeminiHelperPlugin } from "src/plugin";
import { getAvailableModels, type Attachment, type Message, type ModelType } from "src/types";

interface DiscussionAttachment { name: string; mimeType: string; data: string; type?: "image" | "pdf" | "text" | "audio" | "video"; sourcePath?: string }
interface DiscussionIntegration {
  protocolVersion: 1;
  id: string;
  name: string;
  listModels: () => Promise<Array<{ id: string; name: string }>>;
  streamText: (request: { modelId: string; messages: Array<{ role: "user" | "assistant"; content: string; attachments?: DiscussionAttachment[] }>; systemPrompt: string; abortSignal?: AbortSignal; onChunk: (text: string) => void }) => Promise<void>;
}
interface DiscussionHubApi { registerIntegration: (integration: DiscussionIntegration) => () => void }
interface DiscussionWorkspaceEvents {
  on: (name: "discussion-hub:ready", callback: (hub: DiscussionHubApi) => void) => EventRef;
  trigger: {
    (name: "discussion-hub:register-integration", integration: DiscussionIntegration): void;
    (name: "discussion-hub:unregister-integration", request: { id: string; integration: DiscussionIntegration }): void;
  };
}

function asAttachment(value: DiscussionAttachment): Attachment {
  return {
    name: value.name,
    mimeType: value.mimeType,
    data: value.data,
    type: value.type ?? (value.mimeType.startsWith("image/") ? "image" : value.mimeType === "application/pdf" ? "pdf" : "text"),
  };
}

export function registerDiscussionHubIntegration(plugin: GeminiHelperPlugin): void {
  const integration: DiscussionIntegration = {
    protocolVersion: 1,
    id: plugin.manifest.id,
    name: plugin.manifest.name,
    listModels: () => Promise.resolve(getAvailableModels(plugin.settings.apiPlan)
      .filter((model) => !model.isImageModel)
      .map((model) => ({ id: model.name, name: model.displayName }))),
    streamText: async ({ modelId, messages, systemPrompt, abortSignal, onChunk }) => {
      if (!plugin.settings.googleApiKey) throw new Error("Gemini API key is not configured.");
      const client = new GeminiClient(plugin.settings.googleApiKey, modelId as ModelType);
      const converted: Message[] = messages.map((message) => ({
        role: message.role,
        content: message.content,
        timestamp: Date.now(),
        attachments: message.attachments?.map(asAttachment),
      }));
      for await (const chunk of client.chatWithToolsStream(converted, [], systemPrompt, () => Promise.resolve({}))) {
        if (abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");
        if (chunk.type === "text" && chunk.content) onChunk(chunk.content);
        else if (chunk.type === "error") throw new Error(chunk.error || "Gemini discussion failed.");
      }
    },
  };
  const workspace = plugin.app.workspace as unknown as DiscussionWorkspaceEvents;
  plugin.registerEvent(workspace.on("discussion-hub:ready", (hub) => hub.registerIntegration(integration)));
  workspace.trigger("discussion-hub:register-integration", integration);
  plugin.register(() => workspace.trigger("discussion-hub:unregister-integration", { id: integration.id, integration }));
}
