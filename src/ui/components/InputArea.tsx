import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent, forwardRef, useImperativeHandle } from "react";
import { Send, Paperclip, StopCircle, Eye } from "lucide-react";
import type { App } from "obsidian";
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
  onSlashCommand: (command: SlashCommand) => string;
  vaultFiles: string[];
  hasSelection: boolean;
  app: App;
}

export interface InputAreaHandle {
  setInputValue: (value: string) => void;
  getInputValue: () => string;
  focus: () => void;
}

// Mention candidates (special variables + vault files)
interface MentionItem {
  value: string;
  description: string;
  isVariable: boolean;
}

// 対応ファイル形式
const SUPPORTED_TYPES = {
  image: ["image/png", "image/jpeg", "image/gif", "image/webp"],
  pdf: ["application/pdf"],
  text: ["text/plain", "text/markdown", "text/csv", "application/json"],
};

const InputArea = forwardRef<InputAreaHandle, InputAreaProps>(function InputArea({
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
  vaultFiles,
  hasSelection,
  app,
}, ref) {
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [filteredCommands, setFilteredCommands] = useState<SlashCommand[]>([]);
  // Mention autocomplete state
  const [showMentionAutocomplete, setShowMentionAutocomplete] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [filteredMentions, setFilteredMentions] = useState<MentionItem[]>([]);
  const [mentionStartPos, setMentionStartPos] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mentionAutocompleteRef = useRef<HTMLDivElement>(null);

  // Scroll to selected mention item
  useEffect(() => {
    if (showMentionAutocomplete && mentionAutocompleteRef.current) {
      const container = mentionAutocompleteRef.current;
      const activeItem = container.children[mentionIndex] as HTMLElement;
      if (activeItem) {
        activeItem.scrollIntoView({ block: "nearest" });
      }
    }
  }, [mentionIndex, showMentionAutocomplete]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    setInputValue: (value: string) => setInput(value),
    getInputValue: () => input,
    focus: () => textareaRef.current?.focus(),
  }));

  // Build mention candidates
  const buildMentionCandidates = (query: string): MentionItem[] => {
    const variables: MentionItem[] = [
      // Only show {selection} if there's an active selection
      ...(hasSelection ? [{ value: "{selection}", description: "Selected text in editor", isVariable: true }] : []),
      { value: "{content}", description: "Active note content", isVariable: true },
    ];
    const files: MentionItem[] = vaultFiles.map((f) => ({
      value: f,
      description: "Vault file",
      isVariable: false,
    }));
    const all = [...variables, ...files];
    if (!query) return all.slice(0, 10);
    const lowerQuery = query.toLowerCase();
    return all.filter((item) => item.value.toLowerCase().includes(lowerQuery)).slice(0, 10);
  };

  const handleSubmit = () => {
    if ((input.trim() || pendingAttachments.length > 0) && !isLoading) {
      void onSend(input, pendingAttachments.length > 0 ? pendingAttachments : undefined);
      setInput("");
      setPendingAttachments([]);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setInput(value);

    // Check for slash command trigger (only at start of input)
    if (value.startsWith("/") && slashCommands.length > 0) {
      const query = value.slice(1).toLowerCase();
      const matches = slashCommands.filter((cmd) =>
        cmd.name.toLowerCase().startsWith(query)
      );
      setFilteredCommands(matches);
      setShowAutocomplete(matches.length > 0);
      setAutocompleteIndex(0);
      setShowMentionAutocomplete(false);
      return;
    } else {
      setShowAutocomplete(false);
    }

    // Check for @ mention trigger
    const textBeforeCursor = value.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);
    if (atMatch) {
      const query = atMatch[1];
      const startPos = cursorPos - atMatch[0].length;
      const mentions = buildMentionCandidates(query);
      setFilteredMentions(mentions);
      setMentionStartPos(startPos);
      setShowMentionAutocomplete(mentions.length > 0);
      setMentionIndex(0);
    } else {
      setShowMentionAutocomplete(false);
    }
  };

  const selectCommand = (command: SlashCommand) => {
    setShowAutocomplete(false);
    const resolvedPrompt = onSlashCommand(command);
    setInput(resolvedPrompt);
    textareaRef.current?.focus();
  };

  const selectMention = (mention: MentionItem) => {
    // Replace @query with the selected mention value
    const cursorPos = textareaRef.current?.selectionStart || input.length;
    const before = input.substring(0, mentionStartPos);
    const after = input.substring(cursorPos);
    const newInput = before + mention.value + " " + after;
    setInput(newInput);
    setShowMentionAutocomplete(false);
    // Set cursor position after the inserted mention
    setTimeout(() => {
      const newPos = mentionStartPos + mention.value.length + 1;
      textareaRef.current?.setSelectionRange(newPos, newPos);
      textareaRef.current?.focus();
    }, 0);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Slash command autocomplete
    if (showAutocomplete) {
      if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault();
        setAutocompleteIndex((prev) =>
          Math.min(prev + 1, filteredCommands.length - 1)
        );
        return;
      }
      if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
        e.preventDefault();
        setAutocompleteIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter" && filteredCommands.length > 0) {
        e.preventDefault();
        selectCommand(filteredCommands[autocompleteIndex]);
        return;
      }
      if (e.key === "Escape") {
        setShowAutocomplete(false);
        return;
      }
    }

    // Mention autocomplete
    if (showMentionAutocomplete) {
      if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault();
        setMentionIndex((prev) =>
          Math.min(prev + 1, filteredMentions.length - 1)
        );
        return;
      }
      if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
        e.preventDefault();
        setMentionIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      // Ctrl+Shift+O to preview (open) the selected file
      if (e.key === "O" && e.ctrlKey && e.shiftKey && filteredMentions.length > 0) {
        e.preventDefault();
        const mention = filteredMentions[mentionIndex];
        if (mention && !mention.isVariable) {
          void app.workspace.openLinkText(mention.value, "", true);
          // Return focus to textarea after opening
          setTimeout(() => textareaRef.current?.focus(), 100);
        }
        return;
      }
      if (e.key === "Enter" && filteredMentions.length > 0) {
        e.preventDefault();
        selectMention(filteredMentions[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        setShowMentionAutocomplete(false);
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
      {/* Pending attachments display */}
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
                onClick={() => selectCommand(cmd)}
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

        {/* Mention autocomplete */}
        {showMentionAutocomplete && (
          <div className="gemini-helper-autocomplete" ref={mentionAutocompleteRef}>
            {filteredMentions.map((mention, index) => (
              <div
                key={mention.value}
                className={`gemini-helper-autocomplete-item ${
                  index === mentionIndex ? "active" : ""
                }`}
                onClick={() => selectMention(mention)}
                onMouseEnter={() => setMentionIndex(index)}
              >
                <span className="gemini-helper-autocomplete-name">
                  {mention.isVariable ? mention.value : mention.value}
                </span>
                <span className="gemini-helper-autocomplete-desc">
                  {mention.description}
                </span>
                {!mention.isVariable && (
                  <button
                    className="gemini-helper-preview-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      void app.workspace.openLinkText(mention.value, "", true);
                      setTimeout(() => textareaRef.current?.focus(), 100);
                    }}
                    title="Open file (Ctrl+Shift+O)"
                  >
                    <Eye size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Hidden file input */}
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

        {/* Attachment button */}
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
});

export default InputArea;
