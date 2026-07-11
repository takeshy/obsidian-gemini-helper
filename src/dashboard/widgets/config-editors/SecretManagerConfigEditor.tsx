import { t } from "src/i18n";
import type { ConfigEditorProps } from "../../types";
import type { SecretManagerConfig } from "../../secretManager";

export function SecretManagerConfigEditor({ config, onChange }: ConfigEditorProps) {
  const cfg = (config ?? {}) as SecretManagerConfig;
  return (
    <div className="llm-hub-db-fields">
      <div className="llm-hub-db-field">
        <label>{t("dashboard.secretFolder")}</label>
        <input type="text" value={cfg.folder ?? ""} onChange={(event) => onChange({ ...cfg, folder: event.target.value })} placeholder="Secrets" />
        <p className="llm-hub-db-hint">{t("dashboard.secretFolderHint")}</p>
      </div>
    </div>
  );
}
