import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { Plus, Undo2, Redo2, Columns3, Rows3 } from "lucide-react";
import type { App } from "obsidian";
import { t } from "src/i18n";
import type { GeminiHelperPlugin } from "src/plugin";
import { ConfirmModal } from "src/ui/components/ConfirmModal";
import { useBreakpoint } from "./useBreakpoint";
import { useGridLayout } from "./useGridLayout";
import { buildEqualizedLayout, type EqualizeDirection } from "./equalizeLayout";
import GridCell from "./GridCell";
import { WidgetPalette } from "./WidgetPalette";
import { WidgetSettingsPanel } from "./WidgetSettingsPanel";
import type { DashboardData, Widget, WidgetDef, WidgetContext } from "./types";

interface DashboardCanvasProps {
  data: DashboardData;
  /** Called with the next data on every mutation (add/update/delete/move/resize). */
  onChange: (next: DashboardData) => void;
  app: App;
  plugin: GeminiHelperPlugin;
  /** Path of the backing `.dashboard` file (link-resolution source path). */
  sourcePath: string;
  /** Left side of the toolbar (e.g. the dashboard file name). */
  toolbarLeft?: ReactNode;
}

/**
 * Whether a widget has its primary selection set. Used to discard a just-added
 * widget that the user closed without choosing anything. Kanban requires a board
 * title; unknown types are treated as configured so they are kept.
 */
function isWidgetConfigured(widget: Widget): boolean {
  const c = widget.config ?? {};
  const str = (k: string): string => {
    const v = c[k];
    return typeof v === "string" ? v.trim() : "";
  };
  switch (widget.type) {
    case "base":
      return str("base").length > 0;
    case "file":
      return str("path").length > 0;
    case "memo-list":
      return true;
    case "web":
      return str("url").length > 0;
    case "workflow":
      return str("workflow").length > 0;
    case "kanban":
      return str("title").length > 0;
    default:
      return true;
  }
}

/**
 * Controlled dashboard grid editor: toolbar (add widget + edit toggle), the
 * widget grid with drag/resize, the widget palette, and the settings panel.
 *
 * The parent owns the `data` state and persistence; this component only emits
 * `onChange` with the next data.
 */
export function DashboardCanvas({
  data,
  onChange,
  app,
  plugin,
  sourcePath,
  toolbarLeft,
}: DashboardCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showPalette, setShowPalette] = useState(false);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [maximizedWidgetId, setMaximizedWidgetId] = useState<string | null>(null);
  const maximizeRestoreCallbacksRef = useRef<Map<string, () => void>>(new Map());
  // Id of a widget that was just added from the palette and hasn't been
  // configured yet. If its settings panel is closed without a selection, the
  // widget is discarded rather than left empty on the grid.
  const [pendingNewWidgetId, setPendingNewWidgetId] = useState<string | null>(null);

  // --- Undo/redo history ---
  // The canvas is controlled, so it tracks its own stack of data snapshots.
  // `lastEmittedRef` lets us tell our own commits from external changes (load /
  // raw edit), which reset the history.
  const stackRef = useRef<DashboardData[]>([data]);
  const indexRef = useRef(0);
  const lastEmittedRef = useRef<DashboardData>(data);
  const coalesceKeyRef = useRef<string | null>(null);
  const [, setTick] = useState(0);
  const rerender = () => setTick((v) => v + 1);

  useEffect(() => {
    if (data !== lastEmittedRef.current) {
      stackRef.current = [data];
      indexRef.current = 0;
      lastEmittedRef.current = data;
      coalesceKeyRef.current = null;
      rerender();
    }
  }, [data]);

  // Widgets may be registered after this canvas mounts; re-render on the
  // registry's change signal so a previously-unknown type swaps in.
  useEffect(() => {
    const onWidgetsChanged = () => rerender();
    window.addEventListener("dashboard-widgets-changed", onWidgetsChanged);
    return () => window.removeEventListener("dashboard-widgets-changed", onWidgetsChanged);
  }, []);

  const commit = useCallback(
    (next: DashboardData, coalesceKey?: string) => {
      const stack = stackRef.current;
      const atTop = indexRef.current === stack.length - 1;
      if (coalesceKey && coalesceKey === coalesceKeyRef.current && atTop) {
        stack[indexRef.current] = next;
      } else {
        const truncated = stack.slice(0, indexRef.current + 1);
        truncated.push(next);
        if (truncated.length > 100) truncated.shift();
        stackRef.current = truncated;
        indexRef.current = truncated.length - 1;
      }
      coalesceKeyRef.current = coalesceKey ?? null;
      lastEmittedRef.current = next;
      rerender();
      onChange(next);
    },
    [onChange],
  );

  const undo = useCallback(() => {
    if (indexRef.current <= 0) return;
    indexRef.current -= 1;
    const target = stackRef.current[indexRef.current];
    coalesceKeyRef.current = null;
    lastEmittedRef.current = target;
    rerender();
    onChange(target);
  }, [onChange]);

  const redo = useCallback(() => {
    if (indexRef.current >= stackRef.current.length - 1) return;
    indexRef.current += 1;
    const target = stackRef.current[indexRef.current];
    coalesceKeyRef.current = null;
    lastEmittedRef.current = target;
    rerender();
    onChange(target);
  }, [onChange]);

  const canUndo = indexRef.current > 0;
  const canRedo = indexRef.current < stackRef.current.length - 1;

  const { breakpoint, width } = useBreakpoint(containerRef);

  const gridLayout = useGridLayout({
    data,
    breakpoint,
    containerWidth: width,
    onCommit: commit,
  });

  const handleEqualize = useCallback(
    (direction: EqualizeDirection) => {
      if (!data.widgets.length) return;
      const scrollArea = containerRef.current?.parentElement;
      const areaHeight = scrollArea?.clientHeight ?? 600;
      const targetRows = Math.max(6, Math.floor(areaHeight / (data.grid.rowHeight + data.grid.gap)));
      commit({
        ...data,
        widgets: buildEqualizedLayout(data.widgets, direction, data.grid.cols, targetRows),
      });
    },
    [data, commit],
  );

  const handleAddWidget = useCallback(
    (def: WidgetDef) => {
      const maxY = data.widgets.reduce(
        (max, w) => Math.max(max, (w.layout.lg?.y ?? 0) + (w.layout.lg?.h ?? 0)),
        0,
      );
      const defaultSize = def.defaultSize ?? { w: 4, h: 3 };
      const newWidget: Widget = {
        id: crypto.randomUUID(),
        type: def.type,
        layout: { lg: { x: 0, y: maxY, w: defaultSize.w, h: defaultSize.h } },
        config: { ...(def.defaultConfig as Record<string, unknown>) },
      };
      commit({ ...data, widgets: [...data.widgets, newWidget] });
      setShowPalette(false);
      setEditingWidgetId(newWidget.id);
      setPendingNewWidgetId(newWidget.id);
    },
    [data, commit],
  );

  // Close the settings panel. If the widget was just added and still has no
  // selection (e.g. a base widget with no `.base` chosen), discard it instead of
  // leaving an empty widget on the grid.
  const handleCloseSettings = useCallback(() => {
    const id = editingWidgetId;
    setEditingWidgetId(null);
    if (id && id === pendingNewWidgetId) {
      const w = data.widgets.find((x) => x.id === id);
      if (w && !isWidgetConfigured(w)) {
        commit({ ...data, widgets: data.widgets.filter((x) => x.id !== id) });
      }
    }
    setPendingNewWidgetId(null);
  }, [editingWidgetId, pendingNewWidgetId, data, commit]);

  const handleUpdateWidgetConfig = useCallback(
    (widgetId: string, config: unknown) => {
      commit(
        {
          ...data,
          widgets: data.widgets.map((w) =>
            w.id === widgetId ? { ...w, config: config as Record<string, unknown> } : w,
          ),
        },
        `config:${widgetId}`,
      );
    },
    [data, commit],
  );

  const handleDeleteWidget = useCallback(
    (widgetId: string) => {
      void (async () => {
        const confirmed = await new ConfirmModal(app, t("dashboard.deleteWidgetConfirm")).openAndWait();
        if (!confirmed) return;
        commit({ ...data, widgets: data.widgets.filter((w) => w.id !== widgetId) });
        setEditingWidgetId(null);
        setPendingNewWidgetId(null);
      })();
    },
    [app, data, commit],
  );

  const editingWidget = useMemo(
    () => data.widgets.find((w) => w.id === editingWidgetId) ?? null,
    [data, editingWidgetId],
  );

  useEffect(() => {
    if (maximizedWidgetId && !data.widgets.some((w) => w.id === maximizedWidgetId)) {
      const restore = maximizeRestoreCallbacksRef.current.get(maximizedWidgetId);
      maximizeRestoreCallbacksRef.current.delete(maximizedWidgetId);
      setMaximizedWidgetId(null);
      restore?.();
    }
  }, [data.widgets, maximizedWidgetId]);

  const restoreMaximizedWidget = useCallback((widgetId: string) => {
    const restore = maximizeRestoreCallbacksRef.current.get(widgetId);
    maximizeRestoreCallbacksRef.current.delete(widgetId);
    setMaximizedWidgetId((current) => (current === widgetId ? null : current));
    restore?.();
  }, []);

  const requestWidgetMaximize = useCallback((widgetId: string, onRestore?: () => void) => {
    setMaximizedWidgetId((current) => {
      if (current && current !== widgetId) {
        const restore = maximizeRestoreCallbacksRef.current.get(current);
        maximizeRestoreCallbacksRef.current.delete(current);
        restore?.();
      }
      if (onRestore) maximizeRestoreCallbacksRef.current.set(widgetId, onRestore);
      else maximizeRestoreCallbacksRef.current.delete(widgetId);
      return widgetId;
    });
  }, []);

  const grid = data.grid;
  const gridStyle = useMemo(
    () => ({
      display: "grid",
      gridTemplateColumns: `repeat(${grid.cols}, 1fr)`,
      gridAutoRows: `${grid.rowHeight}px`,
      gap: `${grid.gap}px`,
    }),
    [grid.cols, grid.rowHeight, grid.gap],
  );

  const makeCtx = useCallback(
    (widget: Widget, pos: { w: number; h: number }): WidgetContext => ({
      app,
      plugin,
      sourcePath,
      size: { w: pos.w, h: pos.h },
      editMode: false,
      widgetId: widget.id,
      onConfigChange: (config) => handleUpdateWidgetConfig(widget.id, config),
      requestMaximize: (onRestore) => requestWidgetMaximize(widget.id, onRestore),
      restoreMaximized: () => restoreMaximizedWidget(widget.id),
    }),
    [app, plugin, sourcePath, handleUpdateWidgetConfig, requestWidgetMaximize, restoreMaximizedWidget],
  );

  return (
    <div className="llm-hub-db-root">
      <div className="llm-hub-db-toolbar">
        <div className="llm-hub-db-toolbar-left">{toolbarLeft}</div>
        <div className="llm-hub-db-toolbar-right">
          <button
            onClick={undo}
            disabled={!canUndo}
            title={t("dashboard.undo")}
            className="llm-hub-db-toolbtn"
          >
            <Undo2 size={14} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title={t("dashboard.redo")}
            className="llm-hub-db-toolbtn"
          >
            <Redo2 size={14} />
          </button>
          <button
            onClick={() => handleEqualize("horizontal")}
            disabled={data.widgets.length === 0}
            title={t("dashboard.alignHorizontal")}
            className="llm-hub-db-toolbtn"
          >
            <Columns3 size={14} />
          </button>
          <button
            onClick={() => handleEqualize("vertical")}
            disabled={data.widgets.length === 0}
            title={t("dashboard.alignVertical")}
            className="llm-hub-db-toolbtn"
          >
            <Rows3 size={14} />
          </button>
          <button
            onClick={() => setShowPalette(true)}
            className="llm-hub-db-toolbtn is-accent"
          >
            <Plus size={14} />
            {t("dashboard.addWidget")}
          </button>
        </div>
      </div>

      {/* The ref'd element must always be mounted so useBreakpoint can measure
          it — otherwise the breakpoint stays null and newly added widgets never
          render. */}
      <div className="llm-hub-db-scroll">
        <div
          ref={containerRef}
          className={`llm-hub-db-grid${maximizedWidgetId ? " is-maximized" : ""}`}
          style={data.widgets.length > 0 ? gridStyle : undefined}
        >
          {data.widgets.length === 0 ? (
            <div className="llm-hub-db-empty">
              <Plus size={48} className="llm-hub-db-empty-icon" />
              <p>{t("dashboard.emptyDashboard")}</p>
              <button
                onClick={() => setShowPalette(true)}
                className="llm-hub-db-primary-btn"
              >
                <Plus size={16} />
                {t("dashboard.addFirstWidget")}
              </button>
            </div>
          ) : (
            gridLayout.layout
              .filter(({ widget }) => !maximizedWidgetId || widget.id === maximizedWidgetId)
              .map(({ widget, pos }) => {
                const isMaximized = widget.id === maximizedWidgetId;
                const renderPos = isMaximized
                  ? { ...pos, x: 0, y: 0, w: grid.cols, h: Math.max(pos.h, 8) }
                  : pos;
                return (
                  <GridCell
                    key={widget.id}
                    widget={widget}
                    pos={renderPos}
                    grid={grid}
                    cellW={gridLayout.cellW}
                    cellH={gridLayout.cellH}
                    editMode={false}
                    ctx={makeCtx(widget, renderPos)}
                    onDragEnd={(newPos) => gridLayout.commitPos(widget.id, newPos)}
                    onResizeEnd={(newPos) => gridLayout.commitPos(widget.id, newPos)}
                    computeDragPos={gridLayout.computeDragPos}
                    computeResizePos={gridLayout.computeResizePos}
                    onSettings={() => setEditingWidgetId(widget.id)}
                    isMaximized={isMaximized}
                    onToggleMaximize={() => {
                      if (isMaximized) restoreMaximizedWidget(widget.id);
                      else requestWidgetMaximize(widget.id);
                    }}
                  />
                );
              })
          )}
        </div>
      </div>

      {showPalette && (
        <WidgetPalette onSelect={handleAddWidget} onClose={() => setShowPalette(false)} />
      )}

      {editingWidget && (
        <WidgetSettingsPanel
          widget={editingWidget}
          app={app}
          plugin={plugin}
          sourcePath={sourcePath}
          onChange={(config) => handleUpdateWidgetConfig(editingWidget.id, config)}
          onClose={handleCloseSettings}
          onDelete={() => handleDeleteWidget(editingWidget.id)}
        />
      )}
    </div>
  );
}
