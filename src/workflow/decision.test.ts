import { beforeEach, describe, expect, it, vi } from "vitest";
import { geminiCorsFetch } from "obsidian-llm-hub-common/core";
import { WorkflowExecutor, configureWorkflowHost, workflowHost, parseWorkflowFromMarkdown, type NodeRequest } from "obsidian-llm-hub-common/workflow";
import type { App } from "obsidian";
import { DEFAULT_SETTINGS } from "../types";
import type { GeminiHelperPlugin } from "../plugin";
import { getDecisionModelOptions, handleDecisionNode } from "./handlers/decision";

vi.mock("obsidian-llm-hub-common/core", async original => ({ ...await original<object>(), geminiCorsFetch: vi.fn() }));
vi.mock("obsidian", async original => ({ ...await original<object>(), parseYaml: JSON.parse }));
const settings = { ...DEFAULT_SETTINGS, googleApiKey: " gemini-only-key " };
const plugin = { settings } as GeminiHelperPlugin;
const request = (properties: Record<string, string>): NodeRequest => ({
  node: { id: "judge", type: "decision", canvasNodeId: "judge", properties },
  context: { variables: new Map([["text", "Please help now"]]), logs: [] }, app: {} as App,
});
beforeEach(() => { vi.mocked(geminiCorsFetch).mockReset(); });

describe("Gemini decision workflow node", () => {
  it("offers only the fixed decision model when an API key exists", () => {
    expect(getDecisionModelOptions(settings)).toEqual([{ value: "gemini-decision-1", label: "Gemini / gemini-decision-1" }]);
    expect(getDecisionModelOptions({ googleApiKey: " " })).toEqual([]);
  });
  it.each(["true", "false"])("interpolates evidence and returns a strict choice (%s)", async choice => {
    vi.mocked(geminiCorsFetch).mockResolvedValue(new Response(JSON.stringify({ answers: { decision: { type: "choice", choice } } })));
    expect(await handleDecisionNode(request({ prompt: "Is the request urgent?", input: "{{text}}" }), plugin)).toBe(choice === "true");
    const [url, init] = vi.mocked(geminiCorsFetch).mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/decisions");
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("gemini-only-key");
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: "gemini-decision-1", input: [{ type: "text", text: "Please help now" }] });
  });
  it("rejects chat-model overrides and missing credentials before fetching", async () => {
    expect(() => handleDecisionNode(request({ prompt: "Question", model: "gemini-3.8-flash" }), plugin)).toThrow("Unsupported decision model");
    await expect(handleDecisionNode(request({ prompt: "Question" }), { settings: DEFAULT_SETTINGS } as GeminiHelperPlugin)).rejects.toThrow("not configured");
    expect(geminiCorsFetch).not.toHaveBeenCalled();
  });
  it.each([true, false])("parses the node and executes only the chosen branch (%s)", async choice => {
    const previous = workflowHost();
    vi.mocked(geminiCorsFetch).mockResolvedValue(new Response(JSON.stringify({ answers: { decision: { type: "choice", choice: String(choice) } } })));
    configureWorkflowHost({ ...previous, runDecisionNode: node => handleDecisionNode(node, plugin) });
    try {
      const workflow = parseWorkflowFromMarkdown('```hub-workflow\n' + JSON.stringify({ nodes: [
        { id: "judge", type: "decision", prompt: "Urgent?", input: "{{text}}", saveTo: "answer", trueNext: "yes", falseNext: "no" },
        { id: "yes", type: "variable", name: "route", value: "urgent", next: "end" },
        { id: "no", type: "variable", name: "route", value: "normal", next: "end" },
      ] }) + '\n```');
      const result = await new WorkflowExecutor({} as App).execute(workflow, { variables: new Map([["text", "Please help now"]]) });
      expect(result.context.variables.get("answer")).toBe(String(choice));
      expect(result.context.variables.get("route")).toBe(choice ? "urgent" : "normal");
    } finally { configureWorkflowHost(previous); }
  });
});

describe("typed Gemini decisions", () => {
  it.each([
    { decisionType: "score", criteria: JSON.stringify(["Low", "Medium", "High"]), answer: { type: "score", score: 1.8 }, expected: 1.8 },
    { decisionType: "choice", criteria: JSON.stringify({ urgent: "Needs action", normal: "Can wait" }), answer: { type: "choice", choice: "urgent" }, expected: "urgent" },
    { decisionType: "noul", answer: { type: "noul", noul: 0.99 }, expected: 0.99 },
  ])("preserves the $decisionType result", async test => {
    vi.mocked(geminiCorsFetch).mockResolvedValue(new Response(JSON.stringify({ answers: { decision: test.answer } })));
    const properties: Record<string, string> = { decisionType: test.decisionType, prompt: "Evaluate", input: "{{text}}" };
    if (test.criteria) properties.criteria = test.criteria;
    expect(await handleDecisionNode(request(properties), plugin)).toBe(test.expected);
  });
  it("returns all named results from one mixed-question API call", async () => {
    const questions = {
      refund: { type: "noul", instructions: "Requests a refund" },
      category: { type: "choice", instructions: "Classify", criteria: { refund: "Refund", other: "Other" } },
      urgency: { type: "score", instructions: "Rate urgency", criteria: ["Low", "Medium", "High"] },
    };
    vi.mocked(geminiCorsFetch).mockResolvedValue(new Response(JSON.stringify({ answers: {
      refund: { type: "noul", noul: 0.99 }, category: { type: "choice", choice: "refund" }, urgency: { type: "score", score: 1.8 },
    } })));
    expect(await handleDecisionNode(request({ decisionType: "batch", input: "{{text}}", questions: JSON.stringify(questions) }), plugin))
      .toEqual({ refund: 0.99, category: "refund", urgency: 1.8 });
    expect(geminiCorsFetch).toHaveBeenCalledOnce();
    const body = JSON.parse(String(vi.mocked(geminiCorsFetch).mock.calls[0][1]?.body));
    expect(body.model).toBe("gemini-decision-1");
    expect(Object.keys(body.questions)).toEqual(Object.keys(questions));
  });
});
