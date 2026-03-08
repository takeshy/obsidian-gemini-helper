/**
 * Script node handler.
 * Executes JavaScript code in a sandboxed iframe and saves the result to a variable.
 */
import type { WorkflowNode, ExecutionContext } from "../types";
import { replaceVariables } from "./utils";
import { executeSandboxedJS } from "../../core/sandboxExecutor";

const DEFAULT_TIMEOUT = 10_000;

export async function handleScriptNode(
  node: WorkflowNode,
  context: ExecutionContext,
): Promise<void> {
  const codeTemplate = node.properties["code"];
  if (!codeTemplate) throw new Error("Script node missing 'code' property");

  const code = replaceVariables(codeTemplate, context);
  const saveTo = node.properties["saveTo"];

  const timeoutStr = node.properties["timeout"];
  const timeout = timeoutStr ? parseInt(timeoutStr, 10) || DEFAULT_TIMEOUT : DEFAULT_TIMEOUT;

  const result = await executeSandboxedJS(code, undefined, timeout);

  if (saveTo) {
    context.variables.set(saveTo, result);
  }
}
