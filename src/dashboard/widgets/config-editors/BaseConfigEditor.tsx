import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Notice, TFile, parseYaml, stringifyYaml } from "obsidian";
import { t } from "src/i18n";
import type { ConfigEditorProps } from "../../types";
import { BASES_FOLDER } from "../../types";
import { ensureVaultFolder } from "../../dashboardFile";
import { AIBaseModal } from "../../AIBaseModal";
import { FilePicker } from "./FilePicker";

interface BaseConfig {
  base?: string;
  view?: string;
}

type EditableBaseView = Record<string, unknown> & {
  type: string;
  name: string;
  order?: string[];
  sort?: Array<{ property: string; direction: "ASC" | "DESC" }>;
  limit?: number;
  filters?: unknown;
};

type EditableBaseConfig = Record<string, unknown> & {
  views: EditableBaseView[];
  formulas?: Record<string, string>;
};

const DEFAULT_BASE_YAML = `views:
  - type: table
    name: Table
    order:
      - file.name
      - file.mtime
    sort:
      - property: file.mtime
        direction: DESC
    limit: 50
`;

const FILE_FIELDS = ["file.name", "file.path", "file.folder", "file.ext", "file.ctime", "file.mtime", "file.tags", "file.links"];

function sanitizeBaseName(name: string): string {
  return (name || "New Base")
    .replace(/\.base$/i, "")
    .replace(/[\\/:*?"<>|#[\]\n\r\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "New Base";
}

function normalizeView(view: Record<string, unknown>, fallbackIndex: number): EditableBaseView {
  const type = view.type === "cards" || view.type === "list" || view.type === "table" ? view.type : "table";
  const name = typeof view.name === "string" && view.name.trim() ? view.name : `View ${fallbackIndex + 1}`;
  const order = Array.isArray(view.order)
    ? view.order.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    : undefined;
  const sort = Array.isArray(view.sort)
    ? view.sort
        .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && !Array.isArray(s))
        .map((s) => ({
          property: typeof s.property === "string" ? s.property : "",
          direction: s.direction === "ASC" ? "ASC" as const : "DESC" as const,
        }))
        .filter((s) => s.property.length > 0)
    : undefined;
  const limit = typeof view.limit === "number" && Number.isFinite(view.limit) && view.limit > 0 ? view.limit : undefined;
  return cleanView({ ...view, type, name, order, sort, limit });
}

function cleanView(view: EditableBaseView): EditableBaseView {
  const next: EditableBaseView = { ...view };
  if (!next.order || next.order.length === 0) delete next.order;
  if (!next.sort || next.sort.length === 0) delete next.sort;
  if (!next.limit || next.limit < 1) delete next.limit;
  if (next.filters == null || next.filters === "") delete next.filters;
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) delete next[key];
  }
  return next;
}

function parseEditableBase(content: string): EditableBaseConfig {
  const loaded = parseYaml(content) as unknown;
  const obj = loaded && typeof loaded === "object" && !Array.isArray(loaded)
    ? loaded as Record<string, unknown>
    : {};
  const parsedViews = Array.isArray(obj.views)
    ? obj.views
        .filter((v): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v))
        .map(normalizeView)
    : [];
  const seenNames: EditableBaseView[] = [];
  const views = parsedViews.map((view) => {
    const name = uniqueViewName(view.name, seenNames);
    const next = { ...view, name };
    seenNames.push(next);
    return next;
  });
  return { ...obj, views: views.length > 0 ? views : [{ type: "table", name: "Table" }] };
}

function dumpEditableBase(config: EditableBaseConfig): string {
  return stringifyYaml(config).trimEnd() + "\n";
}

function parseFilterInput(value: string): unknown {
  const raw = value.trim();
  if (!raw) return undefined;
  try {
    return parseYaml(raw) as unknown;
  } catch {
    return raw;
  }
}

function filterInputValue(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value;
  return stringifyYaml(value).trimEnd();
}

function defaultFieldLabel(field: string): string {
  const dot = field.indexOf(".");
  return dot >= 0 ? field.slice(dot + 1) : field;
}

function uniqueViewName(baseName: string, views: EditableBaseView[], currentIndex?: number): string {
  const fallback = baseName.trim() || "View";
  const used = new Set(
    views
      .map((view, index) => currentIndex === index ? "" : view.name)
      .filter(Boolean),
  );
  if (!used.has(fallback)) return fallback;
  let i = 2;
  let next = `${fallback} ${i}`;
  while (used.has(next)) next = `${fallback} ${++i}`;
  return next;
}

function uniquePath(existingPaths: string[], desiredName: string): string {
  const base = sanitizeBaseName(desiredName);
  const used = new Set(existingPaths);
  let path = `${BASES_FOLDER}/${base}.base`;
  let i = 2;
  while (used.has(path)) {
    path = `${BASES_FOLDER}/${base} ${i}.base`;
    i += 1;
  }
  return path;
}

function fileFieldsFromVault(app: ConfigEditorProps["app"]): string[] {
  const seen = new Set<string>(FILE_FIELDS);
  for (const file of app.vault.getMarkdownFiles()) {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm && typeof fm === "object") {
      for (const key of Object.keys(fm)) {
        if (key === "position") continue;
        seen.add(`note.${key}`);
      }
    }
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

export function BaseConfigEditor({ config, onChange, app, plugin }: ConfigEditorProps) {
  const cfg = (config ?? {}) as BaseConfig;
  const [baseFiles, setBaseFiles] = useState<string[]>([]);
  const [baseContent, setBaseContent] = useState("");
  const [baseConfig, setBaseConfig] = useState<EditableBaseConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const savingRef = useRef(false);
  const pendingSaveRef = useRef<{ content: string; file: TFile } | null>(null);
  const suppressExternalContentRef = useRef<string | null>(null);

  const refreshBaseFiles = () => {
    setBaseFiles(
      app.vault
        .getFiles()
        .filter((f) => f.extension === "base")
        .map((f) => f.path)
        .sort((a, b) => a.localeCompare(b)),
    );
  };

  useEffect(() => {
    refreshBaseFiles();
  }, [app]);

  const loadSelectedBase = (cancelledRef?: { current: boolean }, options?: { external?: boolean }) => {
    const file = cfg.base ? app.vault.getAbstractFileByPath(cfg.base) : null;
    if (!(file instanceof TFile)) {
      setBaseContent("");
      setBaseConfig(null);
      setLoadError(cfg.base ? t("dashboard.fileNotFound") : null);
      return;
    }
    void app.vault.read(file).then((content) => {
      if (cancelledRef?.current) return;
      if (options?.external && suppressExternalContentRef.current === content) {
        suppressExternalContentRef.current = null;
        return;
      }
      try {
        const parsed = parseEditableBase(content);
        setBaseContent(content);
        setBaseConfig(parsed);
        setLoadError(null);
        const firstView = parsed.views[0]?.name ?? "";
        if (firstView && (!cfg.view || !parsed.views.some((v) => v.name === cfg.view))) {
          onChange({ ...cfg, view: firstView });
        }
      } catch (err) {
        setBaseContent(content);
        setBaseConfig(null);
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  useEffect(() => {
    const cancelled = { current: false };
    loadSelectedBase(cancelled);
    return () => {
      cancelled.current = true;
    };
  }, [app, cfg.base]);

  useEffect(() => {
    if (!cfg.base) return;
    const ref = app.vault.on("modify", (file) => {
      if (file.path === cfg.base) loadSelectedBase(undefined, { external: true });
    });
    return () => app.vault.offref(ref);
  }, [app, cfg.base, cfg.view]);

  const writeLatestSave = async (file: TFile, content: string) => {
    savingRef.current = true;
    setSaving(true);
    suppressExternalContentRef.current = content;
    try {
      await app.vault.modify(file, content);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      const pending = pendingSaveRef.current;
      pendingSaveRef.current = null;
      if (pending) {
        await writeLatestSave(pending.file, pending.content);
      } else {
        savingRef.current = false;
        setSaving(false);
      }
    }
  };

  const fieldNames = useMemo(() => {
    const fields = fileFieldsFromVault(app);
    for (const formula of Object.keys(baseConfig?.formulas ?? {})) {
      fields.push(`formula.${formula}`);
    }
    return Array.from(new Set(fields)).sort((a, b) => a.localeCompare(b));
  }, [app, baseConfig]);

  const activeViewName = cfg.view || baseConfig?.views[0]?.name || "";
  const activeViewIndex = baseConfig?.views.findIndex((v) => v.name === activeViewName) ?? -1;
  const activeView = baseConfig && activeViewIndex >= 0 ? baseConfig.views[activeViewIndex] : baseConfig?.views[0] ?? null;

  const saveBaseConfig = async (next: EditableBaseConfig, nextViewName?: string) => {
    if (!cfg.base) return;
    const file = app.vault.getAbstractFileByPath(cfg.base);
    if (!(file instanceof TFile)) return;
    const nextContent = dumpEditableBase(next);
    setBaseConfig(next);
    setBaseContent(nextContent);
    if (nextViewName !== undefined) onChange({ ...cfg, view: nextViewName });
    if (savingRef.current) {
      pendingSaveRef.current = { file, content: nextContent };
      return;
    }
    await writeLatestSave(file, nextContent);
  };

  const updateActiveView = (patch: Partial<EditableBaseView>, nextViewName?: string) => {
    if (!baseConfig || !activeView) return;
    const nextViews = [...baseConfig.views];
    const index = activeViewIndex >= 0 ? activeViewIndex : 0;
    const patched = { ...activeView, ...patch };
    if (typeof patch.name === "string") {
      patched.name = uniqueViewName(patch.name, nextViews, index);
      nextViewName = patched.name;
    }
    nextViews[index] = cleanView(patched);
    void saveBaseConfig({ ...baseConfig, views: nextViews }, nextViewName);
  };

  const createNewBase = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await ensureVaultFolder(app.vault, BASES_FOLDER);
      const path = uniquePath(baseFiles, newName);
      await app.vault.create(path, DEFAULT_BASE_YAML);
      refreshBaseFiles();
      onChange({ ...cfg, base: path, view: "Table" });
      setNewName("");
      new Notice(t("dashboard.baseCreated"));
    } catch (err) {
      new Notice(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const openAi = (mode: "create" | "modify") => {
    new AIBaseModal(app, plugin, {
      mode,
      basePath: mode === "modify" ? cfg.base : undefined,
      onComplete: (path) => {
        refreshBaseFiles();
        onChange({ ...cfg, base: path, view: "" });
      },
    }).open();
  };

  if (!cfg.base) {
    return (
      <div className="llm-hub-db-fields">
        <div className="llm-hub-db-field">
          <label>{t("dashboard.baseCreateNew")}</label>
          <div className="llm-hub-db-base-create-row">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void createNewBase();
                }
              }}
              placeholder="New Base"
            />
            <button type="button" className="llm-hub-db-ai-btn" onClick={() => void createNewBase()} disabled={creating}>
              <Plus size={13} />
              {t("dashboard.baseCreate")}
            </button>
          </div>
        </div>

        <div className="llm-hub-db-field">
          <label>{t("dashboard.baseImportExisting")}</label>
          <FilePicker
            value=""
            onChange={(path) => onChange({ ...cfg, base: path, view: "" })}
            paths={baseFiles}
            placeholder={t("dashboard.baseSelectFile")}
            searchPlaceholder={t("dashboard.searchPlaceholder")}
          />
        </div>

        <div className="llm-hub-db-ai-actions">
          <button type="button" className="llm-hub-db-ai-btn" onClick={() => openAi("create")}>
            <Sparkles size={13} />
            {t("dashboard.aiBaseCreate")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="llm-hub-db-fields">
      <div className="llm-hub-db-base-editor-head">
        <div className="llm-hub-db-base-file-label">
          <FileText size={14} />
          <span>{cfg.base}</span>
        </div>
        <span className="llm-hub-db-base-save-state">{saving ? t("dashboard.saving") : t("dashboard.saved")}</span>
      </div>

      <div className="llm-hub-db-ai-actions">
        <button type="button" className="llm-hub-db-ai-btn" onClick={() => openAi("modify")}>
          <Sparkles size={13} />
          {t("dashboard.aiBaseEdit")}
        </button>
        <button type="button" className="llm-hub-db-ai-btn" onClick={() => onChange({ ...cfg, base: "", view: "" })}>
          <Pencil size={13} />
          {t("dashboard.baseChangeFile")}
        </button>
      </div>

      {loadError && <p className="llm-hub-db-error">{loadError}</p>}

      {baseConfig && activeView ? (
        <ManualBaseEditor
          baseConfig={baseConfig}
          activeView={activeView}
          baseContent={baseContent}
          fieldNames={fieldNames}
          activeViewName={activeViewName}
          onViewSelect={(viewName) => onChange({ ...cfg, view: viewName })}
          onUpdateView={updateActiveView}
          onSaveConfig={(next, nextViewName) => void saveBaseConfig(next, nextViewName)}
          onRawChange={(content) => {
            setBaseContent(content);
            try {
              const parsed = parseEditableBase(content);
              void saveBaseConfig(parsed, parsed.views[0]?.name ?? "");
              setLoadError(null);
            } catch (err) {
              setLoadError(err instanceof Error ? err.message : String(err));
            }
          }}
        />
      ) : (
        !loadError && <div className="llm-hub-db-empty-hint">{t("dashboard.baseNoViews")}</div>
      )}
    </div>
  );
}

function ManualBaseEditor({
  baseConfig,
  activeView,
  baseContent,
  fieldNames,
  activeViewName,
  onViewSelect,
  onUpdateView,
  onSaveConfig,
  onRawChange,
}: {
  baseConfig: EditableBaseConfig;
  activeView: EditableBaseView;
  baseContent: string;
  fieldNames: string[];
  activeViewName: string;
  onViewSelect: (viewName: string) => void;
  onUpdateView: (patch: Partial<EditableBaseView>, nextViewName?: string) => void;
  onSaveConfig: (next: EditableBaseConfig, nextViewName?: string) => void;
  onRawChange: (content: string) => void;
}) {
  const order = activeView.order ?? [];
  const availableFields = fieldNames.filter((field) => !order.includes(field));
  const sort = activeView.sort?.[0];
  const filterText = filterInputValue(activeView.filters);
  const viewType = activeView.type === "cards" || activeView.type === "list" ? activeView.type : "table";

  const addView = () => {
    let index = baseConfig.views.length + 1;
    let name = `View ${index}`;
    const names = new Set(baseConfig.views.map((v) => v.name));
    while (names.has(name)) name = `View ${++index}`;
    const nextView: EditableBaseView = { type: "table", name };
    onSaveConfig({ ...baseConfig, views: [...baseConfig.views, nextView] }, name);
  };

  const deleteView = () => {
    if (baseConfig.views.length <= 1) return;
    const nextViews = baseConfig.views.filter((v) => v !== activeView);
    onSaveConfig({ ...baseConfig, views: nextViews }, nextViews[0]?.name ?? "");
  };

  const moveField = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    onUpdateView({ order: next });
  };

  return (
    <>
      <div className="llm-hub-db-field">
        <label>{t("dashboard.baseView")}</label>
        <div className="llm-hub-db-base-view-row">
          <select value={activeViewName} onChange={(e) => onViewSelect(e.target.value)}>
            {baseConfig.views.map((view) => (
              <option key={view.name} value={view.name}>{view.name}</option>
            ))}
          </select>
          <button type="button" className="llm-hub-db-iconbtn" onClick={addView} title={t("dashboard.baseAddView")}>
            <Plus size={13} />
          </button>
          <button
            type="button"
            className="llm-hub-db-iconbtn is-danger"
            onClick={deleteView}
            disabled={baseConfig.views.length <= 1}
            title={t("dashboard.baseDeleteView")}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="llm-hub-db-field">
        <label>{t("dashboard.baseViewName")}</label>
        <input
          type="text"
          value={activeView.name}
          onChange={(e) => onUpdateView({ name: e.target.value || "View" }, e.target.value || "View")}
        />
      </div>

      <div className="llm-hub-db-field">
        <label>{t("dashboard.baseViewType")}</label>
        <select value={viewType} onChange={(e) => onUpdateView({ type: e.target.value })}>
          <option value="table">Table</option>
          <option value="cards">Cards</option>
          <option value="list">List</option>
        </select>
      </div>

      <div className="llm-hub-db-field">
        <label>{viewType === "table" ? t("dashboard.baseColumns") : t("dashboard.baseProperties")}</label>
        {order.length === 0 && <p className="llm-hub-db-hint">{t("dashboard.baseFieldsAuto")}</p>}
        {order.map((field, index) => (
          <div className="llm-hub-db-base-field-row" key={field}>
            <span title={field}>{field}</span>
            <button type="button" className="llm-hub-db-iconbtn" onClick={() => moveField(index, -1)} disabled={index === 0} title={t("dashboard.moveUp")}>↑</button>
            <button type="button" className="llm-hub-db-iconbtn" onClick={() => moveField(index, 1)} disabled={index === order.length - 1} title={t("dashboard.moveDown")}>↓</button>
            <button type="button" className="llm-hub-db-iconbtn is-danger" onClick={() => onUpdateView({ order: order.filter((_, i) => i !== index) })} title={t("dashboard.remove")}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onUpdateView({ order: [...order, e.target.value] });
          }}
          disabled={availableFields.length === 0}
        >
          <option value="">{t("dashboard.baseAddField")}</option>
          {availableFields.map((field) => (
            <option key={field} value={field}>{defaultFieldLabel(field)} ({field})</option>
          ))}
        </select>
      </div>

      {viewType === "cards" && (
        <div className="llm-hub-db-field">
          <label>{t("dashboard.baseCardImage")}</label>
          <select
            value={typeof activeView.image === "string" ? activeView.image : ""}
            onChange={(e) => onUpdateView({ image: e.target.value || undefined })}
          >
            <option value="">{t("dashboard.baseImageNone")}</option>
            {fieldNames.map((field) => <option key={field} value={field}>{field}</option>)}
          </select>
        </div>
      )}

      {viewType === "list" && (
        <label className="llm-hub-db-kanban-checkbox">
          <input
            type="checkbox"
            checked={activeView.indentProperties === true}
            onChange={(e) => onUpdateView({ indentProperties: e.target.checked ? true : undefined })}
          />
          {t("dashboard.baseListIndent")}
        </label>
      )}

      <div className="llm-hub-db-field">
        <label>{t("dashboard.baseSort")}</label>
        <div className="llm-hub-db-base-sort-row">
          <select
            value={sort?.property ?? ""}
            onChange={(e) => onUpdateView({ sort: e.target.value ? [{ property: e.target.value, direction: sort?.direction ?? "ASC" }] : undefined })}
          >
            <option value="">{t("dashboard.baseNoSort")}</option>
            {fieldNames.map((field) => <option key={field} value={field}>{field}</option>)}
          </select>
          <select
            value={sort?.direction ?? "ASC"}
            disabled={!sort?.property}
            onChange={(e) => onUpdateView({ sort: sort?.property ? [{ property: sort.property, direction: e.target.value === "DESC" ? "DESC" : "ASC" }] : undefined })}
          >
            <option value="ASC">{t("dashboard.baseSortAsc")}</option>
            <option value="DESC">{t("dashboard.baseSortDesc")}</option>
          </select>
        </div>
      </div>

      <div className="llm-hub-db-field">
        <label>{t("dashboard.baseLimit")}</label>
        <input
          type="number"
          min={1}
          value={activeView.limit ?? ""}
          onChange={(e) => {
            const value = Number(e.target.value);
            onUpdateView({ limit: Number.isFinite(value) && value > 0 ? value : undefined });
          }}
          placeholder="50"
        />
      </div>

      <div className="llm-hub-db-field">
        <label>{t("dashboard.baseFilters")}</label>
        <textarea
          value={filterText}
          onChange={(e) => onUpdateView({ filters: parseFilterInput(e.target.value) })}
          rows={4}
          placeholder='file.inFolder("Projects")'
        />
        <p className="llm-hub-db-hint">{t("dashboard.baseFiltersHint")}</p>
      </div>

      <details className="llm-hub-db-base-raw">
        <summary>{t("dashboard.baseRawYaml")}</summary>
        <textarea value={baseContent} onChange={(e) => onRawChange(e.target.value)} rows={8} />
      </details>
    </>
  );
}
