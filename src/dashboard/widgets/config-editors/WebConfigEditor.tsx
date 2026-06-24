import { Globe, ExternalLink } from "lucide-react";
import { t } from "src/i18n";
import type { ConfigEditorProps } from "../../types";

interface WebConfig {
  url?: string;
}

const isValidUrl = (value: string): boolean => {
  if (!value) return true;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

export function WebConfigEditor({ config, onChange }: ConfigEditorProps) {
  const cfg = (config ?? {}) as WebConfig;
  const url = cfg.url ?? "";
  const valid = isValidUrl(url);
  const showPreview = !!url && valid;

  return (
    <div className="llm-hub-db-fields">
      <div className="llm-hub-db-field">
        <label>{t("dashboard.url")}</label>
        <div className="llm-hub-db-input-icon">
          <Globe size={14} className="llm-hub-db-input-leadicon" />
          <input
            type="url"
            value={url}
            onChange={(e) => onChange({ ...cfg, url: e.target.value })}
            placeholder="https://example.com"
          />
        </div>
        {!valid && <p className="llm-hub-db-error">{t("dashboard.urlInvalid")}</p>}
        <p className="llm-hub-db-hint">{t("dashboard.webHint")}</p>
      </div>

      {showPreview && (
        <a
          className="llm-hub-db-web-open"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={13} />
          {t("dashboard.webOpenExternal")}
        </a>
      )}
    </div>
  );
}
