import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent } from "react";
import { Send, Paperclip, StopCircle } from "lucide-react";
import { AVAILABLE_MODELS, type ModelType, type Attachment } from "src/types";

interface InputAreaProps {
  onSend: (content: string, attachments?: Attachment[]) => void;
  onStop?: () => void;
  isLoading: boolean;
  model: ModelType;
  onModelChange: (model: ModelType) => void;
}

// 対応ファイル形式
const SUPPORTED_TYPES = {
  image: ["image/png", "image/jpeg", "image/gif", "image/webp"],
  pdf: ["application/pdf"],
  text: ["text/plain", "text/markdown", "text/csv", "application/json"],
};

export default function InputArea({ onSend, onStop, isLoading, model, onModelChange }: InputAreaProps) {
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200
      )}px`;
    }
  }, [input]);

  const handleSubmit = () => {
    if ((input.trim() || pendingAttachments.length > 0) && !isLoading) {
      onSend(input, pendingAttachments.length > 0 ? pendingAttachments : undefined);
      setInput("");
      setPendingAttachments([]);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const attachment = await processFile(file);
      if (attachment) {
        setPendingAttachments(prev => [...prev, attachment]);
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const processFile = async (file: File): Promise<Attachment | null> => {
    const mimeType = file.type;

    // 画像
    if (SUPPORTED_TYPES.image.includes(mimeType)) {
      const data = await fileToBase64(file);
      return { name: file.name, type: "image", mimeType, data };
    }

    // PDF
    if (SUPPORTED_TYPES.pdf.includes(mimeType)) {
      const data = await fileToBase64(file);
      return { name: file.name, type: "pdf", mimeType, data };
    }

    // テキスト
    if (SUPPORTED_TYPES.text.includes(mimeType) || file.name.endsWith(".md") || file.name.endsWith(".txt")) {
      const data = await fileToBase64(file);
      return { name: file.name, type: "text", mimeType: mimeType || "text/plain", data };
    }

    console.warn(`Unsupported file type: ${mimeType}`);
    return null;
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (e.g., "data:image/png;base64,")
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (index: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const getAllAcceptedTypes = () => {
    return [...SUPPORTED_TYPES.image, ...SUPPORTED_TYPES.pdf, ...SUPPORTED_TYPES.text, ".md", ".txt"].join(",");
  };

  return (
    <div className="gemini-helper-input-container">
      {/* 添付ファイル表示 */}
      {pendingAttachments.length > 0 && (
        <div className="gemini-helper-pending-attachments">
          {pendingAttachments.map((attachment, index) => (
            <span key={index} className="gemini-helper-pending-attachment">
              {attachment.type === "image" && "🖼️"}
              {attachment.type === "pdf" && "📄"}
              {attachment.type === "text" && "📃"}
              {" "}{attachment.name}
              <button
                className="gemini-helper-pending-attachment-remove"
                onClick={() => removeAttachment(index)}
                title="Remove attachment"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="gemini-helper-input-area">
        {/* 隠しファイル入力 */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={getAllAcceptedTypes()}
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />

        {/* 添付ボタン */}
        <button
          className="gemini-helper-attachment-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          title="Attach file (images, PDF, text)"
        >
          <Paperclip size={18} />
        </button>

        <textarea
          ref={textareaRef}
          className="gemini-helper-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
          disabled={isLoading}
          rows={1}
        />
        {isLoading ? (
          <button
            className="gemini-helper-stop-btn"
            onClick={onStop}
            title="Stop generation"
          >
            <StopCircle size={18} />
          </button>
        ) : (
          <button
            className="gemini-helper-send-btn"
            onClick={handleSubmit}
            disabled={!input.trim() && pendingAttachments.length === 0}
            title="Send message"
          >
            <Send size={18} />
          </button>
        )}
      </div>
      <div className="gemini-helper-model-selector">
        <select
          className="gemini-helper-model-select"
          value={model}
          onChange={(e) => onModelChange(e.target.value as ModelType)}
          disabled={isLoading}
        >
          {AVAILABLE_MODELS.map((m) => (
            <option key={m.name} value={m.name}>
              {m.displayName}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
