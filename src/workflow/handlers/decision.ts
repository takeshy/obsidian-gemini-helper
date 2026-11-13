import { geminiCorsFetch, requestDecision, requestDecisions, type DecisionResult } from "obsidian-llm-hub-common/core";
import { isBatchDecision, getDecisionNodeQuestions, getDecisionNodeDefinition, replaceVariables, type NodeRequest, type WorkflowModelOption } from "obsidian-llm-hub-common/workflow";
import type { GeminiHelperPlugin } from "src/plugin";
import type { GeminiHelperSettings } from "src/types";

const DECISION_MODEL = "gemini-decision-1";

export function getDecisionModelOptions(settings: Pick<GeminiHelperSettings, "googleApiKey">): WorkflowModelOption[] {
  return settings.googleApiKey.trim() ? [{ value: DECISION_MODEL, label: `Gemini / ${DECISION_MODEL}` }] : [];
}

export function handleDecisionNode(
  { node, context, abortSignal }: NodeRequest,
  plugin: GeminiHelperPlugin,
): Promise<DecisionResult> {
  const model = replaceVariables(node.properties.model || "", context).trim();
  if (model && model !== DECISION_MODEL) throw new Error(`Unsupported decision model: ${model}`);
  if (isBatchDecision(node)) return requestDecisions(
    replaceVariables(node.properties.input || "", context), getDecisionNodeQuestions(node, context),
    { provider: "gemini", apiKey: plugin.settings.googleApiKey, fetchImpl: geminiCorsFetch }, abortSignal,
  );
  return requestDecision(
    replaceVariables(node.properties.prompt || "", context),
    replaceVariables(node.properties.input || "", context),
    { provider: "gemini", apiKey: plugin.settings.googleApiKey, fetchImpl: geminiCorsFetch },
    getDecisionNodeDefinition(node, context),
    abortSignal,
  );
}
