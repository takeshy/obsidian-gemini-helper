import { useState, useEffect, useRef } from "react";
import { type App, MarkdownRenderer, Component, Notice, Platform } from "obsidian";
import { Copy, Check, CheckCircle, XCircle, Download, Eye } from "lucide-react";
import type { Message, ToolCall } from "src/types";
import { AVAILABLE_MODELS } from "src/types";
import { HTMLPreviewModal, extractHtmlFromCodeBlock } from "./HTMLPreviewModal";

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  sourceFileName?: string | null;
  onApplyEdit?: () => Promise<void>;
  onDiscardEdit?: () => Promise<void>;
  app: App;
}

export default function MessageBubble({
  message,
  isStreaming,
  sourceFileName,
  onApplyEdit,
  onDiscardEdit,
  app,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const componentRef = useRef<Component | null>(null);

  // Render markdown content using Obsidian's MarkdownRenderer
  useEffect(() => {
    if (!contentRef.current) return;

    // Clear previous content
    contentRef.current.empty();

    // Create a new Component for managing child components
    if (componentRef.current) {
      componentRef.current.unload();
    }
    componentRef.current = new Component();
    componentRef.current.load();

    // Render markdown
    void MarkdownRenderer.render(
      app,
      message.content,
      contentRef.current,
      "/",
      componentRef.current
    ).then(() => {
      // Add click handlers for internal links
      const container = contentRef.current;
      if (!container) return;

      container.querySelectorAll("a.internal-link").forEach((link) => {
        link.addEventListener("click", (e) => {
          e.preventDefault();
          const href = link.getAttribute("href");
          if (href) {
            void app.workspace.openLinkText(href, "", false);
          }
        });
      });

      // Handle external links
      container.querySelectorAll("a.external-link").forEach((link) => {
        link.addEventListener("click", (e) => {
          e.preventDefault();
          const href = link.getAttribute("href");
          if (href) {
            window.open(href, "_blank");
          }
        });
      });
    });

    return () => {
      if (componentRef.current) {
        componentRef.current.unload();
        componentRef.current = null;
      }
    };
  }, [message.content, app]);

  // Get model display name
  const getModelDisplayName = () => {
    if (isUser) return "You";
    if (!message.model) return "Gemini";
    const modelInfo = AVAILABLE_MODELS.find(m => m.name === message.model);
    return modelInfo?.displayName || message.model;
  };

  // Convert tool call to display info
  const getToolDisplayInfo = (toolName: string): { icon: string; label: string } => {
    const toolDisplayMap: Record<string, { icon: string; label: string }> = {
      read_note: { icon: "📖", label: "Read" },
      create_note: { icon: "📝", label: "Created" },
      update_note: { icon: "✏️", label: "Updated" },
      delete_note: { icon: "🗑️", label: "Deleted" },
      rename_note: { icon: "📋", label: "Renamed" },
      search_notes: { icon: "🔍", label: "Searched" },
      list_notes: { icon: "📂", label: "Listed" },
      list_folders: { icon: "📁", label: "Listed folders" },
      create_folder: { icon: "📁", label: "Created folder" },
      get_active_note_info: { icon: "📄", label: "Got active note" },
      get_rag_sync_status: { icon: "🔄", label: "Checked sync" },
      propose_edit: { icon: "✏️", label: "Editing" },
      apply_edit: { icon: "✅", label: "Applied" },
      discard_edit: { icon: "❌", label: "Discarded" },
    };
    return toolDisplayMap[toolName] || { icon: "🔧", label: toolName };
  };

  // Get detail string from tool args for toast
  const getToolDetail = (toolCall: ToolCall): string => {
    const args = toolCall.args;
    const { label } = getToolDisplayInfo(toolCall.name);
    const parts: string[] = [label];

    if (args.fileName && typeof args.fileName === "string") {
      parts.push(args.fileName);
    } else if (args.path && typeof args.path === "string") {
      parts.push(args.path);
    } else if (args.name && typeof args.name === "string") {
      parts.push(args.name);
    } else if (typeof args.old_path === "string" && typeof args.new_path === "string") {
      parts.push(args.old_path + " → " + args.new_path);
    } else if (args.query && typeof args.query === "string") {
      parts.push(`"${args.query}"`);
    } else if (args.folder && typeof args.folder === "string") {
      parts.push(args.folder);
    } else if (args.activeNote === true) {
      parts.push("(active note)");
    }

    return parts.join(": ");
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

  // Copy image to clipboard
  const handleCopyImage = async (mimeType: string, base64Data: string) => {
    try {
      // Convert base64 to blob without using fetch
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });

      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      new Notice("Image copied to clipboard");
    } catch {
      new Notice("Failed to copy image");
    }
  };

  // Download image
  const handleDownloadImage = (mimeType: string, base64Data: string, index: number) => {
    const extension = mimeType.split("/")[1] || "png";
    const link = document.createElement("a");
    link.href = `data:${mimeType};base64,${base64Data}`;
    link.download = `generated-image-${Date.now()}-${index}.${extension}`;
    link.click();
  };

  // Check for HTML code block
  const htmlContent = extractHtmlFromCodeBlock(message.content);

  // Sanitize filename to remove characters not allowed in file systems
  const sanitizeFileName = (name: string): string => {
    return name
      .replace(/[<>:"/\\|?*]/g, "") // Remove Windows-forbidden chars
      .replace(/[\u0000-\u001f]/g, "")  // Remove control characters
      .trim()
      .slice(0, 50) || "output";    // Limit length and provide fallback
  };

  // Get base name for file save
  const getBaseName = () => {
    if (sourceFileName) return sanitizeFileName(sourceFileName);
    // First 10 chars, keeping alphanumeric and Japanese characters
    const raw = message.content.slice(0, 10).replace(/[^a-zA-Z0-9\u3040-\u30ff\u4e00-\u9faf]/g, "") || "output";
    return sanitizeFileName(raw);
  };

  // Preview HTML in modal
  const handlePreviewHtml = () => {
    if (htmlContent) {
      new HTMLPreviewModal(app, htmlContent, getBaseName()).open();
    }
  };

  // Save HTML - vault save on mobile, download on desktop
  const handleSaveHtml = async () => {
    if (!htmlContent) return;

    if (Platform.isMobile) {
      // Mobile: Save as .md file with code block (download doesn't work on mobile)
      try {
        const fileName = `infographic-${getBaseName()}-${Date.now()}.md`;
        const folderPath = "GeminiHelper/infographics";
        const mdContent = `\`\`\`html\n${htmlContent}\n\`\`\``;

        const folder = app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
          await app.vault.createFolder(folderPath);
        }

        const filePath = `${folderPath}/${fileName}`;
        await app.vault.create(filePath, mdContent);

        new Notice(`Saved to ${filePath}`);
      } catch (error) {
        new Notice(`Failed to save: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    } else {
      // PC: Download file
      const blob = new Blob([htmlContent], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `infographic-${getBaseName()}-${Date.now()}.html`;
      link.click();
      URL.revokeObjectURL(url);
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
            onClick={() => {
              void handleCopy();
            }}
            title="Copy to clipboard"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        )}
      </div>

      {/* Web search indicator */}
      {message.webSearchUsed && (
        <div className="gemini-helper-rag-used">
          <span className="gemini-helper-rag-indicator">
            🌐 Used web search
          </span>
        </div>
      )}

      {/* Image generation indicator */}
      {message.imageGenerationUsed && (
        <div className="gemini-helper-rag-used">
          <span className="gemini-helper-rag-indicator">
            🎨 Generated image
          </span>
        </div>
      )}

      {/* Semantic search indicator */}
      {message.ragUsed && (
        <div className="gemini-helper-rag-used">
          <span className="gemini-helper-rag-indicator">
            📚 Used semantic search
          </span>
        </div>
      )}

      {/* Tools used indicator */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="gemini-helper-tools-used">
          {message.toolCalls.map((toolCall, index) => {
            const { icon, label } = getToolDisplayInfo(toolCall.name);
            return (
              <span
                key={index}
                className="gemini-helper-tool-indicator gemini-helper-tool-clickable"
                onClick={() => new Notice(getToolDetail(toolCall), 3000)}
                title="Click to see details"
              >
                {icon} {label}
              </span>
            );
          })}
        </div>
      )}

      {/* Attachments display */}
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

      <div className="gemini-helper-message-content" ref={contentRef} />

      {/* HTML code block actions */}
      {htmlContent && !isStreaming && (
        <div className="gemini-helper-html-actions">
          <span className="gemini-helper-html-indicator">
            📊 HTML Infographic
          </span>
          <div className="gemini-helper-html-buttons">
            <button
              className="gemini-helper-html-btn"
              onClick={handlePreviewHtml}
              title="Preview HTML"
            >
              <Eye size={14} />
              <span>Preview</span>
            </button>
            <button
              className="gemini-helper-html-btn"
              onClick={() => void handleSaveHtml()}
              title={Platform.isMobile ? "Save to vault" : "Download HTML"}
            >
              <Download size={14} />
              <span>Save</span>
            </button>
          </div>
        </div>
      )}

      {/* Generated images display */}
      {message.generatedImages && message.generatedImages.length > 0 && (
        <div className="gemini-helper-generated-images">
          {message.generatedImages.map((image, index) => (
            <div key={index} className="gemini-helper-generated-image-container">
              <img
                src={`data:${image.mimeType};base64,${image.data}`}
                alt={`Generated image ${index + 1}`}
                className="gemini-helper-generated-image"
              />
              <div className="gemini-helper-image-actions">
                <button
                  className="gemini-helper-image-btn"
                  onClick={() => void handleCopyImage(image.mimeType, image.data)}
                  title="Copy image"
                >
                  <Copy size={14} />
                  <span>Copy</span>
                </button>
                <button
                  className="gemini-helper-image-btn"
                  onClick={() => handleDownloadImage(image.mimeType, image.data, index)}
                  title="Download image"
                >
                  <Download size={14} />
                  <span>Save</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit preview buttons */}
      {message.pendingEdit && message.pendingEdit.status === "pending" && (
        <div className="gemini-helper-pending-edit">
          <div className="gemini-helper-pending-edit-info">
            📄 Edited <strong>{message.pendingEdit.originalPath}</strong>
          </div>
          <div className="gemini-helper-pending-edit-actions">
            <button
              className="gemini-helper-edit-btn gemini-helper-edit-apply"
              onClick={() => {
                void onApplyEdit?.();
              }}
              title="Apply changes"
            >
              <CheckCircle size={16} />
              Apply
            </button>
            <button
              className="gemini-helper-edit-btn gemini-helper-edit-discard"
              onClick={() => {
                void onDiscardEdit?.();
              }}
              title="Discard changes"
            >
              <XCircle size={16} />
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Edit applied status */}
      {message.pendingEdit && message.pendingEdit.status === "applied" && (
        <div className="gemini-helper-edit-status gemini-helper-edit-applied">
          ✅ Applied changes to <strong>{message.pendingEdit.originalPath}</strong>
        </div>
      )}

      {/* Edit discarded status */}
      {message.pendingEdit && message.pendingEdit.status === "discarded" && (
        <div className="gemini-helper-edit-status gemini-helper-edit-discarded">
          ❌ Discarded changes
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

