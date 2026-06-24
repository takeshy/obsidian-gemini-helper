import { Puzzle } from "lucide-react";
import { t } from "src/i18n";
import type { WidgetContext } from "../types";

/**
 * Placeholder for unknown / unregistered widget types. The widget's data (type,
 * config, unknown keys) is preserved in the `.dashboard` YAML — only the
 * rendering falls back.
 */
export default function UnknownWidget({
  type,
}: {
  type: string;
  config?: unknown;
  ctx?: WidgetContext;
}) {
  return (
    <div className="llm-hub-db-widget-empty">
      <Puzzle size={24} />
      <span>{t("dashboard.unsupportedWidget")}: {type}</span>
    </div>
  );
}
