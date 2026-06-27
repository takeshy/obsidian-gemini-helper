import { ExternalLink } from "lucide-react";
import { t } from "src/i18n";
import type { WidgetContext } from "../types";

interface WebConfig {
  url?: string;
  showHeader?: boolean;
}

export default function WebWidget({
  config,
}: {
  config: unknown;
  ctx?: WidgetContext;
}) {
  const cfg = (config ?? {}) as WebConfig;
  const href = typeof cfg.url === "string" ? cfg.url : "";
  const showHeader = cfg.showHeader !== false;

  if (!href) {
    return <div className="llm-hub-db-widget-empty">{t("dashboard.noUrl")}</div>;
  }

  return (
    <div className="llm-hub-db-web-wrap">
      {showHeader && (
        <div className="llm-hub-db-web-header">
          <span className="llm-hub-db-web-url">{href}</span>
          <a
            className="llm-hub-db-iconbtn"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={t("dashboard.webOpenExternal")}
            aria-label={t("dashboard.webOpenExternal")}
          >
            <ExternalLink size={13} />
          </a>
        </div>
      )}
      <iframe
        className="llm-hub-db-web"
        src={href}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    </div>
  );
}
