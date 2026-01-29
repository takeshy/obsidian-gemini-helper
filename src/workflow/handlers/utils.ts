import { ExecutionContext, ParsedCondition, ComparisonOperator } from "../types";

/**
 * Error thrown when user requests content regeneration from a note confirmation dialog
 * The executor should catch this and re-run the previous command node
 */
export class RegenerateRequestError extends Error {
  constructor(message: string = "Regeneration requested") {
    super(message);
    this.name = "RegenerateRequestError";
  }
}

// Get value from object/JSON string using dot notation path
export function getNestedValue(data: unknown, path: string, context?: ExecutionContext): unknown {
  const parts = path.split(".");
  let current: unknown = data;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // Handle array index notation like "items[0]" or "items[index]"
    const arrayMatch = part.match(/^(\w+)\[(\w+)\]$/);
    if (arrayMatch) {
      current = (current as Record<string, unknown>)[arrayMatch[1]];
      if (Array.isArray(current)) {
        // Resolve index - could be a number or a variable name
        const indexStr = arrayMatch[2];
        let indexValue: number;
        if (/^\d+$/.test(indexStr)) {
          indexValue = parseInt(indexStr, 10);
        } else if (context) {
          // It's a variable name, resolve it
          const resolvedIndex = context.variables.get(indexStr);
          if (resolvedIndex === undefined) {
            return undefined;
          }
          indexValue = typeof resolvedIndex === "number"
            ? resolvedIndex
            : parseInt(String(resolvedIndex), 10);
          if (isNaN(indexValue)) {
            return undefined;
          }
        } else {
          return undefined;
        }
        current = current[indexValue];
      } else {
        return undefined;
      }
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

// JSON-escape a string value (for embedding in JSON strings)
export function jsonEscapeString(value: string): string {
  // Use JSON.stringify and remove the surrounding quotes
  return JSON.stringify(value).slice(1, -1);
}

// Replace {{variable}} or {{variable.path.to.value}} placeholders with actual values
export function replaceVariables(
  template: string,
  context: ExecutionContext
): string {
  // Loop until no more replacements are made (handles nested variables like {{arr[{{i}}].value}})
  let result = template;
  let previousResult = "";
  let iterations = 0;
  const maxIterations = 10; // Prevent infinite loops

  while (result !== previousResult && iterations < maxIterations) {
    previousResult = result;
    iterations++;

    // Match {{varName}} or {{varName.path.to.value}} or {{varName.items[0].name}}
    // Also supports {{varName:json}} modifier for JSON-escaping the value
    result = result.replace(/\{\{([\w.[\]]+)(:json)?\}\}/g, (match, fullPath, jsonModifier) => {
    const shouldJsonEscape = jsonModifier === ":json";
    // Check if it's a simple variable or a path
    const dotIndex = fullPath.indexOf(".");
    const bracketIndex = fullPath.indexOf("[");
    const firstSpecialIndex = Math.min(
      dotIndex === -1 ? Infinity : dotIndex,
      bracketIndex === -1 ? Infinity : bracketIndex
    );

    if (firstSpecialIndex === Infinity) {
      // Simple variable name
      const value = context.variables.get(fullPath);
      if (value !== undefined) {
        const strValue = String(value);
        return shouldJsonEscape ? jsonEscapeString(strValue) : strValue;
      }
      return match;
    }

    // It's a path like "varName.path.to.value"
    const varName = fullPath.substring(0, firstSpecialIndex);
    const restPath = fullPath.substring(
      firstSpecialIndex + (fullPath[firstSpecialIndex] === "." ? 1 : 0)
    );

    const varValue = context.variables.get(varName);
    if (varValue === undefined) {
      return match;
    }

    // Try to parse as JSON if it's a string
    let parsedValue: unknown;
    if (typeof varValue === "string") {
      try {
        // Try to extract JSON from markdown code block if present
        let jsonString = varValue;
        const codeBlockMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
          jsonString = codeBlockMatch[1].trim();
        }
        parsedValue = JSON.parse(jsonString);
      } catch {
        // Not valid JSON, try treating the whole path as a variable
        return match;
      }
    } else {
      parsedValue = varValue;
    }

    // Navigate the path
    const pathToNavigate =
      fullPath[firstSpecialIndex] === "["
        ? fullPath.substring(varName.length) // Keep the bracket
        : restPath;

    // For bracket notation at root, we need special handling
    if (fullPath[firstSpecialIndex] === "[") {
      // Match both numeric indices [0] and variable indices [index]
      const arrayMatch = pathToNavigate.match(/^\[(\w+)\](.*)$/);
      if (arrayMatch && Array.isArray(parsedValue)) {
        // Resolve index - could be a number or a variable name
        let indexValue: number;
        const indexStr = arrayMatch[1];
        if (/^\d+$/.test(indexStr)) {
          indexValue = parseInt(indexStr, 10);
        } else {
          // It's a variable name, resolve it
          const resolvedIndex = context.variables.get(indexStr);
          if (resolvedIndex === undefined) {
            return match;
          }
          indexValue = typeof resolvedIndex === "number"
            ? resolvedIndex
            : parseInt(String(resolvedIndex), 10);
          if (isNaN(indexValue)) {
            return match;
          }
        }

        let result: unknown = parsedValue[indexValue];
        if (arrayMatch[2]) {
          // There's more path after the index
          const remainingPath = arrayMatch[2].startsWith(".")
            ? arrayMatch[2].substring(1)
            : arrayMatch[2];
          if (remainingPath) {
            result = getNestedValue(result, remainingPath, context);
          }
        }
        if (result !== undefined) {
          let strResult: string;
          if (typeof result === "object") {
            strResult = JSON.stringify(result);
          } else if (typeof result === "string" || typeof result === "number" || typeof result === "boolean") {
            strResult = String(result);
          } else {
            strResult = JSON.stringify(result);
          }
          return shouldJsonEscape ? jsonEscapeString(strResult) : strResult;
        }
      }
      return match;
    }

    const nestedValue = getNestedValue(parsedValue, restPath, context);
    if (nestedValue !== undefined) {
      let strResult: string;
      if (typeof nestedValue === "object") {
        strResult = JSON.stringify(nestedValue);
      } else if (typeof nestedValue === "string" || typeof nestedValue === "number" || typeof nestedValue === "boolean") {
        strResult = String(nestedValue);
      } else {
        strResult = JSON.stringify(nestedValue);
      }
      return shouldJsonEscape ? jsonEscapeString(strResult) : strResult;
    }

    return match;
    });
  }

  return result;
}

// Parse a simple condition expression
export function parseCondition(condition: string): ParsedCondition | null {
  // Match patterns like: {{counter}} < 10, {{status}} == "end", {{text}} contains "error"
  const operators: ComparisonOperator[] = [
    "==",
    "!=",
    "<=",
    ">=",
    "<",
    ">",
    "contains",
  ];

  for (const op of operators) {
    const parts = condition.split(op);
    if (parts.length === 2) {
      return {
        left: parts[0].trim(),
        operator: op,
        right: parts[1].trim(),
      };
    }
  }

  return null;
}

// Evaluate a parsed condition
export function evaluateCondition(
  condition: ParsedCondition,
  context: ExecutionContext
): boolean {
  // Replace variables in left and right sides
  let left = replaceVariables(condition.left, context);
  let right = replaceVariables(condition.right, context);

  // Remove quotes from string values
  left = left.replace(/^["'](.*)["']$/, "$1");
  right = right.replace(/^["'](.*)["']$/, "$1");

  // Try to convert to numbers for numeric comparisons
  const leftNum = parseFloat(left);
  const rightNum = parseFloat(right);
  const bothNumbers = !isNaN(leftNum) && !isNaN(rightNum);

  switch (condition.operator) {
    case "==":
      return bothNumbers ? leftNum === rightNum : left === right;
    case "!=":
      return bothNumbers ? leftNum !== rightNum : left !== right;
    case "<":
      return bothNumbers ? leftNum < rightNum : left < right;
    case ">":
      return bothNumbers ? leftNum > rightNum : left > right;
    case "<=":
      return bothNumbers ? leftNum <= rightNum : left <= right;
    case ">=":
      return bothNumbers ? leftNum >= rightNum : left >= right;
    case "contains":
      // Check if left is a JSON array and right is in it
      try {
        const leftParsed = JSON.parse(left);
        if (Array.isArray(leftParsed)) {
          return leftParsed.includes(right);
        }
      } catch {
        // Not JSON, fall through to string check
      }
      // String contains check
      return left.includes(right);
    default:
      return false;
  }
}

// Increment a numeric variable (useful for loop counters)
export function incrementVariable(
  varName: string,
  context: ExecutionContext,
  amount: number = 1
): void {
  const current = context.variables.get(varName);
  if (typeof current === "number") {
    context.variables.set(varName, current + amount);
  } else if (typeof current === "string") {
    const num = parseFloat(current);
    if (!isNaN(num)) {
      context.variables.set(varName, num + amount);
    }
  }
}
