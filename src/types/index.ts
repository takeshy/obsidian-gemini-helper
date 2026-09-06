import type { McpServerConfig } from "obsidian-llm-hub-common/core";
export type { McpServerConfig, McpTransport, McpFraming } from "obsidian-llm-hub-common/core";

export type { Message, ToolCall, ToolResult, Attachment, PendingEditInfo, PendingDeleteInfo, PendingRenameInfo, WebSearchSource, GeneratedImage } from "obsidian-llm-hub-common/chat";
import type { WorkflowEventTrigger } from "obsidian-llm-hub-common/workflow";

export type { ObsidianEventType, WorkflowEventTrigger } from "obsidian-llm-hub-common/workflow";
import type { Content } from "@google/genai";

export interface AgentPluginInstall {
  name: string;
  repo: string;
  version: string;
  sourceType: "release" | "branch";
  sourceRef: string;
  commitSha: string;
  enabled: boolean;
  skillNames: string[];
  executables?: string[];
}

// MCP (Model Context Protocol) server configuration

// MCP tool information (from server)
export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  _meta?: {
    ui?: {
      resourceUri: string;  // ui:// URI for MCP Apps
    };
    "ui/resourceUri"?: string;
  };
}

// MCP Apps types
export interface McpAppContent {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
  resource?: {
    uri: string;
    mimeType?: string;
    text?: string;
  };
}

export interface McpAppResult {
  content: McpAppContent[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  _meta?: {
    ui?: {
      resourceUri: string;
    };
    "ui/resourceUri"?: string;
  };
}

// MCP App UI resource (HTML/JS content from ui:// scheme)
export interface McpAppUiResource {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: string;  // Base64 encoded binary data
  _meta?: {
    ui?: {
      csp?: {
        connectDomains?: string[];
        connect_domains?: string[];
        resourceDomains?: string[];
        resource_domains?: string[];
        frameDomains?: string[];
        frame_domains?: string[];
        baseUriDomains?: string[];
        base_uri_domains?: string[];
      };
    };
  };
}


export interface KnowledgeSource {
  id: string;
  name: string;
  path: string;
  type: "okf";
  enabled: boolean;
  // Bundle ids active for this source. Persisted so the selection survives
  // restarts. Undefined means "never chosen" and defaults to all bundles on.
  activeBundleIds?: string[];
}

// Vault tool mode type
// Shared: the built-in Vault tool policy lives in the library.
import type { VaultToolMode } from "obsidian-llm-hub-common/core";
export type { VaultToolMode };

// Reason why vault tools are set to "none"
// "manual" = user manually turned off (MCP servers remain unchanged)
export type VaultToolNoneReason = "manual";

// Slash command definition
export interface SlashCommand {
  id: string;
  name: string;                 // コマンド名 (例: "translate")
  promptTemplate: string;       // テンプレート (例: "{selection}を英語に翻訳して")
  model?: ModelType | null;     // null = 現在のモデルを使用
  description?: string;         // オートコンプリートに表示
  searchSetting?: string | null; // null = 現在の設定, "" = None, "__websearch__" = Web Search, その他 = Semantic Search設定名
  confirmEdits?: boolean;       // undefined/true = 編集確認を表示, false = 自動適用
  vaultToolMode?: VaultToolMode | null; // null = 現在の設定, "all" = すべて, "noSearch" = 検索なし, "none" = オフ
  enabledMcpServers?: string[] | null;  // null = 現在の設定, [] = すべてオフ, ["name1", "name2"] = 指定のサーバーのみ有効
}

// Settings interface
export interface GeminiHelperSettings {
  skillsFolder?: string;      // Vault folder holding skills (defaults to SKILLS_FOLDER)
  googleApiKey: string;
  /** Non-secret marker used to detect a missing device-local SecretStorage value. */
  googleApiKeyConfigured: boolean;
  apiPlan: ApiPlan;

  // RAG settings
  ragEnabled: boolean;
  ragTopK: number;  // Number of chunks to retrieve (default: 5)

  // Workspace settings
  workspaceFolder: string;
  /** Vault-relative folder used by "Save as note". Empty uses the vault root. */
  manualChatSaveFolder: string;
  hideWorkspaceFolder: boolean;
  saveChatHistory: boolean;
  /** Maximum automatically saved chats. Zero keeps all chats. */
  maxSavedChatHistories: number;
  systemPrompt: string;

  // Slash commands
  slashCommands: SlashCommand[];

  // Knowledge sources
  knowledgeSources: KnowledgeSource[];

  // Workflow hotkeys
  enabledWorkflowHotkeys: string[];  // Workflow identifiers in format "path#name" (e.g., "folder/file.md#MyWorkflow")

  // Workflow event triggers
  enabledWorkflowEventTriggers: WorkflowEventTrigger[];  // Event-triggered workflows

  // MCP servers
  mcpServers: McpServerConfig[];  // External MCP server configurations
  agentPlugins: AgentPluginInstall[];

  // Function call limits (for settings UI)
  maxFunctionCalls: number;           // 最大function call回数
  functionCallWarningThreshold: number; // 残りこの回数で警告
  listNotesLimit: number;             // listNotesのデフォルト件数制限
  maxNoteChars: number;               // ノート読み込み時の最大文字数
  aiVaultToolAllowedFolders: string[]; // Empty = AI vault tools can access the whole vault

  // Edit history settings
  editHistory: EditHistorySettings;

  // Encryption settings
  encryption: EncryptionSettings;

  // Langfuse observability
  langfuse: LangfuseSettings;

  // Last used model for AI workflow generation
  lastAIWorkflowModel?: string;

  // Last used model for Timeline AI rewrite
  lastTimelineAiModel?: string;

  // Last selected workflow path in Run Workflow modal
  lastSelectedWorkflowPath?: string;

}

// Edit history settings
export interface EditHistorySettings {
  enabled: boolean;
  diff: {
    contextLines: number;
  };
}

// Langfuse observability settings
// Tracing is active when both publicKey and secretKey are set.
export interface LangfuseSettings {
  publicKey: string;      // Langfuse public key
  secretKey: string;      // Langfuse secret key
  baseUrl: string;        // Default: "https://cloud.langfuse.com"
  logPrompts: boolean;    // Default: false (privacy)
  logResponses: boolean;  // Default: false (privacy)
}

export const DEFAULT_LANGFUSE_SETTINGS: LangfuseSettings = {
  publicKey: "",
  secretKey: "",
  baseUrl: "https://cloud.langfuse.com",
  logPrompts: false,
  logResponses: false,
};

// Encryption settings for chat history and workflow logs
export interface EncryptionSettings {
  enabled: boolean;  // Whether encryption keys are set up
  encryptChatHistory: boolean;  // Whether to encrypt AI chat history
  encryptWorkflowHistory: boolean;  // Whether to encrypt workflow execution logs
  publicKey: string;  // Base64 encoded public key (for encryption without password)
  encryptedPrivateKey: string;  // Base64 encoded encrypted private key
  salt: string;  // Base64 encoded salt for password derivation
}

export const DEFAULT_EDIT_HISTORY_SETTINGS: EditHistorySettings = {
  enabled: true,
  diff: {
    contextLines: 3,
  },
};

export const DEFAULT_ENCRYPTION_SETTINGS: EncryptionSettings = {
  enabled: false,
  encryptChatHistory: false,
  encryptWorkflowHistory: false,
  publicKey: "",
  encryptedPrivateKey: "",
  salt: "",
};

// 個別のRAG設定
export interface RagSetting {
  storeId: string | null;       // File Search Store ID (Internal用)
  storeIds: string[];           // File Search Store IDs (External用、複数可)
  storeName: string | null;     // 内部ストア名
  embeddingModel: string | null; // Internal store embedding model
  isExternal: boolean;          // 外部ストアかどうか
  targetFolders: string[];      // 対象フォルダ（空の場合は全体）
  excludePatterns: string[];    // 正規表現パターンでファイルを除外
  metadataFilter: string;       // File Search query-time metadata filter
  files: Record<string, RagFileInfo>;  // path -> file info
  lastFullSync: number | null;
}

export interface RagFileInfo {
  checksum: string;
  uploadedAt: number;
  fileId: string | null;  // File Search API上のファイルID
}

// Chat thinking level. "default" leaves the choice to the Gemini API.
export const REASONING_EFFORTS: ReasoningEffort[] = ["default", "minimal", "low", "medium", "high"];

// Workspace状態ファイル（.gemini-workspace.json）
export interface WorkspaceState {
  selectedRagSetting: string | null;  // 現在選択中のRAG設定名
  webSearchEnabled: boolean;          // Web SearchはRAGとは独立して保持
  selectedModel: ModelType | null;    // 現在選択中のモデル
  ragSettings: Record<string, RagSetting>;  // 設定名 -> RAG設定
  reasoningEffortByModel?: Record<string, ReasoningEffort>;  // Chat thinking level per model ("default" entries are omitted)
  maxPreviousMessages?: number;      // Older chat messages sent with the current one (0-99)
  sentPromptHistory?: string[];       // Recently sent prompts for input history navigation
}

// デフォルトのRAG設定
export const DEFAULT_RAG_SETTING: RagSetting = {
  storeId: null,
  storeIds: [],
  storeName: null,
  embeddingModel: null,
  isExternal: false,
  targetFolders: [],
  excludePatterns: [],
  metadataFilter: "",
  files: {},
  lastFullSync: null,
};

// デフォルトのWorkspace状態
export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  selectedRagSetting: null,
  webSearchEnabled: false,
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

// Model types (includes both chat and image generation models)
export type ModelType =
  | "gemini-3.8-flash"
  | "gemini-3.1-pro-preview"
  | "gemini-3.1-pro-preview-customtools"
  | "gemini-3.5-flash-lite"
  | "gemini-3-pro-image"
  | "gemini-3.1-flash-image"
  | "gemini-3.1-flash-lite-image"
  | "gemma-4-31b-it"
  | "gemma-4-26b-a4b-it";

export interface ModelInfo {
  name: ModelType;
  displayName: string;
  description: string;
  isImageModel?: boolean;  // true if this model is for image generation
  // true if the model accepts PDF/document input. Gemma 4 documents image, video
  // and audio input but not PDF, so PDFs are extracted to text for those models.
  // https://ai.google.dev/gemini-api/docs/document-processing
  // https://ai.google.dev/gemma/docs/core
  acceptsPdf?: boolean;
}

export const PAID_MODELS: ModelInfo[] = [
  {
    name: "gemini-3.8-flash",
    displayName: "Gemini 3.8 Flash",
    description: "Latest fast model with 1M context (recommended)",
    acceptsPdf: true,
  },
  {
    name: "gemini-3.1-pro-preview",
    displayName: "Gemini 3.1 Pro Preview",
    description: "Latest flagship model with 1M context, best performance (recommended)",
    acceptsPdf: true,
  },
  {
    name: "gemini-3.1-pro-preview-customtools",
    displayName: "Gemini 3.1 Pro Preview (Custom Tools)",
    description: "Optimized for agentic workflows with custom tools and bash",
    acceptsPdf: true,
  },
  {
    name: "gemini-3.5-flash-lite",
    displayName: "Gemini 3.5 Flash Lite",
    description: "Latest fast, low-cost model with 1M context",
    acceptsPdf: true,
  },
  {
    name: "gemma-4-31b-it",
    displayName: "Gemma 4 31B",
    description: "Gemma 4 model with function calling and thinking",
  },
  {
    name: "gemma-4-26b-a4b-it",
    displayName: "Gemma 4 26B A4B (MoE)",
    description: "Gemma 4 MoE model with function calling and thinking",
  },
  {
    name: "gemini-3-pro-image",
    displayName: "Gemini 3 Pro (Image)",
    description: "Pro quality image generation, up to 4K",
    isImageModel: true,
  },
  {
    name: "gemini-3.1-flash-image",
    displayName: "Gemini 3.1 Flash (Image)",
    description: "Fast, low-cost image generation",
    isImageModel: true,
  },
  {
    name: "gemini-3.1-flash-lite-image",
    displayName: "Gemini 3.1 Flash Lite (Image)",
    description: "Fastest, lowest-cost image generation, up to 1K",
    isImageModel: true,
  },
];

export const FREE_MODELS: ModelInfo[] = [
  {
    name: "gemini-3.8-flash",
    displayName: "Gemini 3.8 Flash",
    description: "Free tier latest fast model (recommended)",
    acceptsPdf: true,
  },
  {
    name: "gemini-3.5-flash-lite",
    displayName: "Gemini 3.5 Flash Lite",
    description: "Free tier latest lightweight model",
    acceptsPdf: true,
  },
  {
    name: "gemma-4-31b-it",
    displayName: "Gemma 4 31B",
    description: "Free tier Gemma 4 model with function calling and thinking",
  },
  {
    name: "gemma-4-26b-a4b-it",
    displayName: "Gemma 4 26B A4B (MoE)",
    description: "Free tier Gemma 4 MoE model with function calling and thinking",
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

// Helper function to check if a model accepts PDF/document input
export function modelAcceptsPdf(modelName: ModelType): boolean {
  const model = AVAILABLE_MODELS.find(m => m.name === modelName);
  return model?.acceptsPdf ?? false;
}

// Chat message types
// Generated image from Gemini

// MCP App info for rendering in messages
export interface McpAppInfo {
  serverUrl: string;
  serverHeaders?: Record<string, string>;
  toolResult: McpAppResult;
  uiResource?: McpAppUiResource | null;
}


export interface RagContext {
  source: string;
  text: string;
}


// 保留中の編集情報

// 保留中の削除情報

// 保留中のリネーム情報

// 添付ファイル
/** How a PDF reaches the model: as a native document part, or as extracted text. */
export type PdfInputMode = "native" | "extract-text";




// Conversation history for Gemini API
export interface ConversationHistory {
  contents: Content[];
}

// Tool definition for Function Calling


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

// Usage info for streaming chunks and messages

// Streaming chunk types

// Default models by plan
export const DEFAULT_MODEL_FREE: ModelType = "gemma-4-31b-it";
export const DEFAULT_MODEL_PAID: ModelType = "gemini-3.8-flash";

// Default model (for backwards compatibility)
export const DEFAULT_MODEL: ModelType = DEFAULT_MODEL_FREE;

// Get default model for plan
export function getDefaultModelForPlan(plan: ApiPlan): ModelType {
  return plan === "paid" ? DEFAULT_MODEL_PAID : DEFAULT_MODEL_FREE;
}

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

/** Default workspace folder name. */
export const DEFAULT_WORKSPACE_FOLDER = "GeminiHelper";
/** Fixed skills folder name. */
export const SKILLS_FOLDER = "skills";
/** Fixed workflows folder name. */
export const WORKFLOWS_FOLDER = "workflows";

// Default settings
export const DEFAULT_SETTINGS: GeminiHelperSettings = {
  googleApiKey: "",
  googleApiKeyConfigured: false,
  apiPlan: "paid",
  ragEnabled: false,
  ragTopK: 5,  // Default: retrieve 5 chunks
  workspaceFolder: DEFAULT_WORKSPACE_FOLDER,
  manualChatSaveFolder: "",
  hideWorkspaceFolder: true,
  saveChatHistory: true,
  maxSavedChatHistories: 100,
  systemPrompt: "",
  slashCommands: DEFAULT_SLASH_COMMANDS,
  knowledgeSources: [],
  enabledWorkflowHotkeys: [],
  enabledWorkflowEventTriggers: [],
  mcpServers: [],
  agentPlugins: [],
  // Function call limits
  maxFunctionCalls: 20,
  functionCallWarningThreshold: 5,
  listNotesLimit: 50,
  maxNoteChars: 20000,
  aiVaultToolAllowedFolders: [],
  // Edit history
  editHistory: DEFAULT_EDIT_HISTORY_SETTINGS,
  // Encryption
  encryption: DEFAULT_ENCRYPTION_SETTINGS,
  // Langfuse
  langfuse: DEFAULT_LANGFUSE_SETTINGS,
};

// These provider-facing shapes live in the shared library so every plugin describes tools
// and streams responses the same way.
import type { ReasoningEffort } from "obsidian-llm-hub-common/core";

export type {
  ToolDefinition,
  ToolPropertyDefinition,
  StreamChunk,
  StreamChunkUsage,
  ReasoningEffort,
  WebSearchCitation,
} from "obsidian-llm-hub-common/core";
