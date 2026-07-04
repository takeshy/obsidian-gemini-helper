import { useMemo } from "react";
import { t } from "src/i18n";
import type { ConfigEditorProps } from "../../types";
import { FilePicker } from "./FilePicker";

interface FileConfig {
  path?: string;
  showHeader?: boolean;
}

export const SUPPORTED_FILE_EXTENSIONS = new Set([
  "md",
  "markdown",
  "txt",
  "json",
  "csv",
  "tsv",
  "js",
  "ts",
  "tsx",
  "jsx",
  "css",
  "html",
  "xml",
  "yaml",
  "yml",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "pdf",
  "epub",
]);

export function FileConfigEditor({ config, onChange, app }: ConfigEditorProps) {
  const cfg = (config ?? {}) as FileConfig;
  const path = cfg.path ?? "";
  const showHeader = cfg.showHeader !== false;

  const files = useMemo(
    () =>
      app.vault
        .getFiles()
        .filter((file) => SUPPORTED_FILE_EXTENSIONS.has(file.extension.toLowerCase()))
        .map((file) => file.path)
        .sort((a, b) => a.localeCompare(b)),
    [app],
  );

  return (
    <div className="llm-hub-db-fields">
      <div className="llm-hub-db-field">
        <label>{t("dashboard.fileSelectFile")}</label>
        <FilePicker
          value={path}
          onChange={(next) => onChange({ ...cfg, path: next })}
          paths={files}
          placeholder={t("dashboard.fileSelectFile")}
          searchPlaceholder={t("dashboard.searchPlaceholder")}
        />
      </div>
      <label className="llm-hub-db-checkrow">
        <input
          type="checkbox"
          checked={showHeader}
          onChange={(e) => onChange({ ...cfg, showHeader: e.currentTarget.checked })}
        />
        <span>{t("dashboard.showHeader")}</span>
      </label>
    </div>
  );
}
