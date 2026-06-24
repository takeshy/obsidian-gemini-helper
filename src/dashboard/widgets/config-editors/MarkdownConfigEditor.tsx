import { useMemo } from "react";
import { t } from "src/i18n";
import type { ConfigEditorProps } from "../../types";
import { FilePicker } from "./FilePicker";

interface MarkdownConfig {
  path?: string;
}

/**
 * Markdown config editor — picks an existing vault markdown note via a
 * searchable (@-mention style) file picker. The widget renders it inline.
 */
export function MarkdownConfigEditor({ config, onChange, app }: ConfigEditorProps) {
  const cfg = (config ?? {}) as MarkdownConfig;
  const path = cfg.path ?? "";

  const files = useMemo(
    () =>
      app.vault
        .getMarkdownFiles()
        .map((f) => f.path)
        .sort((a, b) => a.localeCompare(b)),
    [app],
  );

  return (
    <div className="llm-hub-db-field">
      <label>{t("dashboard.markdownSelectFile")}</label>
      <FilePicker
        value={path}
        onChange={(next) => onChange({ ...cfg, path: next })}
        paths={files}
        placeholder={t("dashboard.markdownSelectFile")}
        searchPlaceholder={t("dashboard.searchPlaceholder")}
      />
    </div>
  );
}
