import { useCallback, useMemo, useRef } from "react";
import {
  type DashboardData,
  type Widget,
  type LayoutPos,
  type Breakpoint,
  type GridLayout,
} from "./types";
import { updateWidgetLayout, deriveSmLayout } from "./dashboardFile";

/**
 * Get the layout position for a widget at the given breakpoint.
 * Falls back to lg if the requested breakpoint is missing.
 */
export function getWidgetPos(widget: Widget, bp: Breakpoint): LayoutPos {
  return widget.layout[bp] ?? widget.layout.lg ?? { x: 0, y: 0, w: 6, h: 3 };
}

/** Check if two layout rectangles overlap. */
function overlaps(a: LayoutPos, b: LayoutPos): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export interface GridLayoutResult {
  layout: Array<{ widget: Widget; pos: LayoutPos }>;
  cellW: number;
  cellH: number;
  computeDragPos: (widgetId: string, dxPx: number, dyPx: number) => LayoutPos;
  computeResizePos: (widgetId: string, dxPx: number, dyPx: number) => LayoutPos;
  commitPos: (widgetId: string, pos: LayoutPos) => void;
}

export function useGridLayout({
  data,
  breakpoint,
  containerWidth,
  onCommit,
}: {
  data: DashboardData;
  breakpoint: Breakpoint | null;
  containerWidth: number;
  onCommit: (newData: DashboardData) => void;
}): GridLayoutResult {
  const dataRef = useRef(data);
  dataRef.current = data;

  const grid: GridLayout = data.grid;
  // Subtract inter-column gaps before dividing — CSS Grid distributes gap
  // between cells, so actual cell width ≠ containerWidth / cols.
  const cellW = containerWidth > 0
    ? (containerWidth - (grid.cols - 1) * grid.gap) / grid.cols
    : 0;
  const cellH = grid.rowHeight;

  // Layout positions for the current breakpoint. For sm, missing positions are
  // auto-derived via deriveSmLayout (same logic used at save time) so render and
  // persistence stay in sync.
  const layout = useMemo(() => {
    if (!breakpoint) return [];

    if (breakpoint === "lg") {
      return data.widgets.map((w) => ({
        widget: w,
        pos: getWidgetPos(w, "lg"),
      }));
    }

    return deriveSmLayout(data).widgets.map((w) => ({
      widget: w,
      pos: w.layout.sm ?? { x: 0, y: 0, w: grid.cols, h: 3 },
    }));
  }, [data, breakpoint]);

  // Effective position map for the current breakpoint (used by compute funcs).
  const posMapRef = useRef<Map<string, LayoutPos>>(new Map());
  posMapRef.current = new Map(layout.map((item) => [item.widget.id, item.pos]));

  const computeDragPos = useCallback(
    (widgetId: string, dxPx: number, dyPx: number): LayoutPos => {
      const current = posMapRef.current.get(widgetId) ?? { x: 0, y: 0, w: 6, h: 3 };

      const gx = cellW > 0 ? Math.round(dxPx / cellW) : 0;
      const gy = cellH > 0 ? Math.round(dyPx / cellH) : 0;

      const nx = Math.max(0, Math.min(current.x + gx, grid.cols - current.w));
      const ny = Math.max(0, current.y + gy);

      return { ...current, x: nx, y: ny };
    },
    [cellW, cellH, grid.cols],
  );

  const computeResizePos = useCallback(
    (widgetId: string, dxPx: number, dyPx: number): LayoutPos => {
      const current = posMapRef.current.get(widgetId) ?? { x: 0, y: 0, w: 6, h: 3 };

      const gw = cellW > 0 ? Math.round(dxPx / cellW) : 0;
      const gh = cellH > 0 ? Math.round(dyPx / cellH) : 0;

      const nw = Math.max(1, Math.min(current.w + gw, grid.cols - current.x));
      const nh = Math.max(1, current.h + gh);

      return { ...current, w: nw, h: nh };
    },
    [cellW, cellH, grid.cols],
  );

  const commitPos = useCallback(
    (widgetId: string, pos: LayoutPos) => {
      const bp = breakpoint ?? "lg";
      const current = dataRef.current;

      // Cascading collision resolution: the moved/resized widget stays at `pos`;
      // every other widget is processed top-to-bottom and pushed straight down
      // until it clears all already-placed widgets. Pushing one widget can
      // create a new overlap with another, so each is re-checked in a loop —
      // unlike a single pass, this resolves chains of overlaps.
      const placed: LayoutPos[] = [pos];
      const moves = new Map<string, LayoutPos>();

      const others = current.widgets
        .filter((w) => w.id !== widgetId)
        .map((w) => ({ id: w.id, pos: posMapRef.current.get(w.id) ?? getWidgetPos(w, bp) }))
        .sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x);

      for (const other of others) {
        let p = other.pos;
        // y strictly increases each iteration (an overlap means some placed
        // rect's bottom is below p.y), so this terminates; guard is belt-and-braces.
        for (let guard = 0; guard < 1000; guard++) {
          const hits = placed.filter((r) => overlaps(p, r));
          if (hits.length === 0) break;
          const maxBottom = Math.max(...hits.map((r) => r.y + r.h));
          if (maxBottom <= p.y) break;
          p = { ...p, y: maxBottom };
        }
        placed.push(p);
        if (p.y !== other.pos.y) moves.set(other.id, p);
      }

      let updated = updateWidgetLayout(current, widgetId, bp, pos);
      if (moves.size > 0) {
        updated = {
          ...updated,
          widgets: updated.widgets.map((w) =>
            moves.has(w.id)
              ? { ...w, layout: { ...w.layout, [bp]: moves.get(w.id)! } }
              : w,
          ),
        };
      }

      onCommit(updated);
    },
    [breakpoint, onCommit],
  );

  return {
    layout,
    cellW,
    cellH,
    computeDragPos,
    computeResizePos,
    commitPos,
  };
}
