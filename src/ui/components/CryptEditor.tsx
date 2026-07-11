import { useState, useEffect, useRef, useCallback } from "react";
import { Notice, MarkdownRenderer, Component, Modal, App } from "obsidian";
import { Save, Unlock, Eye, Edit2, Lock, Plus, X } from "lucide-react";
import type { GeminiHelperPlugin } from "src/plugin";
import {
  decryptFileContent,
  unwrapEncryptedFile,
  decryptPrivateKey,
  getEncryptedFileMetadata,
  type EncryptedFileMetadata,
} from "src/core/crypto";
import { cryptoCache } from "src/core/cryptoCache";
import { formatError } from "src/utils/error";
import { t } from "src/i18n";

interface CryptEditorProps {
  plugin: GeminiHelperPlugin;
  filePath: string;
  encryptedContent: string;
  onSave: (content: string, metadata: EncryptedFileMetadata) => Promise<void>;
  onDecrypt: (content: string) => Promise<void>;
}

interface MetadataRow { key: string; value: string }

function metadataRows(metadata: Record<string, string>): MetadataRow[] {
  const rows = Object.entries(metadata).map(([key, value]) => ({ key, value }));
  return rows.length ? rows : [{ key: "", value: "" }];
}

function metadataRecord(rows: MetadataRow[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key && !["description", "__proto__", "prototype", "constructor"].includes(key)) result[key] = row.value.trim();
  }
  return result;
}

function CryptMetadataEditor({ description, rows, onDescriptionChange, onRowsChange }: {
  description: string; rows: MetadataRow[]; onDescriptionChange: (value: string) => void; onRowsChange: (rows: MetadataRow[]) => void;
}) {
  const update = (index: number, patch: Partial<MetadataRow>) => onRowsChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  return <div className="gemini-helper-crypt-metadata-editor">
    <label><span>{t("dashboard.secretDescription")}</span><input value={description} onChange={(e) => onDescriptionChange(e.target.value)} /></label>
    <div className="gemini-helper-crypt-metadata-editor-heading"><span>{t("dashboard.secretMetadata")}</span><button type="button" onClick={() => onRowsChange([...rows, { key: "", value: "" }])}><Plus size={13} /> {t("dashboard.secretMetadataAdd")}</button></div>
    <div className="gemini-helper-crypt-metadata-editor-rows">{rows.map((row, index) => <div key={index}>
      <input placeholder={t("dashboard.secretMetadataKey")} value={row.key} onChange={(e) => update(index, { key: e.target.value.replace(/[=\n]/g, "") })} />
      <input placeholder={t("dashboard.secretMetadataValue")} value={row.value} onChange={(e) => update(index, { value: e.target.value.replace(/\n/g, "") })} />
      <button type="button" aria-label={t("dashboard.remove")} onClick={() => onRowsChange(rows.length === 1 ? [{ key: "", value: "" }] : rows.filter((_, i) => i !== index))}><X size={14} /></button>
    </div>)}</div>
  </div>;
}

function CryptMetadata({ encryptedContent }: { encryptedContent: string }) {
  const metadata = getEncryptedFileMetadata(encryptedContent);
  const entries = Object.entries(metadata.publicMetadata ?? {});
  if (!metadata.description && entries.length === 0) return null;

  return (
    <div className="gemini-helper-crypt-metadata">
      {metadata.description && (
        <div className="gemini-helper-crypt-metadata-description">
          <span>{t("dashboard.secretDescription")}</span>
          <p>{metadata.description}</p>
        </div>
      )}
      {entries.length > 0 && (
        <div className="gemini-helper-crypt-metadata-fields">
          <span>{t("dashboard.secretMetadata")}</span>
          <dl>
            {entries.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

export default function CryptEditor({
  plugin,
  filePath,
  encryptedContent,
  onSave,
  onDecrypt,
}: CryptEditorProps) {
  const originalMetadata = useRef(getEncryptedFileMetadata(encryptedContent));
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<string>("");
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [description, setDescription] = useState(originalMetadata.current.description ?? "");
  const [metadata, setMetadata] = useState<MetadataRow[]>(metadataRows(originalMetadata.current.publicMetadata ?? {}));
  const [previewNode, setPreviewNode] = useState<HTMLDivElement | null>(null);
  const previewRef = useCallback((node: HTMLDivElement | null) => {
    setPreviewNode(node);
  }, []);
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
          console.error("Failed to decrypt with cached password:", formatError(error));
          // Don't clear cache - password might be correct for other files with same encryption settings
          // Just ask for password for this file
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
      console.error("Failed to decrypt:", formatError(error));
      new Notice(t("crypt.wrongPassword"));
    } finally {
      setIsDecrypting(false);
    }
  };

  // Update preview when content changes or after decryption
  useEffect(() => {
    if (showPreview && previewNode && editedContent) {
      previewNode.empty();

      // Create a new component for rendering
      if (previewComponent.current) {
        previewComponent.current.unload();
      }
      previewComponent.current = new Component();
      previewComponent.current.load();

      void MarkdownRenderer.render(
        plugin.app,
        editedContent,
        previewNode,
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
    // Include previewNode to trigger when DOM element is mounted
  }, [showPreview, editedContent, previewNode, plugin.app, filePath]);

  // Track changes
  useEffect(() => {
    const current = JSON.stringify({ description: description.trim(), publicMetadata: metadataRecord(metadata) });
    const original = JSON.stringify({
      description: originalMetadata.current.description?.trim() ?? "",
      publicMetadata: originalMetadata.current.publicMetadata ?? {},
    });
    setHasChanges(editedContent !== decryptedContent || current !== original);
  }, [editedContent, decryptedContent, description, metadata]);

  // Handle save (encrypted)
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const nextMetadata = { description: description.trim(), publicMetadata: metadataRecord(metadata) };
      await onSave(editedContent, nextMetadata);
      originalMetadata.current = nextMetadata;
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
        <CryptMetadata encryptedContent={encryptedContent} />
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

      {showPreview && <CryptMetadata encryptedContent={encryptedContent} />}

      <div className="gemini-helper-crypt-content">
        {showPreview ? (
          <div
            ref={previewRef}
            className="gemini-helper-crypt-preview markdown-preview-view"
          />
        ) : (
          <div className="gemini-helper-crypt-edit-content">
            <CryptMetadataEditor description={description} rows={metadata} onDescriptionChange={setDescription} onRowsChange={setMetadata} />
            <textarea className="gemini-helper-crypt-textarea" value={editedContent} onChange={(e) => setEditedContent(e.target.value)} placeholder={t("crypt.editorPlaceholder")} />
          </div>
        )}
      </div>
    </div>
  );
}
