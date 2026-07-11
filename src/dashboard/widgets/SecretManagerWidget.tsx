import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Copy, Eye, FileKey2, Folder, KeyRound, Loader2, Pencil, Plus, Search, X } from "lucide-react";
import { Notice, TFile } from "obsidian";
import { t } from "src/i18n";
import type { WidgetContext } from "../types";
import type { SecretManagerConfig } from "../secretManager";
import { groupSecretPaths, matchesSecretSearch, normalizeSecretFolder, secretFilePath, type SecretPathRow } from "../secretManager";
import { ensureVaultFolder } from "../dashboardFile";
import {
  decryptFileContent,
  decryptWithPrivateKey,
  encryptPlaintextFileContent,
  getEncryptedFileMetadata,
  isEncryptedFile,
} from "src/core/crypto";
import { cryptoCache } from "src/core/cryptoCache";

interface SecretEntry {
  file: TFile;
  name: string;
  description: string;
  publicMetadata: Record<string, string>;
}

interface SecretDraft {
  name: string;
  description: string;
  metadata: string;
  value: string;
}

const EMPTY_DRAFT: SecretDraft = { name: "", description: "", metadata: "", value: "" };

function parseMetadata(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of value.split("\n")) {
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (key && !["description", "__proto__", "prototype", "constructor"].includes(key)) {
      result[key] = line.slice(separator + 1).trim();
    }
  }
  return result;
}

function formatMetadata(value: Record<string, string>): string {
  return Object.entries(value).map(([key, item]) => `${key}=${item}`).join("\n");
}

interface MetadataRow {
  key: string;
  value: string;
}

function metadataRows(value: string): MetadataRow[] {
  const rows = value.split("\n").filter(Boolean).map((line) => {
    const separator = line.indexOf("=");
    return separator < 0
      ? { key: line, value: "" }
      : { key: line.slice(0, separator), value: line.slice(separator + 1) };
  });
  return rows.length > 0 ? rows : [{ key: "", value: "" }];
}

function MetadataEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const rows = metadataRows(value);
  const commit = (next: MetadataRow[]) => onChange(next.map((row) => `${row.key}=${row.value}`).join("\n"));
  const update = (index: number, patch: Partial<MetadataRow>) =>
    commit(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));

  return (
    <div className="llm-hub-db-secret-metadata">
      <div className="llm-hub-db-secret-field-heading">
        <div>
          <span>{t("dashboard.secretMetadata")}</span>
          <small>{t("dashboard.secretMetadataHint")}</small>
        </div>
        <button
          type="button"
          className="llm-hub-db-secret-add-metadata"
          onClick={() => commit([...rows, { key: "", value: "" }])}
        >
          <Plus size={13} /> {t("dashboard.secretMetadataAdd")}
        </button>
      </div>
      <div className="llm-hub-db-secret-metadata-rows">
        {rows.map((row, index) => (
          <div className="llm-hub-db-secret-metadata-row" key={index}>
            <input
              aria-label={t("dashboard.secretMetadataKey")}
              placeholder={t("dashboard.secretMetadataKey")}
              value={row.key}
              onChange={(event) => update(index, { key: event.target.value.replace(/[=\n]/g, "") })}
            />
            <span>=</span>
            <input
              aria-label={t("dashboard.secretMetadataValue")}
              placeholder={t("dashboard.secretMetadataValue")}
              value={row.value}
              onChange={(event) => update(index, { value: event.target.value.replace(/\n/g, "") })}
            />
            <button
              type="button"
              className="llm-hub-db-iconbtn"
              aria-label={t("dashboard.remove")}
              onClick={() => commit(rows.length === 1 ? [{ key: "", value: "" }] : rows.filter((_, rowIndex) => rowIndex !== index))}
            ><X size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetadataDisplay({ metadata }: { metadata: Record<string, string> }) {
  const items = Object.entries(metadata);
  if (items.length === 0) return null;
  return (
    <section className="llm-hub-db-secret-detail-section">
      <span className="llm-hub-db-secret-detail-label">{t("dashboard.secretMetadata")}</span>
      <dl className="llm-hub-db-secret-metadata-display">
        {items.map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function displayName(file: TFile): string {
  return file.name.replace(/\.encrypted$/i, "");
}

export default function SecretManagerWidget({ config, ctx }: { config: unknown; ctx?: WidgetContext }) {
  const cfg = (config ?? {}) as SecretManagerConfig;
  const folder = normalizeSecretFolder(cfg.folder ?? "");
  const [entries, setEntries] = useState<SecretEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<SecretDraft>(EMPTY_DRAFT);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewing, setViewing] = useState<SecretEntry | null>(null);
  const [copying, setCopying] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordEntry, setPasswordEntry] = useState<SecretEntry | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [groupExpanded, setGroupExpanded] = useState<Record<string, boolean>>({});
  const encryption = ctx?.plugin.settings.encryption;
  // `enabled` tracks chat/workflow history encryption, not whether keys exist.
  // Secret files can be encrypted whenever the configured key material is present.
  const encryptionReady = Boolean(encryption?.publicKey && encryption.encryptedPrivateKey && encryption.salt);

  const refresh = useCallback(async () => {
    if (!ctx) return;
    const prefix = folder ? `${folder}/`.toLocaleLowerCase() : "";
    const files = ctx.app.vault.getFiles().filter((file) =>
      file.extension.toLocaleLowerCase() === "encrypted" && (!prefix || file.path.toLocaleLowerCase().startsWith(prefix)));
    const next = await Promise.all(files.map(async (file): Promise<SecretEntry> => {
      try {
        const metadata = getEncryptedFileMetadata(await ctx.app.vault.cachedRead(file));
        return { file, name: displayName(file), description: metadata.description ?? "", publicMetadata: metadata.publicMetadata ?? {} };
      } catch {
        return { file, name: displayName(file), description: "", publicMetadata: {} };
      }
    }));
    next.sort((a, b) => a.name.localeCompare(b.name));
    setEntries(next);
  }, [ctx, folder]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!ctx) return;
    const refs = [
      ctx.app.vault.on("create", () => void refresh()),
      ctx.app.vault.on("modify", () => void refresh()),
      ctx.app.vault.on("delete", () => void refresh()),
      ctx.app.vault.on("rename", () => void refresh()),
    ];
    return () => refs.forEach((ref) => ctx.app.vault.offref(ref));
  }, [ctx, refresh]);

  const filtered = useMemo(() => (entries ?? []).filter((entry) =>
    matchesSecretSearch(entry.name, entry.description, query, entry.publicMetadata)), [entries, query]);
  const entryByPath = useMemo(() => new Map(filtered.map((entry) => [entry.file.path, entry])), [filtered]);
  const groupedRows = useMemo(() => groupSecretPaths(filtered.map((entry) => ({
    id: entry.file.path,
    path: folder && entry.file.path.startsWith(`${folder}/`)
      ? entry.file.path.slice(folder.length + 1)
      : entry.file.path,
  }))), [filtered, folder]);

  const copyDecrypted = useCallback(async (entry: SecretEntry, submittedPassword?: string) => {
    if (!ctx) return;
    setCopying(entry.file.path);
    setError("");
    try {
      const content = await ctx.app.vault.cachedRead(entry.file);
      if (!isEncryptedFile(content)) throw new Error("Invalid encrypted file");
      const privateKey = cryptoCache.getPrivateKey();
      const availablePassword = submittedPassword ?? cryptoCache.getPassword();
      const value = privateKey
        ? await decryptWithPrivateKey(content, privateKey)
        : availablePassword
          ? await decryptFileContent(content, availablePassword)
          : null;
      if (value === null) {
        setPasswordEntry(entry);
        return;
      }
      await navigator.clipboard.writeText(value);
      if (submittedPassword) cryptoCache.setPassword(submittedPassword);
      setPasswordEntry(null);
      setPassword("");
      new Notice(t("dashboard.secretCopied"));
    } catch {
      if (!submittedPassword) setPasswordEntry(entry);
      else setError(t("dashboard.secretDecryptFailed"));
    } finally {
      setCopying(null);
    }
  }, [ctx]);

  const createSecret = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (!ctx || !encryption || !encryptionReady) return;
    setSaving(true);
    setError("");
    try {
      const path = secretFilePath(folder, draft.name);
      if (ctx.app.vault.getAbstractFileByPath(path)) throw new Error("duplicate");
      const slash = path.lastIndexOf("/");
      if (slash > 0) await ensureVaultFolder(ctx.app.vault, path.slice(0, slash));
      const encrypted = await encryptPlaintextFileContent(
        draft.value,
        encryption.publicKey,
        encryption.encryptedPrivateKey,
        encryption.salt,
        { description: draft.description, publicMetadata: parseMetadata(draft.metadata) },
      );
      await ctx.app.vault.create(path, encrypted);
      setDraft(EMPTY_DRAFT);
      setCreateOpen(false);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error && cause.message === "duplicate"
        ? t("dashboard.secretDuplicate") : t("dashboard.secretCreateFailed"));
    } finally {
      setSaving(false);
    }
  }, [ctx, draft, encryption, encryptionReady, folder, refresh]);

  const renderSecretEntry = (entry: SecretEntry): ReactNode => (
    <div
      className="llm-hub-db-secret-row"
      key={entry.file.path}
      role="button"
      tabIndex={0}
      onClick={() => setViewing(entry)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") setViewing(entry);
      }}
    >
      <FileKey2 size={16} />
      <div className="llm-hub-db-secret-info">
        <strong>{entry.name}</strong>
        {entry.description && <span>{entry.description}</span>}
        {Object.keys(entry.publicMetadata).length > 0 && <small>{formatMetadata(entry.publicMetadata).replace(/\n/g, " · ")}</small>}
        <small>{entry.file.path}</small>
      </div>
      <button type="button" className="llm-hub-db-iconbtn" title={t("dashboard.secretCopy")} disabled={copying === entry.file.path} onClick={(event) => { event.stopPropagation(); void copyDecrypted(entry); }}>
        {copying === entry.file.path ? <Loader2 className="llm-hub-spin" size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );

  function renderRow(row: SecretPathRow): ReactNode {
    if (row.kind === "file") {
      const entry = entryByPath.get(row.item.id);
      return entry ? renderSecretEntry(entry) : null;
    }
    const expanded = query.trim().length > 0 || (groupExpanded[row.folderPath] ?? false);
    return (
      <div className="llm-hub-db-secret-group" key={`group:${row.folderPath}`}>
        <button
          type="button"
          className="llm-hub-db-secret-group-header"
          aria-expanded={expanded}
          onClick={() => setGroupExpanded((previous) => ({
            ...previous,
            [row.folderPath]: !(previous[row.folderPath] ?? false),
          }))}
        >
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <Folder size={16} />
          <span title={row.folderPath}>{row.folderPath}</span>
          <small>{row.items.length}</small>
        </button>
        {expanded && <div className="llm-hub-db-secret-group-children">{row.children.map(renderRow)}</div>}
      </div>
    );
  }

  if (!ctx) return null;
  return (
    <div className="llm-hub-db-secret-manager">
      <div className="llm-hub-db-secret-toolbar">
        <div className="llm-hub-db-secret-search">
          <Search size={15} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("dashboard.secretSearch")} />
          {query && (
            <button type="button" aria-label={t("dashboard.timelineFilterClear")} onClick={() => setQuery("")}>
              <X size={13} />
            </button>
          )}
        </div>
        <button type="button" className="llm-hub-db-primary-btn" onClick={() => { setDraft(EMPTY_DRAFT); setCreateOpen(true); setError(""); }}>
          <Plus size={13} /> {t("dashboard.secretNew")}
        </button>
      </div>
      {!encryptionReady && <div className="llm-hub-db-widget-empty">{t("dashboard.secretEncryptionRequired")}</div>}
      {entries === null ? <div className="llm-hub-db-widget-empty"><Loader2 className="llm-hub-spin" size={18} /></div> : (
        <div className="llm-hub-db-secret-list">
          {groupedRows.map(renderRow)}
          {filtered.length === 0 && <div className="llm-hub-db-widget-empty">{t("dashboard.secretEmpty")}</div>}
        </div>
      )}

      {viewing && (
        <SecretViewDialog
          entry={viewing}
          ctx={ctx}
          onClose={() => setViewing(null)}
          onSaved={async () => { await refresh(); setViewing(null); }}
        />
      )}

      {createOpen && (
        <div className="llm-hub-db-secret-overlay" onClick={() => setCreateOpen(false)}>
          <form className="llm-hub-db-secret-dialog" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void createSecret(event)}>
            <div className="llm-hub-db-secret-dialog-title">
              <div className="llm-hub-db-secret-dialog-heading">
                <span className="llm-hub-db-secret-dialog-icon"><KeyRound size={18} /></span>
                <div>
                  <strong>{t("dashboard.secretNew")}</strong>
                  <small>{t("dashboard.secretNewHint")}</small>
                </div>
              </div>
              <button type="button" className="llm-hub-db-iconbtn" onClick={() => setCreateOpen(false)}><X size={16} /></button>
            </div>
            <div className="llm-hub-db-secret-dialog-body">
              <label>{t("dashboard.secretName")}<input autoFocus required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label>{t("dashboard.secretDescription")}<input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
              <MetadataEditor value={draft.metadata} onChange={(metadata) => setDraft({ ...draft, metadata })} />
              <label>{t("dashboard.secretValue")}<textarea required rows={1} className="is-secret" value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} /></label>
              {error && <p className="llm-hub-db-secret-error">{error}</p>}
            </div>
            <div className="llm-hub-db-secret-dialog-footer">
              <button type="button" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</button>
              <button className="llm-hub-db-primary-btn" type="submit" disabled={saving || !encryptionReady}>{saving ? t("dashboard.secretSaving") : t("dashboard.save")}</button>
            </div>
          </form>
        </div>
      )}

      {passwordEntry && (
        <div className="llm-hub-db-secret-overlay" onClick={() => setPasswordEntry(null)}>
          <form className="llm-hub-db-secret-dialog is-compact" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void copyDecrypted(passwordEntry, password); }}>
            <strong>{t("dashboard.secretPassword")}</strong>
            <input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            {error && <p className="llm-hub-db-secret-error">{error}</p>}
            <button className="llm-hub-db-primary-btn" type="submit" disabled={!password || copying !== null}>{t("dashboard.secretUnlockCopy")}</button>
          </form>
        </div>
      )}
    </div>
  );
}

function SecretViewDialog({
  entry,
  ctx,
  onClose,
  onSaved,
}: {
  entry: SecretEntry;
  ctx: WidgetContext;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [encryptedContent, setEncryptedContent] = useState("");
  const [secretValue, setSecretValue] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<SecretDraft>({
    name: entry.name,
    description: entry.description,
    metadata: formatMetadata(entry.publicMetadata),
    value: "",
  });
  const encryption = ctx.plugin.settings.encryption;
  const encryptionReady = Boolean(
    encryption?.publicKey && encryption.encryptedPrivateKey && encryption.salt,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const content = await ctx.app.vault.cachedRead(entry.file);
        if (!isEncryptedFile(content)) throw new Error("invalid");
        if (cancelled) return;
        setEncryptedContent(content);
        const privateKey = cryptoCache.getPrivateKey();
        const cachedPassword = cryptoCache.getPassword();
        if (privateKey || cachedPassword) {
          try {
            const plain = privateKey
              ? await decryptWithPrivateKey(content, privateKey)
              : await decryptFileContent(content, cachedPassword!);
            if (!cancelled) setSecretValue(plain);
          } catch {
            // Leave the value locked so a different password can be entered.
          }
        }
      } catch {
        if (!cancelled) setError(t("dashboard.secretOpenFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ctx, entry.file]);

  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || !encryptedContent) return;
    setBusy(true);
    setError("");
    try {
      const plain = await decryptFileContent(encryptedContent, password);
      cryptoCache.setPassword(password);
      setSecretValue(plain);
      setPassword("");
    } catch {
      setError(t("dashboard.secretDecryptFailed"));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (secretValue === null) return;
    try {
      await navigator.clipboard.writeText(secretValue);
      new Notice(t("dashboard.secretCopied"));
    } catch {
      setError(t("dashboard.secretCopyFailed"));
    }
  };

  const beginEdit = () => {
    if (secretValue === null) return;
    setDraft({
      name: entry.name,
      description: entry.description,
      metadata: formatMetadata(entry.publicMetadata),
      value: secretValue,
    });
    setError("");
    setEditMode(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!encryption || !encryptionReady) {
      setError(t("dashboard.secretEncryptionRequired"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const content = await encryptPlaintextFileContent(
        draft.value,
        encryption.publicKey,
        encryption.encryptedPrivateKey,
        encryption.salt,
        { description: draft.description, publicMetadata: parseMetadata(draft.metadata) },
      );
      await ctx.app.vault.modify(entry.file, content);
      await onSaved();
    } catch {
      setError(t("dashboard.secretUpdateFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="llm-hub-db-secret-overlay" onClick={onClose}>
      <div className="llm-hub-db-secret-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="llm-hub-db-secret-dialog-title">
          <div className="llm-hub-db-secret-dialog-heading">
            <span className="llm-hub-db-secret-dialog-icon"><FileKey2 size={18} /></span>
            <div>
              <strong>{entry.name}</strong>
              <small>{entry.file.path}</small>
            </div>
          </div>
          <button type="button" className="llm-hub-db-iconbtn" onClick={onClose}><X size={16} /></button>
        </div>
        {loading ? <div className="llm-hub-db-widget-empty"><Loader2 className="llm-hub-spin" size={18} /></div> : editMode && secretValue !== null ? (
          <form className="llm-hub-db-secret-edit-form" onSubmit={(event) => void save(event)}>
            <label>{t("dashboard.secretDescription")}<input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
            <MetadataEditor value={draft.metadata} onChange={(metadata) => setDraft({ ...draft, metadata })} />
            <label>{t("dashboard.secretValue")}<textarea required rows={1} className="is-secret" value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} /></label>
            {error && <p className="llm-hub-db-secret-error">{error}</p>}
            <div className="llm-hub-db-secret-actions">
              <button type="button" onClick={() => setEditMode(false)}>{t("common.cancel")}</button>
              <button className="llm-hub-db-primary-btn" type="submit" disabled={busy || !encryptionReady}>{busy ? t("dashboard.secretSaving") : t("dashboard.save")}</button>
            </div>
          </form>
        ) : secretValue !== null ? (
          <div className="llm-hub-db-secret-detail">
            {entry.description && (
              <section className="llm-hub-db-secret-detail-section">
                <span className="llm-hub-db-secret-detail-label">{t("dashboard.secretDescription")}</span>
                <p className="llm-hub-db-secret-description">{entry.description}</p>
              </section>
            )}
            <MetadataDisplay metadata={entry.publicMetadata} />
            <section className="llm-hub-db-secret-detail-section">
              <span className="llm-hub-db-secret-detail-label">{t("dashboard.secretValue")}</span>
              <textarea className="is-secret llm-hub-db-secret-value" readOnly value={secretValue} aria-label={t("dashboard.secretValue")} />
            </section>
            {error && <p className="llm-hub-db-secret-error">{error}</p>}
            <div className="llm-hub-db-secret-actions">
              <button type="button" onClick={() => void copy()}><Copy size={13} /> {t("dashboard.secretCopy")}</button>
              <button type="button" onClick={beginEdit} disabled={!encryptionReady}><Pencil size={13} /> {t("dashboard.secretEditValue")}</button>
            </div>
          </div>
        ) : (
          <form className="llm-hub-db-secret-unlock" onSubmit={(event) => void unlock(event)}>
            <Eye size={20} />
            <label>{t("dashboard.secretPassword")}<input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {error && <p className="llm-hub-db-secret-error">{error}</p>}
            <button className="llm-hub-db-primary-btn" type="submit" disabled={!password || busy}>{t("dashboard.secretUnlock")}</button>
          </form>
        )}
      </div>
    </div>
  );
}
