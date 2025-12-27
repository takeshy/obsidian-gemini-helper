import type { Content } from "@google/genai";

// Slash command definition
export interface SlashCommand {
  id: string;
  name: string;                 // コマンド名 (例: "translate")
  promptTemplate: string;       // テンプレート (例: "{selection}を英語に翻訳して")
  model?: ModelType | null;     // null = 現在のモデルを使用
  description?: string;         // オートコンプリートに表示
  searchSetting?: string | null; // null = 現在の設定, "" = None, "__websearch__" = Web Search, その他 = Semantic Search設定名
}

// Settings interface
export interface GeminiHelperSettings {
  googleApiKey: string;

  // RAG settings
  ragEnabled: boolean;
  ragTopK: number;  // Number of chunks to retrieve (default: 5)

  // Workspace settings
  workspaceFolder: string;
  saveChatHistory: boolean;
  systemPrompt: string;

  // Slash commands
  slashCommands: SlashCommand[];
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

// Model types (includes both chat and image generation models)
export type ModelType =
  | "gemini-3-flash-preview"
  | "gemini-3-pro-preview"
  | "gemini-2.5-flash-lite"
  | "gemini-2.5-flash-image"
  | "gemini-3-pro-image-preview";

export interface ModelInfo {
  name: ModelType;
  displayName: string;
  description: string;
  isImageModel?: boolean;  // true if this model is for image generation
}

export const AVAILABLE_MODELS: ModelInfo[] = [
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
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  ragUsed?: boolean;  // RAG（File Search）が使用されたか
  ragSources?: string[];  // RAG検索で見つかったソースファイル
  webSearchUsed?: boolean;  // Web Searchが使用されたか
  imageGenerationUsed?: boolean;  // Image Generationが使用されたか
  generatedImages?: GeneratedImage[];  // 生成された画像
}

// 保留中の編集情報
export interface PendingEditInfo {
  originalPath: string;
  status: "pending" | "applied" | "discarded";
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
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
        enum?: string[];
      }
    >;
    required?: string[];
  };
}

// File Search types
export interface FileSearchStore {
  id: string;
  name: string;
  createdAt: number;
  fileCount: number;
}

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
  type: "text" | "tool_call" | "tool_result" | "error" | "done" | "rag_used" | "web_search_used" | "image_generated";
  content?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  error?: string;
  ragSources?: string[];  // RAG検索で見つかったソースファイル
  generatedImage?: GeneratedImage;  // 生成された画像
}

// Default model
export const DEFAULT_MODEL: ModelType = "gemini-3-flash-preview";

// Default settings
export const DEFAULT_SETTINGS: GeminiHelperSettings = {
  googleApiKey: "",
  ragEnabled: false,
  ragTopK: 5,  // Default: retrieve 5 chunks
  workspaceFolder: "GeminiHelper",
  saveChatHistory: true,
  systemPrompt: "",
  slashCommands: [],
};
