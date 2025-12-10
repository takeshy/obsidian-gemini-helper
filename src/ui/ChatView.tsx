import { createRoot, Root } from "react-dom/client";
import { ItemView, WorkspaceLeaf, IconName, TFile } from "obsidian";
import type { GeminiHelperPlugin } from "src/plugin";
import Chat, { ChatRef } from "./components/Chat";

export const VIEW_TYPE_GEMINI_CHAT = "gemini-chat-view";

export class ChatView extends ItemView {
  plugin: GeminiHelperPlugin;
  reactRoot!: Root;
  private chatRef: ChatRef | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: GeminiHelperPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_GEMINI_CHAT;
  }

  getDisplayText(): string {
    return "Gemini Chat";
  }

  getIcon(): IconName {
    return "message-square";
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("gemini-helper-chat-container");

    const root = createRoot(container);
    root.render(
      <Chat
        ref={(ref) => {
          this.chatRef = ref;
        }}
        plugin={this.plugin}
      />
    );
    this.reactRoot = root;
  }

  async onClose(): Promise<void> {
    this.reactRoot?.unmount();
  }

  getActiveChat(): TFile | null {
    return this.chatRef?.getActiveChat() ?? null;
  }

  setActiveChat(chat: TFile | null): void {
    this.chatRef?.setActiveChat(chat);
  }
}
