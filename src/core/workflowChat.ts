import { GeminiClient } from "src/core/gemini";
import type { GeminiHelperPlugin } from "src/plugin";
import type { Attachment, ModelType } from "src/types";
import type { WorkflowChatChunk, WorkflowChatRequest } from "obsidian-llm-hub-common/workflow";

/**
 * Runs a workflow generation prompt against Gemini. This is the plugin's half of WorkflowHost:
 * the shared modal knows nothing about which client or key is in play.
 */
export async function* streamWorkflowChat(
  plugin: GeminiHelperPlugin,
  request: WorkflowChatRequest,
): AsyncGenerator<WorkflowChatChunk> {
  const model = (request.model || plugin.getSelectedModel()) as ModelType;
  const client = new GeminiClient(plugin.settings.googleApiKey, model);
  const messages = [{
    role: "user" as const,
    content: request.userPrompt,
    timestamp: Date.now(),
    attachments: request.attachments as Attachment[] | undefined,
  }];

  // Workflow generation only cares about prose, reasoning and the final tally.
  for await (const chunk of client.generateWorkflowStream(messages, request.systemPrompt, request.traceId)) {
    if (chunk.type === "text" || chunk.type === "thinking" || chunk.type === "done" || chunk.type === "error") {
      yield { type: chunk.type, content: chunk.content, usage: chunk.usage, error: chunk.error };
    }
  }
}
