import { t } from "src/i18n";
import type { ConfigEditorProps } from "../../types";

interface TimelineConfig {
  name?: string;
  latestCount?: number;
}

function sanitizeName(value: string): string {
  return value
    .trim()
    .replace(/\.md$/i, "")
    .replace(/[\\/:*?"<>|#[\]\n\r\t]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function TimelineConfigEditor({ config, onChange }: ConfigEditorProps) {
  const cfg = (config ?? {}) as TimelineConfig;
  const update = (patch: Partial<TimelineConfig>) => onChange({ ...cfg, ...patch });

  return (
    <div className="llm-hub-db-fields">
      <div className="llm-hub-db-field">
        <label>{t("dashboard.timelineName")}</label>
        <input
          type="text"
          value={cfg.name ?? ""}
          onChange={(e) => update({ name: sanitizeName(e.target.value) })}
          placeholder="Timeline"
        />
        <p className="llm-hub-db-hint">{t("dashboard.timelineStorageHint")}</p>
      </div>

      <div className="llm-hub-db-field">
        <label>{t("dashboard.timelineLatestCount")}</label>
        <input
          type="number"
          min={1}
          max={200}
          value={cfg.latestCount ?? 20}
          onChange={(e) => {
            const value = Number(e.target.value);
            update({ latestCount: Number.isFinite(value) && value > 0 ? value : 20 });
          }}
        />
      </div>

    </div>
  );
}
