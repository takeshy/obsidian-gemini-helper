import type { Content, Part } from "@google/genai";

// Settings interface
export interface GeminiHelperSettings {
  googleApiKey: string;
  model: ModelType;

  // RAG settings
  ragEnabled: boolean;
  ragStoreId: string | null;
  ragIncludeFolders: string[];   // 対象フォルダ（空の場合は全体）
  ragExcludePatterns: string[];  // 正規表現パターンでファイルを除外
  ragAutoSync: boolean;
  ragSyncState: RagSyncState;    // 同期状態（チェックサム等）

  // Chat settings
  chatsFolder: string;
  systemPrompt: string;

  // Other
  debugMode: boolean;
}

// RAG同期状態
export interface RagSyncState {
  files: Record<string, RagFileInfo>;  // path -> file info
  lastFullSync: number | null;
}

export interface RagFileInfo {
  checksum: string;
  uploadedAt: number;
  fileId: string | null;  // File Search API上のファイルID
}

// Model types
export type ModelType =
  | "gemini-3-pro-preview"
  | "gemini-2.5-pro"
  | "gemini-2.5-flash"
  | "gemini-2.5-flash-lite"
  | "gemini-2.0-flash"
  | "gemini-2.0-flash-lite";

export interface ModelInfo {
  name: ModelType;
  displayName: string;
  description: string;
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    name: "gemini-3-pro-preview",
    displayName: "Gemini 3 Pro Preview",
    description: "Latest flagship model with 1M context, best performance (recommended)",
  },
  {
    name: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    description: "Stable pro model for complex tasks",
  },
  {
    name: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    description: "Fast and capable model",
  },
  {
    name: "gemini-2.5-flash-lite",
    displayName: "Gemini 2.5 Flash Lite",
    description: "Lightweight flash model",
  },
  {
    name: "gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash",
    description: "Fast and efficient model",
  },
  {
    name: "gemini-2.0-flash-lite",
    displayName: "Gemini 2.0 Flash Lite",
    description: "Lightweight model for simple tasks",
  },
];

// Chat message types
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
  type: "text" | "tool_call" | "tool_result" | "error" | "done" | "rag_used";
  content?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  error?: string;
  ragSources?: string[];  // RAG検索で見つかったソースファイル
}

// Default settings
export const DEFAULT_SETTINGS: GeminiHelperSettings = {
  googleApiKey: "",
  model: "gemini-2.5-flash",
  ragEnabled: false,
  ragStoreId: null,
  ragIncludeFolders: [],
  ragExcludePatterns: [],
  ragAutoSync: false,
  ragSyncState: {
    files: {},
    lastFullSync: null,
  },
  chatsFolder: "Chats",
  systemPrompt: "",
  debugMode: false,
};
