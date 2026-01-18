import { createRoot, Root } from "react-dom/client";
import { ItemView, WorkspaceLeaf, IconName, TFile, Notice } from "obsidian";
import type { GeminiHelperPlugin } from "src/plugin";
import CryptEditor from "./components/CryptEditor";
import {
  isEncryptedFile,
  encryptFileContent,
} from "src/core/crypto";
import { formatError } from "src/utils/error";

export const CRYPT_VIEW_TYPE = "gemini-helper-crypt-view";

interface CryptViewState extends Record<string, unknown> {
  filePath: string;
}

export class CryptView extends ItemView {
  plugin: GeminiHelperPlugin;
  reactRoot: Root | null = null;
  filePath: string = "";
  private file: TFile | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: GeminiHelperPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return CRYPT_VIEW_TYPE;
  }

  getDisplayText(): string {
    const fileName = this.filePath.split("/").pop() || "Encrypted";
    return `🔒 ${fileName}`;
  }

  getIcon(): IconName {
    return "lock";
  }

  async setState(state: CryptViewState, result: { history: boolean }): Promise<void> {
    const oldFilePath = this.filePath;
    this.filePath = state.filePath || "";
    await super.setState(state, result);
    // Only re-render if filePath actually changed (prevents losing edits on mobile)
    if (this.filePath && this.filePath !== oldFilePath) {
      // Reset reactRoot to allow re-render for new file
      this.reactRoot?.unmount();
      this.reactRoot = null;
      await this.renderContent();
    }
  }

  getState(): CryptViewState {
    return { filePath: this.filePath };
  }

  setFile(file: TFile): void {
    this.file = file;
    this.filePath = file.path;
  }

  async onOpen(): Promise<void> {
    await Promise.resolve();
    const container = this.containerEl.children[1];
    container.addClass("gemini-helper-crypt-container");

    // Only render if not already rendered (prevents losing edits on mobile keyboard show)
    if (this.filePath && !this.reactRoot) {
      await this.renderContent();
    }
  }

  private async renderContent(): Promise<void> {
    // Skip if already rendered (prevents losing edits on mobile)
    if (this.reactRoot) {
      return;
    }

    const container = this.containerEl.children[1];
    container.empty();

    if (!this.filePath) {
      container.createEl("div", {
        text: "No file specified",
        cls: "gemini-helper-crypt-error",
      });
      return;
    }

    // Get the file
    const file = this.plugin.app.vault.getAbstractFileByPath(this.filePath);
    if (!(file instanceof TFile)) {
      container.createEl("div", {
        text: "File not found",
        cls: "gemini-helper-crypt-error",
      });
      return;
    }
    this.file = file;

    // Read file content
    const content = await this.plugin.app.vault.read(file);
    if (!isEncryptedFile(content)) {
      container.createEl("div", {
        text: "File is not encrypted",
        cls: "gemini-helper-crypt-error",
      });
      return;
    }

    // Render React component
    const root = createRoot(container);
    root.render(
      <CryptEditor
        plugin={this.plugin}
        filePath={this.filePath}
        encryptedContent={content}
        onSave={async (newContent: string) => {
          await this.saveEncrypted(newContent);
        }}
        onDecrypt={async (decryptedContent: string) => {
          await this.saveDecrypted(decryptedContent);
        }}
      />
    );
    this.reactRoot = root;

  }

  async onClose(): Promise<void> {
    this.reactRoot?.unmount();
    await Promise.resolve();
  }

  private async saveEncrypted(content: string): Promise<void> {
    if (!this.file) return;

    const encryption = this.plugin.settings.encryption;
    if (!encryption?.publicKey || !encryption?.encryptedPrivateKey || !encryption?.salt) {
      new Notice("Encryption not configured");
      return;
    }

    try {
      const encryptedContent = await encryptFileContent(
        content,
        encryption.publicKey,
        encryption.encryptedPrivateKey,
        encryption.salt
      );
      await this.plugin.app.vault.modify(this.file, encryptedContent);
      new Notice("File saved (encrypted)");
    } catch (error) {
      console.error("Failed to save encrypted file:", formatError(error));
      new Notice("Failed to save file");
    }
  }

  private async saveDecrypted(content: string): Promise<void> {
    if (!this.file) return;

    try {
      await this.plugin.app.vault.modify(this.file, content);
      new Notice("File decrypted and saved");

      // Close this view and open the file normally
      this.leaf.detach();
      await this.plugin.app.workspace.openLinkText(this.filePath, "", false);
    } catch (error) {
      console.error("Failed to save decrypted file:", formatError(error));
      new Notice("Failed to decrypt file");
    }
  }
}
