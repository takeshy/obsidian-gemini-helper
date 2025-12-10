import {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import { TFile, Notice } from "obsidian";
import { Plus, History, ChevronDown } from "lucide-react";
import type { GeminiHelperPlugin } from "src/plugin";
import type { Message, ModelType, Attachment, PendingEditInfo } from "src/types";
import { getGeminiClient } from "src/core/gemini";
import { getEnabledTools } from "src/core/tools";
import { createToolExecutor, type ToolExecutionContext } from "src/vault/toolExecutor";
import { getPendingEdit, applyEdit, discardEdit, clearPendingEdit } from "src/vault/notes";
import MessageList from "./MessageList";
import InputArea from "./InputArea";

interface ChatHistory {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatRef {
  getActiveChat: () => TFile | null;
  setActiveChat: (chat: TFile | null) => void;
}

interface ChatProps {
  plugin: GeminiHelperPlugin;
}

const Chat = forwardRef<ChatRef, ChatProps>(({ plugin }, ref) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeChat, setActiveChat] = useState<TFile | null>(null);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [chatHistories, setChatHistories] = useState<ChatHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [currentModel, setCurrentModel] = useState<ModelType>(plugin.settings.model);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useImperativeHandle(ref, () => ({
    getActiveChat: () => activeChat,
    setActiveChat: (chat: TFile | null) => setActiveChat(chat),
  }));

  // Generate chat ID
  const generateChatId = () => `chat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Get chat history folder path
  const getChatHistoryFolder = () => {
    return plugin.settings.chatsFolder || "gemini-chats";
  };

  // Get chat file path
  const getChatFilePath = (chatId: string) => {
    return `${getChatHistoryFolder()}/${chatId}.md`;
  };

  // Convert messages to Markdown format
  const messagesToMarkdown = (msgs: Message[], title: string, createdAt: number): string => {
    const date = new Date(createdAt);
    let md = `---\ntitle: "${title.replace(/"/g, '\\"')}"\ncreatedAt: ${createdAt}\nupdatedAt: ${Date.now()}\n---\n\n`;
    md += `# ${title}\n\n`;
    md += `*Created: ${date.toLocaleString()}*\n\n---\n\n`;

    for (const msg of msgs) {
      const role = msg.role === "user" ? "**You**" : `**${msg.model || "Gemini"}**`;
      const time = new Date(msg.timestamp).toLocaleTimeString();

      md += `## ${role} (${time})\n\n`;

      // Attachments
      if (msg.attachments && msg.attachments.length > 0) {
        md += `> Attachments: ${msg.attachments.map(a => `${a.name}`).join(", ")}\n\n`;
      }

      // Tools used
      if (msg.toolsUsed && msg.toolsUsed.length > 0) {
        md += `> Tools: ${msg.toolsUsed.join(", ")}\n\n`;
      }

      md += `${msg.content}\n\n---\n\n`;
    }

    return md;
  };

  // Parse Markdown back to messages
  const parseMarkdownToMessages = (content: string): { messages: Message[]; createdAt: number } | null => {
    try {
      // Extract frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      let createdAt = Date.now();

      if (frontmatterMatch) {
        const createdAtMatch = frontmatterMatch[1].match(/createdAt:\s*(\d+)/);
        if (createdAtMatch) {
          createdAt = parseInt(createdAtMatch[1]);
        }
      }

      // Parse messages
      const messages: Message[] = [];
      const messageBlocks = content.split(/\n## \*\*/);

      for (let i = 1; i < messageBlocks.length; i++) {
        const block = messageBlocks[i];
        const roleMatch = block.match(/^(You|[^*]+)\*\* \(([^)]+)\)/);

        if (roleMatch) {
          const isUser = roleMatch[1] === "You";
          const timeStr = roleMatch[2];

          // Extract content (skip attachments/tools lines)
          const lines = block.split("\n").slice(1);
          let contentLines: string[] = [];
          let inContent = false;

          for (const line of lines) {
            if (line.startsWith("> Attachments:") || line.startsWith("> Tools:")) {
              continue;
            }
            if (line === "---") {
              break;
            }
            if (line.trim() !== "" || inContent) {
              inContent = true;
              contentLines.push(line);
            }
          }

          const msgContent = contentLines.join("\n").trim();

          messages.push({
            role: isUser ? "user" : "assistant",
            content: msgContent,
            timestamp: createdAt + i * 1000, // Approximate timestamp
            model: isUser ? undefined : (roleMatch[1].trim() as ModelType),
          });
        }
      }

      return { messages, createdAt };
    } catch (err) {
      console.error("Failed to parse markdown:", err);
      return null;
    }
  };

  // Load chat histories from folder
  const loadChatHistories = useCallback(async () => {
    try {
      const folder = getChatHistoryFolder();
      const folderFile = plugin.app.vault.getAbstractFileByPath(folder);

      if (!folderFile) {
        setChatHistories([]);
        return;
      }

      const files = plugin.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder + "/"));
      const histories: ChatHistory[] = [];

      for (const file of files) {
        try {
          const content = await plugin.app.vault.read(file);
          const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

          if (frontmatterMatch) {
            const titleMatch = frontmatterMatch[1].match(/title:\s*"([^"]+)"/);
            const createdAtMatch = frontmatterMatch[1].match(/createdAt:\s*(\d+)/);
            const updatedAtMatch = frontmatterMatch[1].match(/updatedAt:\s*(\d+)/);

            const chatId = file.basename;
            const title = titleMatch ? titleMatch[1] : chatId;
            const createdAt = createdAtMatch ? parseInt(createdAtMatch[1]) : file.stat.ctime;
            const updatedAt = updatedAtMatch ? parseInt(updatedAtMatch[1]) : file.stat.mtime;

            // Parse messages from content
            const parsed = parseMarkdownToMessages(content);

            histories.push({
              id: chatId,
              title,
              messages: parsed?.messages || [],
              createdAt,
              updatedAt,
            });
          }
        } catch (err) {
          console.error(`Failed to load chat ${file.path}:`, err);
        }
      }

      setChatHistories(histories.sort((a, b) => b.updatedAt - a.updatedAt));
    } catch (err) {
      console.error("Failed to load chat histories:", err);
      setChatHistories([]);
    }
  }, [plugin]);

  // Save current chat to Markdown file
  const saveCurrentChat = useCallback(async (msgs: Message[]) => {
    if (msgs.length === 0) return;

    const chatId = currentChatId || generateChatId();
    const title = msgs[0].content.slice(0, 50) + (msgs[0].content.length > 50 ? "..." : "");
    const folder = getChatHistoryFolder();

    // Ensure folder exists
    try {
      const folderExists = plugin.app.vault.getAbstractFileByPath(folder);
      if (!folderExists) {
        await plugin.app.vault.createFolder(folder);
      }
    } catch (err) {
      // Folder might already exist
    }

    const existingHistory = chatHistories.find(h => h.id === chatId);
    const createdAt = existingHistory?.createdAt || Date.now();

    const markdown = messagesToMarkdown(msgs, title, createdAt);
    const filePath = getChatFilePath(chatId);

    try {
      const file = plugin.app.vault.getAbstractFileByPath(filePath);

      if (file instanceof TFile) {
        await plugin.app.vault.modify(file, markdown);
      } else {
        await plugin.app.vault.create(filePath, markdown);
      }

      // Update local state
      const newHistory: ChatHistory = {
        id: chatId,
        title,
        messages: msgs,
        createdAt,
        updatedAt: Date.now(),
      };

      const existingIndex = chatHistories.findIndex(h => h.id === chatId);
      let newHistories: ChatHistory[];

      if (existingIndex >= 0) {
        newHistories = [...chatHistories];
        newHistories[existingIndex] = newHistory;
      } else {
        newHistories = [newHistory, ...chatHistories];
      }

      // Keep only last 50 chats
      newHistories = newHistories.slice(0, 50);

      setChatHistories(newHistories);
      setCurrentChatId(chatId);
    } catch (err) {
      console.error("Failed to save chat:", err);
    }
  }, [currentChatId, chatHistories, plugin]);

  // Load chat histories on mount
  useEffect(() => {
    loadChatHistories();
  }, [loadChatHistories]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Start new chat
  const startNewChat = () => {
    setMessages([]);
    setCurrentChatId(null);
    setStreamingContent("");
    setShowHistory(false);
  };

  // Load a chat from history
  const loadChat = (history: ChatHistory) => {
    setMessages(history.messages);
    setCurrentChatId(history.id);
    setShowHistory(false);
  };

  // Delete a chat from history
  const deleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // Delete the Markdown file
    const filePath = getChatFilePath(chatId);
    try {
      const file = plugin.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        await plugin.app.vault.delete(file);
      }
    } catch (err) {
      console.error("Failed to delete chat file:", err);
    }

    const newHistories = chatHistories.filter(h => h.id !== chatId);
    setChatHistories(newHistories);

    if (currentChatId === chatId) {
      startNewChat();
    }
    new Notice("Chat deleted");
  };

  // Send message to Gemini
  const sendMessage = async (content: string, attachments?: Attachment[]) => {
    if ((!content.trim() && (!attachments || attachments.length === 0)) || isLoading) return;

    const client = getGeminiClient();
    if (!client) {
      console.error("Gemini client not initialized");
      return;
    }

    // Set the current model
    client.setModel(currentModel);

    // Add user message
    const userMessage: Message = {
      role: "user",
      content: content.trim() || (attachments ? `[${attachments.length} file(s) attached]` : ""),
      timestamp: Date.now(),
      attachments,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setStreamingContent("");

    // Create abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const { settings } = plugin;
      const tools = getEnabledTools({
        allowWrite: true,
        allowDelete: false,
        ragEnabled: settings.ragEnabled,
      });

      // Create context for RAG tools
      const toolContext: ToolExecutionContext = {
        ragSyncState: settings.ragSyncState,
        ragFilterConfig: {
          includeFolders: settings.ragIncludeFolders,
          excludePatterns: settings.ragExcludePatterns,
        },
      };
      const toolExecutor = createToolExecutor(plugin.app, toolContext);

      let systemPrompt = `You are a helpful AI assistant integrated with Obsidian. You can help users with their notes and vault management.

Available tools allow you to:
- Read notes from the vault
- Create new notes
- Update existing notes
- Search for notes by name or content
- List notes and folders
- Get information about the active note`;

      // Add RAG sync status info if RAG is enabled
      if (settings.ragEnabled) {
        systemPrompt += `
- Check RAG sync status: When users ask about imported files, use the get_rag_sync_status tool to:
  - Check a specific file's sync status (when it was imported, if it has changes)
  - List unsynced files in a directory
  - Get a summary of the vault's overall sync status`;
      }

      systemPrompt += `

Always be helpful and provide clear, concise responses. When working with notes, confirm actions and provide relevant feedback.`;

      if (settings.systemPrompt) {
        systemPrompt += `\n\nAdditional instructions: ${settings.systemPrompt}`;
      }

      // Use streaming with tools
      let fullContent = "";
      const toolCalls: Message["toolCalls"] = [];
      const toolResults: Message["toolResults"] = [];
      const toolsUsed: string[] = [];
      let ragUsed = false;
      let ragSources: string[] = [];

      const allMessages = [...messages, userMessage];

      // Pass RAG store ID if RAG is enabled
      const ragStoreId = settings.ragEnabled ? settings.ragStoreId : null;

      let stopped = false;
      for await (const chunk of client.chatWithToolsStream(
        allMessages,
        tools,
        systemPrompt,
        toolExecutor,
        ragStoreId
      )) {
        // Check if stopped
        if (abortController.signal.aborted) {
          stopped = true;
          break;
        }

        switch (chunk.type) {
          case "text":
            fullContent += chunk.content || "";
            setStreamingContent(fullContent);
            break;

          case "tool_call":
            if (chunk.toolCall) {
              toolCalls.push(chunk.toolCall);
              // ツール名を記録（重複なし）
              if (!toolsUsed.includes(chunk.toolCall.name)) {
                toolsUsed.push(chunk.toolCall.name);
              }
            }
            break;

          case "tool_result":
            if (chunk.toolResult) {
              toolResults.push(chunk.toolResult);
            }
            break;

          case "rag_used":
            ragUsed = true;
            if (chunk.ragSources) {
              ragSources = chunk.ragSources;
            }
            break;

          case "error":
            console.error("Stream error:", chunk.error);
            break;

          case "done":
            // Finalize the message
            break;
        }
      }

      // If stopped, add partial message if any content was received
      if (stopped && fullContent) {
        fullContent += "\n\n_(生成を停止しました)_";
      }

      // Check if there's a pending edit from propose_edit tool
      let pendingEditInfo: PendingEditInfo | undefined;
      const pending = getPendingEdit();
      if (pending && toolsUsed.includes("propose_edit")) {
        pendingEditInfo = {
          originalPath: pending.originalPath,
          status: "pending",
        };
      }

      // Add assistant message
      const assistantMessage: Message = {
        role: "assistant",
        content: fullContent,
        timestamp: Date.now(),
        model: currentModel,
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        pendingEdit: pendingEditInfo,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        toolResults: toolResults.length > 0 ? toolResults : undefined,
        ragUsed: ragUsed || undefined,
        ragSources: ragSources.length > 0 ? ragSources : undefined,
      };

      const newMessages = [...messages, userMessage, assistantMessage];
      setMessages(newMessages);

      // Save chat history
      await saveCurrentChat(newMessages);
    } catch (error) {
      console.error("Error sending message:", error);

      // Add error message
      const errorMessage: Message = {
        role: "assistant",
        content: `Sorry, an error occurred: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setStreamingContent("");
      abortControllerRef.current = null;
    }
  };

  // Stop message generation
  const stopMessage = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // Handle apply edit button click
  const handleApplyEdit = async (messageIndex: number) => {
    try {
      const result = await applyEdit(plugin.app);

      if (result.success) {
        // Update message status
        setMessages((prev) => {
          const newMessages = [...prev];
          if (newMessages[messageIndex].pendingEdit) {
            newMessages[messageIndex] = {
              ...newMessages[messageIndex],
              pendingEdit: {
                ...newMessages[messageIndex].pendingEdit!,
                status: "applied",
              },
            };
          }
          return newMessages;
        });
        new Notice(result.message || "Changes applied");
      } else {
        new Notice(result.error || "Failed to apply changes");
      }
    } catch (error) {
      console.error("Failed to apply edit:", error);
      new Notice("Failed to apply changes");
    }
  };

  // Handle discard edit button click
  const handleDiscardEdit = async (messageIndex: number) => {
    try {
      const result = await discardEdit(plugin.app);

      if (result.success) {
        // Update message status
        setMessages((prev) => {
          const newMessages = [...prev];
          if (newMessages[messageIndex].pendingEdit) {
            newMessages[messageIndex] = {
              ...newMessages[messageIndex],
              pendingEdit: {
                ...newMessages[messageIndex].pendingEdit!,
                status: "discarded",
              },
            };
          }
          return newMessages;
        });
        new Notice(result.message || "Changes discarded");
      } else {
        new Notice(result.error || "Failed to discard changes");
      }
    } catch (error) {
      console.error("Failed to discard edit:", error);
      new Notice("Failed to discard changes");
    }
  };

  // Format date for history
  const formatHistoryDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return date.toLocaleDateString(undefined, { weekday: "short" });
    } else {
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
  };

  return (
    <div className="gemini-helper-chat">
      <div className="gemini-helper-chat-header">
        <h3>Gemini Chat</h3>
        <div className="gemini-helper-header-actions">
          <button
            className="gemini-helper-icon-btn"
            onClick={startNewChat}
            title="New chat"
          >
            <Plus size={18} />
          </button>
          <button
            className="gemini-helper-icon-btn"
            onClick={() => setShowHistory(!showHistory)}
            title="Chat history"
          >
            <History size={18} />
            {showHistory && <ChevronDown size={14} className="gemini-helper-chevron" />}
          </button>
        </div>
      </div>

      {showHistory && chatHistories.length > 0 && (
        <div className="gemini-helper-history-dropdown">
          {chatHistories.map((history) => (
            <div
              key={history.id}
              className={`gemini-helper-history-item ${currentChatId === history.id ? "active" : ""}`}
              onClick={() => loadChat(history)}
            >
              <div className="gemini-helper-history-title">{history.title}</div>
              <div className="gemini-helper-history-meta">
                <span className="gemini-helper-history-date">
                  {formatHistoryDate(history.updatedAt)}
                </span>
                <button
                  className="gemini-helper-history-delete"
                  onClick={(e) => deleteChat(history.id, e)}
                  title="Delete chat"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showHistory && chatHistories.length === 0 && (
        <div className="gemini-helper-history-dropdown">
          <div className="gemini-helper-history-empty">No chat history yet</div>
        </div>
      )}

      <MessageList
        messages={messages}
        streamingContent={streamingContent}
        isLoading={isLoading}
        onApplyEdit={handleApplyEdit}
        onDiscardEdit={handleDiscardEdit}
      />
      <div ref={messagesEndRef} />

      <InputArea
        onSend={sendMessage}
        onStop={stopMessage}
        isLoading={isLoading}
        model={currentModel}
        onModelChange={setCurrentModel}
      />
    </div>
  );
});

Chat.displayName = "Chat";

export default Chat;
