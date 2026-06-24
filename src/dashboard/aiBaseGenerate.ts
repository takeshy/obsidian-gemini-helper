// Headless `.base` generation: builds a system prompt from the built-in `base`
// skill and streams a single completion from the user's selected Gemini model,
// then returns the cleaned YAML.

import type { GeminiHelperPlugin } from "src/plugin";
import { GeminiClient } from "src/core/gemini";
import { loadBuiltinSkill, builtinFolderPath } from "src/core/builtinSkills";
import {
  type ModelType,
  type Message,
  type StreamChunk,
} from "src/types";

/** Build the system prompt for `.base` generation from the built-in skill. */
export function buildBaseSystemPrompt(): string {
  const skill = loadBuiltinSkill(builtinFolderPath("base"));
  const reference = skill
    ? `${skill.instructions}\n\n${skill.references.join("\n\n")}`
    : "";
  return [
    "You are an expert at authoring Obsidian Bases (`.base`) files.",
    "Produce a single valid `.base` YAML document that satisfies the user's request.",
    "Output ONLY the YAML — no prose, no explanation, and no Markdown code fences.",
    "",
    reference,
  ].join("\n");
}

/** Strip a wrapping ```yaml / ``` code fence if the model added one. */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:ya?ml)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return (fence ? fence[1] : trimmed).trim();
}

async function collectText(stream: AsyncGenerator<StreamChunk>): Promise<string> {
  let out = "";
  for await (const chunk of stream) {
    if (chunk.type === "text" && chunk.content) out += chunk.content;
    else if (chunk.type === "error") throw new Error(chunk.error || "Generation failed");
  }
  return out;
}

/**
 * Generate `.base` YAML for the given request. `mode` only affects how the user
 * prompt is framed; `currentYaml` is included for edits so the model revises in
 * place. Returns cleaned YAML (no fences).
 */
export async function generateBaseYaml(
  plugin: GeminiHelperPlugin,
  model: ModelType,
  request: string,
  currentYaml?: string,
): Promise<string> {
  const systemPrompt = buildBaseSystemPrompt();

  const userPrompt = currentYaml
    ? `Revise the following \`.base\` file according to this request:\n\n${request}\n\nCurrent \`.base\` content:\n\`\`\`yaml\n${currentYaml}\n\`\`\``
    : `Create a \`.base\` file for this request:\n\n${request}`;

  const userMessages: Message[] = [{ role: "user", content: userPrompt, timestamp: Date.now() }];

  const raw = await collectText(streamFor(plugin, model, userMessages, systemPrompt));
  const yaml = stripCodeFence(raw);
  if (!yaml) throw new Error("The model returned an empty result.");
  return yaml;
}

function streamFor(
  plugin: GeminiHelperPlugin,
  selectedModel: ModelType,
  userMessages: Message[],
  systemPrompt: string,
): AsyncGenerator<StreamChunk> {
  const apiKey = plugin.settings.googleApiKey;
  if (!apiKey) throw new Error("Gemini API key is not configured.");
  const client = new GeminiClient(apiKey, selectedModel);
  return client.generateWorkflowStream(userMessages, systemPrompt, null);
}
