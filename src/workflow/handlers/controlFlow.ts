import { WorkflowNode, ExecutionContext } from "../types";
import { replaceVariables, parseCondition, evaluateCondition } from "./utils";
import { formatError } from "../../utils/error";

// Handle variable node (initial declaration)
export function handleVariableNode(
  node: WorkflowNode,
  context: ExecutionContext
): void {
  const name = node.properties["name"];
  const value: string | number = replaceVariables(
    node.properties["value"] || "",
    context
  );

  // Try to parse as number
  const numValue = parseFloat(value);
  if (!isNaN(numValue) && value === String(numValue)) {
    context.variables.set(name, numValue);
  } else {
    context.variables.set(name, value);
  }
}

// Evaluate simple arithmetic expression
function evaluateExpression(
  expr: string,
  context: ExecutionContext
): number | string {
  // Replace variables first
  const replaced = replaceVariables(expr, context);

  // Try to evaluate as arithmetic expression
  // Supported: +, -, *, /, %
  const arithmeticMatch = replaced.match(
    /^(-?\d+(?:\.\d+)?)\s*([+\-*/%])\s*(-?\d+(?:\.\d+)?)$/
  );
  if (arithmeticMatch) {
    const left = parseFloat(arithmeticMatch[1]);
    const operator = arithmeticMatch[2];
    const right = parseFloat(arithmeticMatch[3]);

    switch (operator) {
      case "+":
        return left + right;
      case "-":
        return left - right;
      case "*":
        return left * right;
      case "/":
        return right !== 0 ? left / right : 0;
      case "%":
        return left % right;
    }
  }

  // Try as simple number
  const num = parseFloat(replaced);
  if (!isNaN(num) && replaced === String(num)) {
    return num;
  }

  // Return as string
  return replaced;
}

// Handle set node (update existing variable)
export async function handleSetNode(
  node: WorkflowNode,
  context: ExecutionContext
): Promise<void> {
  const name = node.properties["name"];
  const expr = node.properties["value"] || "";

  if (!name) {
    throw new Error("Set node missing 'name' property");
  }

  const result = evaluateExpression(expr, context);
  context.variables.set(name, result);

  // Special handling for _clipboard: copy to system clipboard
  if (name === "_clipboard") {
    try {
      await navigator.clipboard.writeText(String(result));
    } catch (error) {
      console.error("Failed to write to clipboard:", formatError(error));
    }
  }
}

// Handle if node - returns condition result
export function handleIfNode(
  node: WorkflowNode,
  context: ExecutionContext
): boolean {
  const conditionStr = node.properties["condition"] || "";
  const condition = parseCondition(conditionStr);

  if (!condition) {
    throw new Error(`Invalid condition format: ${conditionStr}`);
  }

  return evaluateCondition(condition, context);
}

// Handle while node - returns condition result
export function handleWhileNode(
  node: WorkflowNode,
  context: ExecutionContext
): boolean {
  const conditionStr = node.properties["condition"] || "";
  const condition = parseCondition(conditionStr);

  if (!condition) {
    throw new Error(`Invalid condition format: ${conditionStr}`);
  }

  return evaluateCondition(condition, context);
}

// Handle sleep node - pause execution for specified duration
export async function handleSleepNode(
  node: WorkflowNode,
  context: ExecutionContext
): Promise<void> {
  const durationStr = replaceVariables(node.properties["duration"] || "0", context);
  const duration = parseInt(durationStr, 10);
  if (duration > 0) {
    await new Promise(resolve => setTimeout(resolve, duration));
  }
}
