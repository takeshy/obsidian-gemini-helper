// Workflow widget — runs a workflow headlessly and renders its output as
// Markdown or an HTML embed. The render path reads only from the sidecar cache;
// execution happens on the refresh button, the config editor's test-run, or
// the interval auto-run (stale-on-open check plus a recurring timer while the
// dashboard view is open). See workflowRunner.ts.

import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, Clock, AlertCircle, XCircle } from "lucide-react";
import { t } from "src/i18n";
import type { WidgetContext } from "../types";
import ObsidianMarkdown from "./ObsidianMarkdown";
import {
  loadWidgetCache,
  saveWidgetCache,
  runWorkflowText,
  onWidgetCacheChange,
  type WorkflowCacheRecord,
} from "./workflowRunner";

interface WorkflowConfig {
  workflow?: string;
  outputVariable?: string;
  output?: "markdown" | "html";
  refreshInterval?: number;
}

function formatTime(ranAt: number): string {
  const d = new Date(ranAt);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Value-equality for cache records, to skip no-op re-renders on cache reloads. */
function sameRecord(a: WorkflowCacheRecord | null, b: WorkflowCacheRecord | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.ranAt === b.ranAt && a.status === b.status && a.text === b.text && a.error === b.error;
}

export default function WorkflowWidget({
  config,
  ctx,
}: {
  config: unknown;
  ctx?: WidgetContext;
}) {
  const cfg = (config ?? {}) as WorkflowConfig;
  const output = cfg.output ?? "markdown";
  const dashboardPath = ctx?.sourcePath ?? "";
  const widgetId = ctx?.widgetId ?? "";
  // Stable references: `ctx` is rebuilt every parent render, but `app`/`plugin`
  // are singletons. Depend on these (not `ctx`) so the effects below don't
  // re-fire — and the cache subscription doesn't churn — on every canvas tick.
  const app = ctx?.app;
  const plugin = ctx?.plugin;

  const [record, setRecord] = useState<WorkflowCacheRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const execAbortRef = useRef<AbortController | null>(null);
  // Latest record, read inside executeWorkflow without making it a dependency
  // (so the callback identity stays stable across cache updates).
  const recordRef = useRef(record);
  recordRef.current = record;
  // Latest executeWorkflow, read inside the interval timer without making it a
  // dependency (so the timer is keyed by workflow/interval, not callback
  // identity which changes with `executing`).
  const executeWorkflowRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Load from sidecar cache (never executes).
  useEffect(() => {
    if (!app || !widgetId || !dashboardPath) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const cached = await loadWidgetCache(app, dashboardPath, widgetId);
      if (cancelled) return;
      setRecord(cached);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [app, widgetId, dashboardPath]);

  // Reload the rendered output when the sidecar cache is rewritten elsewhere
  // (e.g. the config editor's test-run or AI generation runs the workflow).
  useEffect(() => {
    if (!app || !widgetId || !dashboardPath) return;
    let cancelled = false;
    const unsubscribe = onWidgetCacheChange(dashboardPath, widgetId, () => {
      void (async () => {
        const cached = await loadWidgetCache(app, dashboardPath, widgetId);
        // Skip the redundant re-render when this is our own write echoing back.
        if (!cancelled) setRecord((prev) => (sameRecord(prev, cached) ? prev : cached));
      })();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [app, widgetId, dashboardPath]);

  // Abort any in-flight run on unmount.
  useEffect(() => () => execAbortRef.current?.abort(), []);

  const executeWorkflow = useCallback(async () => {
    if (!app || !plugin || !widgetId || !dashboardPath || executing) return;
    const workflowPath = cfg.workflow;
    if (!workflowPath) return;

    setExecuting(true);
    execAbortRef.current?.abort();
    const abort = new AbortController();
    execAbortRef.current = abort;

    try {
      const text = await runWorkflowText(plugin, workflowPath, cfg.outputVariable, abort.signal);
      if (abort.signal.aborted) return;
      const next: WorkflowCacheRecord = { ranAt: Date.now(), status: "ok", text };
      await saveWidgetCache(app, dashboardPath, widgetId, next);
      setRecord(next);
    } catch (err) {
      if (abort.signal.aborted) return;
      const next: WorkflowCacheRecord = {
        ranAt: Date.now(),
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        text: recordRef.current?.text, // keep stale output visible alongside the error
      };
      await saveWidgetCache(app, dashboardPath, widgetId, next);
      setRecord(next);
    } finally {
      if (execAbortRef.current === abort) {
        execAbortRef.current = null;
        setExecuting(false);
      }
    }
  }, [app, plugin, widgetId, dashboardPath, executing, cfg.workflow, cfg.outputVariable]);
  executeWorkflowRef.current = executeWorkflow;

  // Auto-run: on mount, run once if the cached result is stale relative to the
  // interval. Then register a recurring timer that re-runs the workflow every
  // `interval` minutes while the dashboard view is open. The timer is cleared
  // on cleanup (unmount or workflow/interval config change).
  useEffect(() => {
    if (loading) return;
    if (!app || !widgetId || !dashboardPath || !cfg.workflow) return;
    const interval = cfg.refreshInterval ?? 0;
    if (interval <= 0) return;

    // One-shot stale-on-open check.
    const stale = Date.now() - (recordRef.current?.ranAt ?? 0) > interval * 60_000;
    if (stale) void executeWorkflowRef.current();

    // Periodic re-run while the widget is mounted.
    const timer = window.setInterval(() => {
      void executeWorkflowRef.current();
    }, interval * 60_000);
    return () => window.clearInterval(timer);
    // executeWorkflow/record intentionally omitted from deps: the timer is
    // keyed by workflow path + interval value; config changes re-register it.
  }, [loading, app, widgetId, dashboardPath, cfg.workflow, cfg.refreshInterval]);

  if (!ctx) return null;

  if (!cfg.workflow) {
    return <div className="llm-hub-db-widget-empty">{t("dashboard.selectWorkflow")}</div>;
  }
  if (loading) {
    return <div className="llm-hub-db-widget-empty">{t("dashboard.loading")}</div>;
  }

  const hasError = record?.status === "error";
  const hasText = record?.text != null;

  let body: React.ReactNode;
  if (!record || !hasText) {
    body = (
      <div className="llm-hub-db-widget-empty">
        {hasError ? record?.error : t("dashboard.workflowNotRun")}
      </div>
    );
  } else if (output === "html") {
    body = (
      <iframe
        className="llm-hub-db-web"
        srcDoc={record.text}
        sandbox="allow-scripts"
        title="workflow-output"
      />
    );
  } else {
    body = (
      <ObsidianMarkdown
        app={ctx.app}
        markdown={record.text ?? ""}
        sourcePath={dashboardPath}
        className="llm-hub-db-markdown"
      />
    );
  }

  return (
    <div className="llm-hub-db-wf">
      <div className="llm-hub-db-wf-header">
        <div className="llm-hub-db-wf-meta">
          {record && (
            <span className="llm-hub-db-wf-time">
              <Clock size={11} /> {formatTime(record.ranAt)}
            </span>
          )}
          {hasError && hasText && (
            <span className="llm-hub-db-wf-stale">
              <AlertCircle size={11} /> {t("dashboard.stale")}
            </span>
          )}
        </div>
        <div className="llm-hub-db-wf-actions">
          <button
            className="llm-hub-db-wf-btn"
            onClick={(e) => {
              e.stopPropagation();
              void executeWorkflow();
            }}
            disabled={executing}
            title={t("dashboard.refresh")}
          >
            <RefreshCw size={11} className={executing ? "is-spinning" : ""} />
            <span>{executing ? t("dashboard.executing") : t("dashboard.refresh")}</span>
          </button>
          {executing && (
            <button
              className="llm-hub-db-wf-btn is-danger"
              onClick={(e) => {
                e.stopPropagation();
                execAbortRef.current?.abort();
                execAbortRef.current = null;
                setExecuting(false);
              }}
              title={t("dashboard.cancel")}
            >
              <XCircle size={11} />
            </button>
          )}
        </div>
      </div>
      {hasError && !hasText && record?.error && (
        <div className="llm-hub-db-wf-error">{record.error}</div>
      )}
      <div className="llm-hub-db-wf-body">{body}</div>
    </div>
  );
}
