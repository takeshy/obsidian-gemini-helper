import { forwardRef } from "react";
import type { App } from "obsidian";
import type { Message } from "src/types";
import MessageBubble from "./MessageBubble";

interface MessageListProps {
  messages: Message[];
  streamingContent: string;
  isLoading: boolean;
  onApplyEdit?: (messageIndex: number) => Promise<void>;
  onDiscardEdit?: (messageIndex: number) => void;
  app: App;
  workspaceFolder: string;
}

// Extract source file name from user message (e.g., From "xxx.md":)
function extractSourceFileName(content: string): string | null {
  const match = content.match(/From "([^"]+\.md)"/);
  if (match) {
    // Get just the file name without path
    const fullPath = match[1];
    const parts = fullPath.split("/");
    return parts[parts.length - 1].replace(".md", "");
  }
  return null;
}

const MessageList = forwardRef<HTMLDivElement, MessageListProps>(({
  messages,
  streamingContent,
  isLoading,
  onApplyEdit,
  onDiscardEdit,
  app,
  workspaceFolder,
}, ref) => {
  // Get source file name for assistant message (from previous user message)
  const getSourceFileForIndex = (index: number): string | null => {
    if (messages[index]?.role !== "assistant") return null;
    // Look at the previous user message
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        return extractSourceFileName(messages[i].content);
      }
    }
    return null;
  };

  return (
    <div className="gemini-helper-messages" ref={ref}>
      {messages.length === 0 && !streamingContent && (
        <div className="gemini-helper-empty-state">
          <p>Start a conversation with Gemini</p>
          <p className="gemini-helper-empty-hint">
            Ask questions about your notes, create new ones, or search your vault.
          </p>
        </div>
      )}

      {messages.map((message, index) => (
        <MessageBubble
          key={index}
          message={message}
          sourceFileName={getSourceFileForIndex(index)}
          onApplyEdit={onApplyEdit ? () => onApplyEdit(index) : undefined}
          onDiscardEdit={onDiscardEdit ? () => onDiscardEdit(index) : undefined}
          app={app}
          workspaceFolder={workspaceFolder}
        />
      ))}

      {streamingContent && (
        <MessageBubble
          message={{
            role: "assistant",
            content: streamingContent,
            timestamp: Date.now(),
          }}
          isStreaming
          app={app}
          workspaceFolder={workspaceFolder}
        />
      )}

      {isLoading && !streamingContent && (
        <div className="gemini-helper-loading">
          <span className="gemini-helper-loading-dot" />
          <span className="gemini-helper-loading-dot" />
          <span className="gemini-helper-loading-dot" />
        </div>
      )}
    </div>
  );
});

export default MessageList;
