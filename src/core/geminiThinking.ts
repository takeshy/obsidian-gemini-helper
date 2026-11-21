import type { ReasoningEffort } from "src/types";
import {
  buildGeminiThinkingConfig as buildSharedThinkingConfig,
  getGeminiReasoningEffortOptions as getSharedReasoningEffortOptions,
  isGeminiThinkingRequired as isSharedThinkingRequired,
  resolveGeminiThinkingLevel as resolveSharedThinkingLevel,
} from "obsidian-llm-hub-common/core";

// Gemini 4 uses thinking levels. Keep this adapter until the vendored shared
// library supports these models.
function isGemini4(model: string): boolean {
  return /^gemini-4-(?:hydrogen|argon|carbon|neon)$/i.test(model);
}

// https://aistudio.google.com/docs/whats-new-gemini-4-neon#understanding-thinking-levels
function supportsGemini4Xhigh(model: string): boolean {
  return /^gemini-4-(?:hydrogen|neon)$/i.test(model);
}

export function isGeminiThinkingRequired(model: string): boolean {
  return isGemini4(model) || isSharedThinkingRequired(model);
}

export function getGeminiReasoningEffortOptions(model: string, isImageModel = false): ReasoningEffort[] {
  if (isGemini4(model) && !isImageModel) {
    return supportsGemini4Xhigh(model)
      ? ["default", "low", "medium", "high", "xhigh"]
      : ["default", "low", "medium", "high"];
  }
  return getSharedReasoningEffortOptions(model, isImageModel);
}

export function resolveGeminiThinkingLevel(
  model: string,
  enableThinking: boolean | undefined,
  reasoningEffort?: ReasoningEffort,
): ReturnType<typeof resolveSharedThinkingLevel> | "xhigh" {
  if (!isGemini4(model)) return resolveSharedThinkingLevel(model, enableThinking, reasoningEffort);
  if (reasoningEffort !== undefined) {
    switch (reasoningEffort) {
      case "low":
      case "medium":
      case "high":
        return reasoningEffort;
      case "xhigh":
        return supportsGemini4Xhigh(model) ? reasoningEffort : undefined;
      default:
        return undefined;
    }
  }
  return enableThinking === undefined ? undefined : enableThinking ? "high" : "low";
}

export function buildGeminiThinkingConfig(
  model: string,
  enableThinking: boolean | undefined,
  reasoningEffort?: ReasoningEffort,
): Record<string, unknown> | undefined {
  if (!isGemini4(model)) return buildSharedThinkingConfig(model, enableThinking, reasoningEffort);
  const level = resolveGeminiThinkingLevel(model, enableThinking, reasoningEffort);
  if (!level) return undefined;
  return enableThinking === false && reasoningEffort === undefined
    ? { thinkingLevel: level.toUpperCase() }
    : { includeThoughts: true, thinkingLevel: level.toUpperCase() };
}
