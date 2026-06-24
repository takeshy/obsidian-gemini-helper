// `.dashboard` YAML parse/serialize with unknown-key preservation.
// File load/save is handled by Obsidian's TextFileView (DashboardView), so this
// module only deals with the in-memory model and pure transforms.

import { parseYaml, stringifyYaml } from "obsidian";
import {
  type DashboardData,
  type LayoutPos,
  type Breakpoint,
  DEFAULT_GRID,
  DASHBOARD_FOLDER,
  DASHBOARD_EXT,
} from "./types";

/**
 * Build the storage path for a dashboard name:
 * `dashboards/{name}.dashboard`.
 */
export function dashboardPath(name: string): string {
  return `${DASHBOARD_FOLDER}/${name}${DASHBOARD_EXT}`;
}

/**
 * Extract a display name from a dashboard file path — strips the folder prefix
 * and the `.dashboard` extension.
 */
export function dashboardDisplayName(fileName: string): string {
  const base = fileName.includes("/")
    ? fileName.slice(fileName.lastIndexOf("/") + 1)
    : fileName;
  return base.endsWith(DASHBOARD_EXT)
    ? base.slice(0, -DASHBOARD_EXT.length)
    : base;
}

/**
 * Parse `.dashboard` YAML content into DashboardData.
 * Returns null for empty/invalid content. Unknown keys (and unknown widget
 * types) are preserved on the parsed object for round-trip safety.
 */
export function parseDashboard(content: string): DashboardData | null {
  if (!content || !content.trim()) return null;
  try {
    const parsed = parseYaml(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const data = parsed as DashboardData;
    // Defensive defaults so a hand-edited / partial file still renders.
    if (typeof data.version !== "number") data.version = 1;
    if (!data.grid || typeof data.grid !== "object") data.grid = { ...DEFAULT_GRID };
    if (!Array.isArray(data.widgets)) data.widgets = [];
    return data;
  } catch {
    return null;
  }
}

/**
 * Serialize DashboardData back to YAML. Unknown keys are naturally preserved
 * since we dump the full object.
 */
export function serializeDashboard(data: DashboardData): string {
  return stringifyYaml(data);
}

/**
 * Update a single widget's layout position for a specific breakpoint.
 * Returns a new DashboardData object, preserving other widgets and unknown keys.
 */
export function updateWidgetLayout(
  data: DashboardData,
  widgetId: string,
  bp: Breakpoint,
  pos: LayoutPos,
): DashboardData {
  return {
    ...data,
    widgets: data.widgets.map((w) =>
      w.id === widgetId
        ? { ...w, layout: { ...w.layout, [bp]: pos } }
        : w,
    ),
  };
}

/**
 * Ensure every widget has an `sm` layout. Widgets with an explicit `sm` keep it;
 * missing ones are auto-derived from `lg` (full grid width, x=0) and stacked
 * vertically in `lg.y` order, skipping the vertical span occupied by explicit
 * `sm` positions.
 */
export function deriveSmLayout(data: DashboardData): DashboardData {
  // Full grid width — honor a non-default column count rather than hardcoding 12.
  const cols = data.grid?.cols ?? DEFAULT_GRID.cols;
  const sorted = [...data.widgets].sort((a, b) => {
    const ay = a.layout.lg?.y ?? 0;
    const by = b.layout.lg?.y ?? 0;
    return ay - by;
  });

  // Collect vertical spans occupied by explicit `sm` positions first, so
  // auto-derived widgets can skip them regardless of `lg` ordering. (An
  // explicit `sm` may sit at a smaller y than a widget that precedes it in
  // `lg.y` order; without this, the auto widget would overlap it.)
  const reserved: Array<{ top: number; bottom: number }> = [];
  for (const w of sorted) {
    if (w.layout.sm) {
      reserved.push({ top: w.layout.sm.y, bottom: w.layout.sm.y + w.layout.sm.h });
    }
  }

  // First y >= start where [y, y+h) overlaps no reserved span.
  const findFreeY = (start: number, h: number): number => {
    let y = start;
    let moved = true;
    while (moved) {
      moved = false;
      for (const r of reserved) {
        if (y < r.bottom && r.top < y + h) {
          y = r.bottom;
          moved = true;
        }
      }
    }
    return y;
  };

  let currentY = 0;
  const smPositions = new Map<string, LayoutPos>();
  for (const w of sorted) {
    if (w.layout.sm) continue;
    const h = w.layout.lg?.h ?? 3;
    const y = findFreeY(currentY, h);
    smPositions.set(w.id, { x: 0, y, w: cols, h });
    currentY = y + h;
  }

  return {
    ...data,
    widgets: data.widgets.map((w) => {
      const sm = smPositions.get(w.id);
      if (!sm) return w;
      return { ...w, layout: { ...w.layout, sm } };
    }),
  };
}

/** Create an empty dashboard (version 1, default grid, no widgets). */
export function createEmptyDashboard(): DashboardData {
  return {
    version: 1,
    grid: { ...DEFAULT_GRID },
    widgets: [],
  };
}
