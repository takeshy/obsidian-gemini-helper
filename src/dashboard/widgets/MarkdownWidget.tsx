// Markdown widget — references an existing vault markdown note and renders it
// inline as an Obsidian embed (read-only). A header shows the note's full path
// and an open icon that navigates to the note in a new tab.

import { ExternalLink } from "lucide-react";
import { TFile } from "obsidian";
import { t } from "src/i18n";
import type { WidgetContext } from "../types";
import ObsidianMarkdown from "./ObsidianMarkdown";

interface MarkdownConfig {
  /** Vault path of the referenced markdown note. */
  path?: string;
}

export default function MarkdownWidget({
  config,
  ctx,
}: {
  config: unknown;
  ctx?: WidgetContext;
}) {
  const cfg = (config ?? {}) as MarkdownConfig;
  const path = (cfg.path ?? "").trim();

  if (!ctx) return null;

  if (!path) {
    return <div className="llm-hub-db-widget-empty">{t("dashboard.markdownSelectFile")}</div>;
  }

  const file = ctx.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) {
    return <div className="llm-hub-db-widget-empty">{t("dashboard.fileNotFound")}: {path}</div>;
  }

  const linktext = ctx.app.metadataCache.fileToLinktext(file, ctx.sourcePath);
  const embed = `![[${linktext}]]`;

  return (
    <div className="llm-hub-db-markdown-wrap">
      <div className="llm-hub-db-markdown-header">
        <span className="llm-hub-db-markdown-path" title={path}>
          {path}
        </span>
        <button
          type="button"
          className="llm-hub-db-markdown-open"
          aria-label={t("dashboard.kanbanOpenNote")}
          title={t("dashboard.kanbanOpenNote")}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            void ctx.app.workspace.getLeaf(true).openFile(file);
          }}
        >
          <ExternalLink size={14} />
        </button>
      </div>
      <ObsidianMarkdown
        app={ctx.app}
        markdown={embed}
        sourcePath={ctx.sourcePath}
        className="llm-hub-db-markdown"
      />
    </div>
  );
}
