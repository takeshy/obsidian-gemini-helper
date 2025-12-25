import { forwardRef } from "react";
import type { App } from "obsidian";
import type { Message } from "src/types";
import MessageBubble from "./MessageBubble";

interface MessageListProps {
  messages: Message[];
  streamingContent: string;
  isLoading: boolean;
  onApplyEdit?: (messageIndex: number) => Promise<void>;
  onDiscardEdit?: (messageIndex: number) => Promise<void>;
  app: App;
}

const MessageList = forwardRef<HTMLDivElement, MessageListProps>(({
  messages,
  streamingContent,
  isLoading,
  onApplyEdit,
  onDiscardEdit,
  app,
}, ref) => {
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
          onApplyEdit={onApplyEdit ? () => onApplyEdit(index) : undefined}
          onDiscardEdit={onDiscardEdit ? () => onDiscardEdit(index) : undefined}
          app={app}
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
