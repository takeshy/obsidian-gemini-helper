// The workflow format the AI writes against lives in the shared library, beside the
// executor it describes. This file only tells it what this plugin offers.
import { getAvailableModels } from "src/types";
import type { GeminiHelperPlugin } from "src/plugin";
import {
  getWorkflowSpecification,
  handleGetWorkflowSpec as handleSharedGetWorkflowSpec,
  type WorkflowSpecContext,
} from "obsidian-llm-hub-common/workflow";

export {
  getWorkflowSpecification,
  getWorkflowNodeSpec,
  WORKFLOW_SPECIFICATION,
  GET_WORKFLOW_SPEC_TOOL,
  GET_WORKFLOW_SPEC_TOOL_NAME,
  type WorkflowSpecContext,
} from "obsidian-llm-hub-common/workflow";

/** Build the spec context from the plugin's current settings & workspace state. */
export function buildWorkflowSpecContext(plugin: GeminiHelperPlugin): WorkflowSpecContext {
  // Without an API key no model can run, so a command node has nothing to offer.
  const modelNames = plugin.settings.googleApiKey
    ? getAvailableModels(plugin.settings.apiPlan).map(model => model.name)
    : [];
  return {
    modelNames,
    mcpServers: plugin.settings.mcpServers || [],
    ragSettingNames: Object.keys(plugin.workspaceState.ragSettings || {}),
  };
}

export function handleGetWorkflowSpec(
  args: Record<string, unknown>,
  plugin: GeminiHelperPlugin,
): { result: string } {
  return handleSharedGetWorkflowSpec(args, buildWorkflowSpecContext(plugin));
}

/** The spec as this plugin's current configuration renders it. */
export function getPluginWorkflowSpecification(plugin: GeminiHelperPlugin): string {
  return getWorkflowSpecification(buildWorkflowSpecContext(plugin));
}
