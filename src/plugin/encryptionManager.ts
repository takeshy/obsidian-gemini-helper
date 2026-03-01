import { Notice, TFile, MarkdownView } from "obsidian";
import type { App } from "obsidian";
import { promptForPassword } from "src/ui/passwordPrompt";
import { isEncryptedFile, encryptFileContent, decryptFileContent } from "src/core/crypto";
import { cryptoCache } from "src/core/cryptoCache";
import { CryptView, CRYPT_VIEW_TYPE } from "src/ui/CryptView";
import { formatError } from "src/utils/error";
import { t } from "src/i18n";
import type { GeminiHelperPlugin } from "src/plugin";

export class EncryptionManager {
  private plugin: GeminiHelperPlugin;

  constructor(plugin: GeminiHelperPlugin) {
    this.plugin = plugin;
  }

  private get app(): App {
    return this.plugin.app;
  }

  async encryptFile(file: TFile): Promise<void> {
    const encryption = this.plugin.settings.encryption;

    // Check if encryption keys are configured (password has been set)
    if (!encryption?.publicKey || !encryption?.encryptedPrivateKey || !encryption?.salt) {
      new Notice(t("crypt.notConfigured"));
      throw new Error(t("crypt.notConfigured"));
    }

    try {
      // Read current content
      const content = await this.app.vault.read(file);

      // Check if already encrypted
      if (isEncryptedFile(content)) {
        new Notice(t("crypt.alreadyEncrypted"));
        return;
      }

      // Encrypt the content
      const encryptedContent = await encryptFileContent(
        content,
        encryption.publicKey,
        encryption.encryptedPrivateKey,
        encryption.salt
      );

      // Save encrypted content
      await this.app.vault.modify(file, encryptedContent);

      // Rename file to add .encrypted extension
      const newPath = file.path + ".encrypted";
      await this.app.vault.rename(file, newPath);

      new Notice(t("crypt.encryptSuccess"));

      // Reopen the file in CryptView
      await this.openCryptView(file);
    } catch (error) {
      console.error("Failed to encrypt file:", formatError(error));
      new Notice(t("crypt.encryptFailed"));
    }
  }

  /**
   * Check if a file is encrypted and open it in CryptView
   */
  async checkAndOpenEncryptedFile(file: TFile): Promise<void> {
    try {
      const content = await this.app.vault.read(file);
      if (isEncryptedFile(content)) {
        // Small delay to let the markdown view finish opening
        setTimeout(() => {
          void this.openCryptView(file);
        }, 50);
      }
    } catch {
      // Ignore read errors
    }
  }

  /**
   * Open a file in CryptView
   */
  async openCryptView(file: TFile): Promise<void> {
    // Check if there's already a CryptView for this file
    const cryptLeaves = this.app.workspace.getLeavesOfType(CRYPT_VIEW_TYPE);
    for (const leaf of cryptLeaves) {
      const view = leaf.view as CryptView;
      if (view.file?.path === file.path) {
        this.app.workspace.setActiveLeaf(leaf, { focus: true });
        return;
      }
    }

    // Find existing markdown view for this file and replace it with CryptView
    const allLeaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of allLeaves) {
      const view = leaf.view as MarkdownView;
      if (view.file?.path === file.path) {
        // Replace the view in the same leaf
        await leaf.setViewState({
          type: CRYPT_VIEW_TYPE,
          active: true,
          state: { file: file.path },
        });
        return;
      }
    }

    // If no existing leaf found, create new CryptView in a new tab
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      type: CRYPT_VIEW_TYPE,
      active: true,
      state: { file: file.path },
    });
  }

  /**
   * Decrypt a file (remove encryption)
   */
  async decryptFile(file: TFile, decryptedContent: string): Promise<void> {
    try {
      await this.app.vault.modify(file, decryptedContent);

      // Remove .encrypted extension if present
      if (file.path.endsWith(".encrypted")) {
        const newPath = file.path.slice(0, -".encrypted".length);
        await this.app.vault.rename(file, newPath);
      }

      new Notice(t("crypt.decryptSuccess"));
    } catch (error) {
      console.error("Failed to decrypt file:", formatError(error));
      new Notice(t("crypt.decryptFailed"));
    }
  }

  // Decrypt current file (command handler)
  async decryptCurrentFile(file: TFile): Promise<void> {
    try {
      const content = await this.app.vault.read(file);

      // Check if file is encrypted
      if (!isEncryptedFile(content)) {
        new Notice(t("crypt.notEncrypted"));
        return;
      }

      // Try cached password first
      let password = cryptoCache.getPassword();

      if (!password) {
        // Prompt for password
        password = await promptForPassword(this.app);

        if (!password) {
          return; // User cancelled
        }
      }

      // Decrypt the file
      const decryptedContent = await decryptFileContent(content, password);

      // Cache the password
      cryptoCache.setPassword(password);

      // Write decrypted content back
      await this.app.vault.modify(file, decryptedContent);

      // Remove .encrypted extension if present
      if (file.path.endsWith(".encrypted")) {
        const newPath = file.path.slice(0, -".encrypted".length);
        await this.app.vault.rename(file, newPath);
      }

      new Notice(t("crypt.decryptSuccess"));
    } catch (error) {
      console.error("Failed to decrypt file:", formatError(error));
      new Notice(t("crypt.decryptFailed"));
    }
  }

}
