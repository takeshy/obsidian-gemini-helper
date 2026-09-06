// Workflow vocabulary lives in obsidian-llm-hub-common; this file adds what only this plugin has.
import type { McpAppInfo } from "src/types";
import type { EditConfirmationResult } from "src/ui/components/workflow/EditConfirmationModal";

declare module "obsidian-llm-hub-common/workflow" {
  interface WorkflowHostStep {
    mcpAppInfo?: McpAppInfo;  // MCP Apps UI info if available
  }
  interface WorkflowHostCallbacks {
    promptForConfirmation: (
      filePath: string,
      content: string,
      mode: string,
      originalContent?: string
    ) => Promise<EditConfirmationResult>;
    showMcpApp?: (mcpApp: McpAppInfo) => Promise<void>;
  }
}

export * from "obsidian-llm-hub-common/workflow";
