import { TFile } from "obsidian";
import type { GeminiHelperPlugin } from "src/plugin";
import { GeminiClient } from "src/core/gemini";
import { getEnabledTools } from "src/core/tools";
import { createToolExecutor } from "src/vault/toolExecutor";
import { loadBuiltinSkill, builtinFolderPath } from "src/core/builtinSkills";
import { WORKFLOW_SPECIFICATION } from "src/workflow/workflowSpec";
import { getAvailableModels, type Message, type ModelType } from "src/types";
import { parseWorkflowFromMarkdown } from "src/workflow/parser";
import { WorkflowExecutor } from "src/workflow/executor";
import type { PromptCallbacks, WorkflowInput } from "src/workflow/types";

export interface DashboardAiModel { id: string; name: string; capabilities: { text: boolean; vaultRead: boolean; tools: boolean } }
interface WorkflowRequest { workflowPath: string; outputVariable?: string; abortSignal?: AbortSignal }
interface BaseRequest { modelId: string; instruction: string; currentYaml?: string; basePath?: string; allowVaultRead: boolean; previousResult?: string; abortSignal?: AbortSignal }
interface RewriteRequest { modelId: string; content: string; instruction: string; previousResult?: string; context: "timeline" | "memo"; abortSignal?: AbortSignal }
interface WorkflowGenerationRequest { modelId: string; mode: "create" | "modify"; instruction: string; currentMarkdown?: string; previousResult?: string; outputContract: { outputVariable: string; format: "markdown" | "html" }; allowVaultRead: boolean; abortSignal?: AbortSignal }

export function listDashboardModels(plugin: GeminiHelperPlugin): DashboardAiModel[] {
  return getAvailableModels(plugin.settings.apiPlan).filter((model) => !model.isImageModel)
    .map((model) => ({ id: model.name, name: model.displayName, capabilities: { text: true, vaultRead: true, tools: true } }));
}

function headlessCallbacks(): PromptCallbacks {
  return { promptForFile: () => Promise.resolve(null), promptForAnyFile: () => Promise.resolve(null), promptForNewFilePath: () => Promise.resolve(null),
    promptForSelection: () => Promise.resolve(null), promptForValue: () => Promise.resolve(null),
    promptForConfirmation: () => Promise.resolve({ confirmed: false }), promptForDialog: () => Promise.resolve(null), promptForPassword: () => Promise.resolve(null) };
}
function extract(values: Map<string, string | number>, name?: string): string | null {
  const str = (value: unknown) => typeof value === "string" ? value : typeof value === "number" ? String(value) : null;
  if (name) return str(values.get(name)); const result = str(values.get("result")); if (result != null) return result;
  for (const [key, value] of values) { const text = str(value); if (!key.startsWith("_") && text) return text; } return null;
}
export async function runDashboardWorkflow(plugin: GeminiHelperPlugin, request: WorkflowRequest): Promise<string> {
  const file = plugin.app.vault.getAbstractFileByPath(request.workflowPath);
  if (!(file instanceof TFile)) throw new Error(`Workflow not found: ${request.workflowPath}`);
  const workflow = parseWorkflowFromMarkdown(await plugin.app.vault.read(file));
  const input: WorkflowInput = { variables: new Map() };
  const execution = await new WorkflowExecutor(plugin.app, plugin).execute(workflow, input, undefined, {
    workflowPath: file.path, workflowName: file.basename, recordHistory: false,
    abortSignal: request.abortSignal ?? new AbortController().signal,
  }, headlessCallbacks());
  const text = extract(execution.context.variables, request.outputVariable);
  if (text == null) throw new Error("Workflow output is not a string. Store it in `result`, or set Output variable.");
  return text;
}

async function generate(plugin: GeminiHelperPlugin, modelId: string, prompt: string, systemPrompt: string, signal?: AbortSignal, vaultRead = false): Promise<string> {
  if (!plugin.settings.googleApiKey) throw new Error("Gemini API key is not configured.");
  const client = new GeminiClient(plugin.settings.googleApiKey, modelId as ModelType);
  const messages: Message[] = [{ role: "user", content: prompt, timestamp: Date.now() }];
  const tools = vaultRead ? getEnabledTools({ allowWrite: false, allowDelete: false, ragEnabled: false }) : [];
  const execute = vaultRead ? createToolExecutor(plugin.app, { listNotesLimit: plugin.settings.listNotesLimit, maxNoteChars: plugin.settings.maxNoteChars,
    limitAiVaultToolScope: true, aiVaultToolAllowedFolders: plugin.settings.aiVaultToolAllowedFolders }) : undefined;
  const stream = client.chatWithToolsStream(messages, tools, systemPrompt, execute, undefined, false, { functionCallLimits: { maxFunctionCalls: 12 }, enableThinking: true, traceId: null });
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
function stripFence(text: string): string { return text.replace(/^\s*```(?:ya?ml)?\s*/i, "").replace(/\s*```\s*$/, "").trim(); }
function baseSystem(): string { const skill = loadBuiltinSkill(builtinFolderPath("base")); return `Return only valid Obsidian Bases YAML. Use read-only Vault tools to verify properties when available.\n\n${skill ? `${skill.instructions}\n${skill.references.join("\n\n")}` : ""}`; }

export async function generateDashboardBase(plugin: GeminiHelperPlugin, request: BaseRequest): Promise<string> {
  const source = request.previousResult || request.currentYaml;
  const prompt = source ? `Revise this Base.\nInstruction: ${request.instruction}\n\nCurrent YAML:\n${source}` : `Create an Obsidian Base.\nInstruction: ${request.instruction}`;
  return stripFence(await generate(plugin, request.modelId, prompt, baseSystem(), request.abortSignal, request.allowVaultRead));
}
export function rewriteDashboardText(plugin: GeminiHelperPlugin, request: RewriteRequest): Promise<string> {
  return generate(plugin, request.modelId, `Instruction: ${request.instruction}\n\nText:\n${request.previousResult || request.content}`,
    `Rewrite the ${request.context} text. Return only the rewritten text.`, request.abortSignal);
}
export function generateDashboardWorkflow(plugin: GeminiHelperPlugin, request: WorkflowGenerationRequest): Promise<string> {
  const source = request.previousResult || request.currentMarkdown;
  return generate(plugin, request.modelId,
    `${request.mode === "modify" ? "Revise" : "Create"} an unattended Obsidian Workflow.\nInstruction: ${request.instruction}\nOutput ${request.outputContract.format} to ${request.outputContract.outputVariable}.${source ? `\n\nCurrent workflow:\n${source}` : ""}`,
    `Return only a complete Markdown document containing a workflow YAML block. Do not use interactive nodes.\n\n${WORKFLOW_SPECIFICATION}`,
    request.abortSignal, request.allowVaultRead);
}
