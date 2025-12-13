import { useState, type ReactNode } from "react";
import { Copy, Check, CheckCircle, XCircle } from "lucide-react";
import type { Message } from "src/types";
import { AVAILABLE_MODELS } from "src/types";

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  onApplyEdit?: () => Promise<void>;
  onDiscardEdit?: () => Promise<void>;
}

export default function MessageBubble({
  message,
  isStreaming,
  onApplyEdit,
  onDiscardEdit,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  // Get model display name
  const getModelDisplayName = () => {
    if (isUser) return "You";
    if (!message.model) return "Gemini";
    const modelInfo = AVAILABLE_MODELS.find(m => m.name === message.model);
    return modelInfo?.displayName || message.model;
  };

  // ツール名を日本語表示に変換
  const getToolDisplayInfo = (toolName: string): { icon: string; label: string } => {
    const toolDisplayMap: Record<string, { icon: string; label: string }> = {
      read_note: { icon: "📖", label: "ノートを読みました" },
      create_note: { icon: "📝", label: "ノートを作成しました" },
      update_note: { icon: "✏️", label: "ノートを更新しました" },
      delete_note: { icon: "🗑️", label: "ノートを削除しました" },
      rename_note: { icon: "📋", label: "ノートをリネームしました" },
      search_notes: { icon: "🔍", label: "ノートを検索しました" },
      list_notes: { icon: "📂", label: "ノート一覧を取得しました" },
      list_folders: { icon: "📁", label: "フォルダ一覧を取得しました" },
      create_folder: { icon: "📁", label: "フォルダを作成しました" },
      get_active_note_info: { icon: "📄", label: "アクティブノート情報を取得しました" },
      get_rag_sync_status: { icon: "🔄", label: "RAG同期状態を確認しました" },
      propose_edit: { icon: "✏️", label: "編集プレビューを作成しました" },
      apply_edit: { icon: "✅", label: "編集を適用しました" },
      discard_edit: { icon: "❌", label: "編集を破棄しました" },
    };
    return toolDisplayMap[toolName] || { icon: "🔧", label: toolName };
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Failed to copy
    }
  };

  return (
    <div
      className={`gemini-helper-message ${
        isUser ? "gemini-helper-message-user" : "gemini-helper-message-assistant"
      } ${isStreaming ? "gemini-helper-message-streaming" : ""}`}
    >
      <div className="gemini-helper-message-header">
        <span className="gemini-helper-message-role">
          {getModelDisplayName()}
        </span>
        <span className="gemini-helper-message-time">
          {formatTime(message.timestamp)}
        </span>
        {!isStreaming && (
          <button
            className="gemini-helper-copy-btn"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        )}
      </div>

      {/* RAG使用インジケータ */}
      {message.ragUsed && (
        <div className="gemini-helper-rag-used">
          <span className="gemini-helper-rag-indicator">
            📚 RAGで検索しました
          </span>
        </div>
      )}

      {/* ツール使用インジケータ */}
      {message.toolsUsed && message.toolsUsed.length > 0 && (
        <div className="gemini-helper-tools-used">
          {message.toolsUsed.map((tool, index) => {
            const { icon, label } = getToolDisplayInfo(tool);
            return (
              <span key={index} className="gemini-helper-tool-indicator">
                {icon} {label}
              </span>
            );
          })}
        </div>
      )}

      {/* 添付ファイル表示 */}
      {message.attachments && message.attachments.length > 0 && (
        <div className="gemini-helper-attachments">
          {message.attachments.map((attachment, index) => (
            <span key={index} className="gemini-helper-attachment">
              {attachment.type === "image" && "🖼️"}
              {attachment.type === "pdf" && "📄"}
              {attachment.type === "text" && "📃"}
              {" "}{attachment.name}
            </span>
          ))}
        </div>
      )}

      <div className="gemini-helper-message-content">
        {renderContent(message.content)}
      </div>

      {/* 編集プレビューボタン */}
      {message.pendingEdit && message.pendingEdit.status === "pending" && (
        <div className="gemini-helper-pending-edit">
          <div className="gemini-helper-pending-edit-info">
            📄 <strong>{message.pendingEdit.originalPath}</strong> を編集しました
          </div>
          <div className="gemini-helper-pending-edit-actions">
            <button
              className="gemini-helper-edit-btn gemini-helper-edit-apply"
              onClick={onApplyEdit}
              title="変更を適用"
            >
              <CheckCircle size={16} />
              適用する
            </button>
            <button
              className="gemini-helper-edit-btn gemini-helper-edit-discard"
              onClick={onDiscardEdit}
              title="変更を破棄"
            >
              <XCircle size={16} />
              破棄する
            </button>
          </div>
        </div>
      )}

      {/* 編集適用済み表示 */}
      {message.pendingEdit && message.pendingEdit.status === "applied" && (
        <div className="gemini-helper-edit-status gemini-helper-edit-applied">
          ✅ <strong>{message.pendingEdit.originalPath}</strong> に変更を適用しました
        </div>
      )}

      {/* 編集破棄済み表示 */}
      {message.pendingEdit && message.pendingEdit.status === "discarded" && (
        <div className="gemini-helper-edit-status gemini-helper-edit-discarded">
          ❌ 変更を破棄しました
        </div>
      )}
    </div>
  );
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderContent(content: string): ReactNode {
  // Simple markdown-like rendering
  const lines = content.split("\n");

  return (
    <>
      {lines.map((line, index) => {
        // Code blocks
        if (line.startsWith("```")) {
          return null; // Handle in a more complex implementation
        }

        // Headers
        if (line.startsWith("### ")) {
          return (
            <h4 key={index} className="gemini-helper-h4">
              {line.slice(4)}
            </h4>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <h3 key={index} className="gemini-helper-h3">
              {line.slice(3)}
            </h3>
          );
        }
        if (line.startsWith("# ")) {
          return (
            <h2 key={index} className="gemini-helper-h2">
              {line.slice(2)}
            </h2>
          );
        }

        // Lists
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <li key={index} className="gemini-helper-list-item">
              {line.slice(2)}
            </li>
          );
        }

        // Numbered lists
        const numberedMatch = line.match(/^\d+\.\s/);
        if (numberedMatch) {
          return (
            <li key={index} className="gemini-helper-list-item">
              {line.slice(numberedMatch[0].length)}
            </li>
          );
        }

        // Bold
        const boldContent = line.replace(
          /\*\*(.+?)\*\*/g,
          "<strong>$1</strong>"
        );

        // Inline code
        const codeContent = boldContent.replace(
          /`([^`]+)`/g,
          '<code class="gemini-helper-inline-code">$1</code>'
        );

        // Empty line
        if (!line.trim()) {
          return <br key={index} />;
        }

        return (
          <p
            key={index}
            className="gemini-helper-paragraph"
            dangerouslySetInnerHTML={{ __html: codeContent }}
          />
        );
      })}
    </>
  );
}
