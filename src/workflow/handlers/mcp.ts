import type { App } from "obsidian";
import type { GeminiHelperPlugin } from "src/plugin";
import type { McpAppInfo } from "src/types";
import { McpClient } from "src/core/mcpClient";
import type { WorkflowNode, ExecutionContext } from "obsidian-llm-hub-common/workflow";
import { replaceVariables } from "obsidian-llm-hub-common/workflow";

export async function handleMcpNode(
  node: WorkflowNode,
  context: ExecutionContext,
  _app: App,
  _plugin: GeminiHelperPlugin
): Promise<McpAppInfo | undefined> {
  const url = replaceVariables(node.properties["url"] || "", context);
  const toolName = replaceVariables(node.properties["tool"] || "", context);
  const argsStr = node.properties["args"] || "";
  const headersStr = node.properties["headers"] || "";
  const saveTo = node.properties["saveTo"];
  const saveUiTo = node.properties["saveUiTo"];  // Optional: save MCP Apps UI info

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
      headers = JSON.parse(replacedHeaders) as Record<string, string>;
    } catch {
      throw new Error(`Invalid JSON in MCP headers: ${replacedHeaders}`);
    }
  }

  // Parse arguments
  let args: Record<string, unknown> = {};
  if (argsStr) {
    const replacedArgs = replaceVariables(argsStr, context);
    try {
      args = JSON.parse(replacedArgs) as Record<string, unknown>;
    } catch {
      throw new Error(`Invalid JSON in MCP args: ${replacedArgs}`);
    }
  }

  // Create MCP client for this URL
  const client = new McpClient({
    name: url,
    url: url,
    headers: headers,
    enabled: true,
  });

  let mcpAppInfo: McpAppInfo | undefined;

  try {
    // Call the tool with UI support
    const appResult = await client.callToolWithUi(toolName, args, node.properties["confirm"] === "false");

    // Extract text content for the result
    const textContents = appResult.content
      .filter(c => c.type === "text" && c.text)
      .map(c => c.text!);

    if (appResult.isError) {
      throw new Error(`MCP tool execution failed: ${textContents.join("\n")}`);
    }

    const result = textContents.join("\n");

    // Save result to variable if specified
    if (saveTo) {
      context.variables.set(saveTo, result);
    }

    // Build MCP Apps UI info if available
    if (appResult._meta?.ui?.resourceUri) {
      // Fetch the UI resource
      const uiResource = await client.readResource(appResult._meta.ui.resourceUri);
      mcpAppInfo = {
        serverUrl: url,
        serverHeaders: headers,
        toolResult: appResult,
        uiResource,
      };

      // Save to variable if saveUiTo is specified
      if (saveUiTo) {
        context.variables.set(saveUiTo, JSON.stringify(mcpAppInfo));
      }
    }
  } finally {
    // Close the client connection
    await client.close();
  }

  return mcpAppInfo;
}
