import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, Loader2, Search } from "lucide-react";
import { t } from "src/i18n";
import type { WidgetContext } from "../types";
import { listMemoFiles } from "../memo";
import FileWidget from "./FileWidget";

const PAGE_SIZE = 20;

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

export default function MemoListWidget({ ctx }: { ctx?: WidgetContext }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listMemoFiles>> | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [detailConfig, setDetailConfig] = useState<Record<string, unknown> | null>(null);

  const refresh = useCallback(() => {
    if (!ctx) return;
    void listMemoFiles(ctx.app).then(setRows);
  }, [ctx]);

  useEffect(() => {
    refresh();
    if (!ctx) return;
    const onChange = () => refresh();
    ctx.app.vault.on("modify", onChange);
    ctx.app.vault.on("create", onChange);
    ctx.app.vault.on("delete", onChange);
    return () => {
      ctx.app.vault.off("modify", onChange);
      ctx.app.vault.off("create", onChange);
      ctx.app.vault.off("delete", onChange);
    };
  }, [ctx, refresh]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((row) => {
      const source = row.source.toLowerCase();
      return !q || source.includes(q) || baseName(source).toLowerCase().includes(q);
    });
  }, [rows, query]);

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = items.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  if (!ctx) return null;

  if (selectedSource) {
    const config = detailConfig ?? {
      path: selectedSource,
      showHeader: true,
      memoPanelOpen: true,
      memoPanelCollapsed: false,
    };
    return (
      <FileWidget
        config={config}
        ctx={{
          ...ctx,
          onConfigChange: (next) => setDetailConfig(next as Record<string, unknown>),
        }}
      />
    );
  }

  return (
    <div className="llm-hub-db-memolist">
      <div className="llm-hub-db-memolist-search">
        <Search size={13} />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder={t("memoList.filterPlaceholder")}
        />
      </div>
      <div className="llm-hub-db-memolist-body">
        {rows === null ? (
          <div className="llm-hub-db-widget-empty"><Loader2 size={16} /></div>
        ) : pageItems.length === 0 ? (
          <div className="llm-hub-db-widget-empty">{t("memoList.empty")}</div>
        ) : (
          pageItems.map((row) => {
            const latest = row.memos[row.memos.length - 1];
            return (
              <button
                key={row.file.path}
                type="button"
                className="llm-hub-db-memolist-row"
                title={row.source}
                onClick={() => {
                  setSelectedSource(row.source);
                  setDetailConfig({
                    path: row.source,
                    showHeader: true,
                    memoPanelOpen: true,
                    memoPanelCollapsed: false,
                  });
                  ctx.requestMaximize?.(() => {
                    setSelectedSource(null);
                    setDetailConfig(null);
                  });
                }}
              >
                <FileText size={14} />
                <span className="llm-hub-db-memolist-text">
                  <strong>{baseName(row.source)}</strong>
                  <small>{row.source}</small>
                  {latest && <em>{row.memos.length} {t("memo.countUnit")} - {latest.text}</em>}
                </span>
                <time>{new Date(row.file.stat.mtime).toLocaleDateString()}</time>
              </button>
            );
          })
        )}
      </div>
      {items.length > PAGE_SIZE && (
        <div className="llm-hub-db-memolist-pager">
          <button type="button" className="llm-hub-db-iconbtn" disabled={currentPage <= 0} onClick={() => setPage((v) => Math.max(0, v - 1))}>
            <ChevronLeft size={14} />
          </button>
          <span>{currentPage + 1} / {pageCount}</span>
          <button type="button" className="llm-hub-db-iconbtn" disabled={currentPage >= pageCount - 1} onClick={() => setPage((v) => Math.min(pageCount - 1, v + 1))}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
