import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { t } from "src/i18n";
import type { ConfigEditorProps } from "../../types";

interface KanbanColumn {
  value: string;
  label: string;
}

interface KanbanConfig {
  title?: string;
  tag?: string;
  folder?: string;
  statusProperty?: string;
  titleProperty?: string;
  columns?: KanbanColumn[];
  showUnspecified?: boolean;
}

export function KanbanConfigEditor({ config, onChange }: ConfigEditorProps) {
  const cfg = (config ?? {}) as KanbanConfig;
  const columns = Array.isArray(cfg.columns) ? cfg.columns : [];
  const showUnspecified = cfg.showUnspecified !== false;

  const update = (patch: Partial<KanbanConfig>) => onChange({ ...cfg, ...patch });

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
        <input
          type="text"
          value={cfg.statusProperty ?? ""}
          onChange={(e) => update({ statusProperty: e.target.value })}
          placeholder="status"
        />
        <p className="llm-hub-db-hint">{t("dashboard.kanbanStatusPropertyHint")}</p>
      </div>

      <div className="llm-hub-db-field">
        <label>{t("dashboard.kanbanTitleProperty")}</label>
        <input
          type="text"
          value={cfg.titleProperty ?? ""}
          onChange={(e) => update({ titleProperty: e.target.value })}
          placeholder="title"
        />
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
