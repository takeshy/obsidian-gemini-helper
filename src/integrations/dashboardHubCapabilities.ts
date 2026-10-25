import { isWebSearchConfigured } from "src/core/webSearch";
import { buildSkillSystemPrompt, type LoadedSkill } from "src/core/skillsLoader";
import type { GeminiHelperPlugin } from "src/plugin";
import { GeminiClient } from "src/core/gemini";
import { getEnabledVaultTools } from "obsidian-llm-hub-common/core";
import { createToolExecutor } from "src/vault/toolExecutor";
import { createMcpToolset, type McpToolset } from "obsidian-llm-hub-common/mcp";
import { createSkillToolset } from "obsidian-llm-hub-common/workflow";
import {
  assertTimelineAnswerSupported, dashboardBasePrompt, dashboardRewritePrompt, dashboardWorkflowPrompt,
  listDashboardSkills, loadDashboardSkills, runDashboardWorkflow as runWorkflow, stripYamlFence,
  timelineAnswerMessages, timelineAnswerSystemPrompt,
  type DashboardAiModel, type DashboardBaseRequest, type DashboardRewriteRequest, type DashboardTimelineAnswerOptions,
  type DashboardTimelineAnswerRequest, type DashboardWorkflowGenerationRequest, type DashboardWorkflowRequest,
} from "obsidian-llm-hub-common/dashboard";
import { loadBuiltinSkill, builtinFolderPath } from "src/core/builtinSkills";
import { WORKFLOW_SPECIFICATION } from "src/workflow/workflowSpec";
import { getAvailableModels, type Message, type ModelType } from "src/types";

export type { DashboardAiModel };
export type TimelineAnswerRequest = DashboardTimelineAnswerRequest;
export type TimelineAnswerOptions = DashboardTimelineAnswerOptions;
interface SearchOptions { ragStoreIds?: string[]; webSearch?: boolean; ragMetadataFilter?: string; mcp?: McpToolset | null; skills?: LoadedSkill[] }

export function listDashboardModels(plugin: GeminiHelperPlugin): DashboardAiModel[] {
  return getAvailableModels(plugin.settings.apiPlan).filter((model) => !model.isImageModel)
    .map((model) => ({ id: model.name, name: model.displayName, capabilities: { text: true, vaultRead: true, tools: true } }));
}

export function runDashboardWorkflow(plugin: GeminiHelperPlugin, request: DashboardWorkflowRequest): Promise<string> {
  return runWorkflow(plugin.app, request);
}

async function generate(plugin: GeminiHelperPlugin, modelId: string, prompt: string | Message[], systemPrompt: string, signal?: AbortSignal, vaultRead = false, search: SearchOptions = {}): Promise<string> {
  if (!plugin.settings.googleApiKey) throw new Error("Gemini API key is not configured.");
  const client = new GeminiClient(plugin.settings.googleApiKey, modelId as ModelType, plugin.settings.webSearch);
  const messages: Message[] = typeof prompt === "string" ? [{ role: "user", content: prompt, timestamp: Date.now() }] : prompt;
  const vaultTools = vaultRead ? getEnabledVaultTools({ allowWrite: false, allowDelete: false, ragSyncStatus: false }) : [];
  const vaultExecute = vaultRead ? createToolExecutor(plugin.app, { listNotesLimit: plugin.settings.listNotesLimit, maxNoteChars: plugin.settings.maxNoteChars,
    limitVaultToolScope: true, vaultToolAllowedFolders: plugin.settings.aiVaultToolAllowedFolders }) : undefined;
  // Skill tools as Chat offers them: SKILL.md of vault skills is read on demand,
  // and skill workflows run in the usual execution modal with their own prompts.
  const skills = createSkillToolset(plugin.app, search.skills ?? [],
    { vaultToolAllowedFolders: plugin.settings.aiVaultToolAllowedFolders, readSkillMarker: false });
  const mcp = search.mcp ?? null;
  const tools = [...vaultTools, ...(mcp?.tools ?? []), ...skills.tools];
  const execute = tools.length > 0 ? async (name: string, args: Record<string, unknown>) => {
    if (skills.has(name)) return skills.execute(name, args);
    if (mcp?.has(name)) return mcp.execute(name, args);
    return vaultExecute ? vaultExecute(name, args) : { error: `Unknown tool: ${name}` };
  } : undefined;
  const stream = client.chatWithToolsStream(messages, tools, systemPrompt, execute, search.ragStoreIds, search.webSearch ?? false, {
    ragTopK: search.ragStoreIds?.length ? plugin.settings.ragTopK : undefined, ragMetadataFilter: search.ragMetadataFilter,
    functionCallLimits: { maxFunctionCalls: 12 }, enableThinking: true, traceId: null });
  let output = "";
  for await (const chunk of stream) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (chunk.type === "text" && chunk.content) output += chunk.content;
    else if (chunk.type === "tool_call") output = "";
    else if (chunk.type === "error") throw new Error(chunk.error || "AI generation failed.");
  }
  if (!output.trim()) throw new Error("AI returned an empty response.");
  return output.trim();
}

export async function generateDashboardBase(plugin: GeminiHelperPlugin, request: DashboardBaseRequest): Promise<string> {
  const { prompt, systemPrompt } = dashboardBasePrompt(request, loadBuiltinSkill(builtinFolderPath("base")));
  return stripYamlFence(await generate(plugin, request.modelId, prompt, systemPrompt, request.abortSignal, request.allowVaultRead));
}
export function rewriteDashboardText(plugin: GeminiHelperPlugin, request: DashboardRewriteRequest): Promise<string> {
  const { prompt, systemPrompt } = dashboardRewritePrompt(request);
  return generate(plugin, request.modelId, prompt, systemPrompt, request.abortSignal);
}
export function generateDashboardWorkflow(plugin: GeminiHelperPlugin, request: DashboardWorkflowGenerationRequest): Promise<string> {
  const { prompt, systemPrompt } = dashboardWorkflowPrompt(request, WORKFLOW_SPECIFICATION);
  return generate(plugin, request.modelId, prompt, systemPrompt, request.abortSignal, request.allowVaultRead);
}

function supportsWebSearch(plugin: GeminiHelperPlugin): boolean {
  return isWebSearchConfigured(plugin.settings.webSearch);
}
function usableRagSettings(plugin: GeminiHelperPlugin): string[] {
  if (!plugin.settings.ragEnabled) return [];
  return plugin.getRagSettingNames().filter((name) => plugin.getStoreIdsForRagSetting(plugin.getRagSetting(name)).length > 0);
}
export async function getDashboardTimelineOptions(plugin: GeminiHelperPlugin, _modelId: string): Promise<TimelineAnswerOptions> {
  return { vaultRead: true, webSearch: supportsWebSearch(plugin), ragSettings: usableRagSettings(plugin),
    mcpServers: (plugin.settings.mcpServers ?? []).map((server) => server.name),
    skills: await listDashboardSkills(plugin.app, plugin.settings.skillsFolder) };
}
export async function answerDashboardTimeline(plugin: GeminiHelperPlugin, request: TimelineAnswerRequest): Promise<string> {
  assertTimelineAnswerSupported(request, { webSearch: supportsWebSearch(plugin) });
  const search: SearchOptions = { webSearch: request.webSearch === true };
  let ragContext: string | undefined;
  if (request.ragSetting) {
    const setting = plugin.getRagSetting(request.ragSetting);
    search.ragStoreIds = plugin.getStoreIdsForRagSetting(setting);
    if (search.ragStoreIds.length === 0) throw new Error(`RAG setting "${request.ragSetting}" has no File Search store. Sync or configure the store before using RAG.`);
    search.ragMetadataFilter = setting?.metadataFilter || undefined;
    ragContext = "A semantic search file store is selected. Use it for questions that may rely on vault knowledge, and prefer retrieved evidence over guessing.";
  }
  // MCP calls go through the shared executor, which asks for approval like Chat does.
  search.mcp = await createMcpToolset((plugin.settings.mcpServers ?? []).filter((server) => request.mcpServers?.includes(server.name)));
  search.skills = await loadDashboardSkills(plugin.app, plugin.settings.skillsFolder, request.skills);
  const systemPrompt = timelineAnswerSystemPrompt({
    vaultRead: request.allowVaultRead, ragContext, mcp: search.mcp !== null,
    skillPrompt: buildSkillSystemPrompt(search.skills), additionalInstructions: plugin.settings.systemPrompt,
  });
  try {
    return await generate(plugin, request.modelId, timelineAnswerMessages(request), systemPrompt, request.abortSignal, request.allowVaultRead === true, search);
  } finally {
    await search.mcp?.cleanup();
  }
}
