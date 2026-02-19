import type { EditConfirmationResult } from "src/ui/components/workflow/EditConfirmationModal";
import type { McpAppInfo } from "src/types";

// Workflow node types
export type WorkflowNodeType =
  | "variable"
  | "set"
  | "if"
  | "while"
  | "command"
  | "http"
  | "json"
  | "note"
  | "note-read"
  | "note-search"
  | "note-list"
  | "folder-list"
  | "open"
  | "dialog"
  | "prompt-file"
  | "prompt-selection"
  | "workflow"
  | "rag-sync"
  | "file-explorer"
  | "file-save"
  | "mcp"
  | "obsidian-command"
  | "sleep";

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  canvasNodeId: string;
  properties: Record<string, string>;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  label?: string; // "true" or "false" for conditional nodes
}

export interface WorkflowOptions {
  showProgress?: boolean;  // Show execution progress modal (default: true)
}

export interface Workflow {
  nodes: Map<string, WorkflowNode>;
  edges: WorkflowEdge[];
  startNode: string | null;
  options?: WorkflowOptions;
}

// Information about the last executed command node (for regeneration)
export interface LastCommandInfo {
  nodeId: string;
  originalPrompt: string;
  saveTo: string;
}

// Information needed to regenerate content
export interface RegenerateInfo {
  commandNodeId: string;
  originalPrompt: string;
  previousOutput: string;
  additionalRequest: string;
}

// Execution context
export interface ExecutionContext {
  variables: Map<string, string | number>;
  chatId?: string;
  logs: ExecutionLog[];
  lastCommandInfo?: LastCommandInfo;
  regenerateInfo?: RegenerateInfo;
}

export interface ExecutionLog {
  nodeId: string;
  nodeType: WorkflowNodeType | "system";
  message: string;
  timestamp: Date;
  status: "info" | "success" | "error";
  input?: Record<string, unknown>;
  output?: unknown;
  mcpAppInfo?: McpAppInfo;  // MCP Apps UI info if available
}

// Editor position for selection
export interface EditorPosition {
  line: number;
  ch: number;
}

// Selection info for prompt-selection node
export interface SelectionInfo {
  path: string;
  start: EditorPosition;
  end: EditorPosition;
}

// File explorer data for file-explorer node
export interface FileExplorerData {
  path: string;
  basename: string;
  name: string;
  extension: string;
  mimeType: string;
  contentType: "text" | "binary";
  data: string; // text content or Base64 encoded data
}

// Condition evaluation
export type ComparisonOperator =
  | "=="
  | "!="
  | "<"
  | ">"
  | "<="
  | ">="
  | "contains";

export interface ParsedCondition {
  left: string;
  operator: ComparisonOperator;
  right: string;
}

// Sidebar types
export interface SidebarNode {
  id: string;
  type: WorkflowNodeType;
  properties: Record<string, string>;
  next?: string;
  trueNext?: string;
  falseNext?: string;
}

// Execution history types
export type ExecutionStatus = "running" | "completed" | "error" | "cancelled";
export type StepStatus = "success" | "error" | "skipped";

export interface ExecutionStep {
  nodeId: string;
  nodeType: WorkflowNodeType;
  timestamp: string;
  input?: Record<string, unknown>;
  output?: unknown;
  status: StepStatus;
  error?: string;
  mcpAppInfo?: McpAppInfo;  // MCP Apps UI info if available
}

export interface ExecutionRecord {
  id: string;
  workflowPath: string;
  workflowName?: string;
  startTime: string;
  endTime?: string;
  status: ExecutionStatus;
  steps: ExecutionStep[];
  errorNodeId?: string;
  variablesSnapshot?: Record<string, string | number>;
}

// Workflow input for execution
export interface WorkflowInput {
  variables: Map<string, string | number>;
}

// Dialog result
export interface DialogResult {
  button: string;
  selected: string[];
  input?: string;
}

// Prompt callbacks for interactive nodes
export interface PromptCallbacks {
  promptForFile: (defaultPath?: string) => Promise<string | null>;
  promptForAnyFile?: (
    extensions?: string[],
    defaultPath?: string
  ) => Promise<string | null>;
  promptForNewFilePath?: (
    extensions?: string[],
    defaultPath?: string
  ) => Promise<string | null>;
  promptForSelection: () => Promise<SelectionInfo | null>;
  promptForValue: (
    prompt: string,
    defaultValue?: string,
    multiline?: boolean
  ) => Promise<string | null>;
  promptForConfirmation: (
    filePath: string,
    content: string,
    mode: string
  ) => Promise<EditConfirmationResult>;
  promptForDialog?: (
    title: string,
    message: string,
    options: string[],
    multiSelect: boolean,
    button1: string,
    button2?: string,
    markdown?: boolean,
    inputTitle?: string,
    defaults?: { input?: string; selected?: string[] },
    multiline?: boolean
  ) => Promise<DialogResult | null>;
  openFile?: (filePath: string) => Promise<void>;
  executeSubWorkflow?: (
    workflowPath: string,
    workflowName: string | undefined,
    inputVariables: Map<string, string | number>
  ) => Promise<Map<string, string | number>>;
  promptForPassword?: () => Promise<string | null>;
  showMcpApp?: (mcpApp: McpAppInfo) => Promise<void>;
  onThinking?: (nodeId: string, thinking: string) => void;  // Stream thinking content
}
