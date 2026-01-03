import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { GeminiHelperPlugin } from "src/plugin";
import type { TFile } from "obsidian";
import Chat, { ChatRef } from "./Chat";
import WorkflowPanel from "./workflow/WorkflowPanel";

export type TabType = "chat" | "workflow";

export interface TabContainerRef {
  getActiveChat: () => TFile | null;
  setActiveChat: (chat: TFile | null) => void;
}

interface TabContainerProps {
  plugin: GeminiHelperPlugin;
}

const TabContainer = forwardRef<TabContainerRef, TabContainerProps>(
  ({ plugin }, ref) => {
    const [activeTab, setActiveTab] = useState<TabType>("chat");
    const chatRef = useRef<ChatRef>(null);

    useImperativeHandle(ref, () => ({
      getActiveChat: () => chatRef.current?.getActiveChat() ?? null,
      setActiveChat: (chat: TFile | null) => chatRef.current?.setActiveChat(chat),
    }));

    return (
      <div className="gemini-helper-tab-container">
        <div className="gemini-helper-tab-bar">
          <button
            className={`gemini-helper-tab ${activeTab === "chat" ? "active" : ""}`}
            onClick={() => setActiveTab("chat")}
          >
            Chat
          </button>
          <button
            className={`gemini-helper-tab ${activeTab === "workflow" ? "active" : ""}`}
            onClick={() => setActiveTab("workflow")}
          >
            Workflow
          </button>
        </div>
        <div className="gemini-helper-tab-content">
          {activeTab === "chat" && <Chat ref={chatRef} plugin={plugin} />}
          {activeTab === "workflow" && <WorkflowPanel plugin={plugin} />}
        </div>
      </div>
    );
  }
);

TabContainer.displayName = "TabContainer";

export default TabContainer;
