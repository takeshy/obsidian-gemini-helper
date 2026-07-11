// `.dashboard` YAML parse/serialize with unknown-key preservation.
// File load/save is handled by Obsidian's TextFileView (DashboardView), so this
// module only deals with the in-memory model and pure transforms.

import { parseYaml, stringifyYaml, TFolder, type Vault } from "obsidian";
import {
  type DashboardData,
  type GridLayout,
  type LayoutPos,
  type Breakpoint,
  type Widget,
  DEFAULT_GRID,
  DASHBOARD_FOLDER,
  DASHBOARD_EXT,
} from "./types";
import {
  kanbanDefinitionFromConfig,
  KANBAN_EXT,
  KANBAN_FOLDER,
  serializeKanbanFile,
} from "./kanbanFile";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
    const parsed = parseYaml(content) as unknown;
    if (!isRecord(parsed)) return null;
    const data = parsed as DashboardData;
    // Defensive defaults so a hand-edited / partial file still renders.
    if (typeof data.version !== "number") data.version = 1;
    if (!data.grid || typeof data.grid !== "object") {
      data.grid = { ...DEFAULT_GRID };
    } else {
      const grid = data.grid as Partial<GridLayout>;
      data.grid = {
        cols: Number.isFinite(grid.cols) && grid.cols! > 0 ? grid.cols! : DEFAULT_GRID.cols,
        rowHeight: Number.isFinite(grid.rowHeight) && grid.rowHeight! > 0
          ? grid.rowHeight!
          : DEFAULT_GRID.rowHeight,
        gap: Number.isFinite(grid.gap) && grid.gap! >= 0 ? grid.gap! : DEFAULT_GRID.gap,
      };
    }
    if (!Array.isArray(data.widgets)) data.widgets = [];
    data.widgets = migrateDashboardWidgets(data.widgets);
    return data;
  } catch {
    return null;
  }
}

/** Migrate dashboard widget records from older schema names to current types. */
export function migrateDashboardWidgets(widgets: DashboardData["widgets"]): DashboardData["widgets"] {
  return widgets.map((widget) => {
    if (widget.type === "markdown") {
      return { ...widget, type: "file" };
    }
    return widget;
  });
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeFileBase(name: string): string {
  return name
    .replace(/[\\/:*?"<>|#[\]]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim() || "Board";
}

async function uniqueKanbanPath(vault: Vault, baseName: string): Promise<string> {
  const base = sanitizeFileBase(baseName);
  let path = `${KANBAN_FOLDER}/${base}${KANBAN_EXT}`;
  let index = 2;
  while (vault.getAbstractFileByPath(path) || await vault.adapter.exists(path)) {
    path = `${KANBAN_FOLDER}/${base} ${index++}${KANBAN_EXT}`;
  }
  return path;
}

export async function createKanbanFileFromConfig(
  vault: Vault,
  config: Record<string, unknown>,
  fallbackName: string,
): Promise<string> {
  await ensureVaultFolder(vault, KANBAN_FOLDER);
  const path = await uniqueKanbanPath(vault, trimString(config.title) || fallbackName);
  await vault.create(path, serializeKanbanFile(kanbanDefinitionFromConfig(config)));
  return path;
}

/** Move legacy inline kanban widget definitions into reusable `.kanban` files. */
export async function migrateDashboardKanbanWidgetsToFiles(
  vault: Vault,
  data: DashboardData,
): Promise<DashboardData | null> {
  const migratedWidgets: Widget[] = [];
  let changed = false;

  for (const widget of data.widgets) {
    if (widget.type !== "kanban" || trimString(widget.config?.kanban)) {
      migratedWidgets.push(widget);
      continue;
    }

    const config = widget.config ?? {};
    const path = await createKanbanFileFromConfig(vault, config, widget.id || "Board");
    const nextConfig: Record<string, unknown> = { kanban: path };
    if (Array.isArray(config.cardOrder)) nextConfig.cardOrder = config.cardOrder;
    migratedWidgets.push({ ...widget, config: nextConfig });
    changed = true;
  }

  return changed ? { ...data, widgets: migratedWidgets } : null;
}

/**
 * Create a vault folder and any missing parents. Obsidian's `createFolder`
 * expects the immediate parent to already exist, so nested dashboard-generated
 * paths need to be built segment by segment.
 */
export async function ensureVaultFolder(vault: Vault, folderPath: string): Promise<void> {
  const normalized = folderPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized) return;

  const adapterPathIsFolder = async (path: string): Promise<boolean> => {
    const stat = await vault.adapter.stat(path);
    return stat?.type === "folder";
  };

  let current = "";
  for (const segment of normalized.split("/").filter(Boolean)) {
    current = current ? `${current}/${segment}` : segment;
    const existing = vault.getAbstractFileByPath(current);
    if (existing instanceof TFolder) continue;
    if (existing) throw new Error(`Path exists and is not a folder: ${current}`);
    if (await adapterPathIsFolder(current)) continue;
    try {
      await vault.createFolder(current);
    } catch {
      const afterRace = vault.getAbstractFileByPath(current);
      if (!(afterRace instanceof TFolder) && !(await adapterPathIsFolder(current))) {
        throw new Error(`Failed to create folder: ${current}`);
      }
    }
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
