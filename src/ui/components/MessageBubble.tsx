import { useState, useEffect, useRef, useCallback } from "react";
import { type App, MarkdownRenderer, Component, Notice, Platform } from "obsidian";
import { Copy, Check, CheckCircle, XCircle, Download, Eye, Layout } from "lucide-react";
import type { Message, ToolCall } from "src/types";
import { AVAILABLE_MODELS } from "src/types";
import { HTMLPreviewModal, extractHtmlFromCodeBlock } from "./HTMLPreviewModal";
import { hasMermaidFlowchart, convertMessageMermaidToCanvas } from "src/utils/mermaidToCanvas";
import { McpAppRenderer } from "./McpAppRenderer";
import { t } from "src/i18n";

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  sourceFileName?: string | null;
  onApplyEdit?: () => Promise<void>;
  onDiscardEdit?: () => void;
  app: App;
  workspaceFolder?: string;
}

export default function MessageBubble({
  message,
  isStreaming,
  sourceFileName,
  onApplyEdit,
  onDiscardEdit,
  app,
  workspaceFolder,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [expandedMcpApps, setExpandedMcpApps] = useState<Set<number>>(new Set());
  const contentRef = useRef<HTMLDivElement>(null);
  const componentRef = useRef<Component | null>(null);

  // Toggle MCP App expansion
  const toggleMcpAppExpand = useCallback((index: number) => {
    setExpandedMcpApps(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

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
    if (isUser) return t("message.you");
    if (!message.model) return t("message.gemini");
    const modelInfo = AVAILABLE_MODELS.find(m => m.name === message.model);
    return modelInfo?.displayName || message.model;
  };

  // Convert tool call to display info
  const getToolDisplayInfo = (toolName: string): { icon: string; label: string } => {
    // Handle MCP tools (format: mcp_{serverName}_{toolName})
    if (toolName.startsWith("mcp_")) {
      const parts = toolName.split("_");
      // Remove "mcp" prefix and extract server name and tool name
      if (parts.length >= 3) {
        const serverName = parts[1];
        const mcpToolName = parts.slice(2).join("_");
        return { icon: "🔌", label: `${serverName}:${mcpToolName}` };
      }
      return { icon: "🔌", label: toolName.replace("mcp_", "") };
    }

    const toolDisplayMap: Record<string, { icon: string; label: string }> = {
      read_note: { icon: "📖", label: t("tool.read") },
      create_note: { icon: "📝", label: t("tool.created") },
      update_note: { icon: "✏️", label: t("tool.updated") },
      delete_note: { icon: "🗑️", label: t("tool.deleted") },
      rename_note: { icon: "📋", label: t("tool.renamed") },
      search_notes: { icon: "🔍", label: t("tool.searched") },
      list_notes: { icon: "📂", label: t("tool.listed") },
      list_folders: { icon: "📁", label: t("tool.listedFolders") },
      create_folder: { icon: "📁", label: t("tool.createdFolder") },
      get_active_note_info: { icon: "📄", label: t("tool.gotActiveNote") },
      get_rag_sync_status: { icon: "🔄", label: t("tool.checkedSync") },
      propose_edit: { icon: "✏️", label: t("tool.editing") },
      apply_edit: { icon: "✅", label: t("tool.applied") },
      discard_edit: { icon: "❌", label: t("tool.discarded") },
    };
    return toolDisplayMap[toolName] || { icon: "🔧", label: toolName };
  };

  // Get detail string from tool args for toast
  const getToolDetail = (toolCall: ToolCall): string => {
    const args = toolCall.args;
    const { label } = getToolDisplayInfo(toolCall.name);
    const parts: string[] = [label];

    // Handle MCP tools - show all arguments
    if (toolCall.name.startsWith("mcp_")) {
      const argEntries = Object.entries(args);
      if (argEntries.length > 0) {
        const argStrings = argEntries.map(([key, value]) => {
          if (typeof value === "string") {
            // Truncate long strings
            const displayValue = value.length > 50 ? value.slice(0, 50) + "..." : value;
            return `${key}: "${displayValue}"`;
          } else if (typeof value === "object" && value !== null) {
            return `${key}: ${JSON.stringify(value).slice(0, 50)}...`;
          }
          return `${key}: ${String(value)}`;
        });
        parts.push(argStrings.join(", "));
      }
      return parts.join("\n");
    }

    // Handle built-in tools
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
      let pngBlob: Blob;

      if (mimeType === "image/png") {
        // Already PNG - convert base64 to blob directly
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        pngBlob = new Blob([byteArray], { type: "image/png" });
      } else {
        // Clipboard API typically only supports image/png
        // Convert image to PNG using canvas
        const img = new Image();
        const loadPromise = new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Failed to load image"));
        });
        img.src = `data:${mimeType};base64,${base64Data}`;
        await loadPromise;

        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Failed to get canvas context");
        ctx.drawImage(img, 0, 0);

        pngBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Failed to convert to PNG"));
          }, "image/png");
        });
      }

      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": pngBlob })
      ]);
      new Notice(t("message.imageCopied"));
    } catch {
      new Notice(t("message.imageCopyFailed"));
    }
  };

  // Download image - vault save on mobile, download on desktop
  const handleDownloadImage = async (mimeType: string, base64Data: string, index: number) => {
    const extension = mimeType.split("/")[1] || "png";
    const fileName = `generated-image-${Date.now()}-${index}.${extension}`;

    if (Platform.isMobile) {
      // Mobile: Save to vault (download doesn't work on mobile)
      try {
        const folderPath = "GeminiHelper/images";

        // Convert base64 to ArrayBuffer
        const byteCharacters = atob(base64Data);
        const byteArray = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteArray[i] = byteCharacters.charCodeAt(i);
        }

        const folder = app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
          await app.vault.createFolder(folderPath);
        }

        const filePath = `${folderPath}/${fileName}`;
        await app.vault.createBinary(filePath, byteArray.buffer);

        new Notice(t("message.savedTo", { path: filePath }));
      } catch (error) {
        new Notice(t("message.saveFailed", { error: error instanceof Error ? error.message : "Unknown error" }));
      }
    } else {
      // PC: Download file
      const link = document.createElement("a");
      link.href = `data:${mimeType};base64,${base64Data}`;
      link.download = fileName;
      link.click();
    }
  };

  // Check for HTML code block
  const htmlContent = extractHtmlFromCodeBlock(message.content);

  // Check for Mermaid flowchart
  const hasMermaid = hasMermaidFlowchart(message.content);

  // Open Mermaid as Canvas
  const handleOpenAsCanvas = async () => {
    if (!hasMermaid || !workspaceFolder) return;

    try {
      const success = await convertMessageMermaidToCanvas(
        app,
        message.content,
        workspaceFolder,
        getBaseName()
      );
      if (success) {
        new Notice(t("message.canvasCreated"));
      } else {
        new Notice(t("message.canvasCreationFailed"));
      }
    } catch {
      new Notice(t("message.canvasCreationFailed"));
    }
  };

  const stripControlChars = (value: string): string => {
    let result = "";
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code >= 0x20 && code !== 0x7f) {
        result += value[i];
      }
    }
    return result;
  };

  // Sanitize filename to remove characters not allowed in file systems
  const sanitizeFileName = (name: string): string => {
    return stripControlChars(name)
      .replace(/[<>:"/\\|?*]/g, "") // Remove Windows-forbidden chars
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

        new Notice(t("message.savedTo", { path: filePath }));
      } catch (error) {
        new Notice(t("message.saveFailed", { error: error instanceof Error ? error.message : "Unknown error" }));
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
            title={t("message.copyToClipboard")}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        )}
      </div>

      {/* Web search indicator */}
      {message.webSearchUsed && (
        <div className="gemini-helper-rag-used">
          <span className="gemini-helper-rag-indicator">
            🌐 {t("message.webSearchUsed")}
          </span>
        </div>
      )}

      {/* Image generation indicator */}
      {message.imageGenerationUsed && (
        <div className="gemini-helper-rag-used">
          <span className="gemini-helper-rag-indicator">
            🎨 {t("message.imageGenerated")}
          </span>
        </div>
      )}

      {/* Semantic search indicator with sources */}
      {message.ragUsed && (
        <div className="gemini-helper-rag-used">
          <span className="gemini-helper-rag-indicator">
            📚 {t("message.rag")}
          </span>
          {message.ragSources && message.ragSources.length > 0 && (
            <div className="gemini-helper-rag-sources">
              {message.ragSources.map((source, index) => (
                <span
                  key={index}
                  className="gemini-helper-rag-source gemini-helper-tool-clickable"
                  onClick={() => {
                    // Try to open the file if it's a vault file
                    const file = app.vault.getAbstractFileByPath(source);
                    if (file) {
                      void app.workspace.openLinkText(source, "", false);
                    } else {
                      new Notice(`Source: ${source}`, 3000);
                    }
                  }}
                  title={t("message.clickToOpen", { source })}
                >
                  📄 {source.split("/").pop() || source}
                </span>
              ))}
            </div>
          )}
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
                title={t("message.clickToSeeDetails")}
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

      {/* Thinking content (collapsible) */}
      {message.thinking && (
        <details className="gemini-helper-thinking">
          <summary className="gemini-helper-thinking-summary">
            💭 {t("message.thinking")}
          </summary>
          <div className="gemini-helper-thinking-content">
            {message.thinking}
          </div>
        </details>
      )}

      <div className="gemini-helper-message-content" ref={contentRef} />

      {/* HTML code block actions */}
      {htmlContent && !isStreaming && (
        <div className="gemini-helper-html-actions">
          <span className="gemini-helper-html-indicator">
            📊 {t("message.htmlInfographic")}
          </span>
          <div className="gemini-helper-html-buttons">
            <button
              className="gemini-helper-html-btn"
              onClick={handlePreviewHtml}
              title={t("message.previewHtml")}
            >
              <Eye size={14} />
              <span>{t("message.preview")}</span>
            </button>
            <button
              className="gemini-helper-html-btn"
              onClick={() => void handleSaveHtml()}
              title={Platform.isMobile ? t("message.saveHtml") : t("message.downloadHtml")}
            >
              <Download size={14} />
              <span>{t("common.save")}</span>
            </button>
          </div>
        </div>
      )}

      {/* Mermaid flowchart actions */}
      {hasMermaid && !isStreaming && workspaceFolder && (
        <div className="gemini-helper-html-actions">
          <span className="gemini-helper-html-indicator">
            📐 {t("message.mermaidFlowchart")}
          </span>
          <div className="gemini-helper-html-buttons">
            <button
              className="gemini-helper-html-btn"
              onClick={() => void handleOpenAsCanvas()}
              title={t("message.openAsCanvas")}
            >
              <Layout size={14} />
              <span>{t("message.openCanvas")}</span>
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
                  title={t("message.copyImage")}
                >
                  <Copy size={14} />
                  <span>{t("message.copy")}</span>
                </button>
                <button
                  className="gemini-helper-image-btn"
                  onClick={() => void handleDownloadImage(image.mimeType, image.data, index)}
                  title={t("message.downloadImage")}
                >
                  <Download size={14} />
                  <span>{t("common.save")}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MCP Apps display */}
      {message.mcpApps && message.mcpApps.length > 0 && (
        <div className="gemini-helper-mcp-apps">
          {message.mcpApps.map((mcpApp, index) => (
            <McpAppRenderer
              key={index}
              serverUrl={mcpApp.serverUrl}
              serverHeaders={mcpApp.serverHeaders}
              toolResult={mcpApp.toolResult}
              uiResource={mcpApp.uiResource}
              expanded={expandedMcpApps.has(index)}
              onToggleExpand={() => toggleMcpAppExpand(index)}
            />
          ))}
        </div>
      )}

      {/* Edit preview buttons */}
      {message.pendingEdit && message.pendingEdit.status === "pending" && (
        <div className="gemini-helper-pending-edit">
          <div className="gemini-helper-pending-edit-info">
            📄 {t("message.edited")} <strong>{message.pendingEdit.originalPath}</strong>
          </div>
          <div className="gemini-helper-pending-edit-actions">
            <button
              className="gemini-helper-edit-btn gemini-helper-edit-apply"
              onClick={() => {
                void onApplyEdit?.();
              }}
              title={t("message.applyChanges")}
            >
              <CheckCircle size={16} />
              {t("message.apply")}
            </button>
            <button
              className="gemini-helper-edit-btn gemini-helper-edit-discard"
              onClick={() => {
                void onDiscardEdit?.();
              }}
              title={t("message.discardChanges")}
            >
              <XCircle size={16} />
              {t("message.discard")}
            </button>
          </div>
        </div>
      )}

      {/* Edit applied status */}
      {message.pendingEdit && message.pendingEdit.status === "applied" && (
        <div className="gemini-helper-edit-status gemini-helper-edit-applied">
          ✅ {t("message.appliedChanges")} <strong>{message.pendingEdit.originalPath}</strong>
        </div>
      )}

      {/* Edit discarded status */}
      {message.pendingEdit && message.pendingEdit.status === "discarded" && (
        <div className="gemini-helper-edit-status gemini-helper-edit-discarded">
          ❌ {t("message.discardedChanges")}
        </div>
      )}

      {/* Delete status */}
      {message.pendingDelete && message.pendingDelete.status === "deleted" && (
        <div className="gemini-helper-edit-status gemini-helper-delete-applied">
          🗑️ {t("message.deleted")} <strong>{message.pendingDelete.path}</strong>
        </div>
      )}

      {/* Delete cancelled status */}
      {message.pendingDelete && message.pendingDelete.status === "cancelled" && (
        <div className="gemini-helper-edit-status gemini-helper-delete-cancelled">
          ↩️ {t("message.cancelledDeletion")} <strong>{message.pendingDelete.path}</strong>
        </div>
      )}

      {/* Delete failed status */}
      {message.pendingDelete && message.pendingDelete.status === "failed" && (
        <div className="gemini-helper-edit-status gemini-helper-edit-discarded">
          ❌ {t("message.failedToDelete")}
        </div>
      )}

      {/* Rename applied status */}
      {message.pendingRename && message.pendingRename.status === "applied" && (
        <div className="gemini-helper-edit-status gemini-helper-edit-applied">
          📁 {t("message.renamed")} <strong>{message.pendingRename.originalPath}</strong> → <strong>{message.pendingRename.newPath}</strong>
        </div>
      )}

      {/* Rename discarded status */}
      {message.pendingRename && message.pendingRename.status === "discarded" && (
        <div className="gemini-helper-edit-status gemini-helper-edit-discarded">
          ❌ {t("message.cancelledRename")} <strong>{message.pendingRename.originalPath}</strong>
        </div>
      )}

      {/* Rename failed status */}
      {message.pendingRename && message.pendingRename.status === "failed" && (
        <div className="gemini-helper-edit-status gemini-helper-edit-discarded">
          ❌ {t("message.failedToRename")}
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
