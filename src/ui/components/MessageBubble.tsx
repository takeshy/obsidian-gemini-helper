// The message bubble lives in the shared library; this supplies what only this plugin
// knows: where its workflow panel is.
import type { App } from "obsidian";
import { MessageBubbleView } from "obsidian-llm-hub-common/modals";
import type { Message } from "src/types";
import { ChatView, VIEW_TYPE_GEMINI_CHAT } from "src/ui/ChatView";

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  sourceFileName?: string | null;
  onApplyEdit?: () => Promise<void>;
  onDiscardEdit?: () => void;
  app: App;
  skillsFolder?: string;
}

export default function MessageBubble(props: MessageBubbleProps) {
  return <MessageBubbleView {...props} classPrefix="gemini-helper" onOpenWorkflow={() => revealWorkflowTab(props.app, "")} />;
}

/** Reveals a workflow file in this plugin's own workflow panel. */
function revealWorkflowTab(app: App, _path: string): void {
  for (const leaf of app.workspace.getLeavesOfType(VIEW_TYPE_GEMINI_CHAT)) {
    const view = leaf.view;
    if (view instanceof ChatView) {
      view.setActiveTab("workflow");
      void app.workspace.revealLeaf(leaf);
    }
  }
}
