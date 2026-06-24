import { t } from "src/i18n";
import type { WidgetContext } from "../types";

export default function WebWidget({
  config,
}: {
  config: unknown;
  ctx?: WidgetContext;
}) {
  const url = (config as Record<string, unknown>)?.url;
  const href = typeof url === "string" ? url : "";

  if (!href) {
    return <div className="llm-hub-db-widget-empty">{t("dashboard.noUrl")}</div>;
  }

  return (
    <iframe
      className="llm-hub-db-web"
      src={href}
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
    />
  );
}
