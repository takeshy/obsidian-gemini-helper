import { useEffect, useMemo, useState } from "react";
import { TFile, parseYaml } from "obsidian";
import { Sparkles, Pencil } from "lucide-react";
import { t } from "src/i18n";
import type { ConfigEditorProps } from "../../types";
import { FilePicker } from "./FilePicker";
import { AIBaseModal } from "../../AIBaseModal";

interface BaseConfig {
  base?: string;
  view?: string;
}

/**
 * Base config editor — pick a `.base` file and one of its views, or author the
 * `.base` with AI (create new / edit the selected one). View names are
 * discovered by reading and parsing the selected `.base` file's `views[].name`.
 */
export function BaseConfigEditor({ config, onChange, app, plugin }: ConfigEditorProps) {
  const cfg = (config ?? {}) as BaseConfig;
  const base = cfg.base ?? "";
  const view = cfg.view ?? "";

  const baseFiles = useMemo(
    () =>
      app.vault
        .getFiles()
        .filter((f) => f.extension === "base")
        .map((f) => f.path)
        .sort((a, b) => a.localeCompare(b)),
    [app],
  );

  const [views, setViews] = useState<string[]>([]);

  // Load view names from the selected base file.
  useEffect(() => {
    let cancelled = false;
    const file = base ? app.vault.getAbstractFileByPath(base) : null;
    if (!(file instanceof TFile)) {
      setViews([]);
      return;
    }
    void app.vault.read(file).then((content) => {
      if (cancelled) return;
      try {
        const parsed = parseYaml(content) as { views?: Array<{ name?: string }> } | null;
        const viewList = Array.isArray(parsed?.views) ? parsed.views : [];
        const names = viewList
          .map((v) => v?.name)
          .filter((n): n is string => typeof n === "string");
        setViews(names);
      } catch {
        setViews([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [app, base]);

  const openAi = (mode: "create" | "modify") => {
    new AIBaseModal(app, plugin, {
      mode,
      basePath: mode === "modify" ? base : undefined,
      onComplete: (path) => onChange({ ...cfg, base: path, view: "" }),
    }).open();
  };

  return (
    <div className="llm-hub-db-fields">
      <div className="llm-hub-db-field">
        <label>{t("dashboard.baseFile")}</label>
        <FilePicker
          value={base}
          onChange={(path) => onChange({ ...cfg, base: path, view: "" })}
          paths={baseFiles}
          placeholder={t("dashboard.baseSelectFile")}
          searchPlaceholder={t("dashboard.searchPlaceholder")}
        />
        <div className="llm-hub-db-ai-actions">
          <button type="button" className="llm-hub-db-ai-btn" onClick={() => openAi("create")}>
            <Sparkles size={13} />
            {t("dashboard.aiBaseCreate")}
          </button>
          {base && (
            <button type="button" className="llm-hub-db-ai-btn" onClick={() => openAi("modify")}>
              <Pencil size={13} />
              {t("dashboard.aiBaseEdit")}
            </button>
          )}
        </div>
      </div>

      <div className="llm-hub-db-field">
        <label>{t("dashboard.baseView")}</label>
        {views.length > 0 ? (
          <select value={view} onChange={(e) => onChange({ ...cfg, view: e.target.value })}>
            <option value="">{t("dashboard.baseFirstView")}</option>
            {view && !views.includes(view) && <option value={view}>{view}</option>}
            {views.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={view}
            onChange={(e) => onChange({ ...cfg, view: e.target.value })}
            placeholder={t("dashboard.baseFirstView")}
          />
        )}
      </div>
    </div>
  );
}
