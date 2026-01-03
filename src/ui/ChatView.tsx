import { createRoot, Root } from "react-dom/client";
import { ItemView, WorkspaceLeaf, IconName, TFile } from "obsidian";
import type { GeminiHelperPlugin } from "src/plugin";
import TabContainer, { TabContainerRef } from "./components/TabContainer";

export const VIEW_TYPE_GEMINI_CHAT = "gemini-chat-view";

export class ChatView extends ItemView {
  plugin: GeminiHelperPlugin;
  reactRoot!: Root;
  private tabContainerRef: TabContainerRef | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: GeminiHelperPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_GEMINI_CHAT;
  }

  getDisplayText(): string {
    return "Gemini";
  }

  getIcon(): IconName {
    return "message-square";
  }

  async onOpen(): Promise<void> {
    await Promise.resolve();
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("gemini-helper-chat-container");

    const root = createRoot(container);
    root.render(
      <TabContainer
        ref={(ref) => {
          this.tabContainerRef = ref;
        }}
        plugin={this.plugin}
      />
    );
    this.reactRoot = root;
  }

  async onClose(): Promise<void> {
    // Clear selection highlight when chat view is closed
    this.plugin.clearSelectionHighlight();
    this.reactRoot?.unmount();
    await Promise.resolve();
  }

  getActiveChat(): TFile | null {
    return this.tabContainerRef?.getActiveChat() ?? null;
  }

  setActiveChat(chat: TFile | null): void {
    this.tabContainerRef?.setActiveChat(chat);
  }
}
