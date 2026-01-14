import { App, TFile, requestUrl } from "obsidian";
import type { GeminiHelperPlugin } from "../plugin";
import { getGeminiClient } from "../core/gemini";
import { getFileSearchManager } from "../core/fileSearch";
import { getEditHistoryManager } from "../core/editHistory";
import { CliProviderManager } from "../core/cliProvider";
import { isImageGenerationModel, type ModelType } from "../types";
import { McpClient } from "../core/mcpClient";
import {
  WorkflowNode,
  ExecutionContext,
  ParsedCondition,
  ComparisonOperator,
  PromptCallbacks,
  FileExplorerData,
} from "./types";

// Get value from object/JSON string using dot notation path
function getNestedValue(data: unknown, path: string, context?: ExecutionContext): unknown {
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
    result = result.replace(/\{\{([\w.[\]]+)\}\}/g, (match, fullPath) => {
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
        return String(value);
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
          if (typeof result === "object") {
            return JSON.stringify(result);
          } else if (typeof result === "string" || typeof result === "number" || typeof result === "boolean") {
            return String(result);
          }
          return JSON.stringify(result);
        }
      }
      return match;
    }

    const nestedValue = getNestedValue(parsedValue, restPath, context);
    if (nestedValue !== undefined) {
      if (typeof nestedValue === "object") {
        return JSON.stringify(nestedValue);
      } else if (typeof nestedValue === "string" || typeof nestedValue === "number" || typeof nestedValue === "boolean") {
        return String(nestedValue);
      }
      return JSON.stringify(nestedValue);
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
      return left.includes(right);
    default:
      return false;
  }
}

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
      console.error("Failed to write to clipboard:", error);
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

// Handle command node - execute LLM with prompt directly
export async function handleCommandNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App,
  plugin: GeminiHelperPlugin
): Promise<void> {
  const promptTemplate = node.properties["prompt"];
  if (!promptTemplate) {
    throw new Error("Command node missing 'prompt' property");
  }

  // Replace variables in prompt
  const prompt = replaceVariables(promptTemplate, context);

  // Get model (use node's model or current selection)
  const modelName = node.properties["model"] || "";
  // Cast to ModelType - if invalid, it will use default
  const model = (modelName || plugin.getSelectedModel()) as import("../types").ModelType;

  // Check if this is a CLI model
  const isCliModel = model === "gemini-cli" || model === "claude-cli" || model === "codex-cli";

  if (isCliModel) {
    // Use CLI provider for CLI models
    const cliManager = new CliProviderManager();
    const providerName = model === "claude-cli" ? "claude-cli" : model === "codex-cli" ? "codex-cli" : "gemini-cli";
    const provider = cliManager.getProvider(providerName);

    if (!provider) {
      throw new Error(`CLI provider ${providerName} not available`);
    }

    // Build messages
    const messages = [
      {
        role: "user" as const,
        content: prompt,
        timestamp: Date.now(),
      },
    ];

    // Get vault path as working directory
    const vaultPath = (app.vault.adapter as { basePath?: string }).basePath || "";

    // Execute CLI call
    let fullResponse = "";
    const stream = provider.chatStream(messages, "", vaultPath);

    for await (const chunk of stream) {
      if (chunk.type === "text") {
        fullResponse += chunk.content;
      } else if (chunk.type === "error") {
        throw new Error(chunk.error);
      }
    }

    // Save response to variable if specified
    const saveTo = node.properties["saveTo"];
    if (saveTo) {
      context.variables.set(saveTo, fullResponse);
    }
    return;
  }

  // Non-CLI model: use GeminiClient
  // Get RAG setting
  // undefined/"" = use current, "__none__" = no RAG, "__websearch__" = web search, other = setting name
  const ragSettingName = node.properties["ragSetting"];
  let storeIds: string[] = [];
  let useWebSearch = false;

  if (ragSettingName === "__websearch__") {
    // Web search mode
    useWebSearch = true;
  } else if (ragSettingName === "__none__") {
    // Explicitly no RAG - storeIds stays empty
  } else if (ragSettingName && ragSettingName !== "") {
    // Specific RAG setting
    const ragSetting = plugin.workspaceState.ragSettings[ragSettingName];
    if (ragSetting) {
      if (ragSetting.isExternal && ragSetting.storeIds.length > 0) {
        storeIds = ragSetting.storeIds;
      } else if (ragSetting.storeId) {
        storeIds = [ragSetting.storeId];
      }
    }
  } else if (ragSettingName === undefined) {
    // Use current RAG setting
    const currentSetting = plugin.getSelectedRagSetting();
    if (currentSetting) {
      if (currentSetting.isExternal && currentSetting.storeIds.length > 0) {
        storeIds = currentSetting.storeIds;
      } else if (currentSetting.storeId) {
        storeIds = [currentSetting.storeId];
      }
    }
  }
  // If ragSettingName === "", use no RAG (storeIds stays empty)

  // Image generation models don't support RAG (File Search)
  // gemini-2.5-flash-image: no tools at all
  // gemini-3-pro-image-preview: only Web Search
  if (isImageGenerationModel(model as ModelType)) {
    storeIds = []; // Disable RAG
    if (model === "gemini-2.5-flash-image") {
      useWebSearch = false; // No tools supported
    }
  }

  // Get GeminiClient
  const client = getGeminiClient();
  if (!client) {
    throw new Error("GeminiClient not initialized");
  }
  client.setModel(model);

  // Parse attachments property (comma-separated variable names containing FileExplorerData)
  const attachmentsStr = node.properties["attachments"] || "";
  const attachments: import("../types").Attachment[] = [];

  if (attachmentsStr) {
    const varNames = attachmentsStr.split(",").map((s) => s.trim()).filter((s) => s);
    for (const varName of varNames) {
      const varValue = context.variables.get(varName);
      if (varValue && typeof varValue === "string") {
        try {
          const fileData: FileExplorerData = JSON.parse(varValue);
          if (fileData.contentType === "binary" && fileData.data) {
            // Determine attachment type from MIME type
            let attachmentType: "image" | "pdf" | "text" = "text";
            if (fileData.mimeType.startsWith("image/")) {
              attachmentType = "image";
            } else if (fileData.mimeType === "application/pdf") {
              attachmentType = "pdf";
            }
            attachments.push({
              name: fileData.basename,
              type: attachmentType,
              mimeType: fileData.mimeType,
              data: fileData.data,
            });
          }
          // Text files are already included via variable substitution in the prompt
        } catch {
          // Not valid FileExplorerData JSON, skip
        }
      }
    }
  }

  // Build messages
  const messages = [
    {
      role: "user" as const,
      content: prompt,
      timestamp: Date.now(),
      attachments: attachments.length > 0 ? attachments : undefined,
    },
  ];

  // Execute LLM call - use generateImageStream for image models
  let fullResponse = "";
  const generatedImages: Array<{ mimeType: string; data: string }> = [];
  const isImageModel = isImageGenerationModel(model as ModelType);

  const stream = isImageModel
    ? client.generateImageStream(
        messages,
        model as ModelType,
        undefined, // No system prompt for image generation
        useWebSearch,
        storeIds.length > 0 ? storeIds : undefined
      )
    : client.chatWithToolsStream(
        messages,
        [], // No tools for workflow command
        undefined, // No system prompt
        undefined, // No executeToolCall
        storeIds.length > 0 ? storeIds : undefined, // RAG store IDs
        useWebSearch, // Web search mode
        undefined // No options
      );

  for await (const chunk of stream) {
    if (chunk.type === "text") {
      fullResponse += chunk.content;
    } else if (chunk.type === "image_generated" && chunk.generatedImage) {
      generatedImages.push(chunk.generatedImage);
    } else if (chunk.type === "error") {
      throw new Error(chunk.content);
    } else if (chunk.type === "done") {
      break;
    }
  }

  // Save response to variable if specified
  const saveTo = node.properties["saveTo"];
  if (saveTo) {
    context.variables.set(saveTo, fullResponse);
  }

  // Save generated images to variable if specified
  const saveImageTo = node.properties["saveImageTo"];
  if (saveImageTo && generatedImages.length > 0) {
    // Convert to FileExplorerData format for consistency with file-explorer node
    const imageDataList: FileExplorerData[] = generatedImages.map((img, index) => {
      const extension = img.mimeType.split("/")[1] || "png";
      const filename = `generated-image-${index + 1}.${extension}`;
      return {
        path: filename,
        basename: filename,
        name: `generated-image-${index + 1}`,
        extension,
        mimeType: img.mimeType,
        contentType: "binary" as const,
        data: img.data,
      };
    });

    // If single image, save as single object; if multiple, save as array
    if (imageDataList.length === 1) {
      context.variables.set(saveImageTo, JSON.stringify(imageDataList[0]));
    } else {
      context.variables.set(saveImageTo, JSON.stringify(imageDataList));
    }
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

// Decode base64 string to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Try to parse FileExplorerData from string
function tryParseFileExplorerData(value: string): FileExplorerData | null {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && "contentType" in parsed && "data" in parsed && "mimeType" in parsed) {
      return parsed as FileExplorerData;
    }
  } catch {
    // Not JSON or not FileExplorerData
  }
  return null;
}

// Build multipart/form-data body with binary support
function buildMultipartBodyBinary(
  fields: Record<string, string>,
  boundary: string
): ArrayBuffer {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];

  for (const [name, value] of Object.entries(fields)) {
    // Check if value is FileExplorerData JSON (from file-explorer node)
    const fileData = tryParseFileExplorerData(value);

    let headerStr = `--${boundary}\r\n`;

    // Check if this looks like a file upload (has filename in field name)
    // Format: "fieldName" for regular fields, or "fieldName:filename" for files
    const colonIndex = name.indexOf(":");

    if (fileData) {
      // FileExplorerData: use its metadata for Content-Disposition
      const fieldName = colonIndex !== -1 ? name.substring(0, colonIndex) : name;
      const filename = fileData.basename;
      headerStr += `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n`;
      headerStr += `Content-Type: ${fileData.mimeType}\r\n\r\n`;
      parts.push(encoder.encode(headerStr));

      // Add binary or text data
      if (fileData.contentType === "binary" && fileData.data) {
        parts.push(base64ToUint8Array(fileData.data));
      } else {
        parts.push(encoder.encode(fileData.data));
      }
      parts.push(encoder.encode("\r\n"));
    } else if (colonIndex !== -1) {
      // File field with explicit filename: "file:filename.html"
      const fieldName = name.substring(0, colonIndex);
      const filename = name.substring(colonIndex + 1);
      const contentType = guessContentType(filename);
      headerStr += `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n`;
      headerStr += `Content-Type: ${contentType}\r\n\r\n`;
      parts.push(encoder.encode(headerStr));
      parts.push(encoder.encode(value));
      parts.push(encoder.encode("\r\n"));
    } else {
      // Regular field
      headerStr += `Content-Disposition: form-data; name="${name}"\r\n\r\n`;
      parts.push(encoder.encode(headerStr));
      parts.push(encoder.encode(value));
      parts.push(encoder.encode("\r\n"));
    }
  }

  // Final boundary
  parts.push(encoder.encode(`--${boundary}--\r\n`));

  // Concatenate all parts
  const totalLength = parts.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result.buffer;
}

// Guess content type from filename
function guessContentType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  const types: Record<string, string> = {
    html: "text/html",
    htm: "text/html",
    txt: "text/plain",
    json: "application/json",
    xml: "application/xml",
    css: "text/css",
    js: "application/javascript",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
  };
  return types[ext || ""] || "application/octet-stream";
}

// Handle HTTP request node
export async function handleHttpNode(
  node: WorkflowNode,
  context: ExecutionContext
): Promise<void> {
  const url = replaceVariables(node.properties["url"] || "", context);
  const method = (node.properties["method"] || "GET").toUpperCase();
  const contentType = node.properties["contentType"] || "json"; // json, form-data, text

  if (!url) {
    throw new Error("HTTP node missing 'url' property");
  }

  // Build headers - only add Content-Type for requests with body
  const headers: Record<string, string> = {};

  // Parse custom headers (format: "Key: Value" per line or JSON)
  const headersStr = node.properties["headers"];
  if (headersStr) {
    const replacedHeaders = replaceVariables(headersStr, context);
    try {
      // Try parsing as JSON first
      const parsedHeaders = JSON.parse(replacedHeaders);
      Object.assign(headers, parsedHeaders);
    } catch {
      // Parse as "Key: Value" format
      const lines = replacedHeaders.split("\n");
      for (const line of lines) {
        const colonIndex = line.indexOf(":");
        if (colonIndex !== -1) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();
          if (key) {
            headers[key] = value;
          }
        }
      }
    }
  }

  // Build body based on contentType
  let body: string | ArrayBuffer | undefined;
  const bodyStr = node.properties["body"];

  if (bodyStr && (method === "POST" || method === "PUT" || method === "PATCH")) {
    if (contentType === "form-data") {
      // Build multipart/form-data body with binary support
      // For form-data, parse JSON first, then replace variables in each field
      // This prevents variable content (like HTML) from breaking JSON parsing
      try {
        const rawFields = JSON.parse(bodyStr);
        const fields: Record<string, string> = {};
        for (const [key, value] of Object.entries(rawFields)) {
          // Replace variables in key and value separately
          const expandedKey = replaceVariables(key, context);
          const expandedValue = replaceVariables(String(value), context);
          fields[expandedKey] = expandedValue;
        }
        const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
        body = buildMultipartBodyBinary(fields, boundary);
        headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
      } catch {
        throw new Error("form-data contentType requires body to be a valid JSON object");
      }
    } else if (contentType === "text") {
      // Plain text body
      body = replaceVariables(bodyStr, context);
      if (!headers["Content-Type"]) {
        headers["Content-Type"] = "text/plain";
      }
    } else {
      // Default: JSON body
      body = replaceVariables(bodyStr, context);
      if (!headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
    }
  }

  // Make HTTP request using Obsidian's requestUrl (avoids CORS issues)
  let response;
  try {
    const requestOptions: Parameters<typeof requestUrl>[0] = {
      url,
      method,
    };

    // Only add headers if there are any
    if (Object.keys(headers).length > 0) {
      requestOptions.headers = headers;
    }

    // Only add body for appropriate methods
    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      requestOptions.body = body;
    }

    response = await requestUrl(requestOptions);
  } catch (err) {
    // Network error or other fetch failure
    const errorMessage = err instanceof Error ? err.message : String(err);
    throw new Error(`HTTP request failed: ${method} ${url} - ${errorMessage}`);
  }

  // Get response text
  const responseText = response.text;

  // Try to parse as JSON for better handling
  let responseData: string;
  try {
    const jsonData = JSON.parse(responseText);
    responseData = JSON.stringify(jsonData);
  } catch {
    responseData = responseText;
  }

  // Save response to variable if specified
  const saveTo = node.properties["saveTo"];
  if (saveTo) {
    context.variables.set(saveTo, responseData);
  }

  // Save status code if specified
  const saveStatus = node.properties["saveStatus"];
  if (saveStatus) {
    context.variables.set(saveStatus, response.status);
  }

  // Throw error if response is not ok and throwOnError is set
  if (response.status >= 400 && node.properties["throwOnError"] === "true") {
    throw new Error(`HTTP ${response.status} ${method} ${url}: ${responseText}`);
  }
}

// Handle JSON parse node - parse string to JSON object
export function handleJsonNode(
  node: WorkflowNode,
  context: ExecutionContext
): void {
  const sourceVar = node.properties["source"];
  const saveTo = node.properties["saveTo"];

  if (!sourceVar) {
    throw new Error("JSON node missing 'source' property");
  }
  if (!saveTo) {
    throw new Error("JSON node missing 'saveTo' property");
  }

  // Get the source string
  const sourceValue = context.variables.get(sourceVar);
  if (sourceValue === undefined) {
    throw new Error(`Variable '${sourceVar}' not found`);
  }

  let jsonString = String(sourceValue);

  // Extract JSON from markdown code block if present
  const codeBlockMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonString = codeBlockMatch[1].trim();
  }

  // Parse JSON and save as string (for consistent storage)
  try {
    const parsed = JSON.parse(jsonString);
    // Store as JSON string so it can be accessed with dot notation
    context.variables.set(saveTo, JSON.stringify(parsed));
  } catch (e) {
    throw new Error(`Failed to parse JSON from '${sourceVar}': ${e instanceof Error ? e.message : String(e)}`);
  }
}

// Helper function to create file info object from path
function createFileInfo(filePath: string): { path: string; basename: string; name: string; extension: string } {
  const parts = filePath.split("/");
  const basename = parts[parts.length - 1];
  const lastDotIndex = basename.lastIndexOf(".");
  const name = lastDotIndex > 0 ? basename.substring(0, lastDotIndex) : basename;
  const extension = lastDotIndex > 0 ? basename.substring(lastDotIndex + 1) : "";
  return { path: filePath, basename, name, extension };
}

// Handle prompt-file node - show file picker dialog or use active file in hotkey mode
// In hotkey mode: Uses __hotkeyActiveFile__ to auto-select active file without dialog
// In panel mode: Shows file picker dialog
// Set forcePrompt: "true" to always show the file picker dialog
// saveTo: stores file content, saveFileTo: stores file info JSON
export async function handlePromptFileNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App,
  promptCallbacks?: PromptCallbacks
): Promise<void> {
  const defaultPath = replaceVariables(
    node.properties["default"] || "",
    context
  );
  const saveTo = node.properties["saveTo"];
  const saveFileTo = node.properties["saveFileTo"];
  const forcePrompt = node.properties["forcePrompt"] === "true";

  if (!saveTo) {
    throw new Error("prompt-file node missing 'saveTo' property");
  }

  let filePath: string | null = null;

  // Check for hotkey mode (active file info passed via __hotkeyActiveFile__)
  // or event mode (file info passed via __eventFile__)
  const hotkeyActiveFile = context.variables.get("__hotkeyActiveFile__");
  const eventFile = context.variables.get("__eventFile__");

  // If forcePrompt is true, always show the dialog
  if (forcePrompt) {
    if (!promptCallbacks?.promptForFile) {
      throw new Error("File prompt callback not available");
    }
    filePath = await promptCallbacks.promptForFile(defaultPath);
    if (filePath === null) {
      throw new Error("File selection cancelled by user");
    }
  } else if (hotkeyActiveFile) {
    // Hotkey mode: use active file without showing dialog
    try {
      const fileInfo = JSON.parse(String(hotkeyActiveFile));
      if (fileInfo.path) {
        filePath = fileInfo.path as string;
      }
    } catch {
      // Invalid JSON, fall through to dialog
    }
  } else if (eventFile) {
    // Event mode: use event file without showing dialog
    try {
      const fileInfo = JSON.parse(String(eventFile));
      if (fileInfo.path) {
        filePath = fileInfo.path as string;
      }
    } catch {
      // Invalid JSON, fall through to dialog
    }
  }

  // Panel mode or fallback: show file picker dialog
  if (filePath === null) {
    if (!promptCallbacks?.promptForFile) {
      throw new Error("File prompt callback not available");
    }
    filePath = await promptCallbacks.promptForFile(defaultPath);
  }

  if (filePath === null) {
    throw new Error("File selection cancelled by user");
  }

  // Read file content
  const notePath = filePath.endsWith(".md") ? filePath : `${filePath}.md`;
  const file = app.vault.getAbstractFileByPath(notePath);
  if (!file || !(file instanceof TFile)) {
    throw new Error(`File not found: ${notePath}`);
  }
  const content = await app.vault.read(file);

  // Set content to saveTo
  context.variables.set(saveTo, content);

  // Set file info to saveFileTo if specified
  if (saveFileTo) {
    const fileInfo = createFileInfo(filePath);
    context.variables.set(saveFileTo, JSON.stringify(fileInfo));
  }
}

// Handle prompt-selection node - show file preview with text selection or use hotkey/event selection
// In hotkey mode: Uses __hotkeySelection__ to auto-use selected text without dialog
// In event mode: Uses __eventFileContent__ as full file selection
// In hotkey/event mode without selection: Uses full file content as selection
// In panel mode: Shows selection dialog
// saveTo: stores selected text, saveSelectionTo: stores selection metadata JSON
export async function handlePromptSelectionNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App,
  promptCallbacks?: PromptCallbacks
): Promise<void> {
  const saveTo = node.properties["saveTo"];
  const saveSelectionTo = node.properties["saveSelectionTo"];

  if (!saveTo) {
    throw new Error("prompt-selection node missing 'saveTo' property");
  }

  // Check for hotkey mode (selection passed via __hotkeySelection__)
  const hotkeySelection = context.variables.get("__hotkeySelection__");
  const hotkeySelectionInfo = context.variables.get("__hotkeySelectionInfo__");

  if (hotkeySelection !== undefined && hotkeySelection !== "") {
    // Hotkey mode with selection: use existing selection without dialog
    const selectionText = String(hotkeySelection);

    // Set user-specified variables only
    context.variables.set(saveTo, selectionText);
    if (saveSelectionTo && hotkeySelectionInfo) {
      context.variables.set(saveSelectionTo, String(hotkeySelectionInfo));
    }
    return;
  }

  // Check for hotkey mode without selection - use full file content
  const hotkeyContent = context.variables.get("__hotkeyContent__");
  const hotkeyActiveFile = context.variables.get("__hotkeyActiveFile__");

  if (hotkeyContent !== undefined && hotkeyContent !== "") {
    // Hotkey mode without selection: use full file content
    const fullContent = String(hotkeyContent);
    context.variables.set(saveTo, fullContent);

    // Create selection info for full file
    if (saveSelectionTo && hotkeyActiveFile) {
      try {
        const fileInfo = JSON.parse(String(hotkeyActiveFile));
        const lines = fullContent.split("\n");
        context.variables.set(saveSelectionTo, JSON.stringify({
          filePath: fileInfo.path,
          startLine: 1,
          endLine: lines.length,
          start: 0,
          end: fullContent.length,
        }));
      } catch {
        // Invalid JSON, skip setting selection info
      }
    }
    return;
  }

  // Check for event mode - use event file content
  const eventFileContent = context.variables.get("__eventFileContent__");
  const eventFile = context.variables.get("__eventFile__");
  const eventFilePath = context.variables.get("__eventFilePath__");

  if (eventFileContent !== undefined && eventFileContent !== "") {
    // Event mode: use full file content as selection
    const fullContent = String(eventFileContent);
    context.variables.set(saveTo, fullContent);

    // Create selection info for full file
    if (saveSelectionTo) {
      const filePath = eventFilePath ? String(eventFilePath) : "";
      const lines = fullContent.split("\n");
      context.variables.set(saveSelectionTo, JSON.stringify({
        filePath: filePath,
        startLine: 1,
        endLine: lines.length,
        start: 0,
        end: fullContent.length,
      }));
    }
    return;
  }

  // Event mode without content (e.g., delete event) - try to read from event file
  if (eventFile) {
    try {
      const fileInfo = JSON.parse(String(eventFile));
      if (fileInfo.path) {
        const file = app.vault.getAbstractFileByPath(fileInfo.path);
        if (file && file instanceof TFile) {
          const content = await app.vault.read(file);
          context.variables.set(saveTo, content);

          if (saveSelectionTo) {
            const lines = content.split("\n");
            context.variables.set(saveSelectionTo, JSON.stringify({
              filePath: fileInfo.path,
              startLine: 1,
              endLine: lines.length,
              start: 0,
              end: content.length,
            }));
          }
          return;
        }
      }
    } catch {
      // Invalid JSON or file not readable, fall through to dialog
    }
  }

  // Panel mode: show selection dialog
  if (!promptCallbacks?.promptForSelection) {
    throw new Error("Selection prompt callback not available");
  }

  const result = await promptCallbacks.promptForSelection();

  if (result === null) {
    throw new Error("Selection cancelled by user");
  }

  // Read the file content to extract the actual selected text
  const file = app.vault.getAbstractFileByPath(result.path);
  if (!file || !(file instanceof TFile)) {
    throw new Error(`File not found: ${result.path}`);
  }
  const fileContent = await app.vault.read(file);

  // Convert EditorPosition (line, ch) to character offsets
  const lines = fileContent.split("\n");
  let startOffset = 0;
  for (let i = 0; i < result.start.line; i++) {
    startOffset += lines[i].length + 1; // +1 for newline
  }
  startOffset += result.start.ch;

  let endOffset = 0;
  for (let i = 0; i < result.end.line; i++) {
    endOffset += lines[i].length + 1;
  }
  endOffset += result.end.ch;

  // Extract the selected text
  const selectedText = fileContent.substring(startOffset, endOffset);

  // Set user-specified variables only
  context.variables.set(saveTo, selectedText);
  if (saveSelectionTo) {
    context.variables.set(saveSelectionTo, JSON.stringify({
      filePath: result.path,
      startLine: result.start.line,
      endLine: result.end.line,
      start: startOffset,
      end: endOffset,
    }));
  }
}

// Binary file extensions that should be read as binary and encoded as Base64
const BINARY_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg"];

// Check if a file extension is binary
function isBinaryExtension(extension: string): boolean {
  return BINARY_EXTENSIONS.includes(extension.toLowerCase());
}

// Get MIME type from file extension
function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    md: "text/markdown",
    txt: "text/plain",
    json: "application/json",
    csv: "text/csv",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    ico: "image/x-icon",
    svg: "image/svg+xml",
  };
  return mimeTypes[extension.toLowerCase()] || "application/octet-stream";
}

// Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Handle file-explorer node - select any file or create new file path
// mode: "select" (default) - pick existing file, "create" - input new file path
// extensions: comma-separated list of allowed extensions (empty = all)
// saveTo: stores FileExplorerData JSON, savePathTo: stores just the file path
export async function handleFileExplorerNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App,
  promptCallbacks?: PromptCallbacks
): Promise<void> {
  const mode = node.properties["mode"] || "select";
  const _title = node.properties["title"] || (mode === "create" ? "Enter file path" : "Select a file");
  const extensionsStr = node.properties["extensions"] || "";
  const defaultPath = replaceVariables(node.properties["default"] || "", context);
  const directPath = replaceVariables(node.properties["path"] || "", context);
  const saveTo = node.properties["saveTo"];
  const savePathTo = node.properties["savePathTo"];

  if (!saveTo && !savePathTo) {
    throw new Error("file-explorer node requires 'saveTo' or 'savePathTo' property");
  }

  // Parse extensions
  const extensions = extensionsStr
    ? extensionsStr.split(",").map((e) => e.trim().toLowerCase().replace(/^\./, ""))
    : undefined;

  let filePath: string | null = null;

  // If path is specified, use it directly without dialog
  if (directPath) {
    filePath = directPath;
  } else if (mode === "create") {
    // Create mode: prompt for new file path
    if (!promptCallbacks?.promptForNewFilePath) {
      throw new Error("New file path prompt callback not available");
    }
    filePath = await promptCallbacks.promptForNewFilePath(extensions, defaultPath);
  } else {
    // Select mode: pick existing file
    if (!promptCallbacks?.promptForAnyFile) {
      throw new Error("File picker callback not available");
    }
    filePath = await promptCallbacks.promptForAnyFile(extensions, defaultPath);
  }

  if (filePath === null) {
    throw new Error("File selection cancelled by user");
  }

  // Save path if savePathTo is specified
  if (savePathTo) {
    context.variables.set(savePathTo, filePath);
  }

  // If saveTo is specified, read the file and create FileExplorerData
  if (saveTo) {
    if (mode === "create") {
      // For create mode, just save empty data with path info
      const basename = filePath.split("/").pop() || filePath;
      const lastDotIndex = basename.lastIndexOf(".");
      const name = lastDotIndex > 0 ? basename.substring(0, lastDotIndex) : basename;
      const extension = lastDotIndex > 0 ? basename.substring(lastDotIndex + 1) : "";

      const fileData: FileExplorerData = {
        path: filePath,
        basename,
        name,
        extension,
        mimeType: getMimeType(extension),
        contentType: isBinaryExtension(extension) ? "binary" : "text",
        data: "",
      };
      context.variables.set(saveTo, JSON.stringify(fileData));
    } else {
      // Select mode: read the file
      const file = app.vault.getAbstractFileByPath(filePath);
      if (!file || !(file instanceof TFile)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const extension = file.extension.toLowerCase();
      const mimeType = getMimeType(extension);
      const isBinary = isBinaryExtension(extension);

      let data: string;
      if (isBinary) {
        const buffer = await app.vault.readBinary(file);
        data = arrayBufferToBase64(buffer);
      } else {
        data = await app.vault.read(file);
      }

      const fileData: FileExplorerData = {
        path: filePath,
        basename: file.basename + "." + file.extension,
        name: file.basename,
        extension,
        mimeType,
        contentType: isBinary ? "binary" : "text",
        data,
      };
      context.variables.set(saveTo, JSON.stringify(fileData));
    }
  }
}

// Recursively ensure all parent folders exist
async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
  if (!folderPath) return;

  const folder = app.vault.getAbstractFileByPath(folderPath);
  if (folder) return; // Already exists

  // Get parent folder path
  const parentPath = folderPath.substring(0, folderPath.lastIndexOf("/"));
  if (parentPath) {
    // Recursively ensure parent exists first
    await ensureFolderExists(app, parentPath);
  }

  // Now create this folder
  try {
    await app.vault.createFolder(folderPath);
  } catch {
    // Folder might have been created by another process
  }
}

// Handle note node - write content to a note file
export async function handleNoteNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App,
  promptCallbacks?: PromptCallbacks
): Promise<void> {
  const path = replaceVariables(node.properties["path"] || "", context);
  const content = replaceVariables(node.properties["content"] || "", context);
  const mode = node.properties["mode"] || "overwrite"; // overwrite, append, create
  // Check if history should be saved: use settings by default, allow workflow to override
  const historyManager = getEditHistoryManager();
  const historyEnabled = historyManager?.isEnabled() ?? false;
  const saveHistory = node.properties["history"] === "false" ? false : historyEnabled;
  const workflowName = context.variables.get("__workflowName__") as string | undefined;
  const model = context.variables.get("__lastModel__") as string | undefined;

  if (!path) {
    throw new Error("Note node missing 'path' property");
  }

  // Ensure .md extension
  const notePath = path.endsWith(".md") ? path : `${path}.md`;

  // Check if confirmation is required (default: true)
  const confirm = node.properties["confirm"] !== "false";

  if (confirm && promptCallbacks?.promptForConfirmation) {
    const confirmed = await promptCallbacks.promptForConfirmation(
      notePath,
      content,
      mode
    );
    if (!confirmed) {
      throw new Error("Note write cancelled by user");
    }
  }

  // Check if file exists
  const existingFile = app.vault.getAbstractFileByPath(notePath);

  // Ensure snapshot exists before modification (for edit history)
  if (saveHistory && existingFile && historyManager) {
    await historyManager.ensureSnapshot(notePath);
  }

  // Ensure parent folder exists for all modes when creating new file
  const folderPath = notePath.substring(0, notePath.lastIndexOf("/"));

  let finalContent = content;

  if (mode === "create") {
    // Only create if file doesn't exist
    if (existingFile) {
      // File already exists, skip
      return;
    }
    await ensureFolderExists(app, folderPath);
    await app.vault.create(notePath, content);
  } else if (mode === "append") {
    if (existingFile && existingFile instanceof TFile) {
      // Append to existing file
      const currentContent = await app.vault.read(existingFile);
      finalContent = currentContent + "\n" + content;
      await app.vault.modify(existingFile, finalContent);
    } else {
      // Create new file with content
      await ensureFolderExists(app, folderPath);
      await app.vault.create(notePath, content);
    }
  } else {
    // overwrite mode (default)
    if (existingFile && existingFile instanceof TFile) {
      await app.vault.modify(existingFile, content);
    } else {
      await ensureFolderExists(app, folderPath);
      await app.vault.create(notePath, content);
    }
  }

  // Save edit history if enabled
  if (saveHistory && historyManager) {
    await historyManager.saveEdit({
      path: notePath,
      modifiedContent: finalContent,
      source: "workflow",
      workflowName,
      model,
    });
  }
}

// Handle note-read node - read note content from file
// Always requires path - use prompt-file first to get the file path
export async function handleNoteReadNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App,
  _promptCallbacks?: PromptCallbacks
): Promise<void> {
  const pathRaw = node.properties["path"] || "";
  const saveTo = node.properties["saveTo"];

  if (!saveTo) {
    throw new Error("note-read node missing 'saveTo' property");
  }

  if (!pathRaw.trim()) {
    throw new Error("note-read node missing 'path' property. Use prompt-file first to get the file path.");
  }

  const path = replaceVariables(pathRaw, context);

  // Ensure .md extension
  const notePath = path.endsWith(".md") ? path : `${path}.md`;

  const file = app.vault.getAbstractFileByPath(notePath);
  if (!file) {
    throw new Error(`Note not found: ${notePath}`);
  }

  if (!(file instanceof TFile)) {
    throw new Error(`Path is not a file: ${notePath}`);
  }

  const content = await app.vault.read(file);
  context.variables.set(saveTo, content);
}

// Handle note-search node - search for notes by name or content
export async function handleNoteSearchNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App
): Promise<void> {
  const query = replaceVariables(node.properties["query"] || "", context);
  const searchContent = node.properties["searchContent"] === "true";
  const limitStr = node.properties["limit"] || "10";
  const limit = parseInt(limitStr, 10) || 10;
  const saveTo = node.properties["saveTo"];

  if (!query) {
    throw new Error("note-search node missing 'query' property");
  }
  if (!saveTo) {
    throw new Error("note-search node missing 'saveTo' property");
  }

  const files = app.vault.getMarkdownFiles();
  const results: { name: string; path: string; matchedContent?: string }[] = [];

  if (searchContent) {
    // Search within file contents
    for (const file of files) {
      if (results.length >= limit) break;

      const content = await app.vault.cachedRead(file);
      const lowerContent = content.toLowerCase();
      const lowerQuery = query.toLowerCase();

      if (lowerContent.includes(lowerQuery)) {
        // Extract matched context (50 chars before and after)
        const index = lowerContent.indexOf(lowerQuery);
        const start = Math.max(0, index - 50);
        const end = Math.min(content.length, index + query.length + 50);
        const matchedContent = content.substring(start, end);

        results.push({
          name: file.basename,
          path: file.path,
          matchedContent:
            (start > 0 ? "..." : "") +
            matchedContent +
            (end < content.length ? "..." : ""),
        });
      }
    }
  } else {
    // Search by file name
    const lowerQuery = query.toLowerCase();
    for (const file of files) {
      if (results.length >= limit) break;

      if (
        file.basename.toLowerCase().includes(lowerQuery) ||
        file.path.toLowerCase().includes(lowerQuery)
      ) {
        results.push({
          name: file.basename,
          path: file.path,
        });
      }
    }
  }

  context.variables.set(saveTo, JSON.stringify(results));
}

// Parse time duration string (e.g., "7d", "30m", "2h") to milliseconds
function parseTimeDuration(duration: string): number | null {
  if (!duration) return null;

  const match = duration.trim().match(/^(\d+)\s*(m|min|h|hour|d|day)s?$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case "m":
    case "min":
      return value * 60 * 1000;
    case "h":
    case "hour":
      return value * 60 * 60 * 1000;
    case "d":
    case "day":
      return value * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

// Get tags from a file using Obsidian's metadata cache
function getFileTags(app: App, filePath: string): string[] {
  const cache = app.metadataCache.getCache(filePath);
  if (!cache) return [];

  const tags: string[] = [];

  // Get tags from frontmatter
  if (cache.frontmatter?.tags) {
    const fmTags = cache.frontmatter.tags;
    if (Array.isArray(fmTags)) {
      tags.push(...fmTags.map((t) => (t.startsWith("#") ? t : `#${t}`)));
    } else if (typeof fmTags === "string") {
      tags.push(fmTags.startsWith("#") ? fmTags : `#${fmTags}`);
    }
  }

  // Get inline tags
  if (cache.tags) {
    tags.push(...cache.tags.map((t) => t.tag));
  }

  return [...new Set(tags)]; // Remove duplicates
}

// Handle note-list node - list notes in a folder
export function handleNoteListNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App
): void {
  const folder = replaceVariables(node.properties["folder"] || "", context);
  const recursive = node.properties["recursive"] === "true";
  const limitStr = node.properties["limit"] || "50";
  const limit = parseInt(limitStr, 10) || 50;
  const saveTo = node.properties["saveTo"];

  // Date filtering
  const createdWithin = replaceVariables(
    node.properties["createdWithin"] || "",
    context
  );
  const modifiedWithin = replaceVariables(
    node.properties["modifiedWithin"] || "",
    context
  );
  const sortBy = node.properties["sortBy"] || ""; // "created", "modified", "name"
  const sortOrder = node.properties["sortOrder"] || "desc"; // "asc", "desc"

  // Tag filtering
  const tagsFilter = replaceVariables(node.properties["tags"] || "", context);
  const tagMatchMode = node.properties["tagMatch"] || "any"; // "any" or "all"

  if (!saveTo) {
    throw new Error("note-list node missing 'saveTo' property");
  }

  const now = Date.now();
  const createdThreshold = parseTimeDuration(createdWithin);
  const modifiedThreshold = parseTimeDuration(modifiedWithin);

  // Parse tag filter
  const requiredTags = tagsFilter
    ? tagsFilter
        .split(",")
        .map((t) => {
          const trimmed = t.trim();
          return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
        })
        .filter((t) => t.length > 1)
    : [];

  let files = app.vault.getMarkdownFiles();

  // Filter by folder
  if (folder) {
    const normalizedFolder = folder.endsWith("/") ? folder : folder + "/";
    files = files.filter((file) => {
      if (recursive) {
        return (
          file.path.startsWith(normalizedFolder) ||
          file.path === folder + ".md"
        );
      } else {
        const fileFolder =
          file.path.substring(0, file.path.lastIndexOf("/") + 1);
        return fileFolder === normalizedFolder || file.parent?.path === folder;
      }
    });
  }

  // Filter by creation time
  if (createdThreshold !== null) {
    const cutoff = now - createdThreshold;
    files = files.filter((file) => file.stat.ctime >= cutoff);
  }

  // Filter by modification time
  if (modifiedThreshold !== null) {
    const cutoff = now - modifiedThreshold;
    files = files.filter((file) => file.stat.mtime >= cutoff);
  }

  // Filter by tags
  if (requiredTags.length > 0) {
    files = files.filter((file) => {
      const fileTags = getFileTags(app, file.path);
      if (tagMatchMode === "all") {
        // All tags must be present
        return requiredTags.every((tag) => fileTags.includes(tag));
      } else {
        // Any tag must be present
        return requiredTags.some((tag) => fileTags.includes(tag));
      }
    });
  }

  // Sort files
  if (sortBy === "created") {
    files.sort((a, b) =>
      sortOrder === "asc"
        ? a.stat.ctime - b.stat.ctime
        : b.stat.ctime - a.stat.ctime
    );
  } else if (sortBy === "modified") {
    files.sort((a, b) =>
      sortOrder === "asc"
        ? a.stat.mtime - b.stat.mtime
        : b.stat.mtime - a.stat.mtime
    );
  } else if (sortBy === "name") {
    files.sort((a, b) =>
      sortOrder === "asc"
        ? a.basename.localeCompare(b.basename)
        : b.basename.localeCompare(a.basename)
    );
  }

  // Apply limit and build results
  const totalCount = files.length;
  const limitedFiles = files.slice(0, limit);

  const results = limitedFiles.map((file) => ({
    name: file.basename,
    path: file.path,
    created: file.stat.ctime,
    modified: file.stat.mtime,
    tags: getFileTags(app, file.path),
  }));

  context.variables.set(
    saveTo,
    JSON.stringify({
      notes: results,
      count: results.length,
      totalCount,
      hasMore: totalCount > limit,
    })
  );
}

// Handle folder-list node - list folders in the vault
export function handleFolderListNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App
): void {
  const parentFolder = replaceVariables(
    node.properties["folder"] || "",
    context
  );
  const saveTo = node.properties["saveTo"];

  if (!saveTo) {
    throw new Error("folder-list node missing 'saveTo' property");
  }

  const folders: string[] = [];

  // Get all folders from the vault
  const allFiles = app.vault.getAllLoadedFiles();
  for (const file of allFiles) {
    // Check if it's a folder (has children property)
    if ("children" in file && file.children !== undefined) {
      const folderPath = file.path;

      // Filter by parent folder if specified
      if (parentFolder) {
        const normalizedParent = parentFolder.endsWith("/")
          ? parentFolder.slice(0, -1)
          : parentFolder;
        if (
          !folderPath.startsWith(normalizedParent + "/") &&
          folderPath !== normalizedParent
        ) {
          continue;
        }
      }

      if (folderPath) {
        folders.push(folderPath);
      }
    }
  }

  // Sort alphabetically
  folders.sort();

  context.variables.set(
    saveTo,
    JSON.stringify({
      folders,
      count: folders.length,
    })
  );
}

// Handle open node - open a file in Obsidian
export async function handleOpenNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App,
  promptCallbacks?: PromptCallbacks
): Promise<void> {
  const path = replaceVariables(node.properties["path"] || "", context);

  if (!path) {
    throw new Error("Open node missing 'path' property");
  }

  // Ensure .md extension
  const notePath = path.endsWith(".md") ? path : `${path}.md`;

  if (promptCallbacks?.openFile) {
    await promptCallbacks.openFile(notePath);
  }
}

// Handle dialog node - show a dialog with options and buttons
export async function handleDialogNode(
  node: WorkflowNode,
  context: ExecutionContext,
  _app: App,
  promptCallbacks?: PromptCallbacks
): Promise<void> {
  const title = replaceVariables(node.properties["title"] || "Dialog", context);
  const message = replaceVariables(node.properties["message"] || "", context);
  const optionsStr = replaceVariables(node.properties["options"] || "", context);
  const multiSelect = node.properties["multiSelect"] === "true";
  const markdown = node.properties["markdown"] === "true";
  const button1 = replaceVariables(node.properties["button1"] || "OK", context);
  const button2Prop = node.properties["button2"];
  const button2 = button2Prop ? replaceVariables(button2Prop, context) : undefined;
  const inputTitleProp = node.properties["inputTitle"];
  const inputTitle = inputTitleProp ? replaceVariables(inputTitleProp, context) : undefined;
  const multiline = node.properties["multiline"] === "true";
  const defaultsProp = node.properties["defaults"];
  const saveTo = node.properties["saveTo"];

  // Parse defaults JSON
  let defaults: { input?: string; selected?: string[] } | undefined;
  if (defaultsProp) {
    try {
      const parsed = JSON.parse(replaceVariables(defaultsProp, context));
      defaults = {
        input: parsed.input,
        selected: Array.isArray(parsed.selected) ? parsed.selected : undefined,
      };
    } catch {
      // Invalid JSON, ignore defaults
    }
  }

  // Parse options (comma-separated)
  const options = optionsStr
    ? optionsStr.split(",").map((o) => o.trim()).filter((o) => o.length > 0)
    : [];

  if (!promptCallbacks?.promptForDialog) {
    throw new Error("Dialog prompt callback not available");
  }

  const result = await promptCallbacks.promptForDialog(
    title,
    message,
    options,
    multiSelect,
    button1,
    button2,
    markdown,
    inputTitle,
    defaults,
    multiline
  );

  if (result === null) {
    throw new Error("Dialog cancelled by user");
  }

  // Save result to variable
  if (saveTo) {
    context.variables.set(saveTo, JSON.stringify(result));
  }
}

// Handle workflow node - execute a sub-workflow
export async function handleWorkflowNode(
  node: WorkflowNode,
  context: ExecutionContext,
  _app: App,
  promptCallbacks?: PromptCallbacks
): Promise<void> {
  const path = replaceVariables(node.properties["path"] || "", context);
  const name = node.properties["name"]
    ? replaceVariables(node.properties["name"], context)
    : undefined;
  const inputStr = node.properties["input"] || "";
  const outputStr = node.properties["output"] || "";

  if (!path) {
    throw new Error("Workflow node missing 'path' property");
  }

  if (!promptCallbacks?.executeSubWorkflow) {
    throw new Error("Sub-workflow execution not available");
  }

  // Parse input variable mapping (JSON object: {"subVar": "{{parentVar}}"})
  const inputVariables = new Map<string, string | number>();
  if (inputStr) {
    const replacedInput = replaceVariables(inputStr, context);
    try {
      const inputMapping = JSON.parse(replacedInput);
      if (typeof inputMapping === "object" && inputMapping !== null) {
        for (const [key, value] of Object.entries(inputMapping)) {
          if (typeof value === "string" || typeof value === "number") {
            inputVariables.set(key, value);
          } else {
            inputVariables.set(key, JSON.stringify(value));
          }
        }
      }
    } catch {
      // If not valid JSON, try to parse as comma-separated key=value pairs
      const pairs = replacedInput.split(",");
      for (const pair of pairs) {
        const eqIndex = pair.indexOf("=");
        if (eqIndex !== -1) {
          const key = pair.substring(0, eqIndex).trim();
          const value = pair.substring(eqIndex + 1).trim();
          if (key) {
            // Try to get value from context if it looks like a variable reference
            const contextValue = context.variables.get(value);
            inputVariables.set(key, contextValue !== undefined ? contextValue : value);
          }
        }
      }
    }
  }

  // Execute sub-workflow
  const resultVariables = await promptCallbacks.executeSubWorkflow(
    path,
    name,
    inputVariables
  );

  // Copy output variables back to parent context
  if (outputStr) {
    // Parse output mapping (JSON object: {"parentVar": "subVar"} or comma-separated)
    const replacedOutput = replaceVariables(outputStr, context);
    try {
      const outputMapping = JSON.parse(replacedOutput);
      if (typeof outputMapping === "object" && outputMapping !== null) {
        for (const [parentVar, subVar] of Object.entries(outputMapping)) {
          if (typeof subVar === "string") {
            const value = resultVariables.get(subVar);
            if (value !== undefined) {
              context.variables.set(parentVar, value);
            }
          }
        }
      }
    } catch {
      // Comma-separated: parentVar=subVar
      const pairs = replacedOutput.split(",");
      for (const pair of pairs) {
        const eqIndex = pair.indexOf("=");
        if (eqIndex !== -1) {
          const parentVar = pair.substring(0, eqIndex).trim();
          const subVar = pair.substring(eqIndex + 1).trim();
          if (parentVar && subVar) {
            const value = resultVariables.get(subVar);
            if (value !== undefined) {
              context.variables.set(parentVar, value);
            }
          }
        }
      }
    }
  } else {
    // No explicit output mapping - copy all result variables with optional prefix
    const prefix = node.properties["prefix"] || "";
    for (const [key, value] of resultVariables) {
      context.variables.set(prefix + key, value);
    }
  }
}

// Handle rag-sync node - sync a note to RAG store
export async function handleRagSyncNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App,
  plugin: GeminiHelperPlugin
): Promise<void> {
  const pathRaw = node.properties["path"] || "";
  const ragSettingName = replaceVariables(node.properties["ragSetting"] || "", context);
  const saveTo = node.properties["saveTo"];

  if (!pathRaw.trim()) {
    throw new Error("rag-sync node missing 'path' property");
  }

  if (!ragSettingName.trim()) {
    throw new Error("rag-sync node missing 'ragSetting' property");
  }

  const path = replaceVariables(pathRaw, context);

  // Ensure .md extension
  const notePath = path.endsWith(".md") ? path : `${path}.md`;

  // Get the file
  const file = app.vault.getAbstractFileByPath(notePath);
  if (!(file instanceof TFile)) {
    throw new Error(`Note not found: ${notePath}`);
  }

  // Get RAG setting
  const workspaceState = plugin.workspaceState;
  const ragSetting = workspaceState.ragSettings[ragSettingName] || null;
  if (!ragSetting) {
    throw new Error(`RAG setting not found: ${ragSettingName}`);
  }

  if (!ragSetting.storeId) {
    throw new Error(`RAG setting "${ragSettingName}" has no store configured.`);
  }

  // Get or create FileSearchManager
  const fileSearchManager = getFileSearchManager();
  if (!fileSearchManager) {
    throw new Error("FileSearchManager not initialized. Please check your API key.");
  }

  // Set the store name
  fileSearchManager.setStoreName(ragSetting.storeId);

  // Read file content and calculate checksum
  const content = await app.vault.read(file);
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const checksum = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  // Upload the file
  const fileId = await fileSearchManager.uploadFile(file);

  // Update the RAG setting's files state
  ragSetting.files[notePath] = {
    checksum,
    uploadedAt: Date.now(),
    fileId,
  };

  // Save the updated workspace state
  workspaceState.ragSettings[ragSettingName] = ragSetting;
  await plugin.saveWorkspaceState();

  // Set result if saveTo is specified
  if (saveTo) {
    context.variables.set(saveTo, JSON.stringify({
      path: notePath,
      fileId,
      ragSetting: ragSettingName,
      syncedAt: Date.now(),
    }));
  }
}

// Handle file-save node - save FileExplorerData as a file in the vault
export async function handleFileSaveNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App
): Promise<void> {
  const sourceProp = node.properties["source"];
  const pathProp = node.properties["path"];

  if (!sourceProp) {
    throw new Error("file-save node requires 'source' property");
  }
  if (!pathProp) {
    throw new Error("file-save node requires 'path' property");
  }

  // Get the source variable value
  const sourceValue = context.variables.get(sourceProp);
  if (!sourceValue || typeof sourceValue !== "string") {
    throw new Error(`Source variable '${sourceProp}' not found or not a string`);
  }

  // Parse FileExplorerData
  let fileData: FileExplorerData;
  try {
    fileData = JSON.parse(sourceValue);
    if (!fileData.data || !fileData.contentType) {
      throw new Error("Invalid FileExplorerData structure");
    }
  } catch {
    throw new Error(`Source variable '${sourceProp}' is not valid FileExplorerData JSON`);
  }

  // Resolve path with variables
  let filePath = replaceVariables(pathProp, context);

  // Add extension if not present
  if (!filePath.includes(".") && fileData.extension) {
    filePath = `${filePath}.${fileData.extension}`;
  }

  // Ensure parent folder exists
  const folderPath = filePath.substring(0, filePath.lastIndexOf("/"));
  if (folderPath) {
    await ensureFolderExists(app, folderPath);
  }

  // Check if file exists
  const existingFile = app.vault.getAbstractFileByPath(filePath);

  if (fileData.contentType === "binary") {
    // Decode base64 to binary
    const binaryData = base64ToUint8Array(fileData.data);
    const arrayBuffer = binaryData.buffer.slice(binaryData.byteOffset, binaryData.byteOffset + binaryData.byteLength) as ArrayBuffer;

    if (existingFile && existingFile instanceof TFile) {
      await app.vault.modifyBinary(existingFile, arrayBuffer);
    } else {
      await app.vault.createBinary(filePath, arrayBuffer);
    }
  } else {
    // Text file
    if (existingFile && existingFile instanceof TFile) {
      await app.vault.modify(existingFile, fileData.data);
    } else {
      await app.vault.create(filePath, fileData.data);
    }
  }

  // Save path to variable if specified
  const savePathTo = node.properties["savePathTo"];
  if (savePathTo) {
    context.variables.set(savePathTo, filePath);
  }
}

// Handle obsidian-command node - execute an Obsidian command
export async function handleObsidianCommandNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App
): Promise<void> {
  const commandId = replaceVariables(node.properties["command"] || "", context);

  if (!commandId) {
    throw new Error("obsidian-command node missing 'command' property");
  }

  // Check if command exists
  const command = (app as unknown as { commands: { commands: Record<string, unknown> } }).commands.commands[commandId];
  if (!command) {
    throw new Error(`Command not found: ${commandId}`);
  }

  // Execute the command
  await (app as unknown as { commands: { executeCommandById: (id: string) => Promise<void> } }).commands.executeCommandById(commandId);

  // Save execution info to variable if specified
  const saveTo = node.properties["saveTo"];
  if (saveTo) {
    context.variables.set(saveTo, JSON.stringify({
      commandId,
      executed: true,
      timestamp: Date.now(),
    }));
  }
}

// Handle MCP node - call remote MCP server tool via HTTP
export async function handleMcpNode(
  node: WorkflowNode,
  context: ExecutionContext,
  _app: App,
  _plugin: GeminiHelperPlugin
): Promise<void> {
  const url = replaceVariables(node.properties["url"] || "", context);
  const toolName = replaceVariables(node.properties["tool"] || "", context);
  const argsStr = node.properties["args"] || "";
  const headersStr = node.properties["headers"] || "";
  const saveTo = node.properties["saveTo"];

  if (!url) {
    throw new Error("MCP node missing 'url' property");
  }
  if (!toolName) {
    throw new Error("MCP node missing 'tool' property");
  }

  // Parse headers if provided
  let headers: Record<string, string> = {};
  if (headersStr) {
    const replacedHeaders = replaceVariables(headersStr, context);
    try {
      headers = JSON.parse(replacedHeaders);
    } catch {
      throw new Error(`Invalid JSON in MCP headers: ${replacedHeaders}`);
    }
  }

  // Parse arguments
  let args: Record<string, unknown> = {};
  if (argsStr) {
    const replacedArgs = replaceVariables(argsStr, context);
    try {
      args = JSON.parse(replacedArgs);
    } catch {
      throw new Error(`Invalid JSON in MCP args: ${replacedArgs}`);
    }
  }

  // Create MCP client for this URL
  const client = new McpClient({
    name: url,
    url: url,
    headers: headers,
  });

  try {
    // Call the tool
    const result = await client.callTool(toolName, args);

    // Save result to variable if specified
    if (saveTo) {
      context.variables.set(saveTo, result);
    }
  } finally {
    // Close the client connection
    await client.close();
  }
}

