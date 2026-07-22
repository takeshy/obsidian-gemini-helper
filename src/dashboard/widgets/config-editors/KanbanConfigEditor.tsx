import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { TFile } from "obsidian";
import { t } from "src/i18n";
import type { ConfigEditorProps } from "../../types";
import { kanbanDefinitionFromConfig, parseKanbanFile, serializeKanbanFile } from "../../kanbanFile";
import { FilePicker } from "./FilePicker";

interface KanbanColumn {
  value: string;
  label: string;
}

interface KanbanConfig {
  kanban?: string;
  title?: string;
  tag?: string;
  folder?: string;
  statusProperty?: string;
  titleProperty?: string;
  columns?: KanbanColumn[];
  showUnspecified?: boolean;
  displayFields?: Array<string | KanbanDisplayField>;
  cardOrder?: string[];
}

interface KanbanDisplayField {
  field: string;
  label?: string;
  maxLength?: number;
}

function normalizeDisplayFields(value: KanbanConfig["displayFields"]): KanbanDisplayField[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? { field: item, label: "" } : item);
}

const FILE_FIELD_NAMES = ["file.path", "file.name", "file.content", "file.mtime", "file.ctime"];

function normalizeTags(value: unknown): string[] {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

function fieldNamesFromVault(app: ConfigEditorProps["app"], folder: string, tag: string): string[] {
  const normalizedFolder = folder.trim().replace(/[/\\]+$/, "").toLocaleLowerCase();
  const folderPrefix = normalizedFolder ? `${normalizedFolder}/` : "";
  const normalizedTag = tag.trim().replace(/^#/, "").toLocaleLowerCase();
  const names = new Set<string>(FILE_FIELD_NAMES);
  for (const file of app.vault.getMarkdownFiles()) {
    if (folderPrefix && !file.path.toLocaleLowerCase().startsWith(folderPrefix)) continue;
    const cache = app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    if (!frontmatter || typeof frontmatter !== "object") continue;
    if (normalizedTag) {
      const tags = [
        ...(cache?.tags?.map((entry) => entry.tag) ?? []),
        ...normalizeTags(frontmatter.tags),
      ].map((value) => String(value).replace(/^#/, "").toLocaleLowerCase());
      if (!tags.includes(normalizedTag)) continue;
    }
    for (const name of Object.keys(frontmatter)) {
      if (name !== "position") names.add(name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function KanbanConfigEditor({ config, onChange, app }: ConfigEditorProps) {
  const rawCfg = (config ?? {}) as KanbanConfig;
  const [fileCfg, setFileCfg] = useState<KanbanConfig | null>(null);
  const [fileMissing, setFileMissing] = useState(false);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const kanbanPaths = useMemo(() => app.vault.getFiles()
    .filter((file) => file.extension.toLocaleLowerCase() === "kanban")
    .map((file) => file.path)
    .sort(), [app, rawCfg.kanban]);
  useEffect(() => {
    const path = rawCfg.kanban?.trim();
    if (!path) { setFileCfg(null); setFileMissing(false); return; }
    let cancelled = false;
    const load = async () => {
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        if (!cancelled) { setFileCfg(null); setFileMissing(true); }
        return;
      }
      const parsed = parseKanbanFile(await app.vault.cachedRead(file)) as KanbanConfig | null;
      if (!cancelled) { setFileCfg(parsed); setFileMissing(parsed === null); }
    };
    void load();
    const refs = [
      app.vault.on("modify", (file) => { if (file.path === path) void load(); }),
      app.vault.on("delete", (file) => { if (file.path === path) void load(); }),
      app.vault.on("rename", (file, oldPath) => { if (oldPath === path || file.path === path) void load(); }),
    ];
    return () => { cancelled = true; refs.forEach((ref) => app.vault.offref(ref)); };
  }, [app, rawCfg.kanban]);
  const cfg = fileCfg ?? rawCfg;
  const columns = Array.isArray(cfg.columns) ? cfg.columns : [];
  const displayFields = normalizeDisplayFields(cfg.displayFields);
  const showUnspecified = cfg.showUnspecified !== false;
  const fieldNames = useMemo(
    () => fieldNamesFromVault(app, cfg.folder ?? "", cfg.tag ?? ""),
    [app, cfg.folder, cfg.tag],
  );

  const update = (patch: Partial<KanbanConfig>) => {
    const next = { ...cfg, ...patch };
    if (rawCfg.kanban) {
      setFileCfg(next);
      const file = app.vault.getAbstractFileByPath(rawCfg.kanban);
      if (file instanceof TFile) {
        const content = serializeKanbanFile(kanbanDefinitionFromConfig(next));
        writeQueue.current = writeQueue.current
          // A previous write failure must not permanently poison the queue.
          .catch(() => undefined)
          .then(() => app.vault.modify(file, content))
          .catch((error: unknown) => {
            console.error("Kanban: failed to save board file", error);
          });
      }
    } else onChange(next);
  };

  const updateField = (index: number, patch: Partial<KanbanDisplayField>) => {
    update({ displayFields: displayFields.map((f, i) => (i === index ? { ...f, ...patch } : f)) });
  };
  const addField = () => {
    const used = new Set(displayFields.map((item) => item.field));
    const field = fieldNames.find((name) => !used.has(name));
    if (field) update({ displayFields: [...displayFields, { field, label: "" }] });
  };
  const removeField = (index: number) => update({ displayFields: displayFields.filter((_, i) => i !== index) });
  const moveField = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= displayFields.length) return;
    const next = [...displayFields];
    [next[index], next[target]] = [next[target], next[index]];
    update({ displayFields: next });
  };

  const updateColumn = (index: number, patch: Partial<KanbanColumn>) => {
    const next = columns.map((c, i) => (i === index ? { ...c, ...patch } : c));
    update({ columns: next });
  };

  const addColumn = () => {
    update({ columns: [...columns, { value: "", label: "" }] });
  };

  const removeColumn = (index: number) => {
    update({ columns: columns.filter((_, i) => i !== index) });
  };

  const moveColumn = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= columns.length) return;
    const next = [...columns];
    [next[index], next[target]] = [next[target], next[index]];
    update({ columns: next });
  };

  return (
    <div className="llm-hub-db-fields">
      <div className="llm-hub-db-field">
        <label>{t("dashboard.kanbanFile")}</label>
        <FilePicker
          value={rawCfg.kanban ?? ""}
          paths={kanbanPaths}
          onChange={(kanban) => onChange(kanban ? { kanban, cardOrder: rawCfg.cardOrder } : { cardOrder: rawCfg.cardOrder })}
          placeholder="Dashboards/Kanbans/Tasks.kanban"
        />
        <p className="llm-hub-db-hint">{t("dashboard.kanbanFileHint")}</p>
        {fileMissing && <p className="llm-hub-db-secret-error">{t("dashboard.kanbanFileError")}</p>}
      </div>
      <div className="llm-hub-db-field">
        <label>{t("dashboard.kanbanBoardTitle")}</label>
        <input
          type="text"
          value={cfg.title ?? ""}
          onChange={(e) => update({ title: e.target.value })}
          placeholder={t("dashboard.kanbanBoardTitlePlaceholder")}
        />
        <p className="llm-hub-db-hint">{t("dashboard.kanbanBoardTitleHint")}</p>
      </div>

      <div className="llm-hub-db-field">
        <label>{t("dashboard.kanbanTag")}</label>
        <input
          type="text"
          value={cfg.tag ?? ""}
          onChange={(e) => update({ tag: e.target.value })}
          placeholder="task"
        />
        <p className="llm-hub-db-hint">{t("dashboard.kanbanTagHint")}</p>
      </div>

      <div className="llm-hub-db-field">
        <label>{t("dashboard.kanbanFolder")}</label>
        <input
          type="text"
          value={cfg.folder ?? ""}
          onChange={(e) => update({ folder: e.target.value })}
          placeholder="Projects"
        />
        <p className="llm-hub-db-hint">{t("dashboard.kanbanFolderHint")}</p>
      </div>

      <div className="llm-hub-db-field">
        <label>{t("dashboard.kanbanStatusProperty")}</label>
        <select
          value={cfg.statusProperty ?? ""}
          onChange={(e) => update({ statusProperty: e.target.value })}
        >
          <option value="">status</option>
          {cfg.statusProperty && cfg.statusProperty !== "status" && !fieldNames.includes(cfg.statusProperty) && <option value={cfg.statusProperty}>{cfg.statusProperty}</option>}
          {fieldNames.filter((name) => !name.startsWith("file.")).map((name) => <option value={name} key={name}>{name}</option>)}
        </select>
        <p className="llm-hub-db-hint">{t("dashboard.kanbanStatusPropertyHint")}</p>
      </div>

      <div className="llm-hub-db-field">
        <label>{t("dashboard.kanbanTitleProperty")}</label>
        <select
          value={cfg.titleProperty ?? ""}
          onChange={(e) => update({ titleProperty: e.target.value })}
        >
          <option value="">{t("dashboard.kanbanFileNameTitle")}</option>
          {cfg.titleProperty && !fieldNames.includes(cfg.titleProperty) && <option value={cfg.titleProperty}>{cfg.titleProperty}</option>}
          {fieldNames.map((name) => <option value={name} key={name}>{name}</option>)}
        </select>
        <p className="llm-hub-db-hint">{t("dashboard.kanbanTitlePropertyHint")}</p>
      </div>

      <div className="llm-hub-db-field">
        <label>{t("dashboard.kanbanColumns")}</label>
        {columns.map((col, i) => (
          <div className="llm-hub-db-kanban-config-col" key={i}>
            <input
              type="text"
              value={col.value}
              onChange={(e) => updateColumn(i, { value: e.target.value })}
              placeholder={t("dashboard.kanbanColumnValue")}
            />
            <input
              type="text"
              value={col.label}
              onChange={(e) => updateColumn(i, { label: e.target.value })}
              placeholder={t("dashboard.kanbanColumnLabel")}
            />
            <button type="button" className="llm-hub-db-iconbtn" onClick={() => moveColumn(i, -1)} disabled={i === 0} title={t("dashboard.moveUp")}>
              <ChevronUp size={12} />
            </button>
            <button type="button" className="llm-hub-db-iconbtn" onClick={() => moveColumn(i, 1)} disabled={i === columns.length - 1} title={t("dashboard.moveDown")}>
              <ChevronDown size={12} />
            </button>
            <button type="button" className="llm-hub-db-iconbtn is-danger" onClick={() => removeColumn(i)} title={t("dashboard.deleteWidget")}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <button type="button" className="llm-hub-db-ai-btn" onClick={addColumn}>
          <Plus size={13} />
          {t("dashboard.kanbanAddColumn")}
        </button>
      </div>

      <div className="llm-hub-db-field">
        <label>{t("dashboard.kanbanDisplayFields")}</label>
        {displayFields.map((field, i) => (
          <div className="llm-hub-db-kanban-config-col" key={i}>
            <select
              value={field.field}
              onChange={(e) => updateField(i, {
                field: e.target.value,
                maxLength: e.target.value === "file.content" ? field.maxLength : undefined,
              })}
            >
              {field.field && !fieldNames.includes(field.field) && <option value={field.field}>{field.field}</option>}
              {fieldNames.map((name) => <option value={name} key={name}>{name}</option>)}
            </select>
            <input
              type="text"
              value={field.label ?? ""}
              onChange={(e) => updateField(i, { label: e.target.value })}
              placeholder={t("dashboard.kanbanDisplayLabel")}
            />
            {field.field === "file.content" && (
              <input
                type="number"
                min={1}
                value={field.maxLength ?? ""}
                onChange={(e) => updateField(i, { maxLength: e.target.value ? Math.max(1, Number(e.target.value) || 1) : undefined })}
                placeholder={t("dashboard.kanbanDisplayMaxLength")}
              />
            )}
            <button type="button" className="llm-hub-db-iconbtn" onClick={() => moveField(i, -1)} disabled={i === 0} title={t("dashboard.moveUp")}>
              <ChevronUp size={12} />
            </button>
            <button type="button" className="llm-hub-db-iconbtn" onClick={() => moveField(i, 1)} disabled={i === displayFields.length - 1} title={t("dashboard.moveDown")}>
              <ChevronDown size={12} />
            </button>
            <button type="button" className="llm-hub-db-iconbtn is-danger" onClick={() => removeField(i)} title={t("dashboard.deleteWidget")}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <button type="button" className="llm-hub-db-ai-btn" onClick={addField} disabled={fieldNames.every((name) => displayFields.some((field) => field.field === name))}>
          <Plus size={13} />
          {t("dashboard.kanbanAddDisplayField")}
        </button>
        <p className="llm-hub-db-hint">{t("dashboard.kanbanDisplayFieldsHint")}</p>
      </div>

      <div className="llm-hub-db-field">
        <label className="llm-hub-db-kanban-checkbox">
          <input
            type="checkbox"
            checked={showUnspecified}
            onChange={(e) => update({ showUnspecified: e.target.checked })}
          />
          {t("dashboard.kanbanShowUnspecified")}
        </label>
      </div>
    </div>
  );
}
