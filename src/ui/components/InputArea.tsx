import { useState, useRef, KeyboardEvent, ChangeEvent } from "react";
import { Send, Paperclip, StopCircle } from "lucide-react";
import { AVAILABLE_MODELS, type ModelType, type Attachment, type SlashCommand } from "src/types";

interface InputAreaProps {
  onSend: (content: string, attachments?: Attachment[]) => void | Promise<void>;
  onStop?: () => void;
  isLoading: boolean;
  model: ModelType;
  onModelChange: (model: ModelType) => void;
  ragEnabled: boolean;
  ragSettings: string[];
  selectedRagSetting: string | null;
  onRagSettingChange: (setting: string | null) => void;
  slashCommands: SlashCommand[];
  onSlashCommand: (command: SlashCommand) => Promise<string>;
}

// 対応ファイル形式
const SUPPORTED_TYPES = {
  image: ["image/png", "image/jpeg", "image/gif", "image/webp"],
  pdf: ["application/pdf"],
  text: ["text/plain", "text/markdown", "text/csv", "application/json"],
};

export default function InputArea({
  onSend,
  onStop,
  isLoading,
  model,
  onModelChange,
  ragEnabled,
  ragSettings,
  selectedRagSetting,
  onRagSettingChange,
  slashCommands,
  onSlashCommand,
}: InputAreaProps) {
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [filteredCommands, setFilteredCommands] = useState<SlashCommand[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if ((input.trim() || pendingAttachments.length > 0) && !isLoading) {
      void onSend(input, pendingAttachments.length > 0 ? pendingAttachments : undefined);
      setInput("");
      setPendingAttachments([]);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    // Check for slash command trigger
    if (value.startsWith("/") && slashCommands.length > 0) {
      const query = value.slice(1).toLowerCase();
      const matches = slashCommands.filter((cmd) =>
        cmd.name.toLowerCase().startsWith(query)
      );
      setFilteredCommands(matches);
      setShowAutocomplete(matches.length > 0);
      setAutocompleteIndex(0);
    } else {
      setShowAutocomplete(false);
    }
  };

  const selectCommand = async (command: SlashCommand) => {
    setShowAutocomplete(false);
    const resolvedPrompt = await onSlashCommand(command);
    setInput(resolvedPrompt);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showAutocomplete) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAutocompleteIndex((prev) =>
          Math.min(prev + 1, filteredCommands.length - 1)
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAutocompleteIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && filteredCommands.length > 0)) {
        e.preventDefault();
        void selectCommand(filteredCommands[autocompleteIndex]);
        return;
      }
      if (e.key === "Escape") {
        setShowAutocomplete(false);
        return;
      }
    }

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

    // Unsupported file type
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
        {/* Slash command autocomplete */}
        {showAutocomplete && (
          <div className="gemini-helper-autocomplete">
            {filteredCommands.map((cmd, index) => (
              <div
                key={cmd.id}
                className={`gemini-helper-autocomplete-item ${
                  index === autocompleteIndex ? "active" : ""
                }`}
                onClick={() => void selectCommand(cmd)}
                onMouseEnter={() => setAutocompleteIndex(index)}
              >
                <span className="gemini-helper-autocomplete-name">/{cmd.name}</span>
                {cmd.description && (
                  <span className="gemini-helper-autocomplete-desc">
                    {cmd.description}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 隠しファイル入力 */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={getAllAcceptedTypes()}
          onChange={(event) => {
            void handleFileSelect(event);
          }}
          className="gemini-helper-hidden-input"
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
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
          disabled={isLoading}
          rows={3}
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
        <select
          className="gemini-helper-model-select gemini-helper-rag-select"
          value={selectedRagSetting || ""}
          onChange={(e) => onRagSettingChange(e.target.value || null)}
          disabled={isLoading}
        >
          <option value="">Search: None</option>
          <option value="__websearch__">Web Search</option>
          {ragEnabled && ragSettings.map((name) => (
            <option key={name} value={name}>
              Semantic search: {name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
