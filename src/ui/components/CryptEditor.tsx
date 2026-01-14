import { useState, useEffect, useRef } from "react";
import { Notice, MarkdownRenderer, Component, Modal, App } from "obsidian";
import { Save, Unlock, Eye, Edit2, Lock } from "lucide-react";
import type { GeminiHelperPlugin } from "src/plugin";
import {
  decryptFileContent,
  unwrapEncryptedFile,
  decryptPrivateKey,
} from "src/core/crypto";
import { cryptoCache } from "src/core/cryptoCache";
import { t } from "src/i18n";

interface CryptEditorProps {
  plugin: GeminiHelperPlugin;
  filePath: string;
  encryptedContent: string;
  onSave: (content: string) => Promise<void>;
  onDecrypt: (content: string) => Promise<void>;
}

export default function CryptEditor({
  plugin,
  filePath,
  encryptedContent,
  onSave,
  onDecrypt,
}: CryptEditorProps) {
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<string>("");
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewComponent = useRef<Component | null>(null);

  // Try to decrypt on mount
  useEffect(() => {
    const tryDecrypt = async () => {
      // Check if we have cached password
      const cachedPassword = cryptoCache.getPassword();
      if (cachedPassword) {
        setIsDecrypting(true);
        try {
          const content = await decryptFileContent(encryptedContent, cachedPassword);
          setDecryptedContent(content);
          setEditedContent(content);
        } catch (error) {
          console.error("Failed to decrypt with cached password:", error);
          // Clear cache and ask for password
          cryptoCache.clear();
          setNeedsPassword(true);
        } finally {
          setIsDecrypting(false);
        }
      } else {
        setNeedsPassword(true);
      }
    };

    void tryDecrypt();
  }, [encryptedContent]);

  // Handle password submission
  const handlePasswordSubmit = async () => {
    if (!password) return;

    setIsDecrypting(true);
    try {
      const content = await decryptFileContent(encryptedContent, password);
      setDecryptedContent(content);
      setEditedContent(content);
      setNeedsPassword(false);

      // Cache the password
      cryptoCache.setPassword(password);

      // Also cache the private key for future use
      const encrypted = unwrapEncryptedFile(encryptedContent);
      if (encrypted) {
        const privateKey = await decryptPrivateKey(encrypted.key, encrypted.salt, password);
        cryptoCache.setPrivateKey(privateKey);
      }
    } catch (error) {
      console.error("Failed to decrypt:", error);
      new Notice(t("crypt.wrongPassword"));
    } finally {
      setIsDecrypting(false);
    }
  };

  // Update preview when content changes
  useEffect(() => {
    if (showPreview && previewRef.current && editedContent) {
      previewRef.current.empty();

      // Create a new component for rendering
      if (previewComponent.current) {
        previewComponent.current.unload();
      }
      previewComponent.current = new Component();
      previewComponent.current.load();

      void MarkdownRenderer.render(
        plugin.app,
        editedContent,
        previewRef.current,
        filePath,
        previewComponent.current
      );
    }

    return () => {
      if (previewComponent.current) {
        previewComponent.current.unload();
        previewComponent.current = null;
      }
    };
  }, [showPreview, editedContent, plugin.app, filePath]);

  // Track changes
  useEffect(() => {
    setHasChanges(editedContent !== decryptedContent);
  }, [editedContent, decryptedContent]);

  // Handle save (encrypted)
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(editedContent);
      setDecryptedContent(editedContent);
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle decrypt (remove encryption)
  const handleDecrypt = async () => {
    const confirmed = await new Promise<boolean>((resolve) => {
      class ConfirmModal extends Modal {
        constructor(app: App) {
          super(app);
        }
        onOpen() {
          this.contentEl.createEl("h3", { text: t("crypt.confirmDecrypt") });
          this.contentEl.createEl("p", { text: t("crypt.confirmDecryptDesc") });

          const buttonContainer = this.contentEl.createDiv({ cls: "modal-button-container" });

          buttonContainer.createEl("button", {
            text: t("common.cancel"),
            cls: "mod-cta",
          }).onclick = () => {
            this.close();
            resolve(false);
          };

          buttonContainer.createEl("button", {
            text: t("crypt.removeEncryption"),
          }).onclick = () => {
            this.close();
            resolve(true);
          };
        }
      }
      const modal = new ConfirmModal(plugin.app);
      modal.open();
    });

    if (confirmed) {
      await onDecrypt(editedContent);
    }
  };

  // Password input UI
  if (needsPassword) {
    return (
      <div className="gemini-helper-crypt-password">
        <div className="gemini-helper-crypt-password-icon">
          <Lock size={48} />
        </div>
        <h3>{t("crypt.enterPassword")}</h3>
        <p>{t("crypt.enterPasswordDesc")}</p>
        <div className="gemini-helper-crypt-password-form">
          <input
            type="password"
            placeholder={t("crypt.passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void handlePasswordSubmit();
              }
            }}
            disabled={isDecrypting}
            autoFocus
          />
          <button
            onClick={() => void handlePasswordSubmit()}
            disabled={isDecrypting || !password}
            className="mod-cta"
          >
            {isDecrypting ? t("crypt.decrypting") : t("crypt.unlock")}
          </button>
        </div>
      </div>
    );
  }

  // Loading UI
  if (isDecrypting || decryptedContent === null) {
    return (
      <div className="gemini-helper-crypt-loading">
        <div className="gemini-helper-loading-spinner" />
        <p>{t("crypt.decrypting")}</p>
      </div>
    );
  }

  // Editor UI
  return (
    <div className="gemini-helper-crypt-editor">
      <div className="gemini-helper-crypt-toolbar">
        <div className="gemini-helper-crypt-toolbar-left">
          <span className="gemini-helper-crypt-filename">
            <Lock size={14} />
            {filePath.split("/").pop()}
          </span>
          {hasChanges && (
            <span className="gemini-helper-crypt-unsaved">
              {t("crypt.unsavedChanges")}
            </span>
          )}
        </div>
        <div className="gemini-helper-crypt-toolbar-right">
          <button
            className={`gemini-helper-crypt-btn ${showPreview ? "active" : ""}`}
            onClick={() => setShowPreview(!showPreview)}
            title={showPreview ? t("crypt.edit") : t("crypt.preview")}
          >
            {showPreview ? <Edit2 size={16} /> : <Eye size={16} />}
          </button>
          <button
            className="gemini-helper-crypt-btn"
            onClick={() => void handleSave()}
            disabled={isSaving || !hasChanges}
            title={t("crypt.save")}
          >
            <Save size={16} />
            {t("crypt.save")}
          </button>
          <button
            className="gemini-helper-crypt-btn gemini-helper-crypt-btn-decrypt"
            onClick={() => void handleDecrypt()}
            title={t("crypt.removeEncryption")}
          >
            <Unlock size={16} />
            {t("crypt.removeEncryption")}
          </button>
        </div>
      </div>

      <div className="gemini-helper-crypt-content">
        {showPreview ? (
          <div
            ref={previewRef}
            className="gemini-helper-crypt-preview markdown-preview-view"
          />
        ) : (
          <textarea
            className="gemini-helper-crypt-textarea"
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            placeholder={t("crypt.editorPlaceholder")}
          />
        )}
      </div>
    </div>
  );
}
