import type { Content } from "@google/genai";

// Slash command definition
export interface SlashCommand {
  id: string;
  name: string;                 // コマンド名 (例: "translate")
  promptTemplate: string;       // テンプレート (例: "{selection}を英語に翻訳して")
  model?: ModelType | null;     // null = 現在のモデルを使用
  description?: string;         // オートコンプリートに表示
  searchSetting?: string | null; // null = 現在の設定, "" = None, "__websearch__" = Web Search, その他 = Semantic Search設定名
  confirmEdits?: boolean;       // undefined/true = 編集確認を表示, false = 自動適用
}

// Settings interface
export interface GeminiHelperSettings {
  googleApiKey: string;
  apiPlan: ApiPlan;

  // CLI provider settings
  cliConfig: CliProviderConfig;

  // RAG settings
  ragEnabled: boolean;
  ragTopK: number;  // Number of chunks to retrieve (default: 5)

  // Workspace settings
  workspaceFolder: string;
  saveChatHistory: boolean;
  systemPrompt: string;

  // Slash commands
  slashCommands: SlashCommand[];

  // Workflow hotkeys
  enabledWorkflowHotkeys: string[];  // Workflow identifiers in format "path#name" (e.g., "folder/file.md#MyWorkflow")

  // Function call limits (for settings UI)
  maxFunctionCalls: number;           // 最大function call回数
  functionCallWarningThreshold: number; // 残りこの回数で警告
  listNotesLimit: number;             // listNotesのデフォルト件数制限
  maxNoteChars: number;               // ノート読み込み時の最大文字数
}

// 個別のRAG設定
export interface RagSetting {
  storeId: string | null;       // File Search Store ID (Internal用)
  storeIds: string[];           // File Search Store IDs (External用、複数可)
  storeName: string | null;     // 内部ストア名
  isExternal: boolean;          // 外部ストアかどうか
  targetFolders: string[];      // 対象フォルダ（空の場合は全体）
  excludePatterns: string[];    // 正規表現パターンでファイルを除外
  files: Record<string, RagFileInfo>;  // path -> file info
  lastFullSync: number | null;
}

export interface RagFileInfo {
  checksum: string;
  uploadedAt: number;
  fileId: string | null;  // File Search API上のファイルID
}

// Workspace状態ファイル（.gemini-workspace.json）
export interface WorkspaceState {
  selectedRagSetting: string | null;  // 現在選択中のRAG設定名
  selectedModel: ModelType | null;    // 現在選択中のモデル
  ragSettings: Record<string, RagSetting>;  // 設定名 -> RAG設定
}

// デフォルトのRAG設定
export const DEFAULT_RAG_SETTING: RagSetting = {
  storeId: null,
  storeIds: [],
  storeName: null,
  isExternal: false,
  targetFolders: [],
  excludePatterns: [],
  files: {},
  lastFullSync: null,
};

// デフォルトのWorkspace状態
export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  selectedRagSetting: null,
  selectedModel: null,
  ragSettings: {},
};

// 後方互換性のためのエイリアス（旧RagState形式）
export interface RagState {
  storeId: string | null;
  storeName: string | null;
  files: Record<string, RagFileInfo>;
  lastFullSync: number | null;
  includeFolders: string[];
  excludePatterns: string[];
}

export const DEFAULT_RAG_STATE: RagState = {
  storeId: null,
  storeName: null,
  files: {},
  lastFullSync: null,
  includeFolders: [],
  excludePatterns: [],
};

export type RagSyncState = Pick<RagState, "files" | "lastFullSync">;

export type ApiPlan = "paid" | "free";

// Chat provider types
export type ChatProvider = "api" | "gemini-cli" | "claude-cli" | "codex-cli";

export interface CliProviderConfig {
  cliVerified?: boolean;        // Whether Gemini CLI has been verified
  claudeCliVerified?: boolean;  // Whether Claude CLI has been verified
  codexCliVerified?: boolean;   // Whether Codex CLI has been verified
}

export const DEFAULT_CLI_CONFIG: CliProviderConfig = {
  cliVerified: false,
  claudeCliVerified: false,
  codexCliVerified: false,
};

// Helper to check if any CLI is verified
export function hasVerifiedCli(config: CliProviderConfig): boolean {
  return !!(config.cliVerified || config.claudeCliVerified || config.codexCliVerified);
}

// Model types (includes both chat and image generation models)
export type ModelType =
  | "gemini-2.5-flash"
  | "gemini-2.5-pro"
  | "gemini-3-flash-preview"
  | "gemini-3-pro-preview"
  | "gemini-2.5-flash-lite"
  | "gemini-2.5-flash-image"
  | "gemini-3-pro-image-preview"
  | "gemma-3-27b-it"
  | "gemma-3-12b-it"
  | "gemma-3-4b-it"
  | "gemma-3-1b-it"
  | "gemini-cli"
  | "claude-cli"
  | "codex-cli";

export interface ModelInfo {
  name: ModelType;
  displayName: string;
  description: string;
  isImageModel?: boolean;  // true if this model is for image generation
  isCliModel?: boolean;    // true if this model is CLI-based
}

// CLI model definitions
export const CLI_MODEL: ModelInfo = {
  name: "gemini-cli",
  displayName: "Gemini CLI",
  description: "Google Gemini via command line (requires Google account)",
  isCliModel: true,
};

export const CLAUDE_CLI_MODEL: ModelInfo = {
  name: "claude-cli",
  displayName: "Claude CLI",
  description: "Anthropic Claude via command line (requires Anthropic account)",
  isCliModel: true,
};

export const CODEX_CLI_MODEL: ModelInfo = {
  name: "codex-cli",
  displayName: "Codex CLI",
  description: "OpenAI Codex via command line (requires OpenAI account)",
  isCliModel: true,
};

export const PAID_MODELS: ModelInfo[] = [
  {
    name: "gemini-3-flash-preview",
    displayName: "Gemini 3 Flash Preview",
    description: "Latest fast model with 1M context, best cost-performance (recommended)",
  },
  {
    name: "gemini-3-pro-preview",
    displayName: "Gemini 3 Pro Preview",
    description: "Latest flagship model with 1M context, best performance",
  },
  {
    name: "gemini-2.5-flash-lite",
    displayName: "Gemini 2.5 Flash Lite",
    description: "Lightweight flash model",
  },
  {
    name: "gemini-2.5-flash-image",
    displayName: "Gemini 2.5 Flash (Image)",
    description: "Fast image generation, max 1024px",
    isImageModel: true,
  },
  {
    name: "gemini-3-pro-image-preview",
    displayName: "Gemini 3 Pro (Image)",
    description: "Pro quality image generation, up to 4K",
    isImageModel: true,
  },
];

export const FREE_MODELS: ModelInfo[] = [
  {
    name: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    description: "Free tier fast model",
  },
  {
    name: "gemini-2.5-flash-lite",
    displayName: "Gemini 2.5 Flash Lite",
    description: "Free tier lightweight model",
  },
  {
    name: "gemini-3-flash-preview",
    displayName: "Gemini 3 Flash Preview",
    description: "Free tier preview model",
  },
  {
    name: "gemma-3-27b-it",
    displayName: "Gemma 3 27B (No vault ops)",
    description: "Free tier Gemma model (no function calling)",
  },
  {
    name: "gemma-3-12b-it",
    displayName: "Gemma 3 12B (No vault ops)",
    description: "Free tier Gemma model (no function calling)",
  },
  {
    name: "gemma-3-4b-it",
    displayName: "Gemma 3 4B (No vault ops)",
    description: "Free tier Gemma model (no function calling)",
  },
  {
    name: "gemma-3-1b-it",
    displayName: "Gemma 3 1B (No vault ops)",
    description: "Free tier Gemma model (no function calling)",
  },
];

function mergeModelLists(lists: ModelInfo[][]): ModelInfo[] {
  const merged: ModelInfo[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const model of list) {
      if (!seen.has(model.name)) {
        seen.add(model.name);
        merged.push(model);
      }
    }
  }
  return merged;
}

export const AVAILABLE_MODELS: ModelInfo[] = mergeModelLists([PAID_MODELS, FREE_MODELS]);

export function getAvailableModels(plan: ApiPlan): ModelInfo[] {
  return plan === "free" ? FREE_MODELS : PAID_MODELS;
}

export function isModelAllowedForPlan(plan: ApiPlan, modelName: ModelType): boolean {
  return getAvailableModels(plan).some((model) => model.name === modelName);
}

// Helper function to check if a model is an image model
export function isImageGenerationModel(modelName: ModelType): boolean {
  const model = AVAILABLE_MODELS.find(m => m.name === modelName);
  return model?.isImageModel ?? false;
}

// Chat message types
// Generated image from Gemini
export interface GeneratedImage {
  mimeType: string;
  data: string;  // Base64 encoded image data
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  model?: ModelType;  // モデル名（assistantの場合のみ）
  toolsUsed?: string[];  // 使用したツール名の配列
  attachments?: Attachment[];  // 添付ファイル
  pendingEdit?: PendingEditInfo;  // 保留中の編集情報
  pendingDelete?: PendingDeleteInfo;  // 保留中の削除情報
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  ragUsed?: boolean;  // RAG（File Search）が使用されたか
  ragSources?: string[];  // RAG検索で見つかったソースファイル
  webSearchUsed?: boolean;  // Web Searchが使用されたか
  imageGenerationUsed?: boolean;  // Image Generationが使用されたか
  generatedImages?: GeneratedImage[];  // 生成された画像
  thinking?: string;  // モデルの思考内容（thinkingモデル用）
}

// 保留中の編集情報
export interface PendingEditInfo {
  originalPath: string;
  status: "pending" | "applied" | "discarded" | "failed";
}

// 保留中の削除情報
export interface PendingDeleteInfo {
  path: string;
  status: "pending" | "deleted" | "cancelled" | "failed";
}

// 添付ファイル
export interface Attachment {
  name: string;
  type: "image" | "pdf" | "text";
  mimeType: string;
  data: string;  // Base64エンコードされたデータ
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  result: unknown;
}

// Conversation history for Gemini API
export interface ConversationHistory {
  contents: Content[];
}

// Tool definition for Function Calling
export interface ToolPropertyDefinition {
  type: string;
  description: string;
  enum?: string[];
  items?: ToolPropertyDefinition | {
    type: string;
    properties?: Record<string, ToolPropertyDefinition>;
    required?: string[];
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolPropertyDefinition>;
    required?: string[];
  };
}

// File Search types
export interface FileSearchResult {
  content: string;
  filePath: string;
  score: number;
}

export interface SyncStatus {
  lastSync: number | null;
  syncedFiles: string[];
  pendingFiles: string[];
  isRunning: boolean;
}

// Streaming chunk types
export interface StreamChunk {
  type: "text" | "thinking" | "tool_call" | "tool_result" | "error" | "done" | "rag_used" | "web_search_used" | "image_generated";
  content?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  error?: string;
  ragSources?: string[];  // RAG検索で見つかったソースファイル
  generatedImage?: GeneratedImage;  // 生成された画像
}

// Default model
export const DEFAULT_MODEL: ModelType = "gemini-3-flash-preview";

// Default slash commands
export const DEFAULT_SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "cmd_infographic_default",
    name: "infographic",
    promptTemplate: "Convert the following content into an HTML infographic. Output the HTML directly in your response, do not create a note:\n\n{selection}",
    model: null,
    description: "Generate HTML infographic from selection or active note",
    searchSetting: null,
  },
];

// Default settings
export const DEFAULT_SETTINGS: GeminiHelperSettings = {
  googleApiKey: "",
  apiPlan: "paid",
  cliConfig: DEFAULT_CLI_CONFIG,
  ragEnabled: false,
  ragTopK: 5,  // Default: retrieve 5 chunks
  workspaceFolder: "GeminiHelper",
  saveChatHistory: true,
  systemPrompt: "",
  slashCommands: DEFAULT_SLASH_COMMANDS,
  enabledWorkflowHotkeys: [],
  // Function call limits
  maxFunctionCalls: 20,
  functionCallWarningThreshold: 5,
  listNotesLimit: 50,
  maxNoteChars: 20000,
};
