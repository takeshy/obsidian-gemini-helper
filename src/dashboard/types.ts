// Dashboard data model types — the `.dashboard` YAML schema (version 1).
// Ported from gemihub's dashboard feature and adapted for the Obsidian plugin.

import type { ReactNode, FC } from "react";
import type { App } from "obsidian";
import type { GeminiHelperPlugin } from "src/plugin";

export type Breakpoint = "lg" | "sm";

export interface LayoutPos {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridLayout {
  cols: number;
  rowHeight: number;
  gap: number;
}

export interface Widget {
  id: string;
  type: string;
  layout: Partial<Record<Breakpoint, LayoutPos>>;
  config: Record<string, unknown>;
  // Unknown keys are preserved on round-trip (plugin widgets, future extensions).
  [key: string]: unknown;
}

export interface DashboardData {
  version: number;
  grid: GridLayout;
  widgets: Widget[];
  /** Direction used to arrange widgets when a new widget is added. */
  layoutDirection?: "horizontal" | "vertical";
  [key: string]: unknown;
}

export const DEFAULT_GRID: GridLayout = {
  cols: 12,
  rowHeight: 80,
  gap: 8,
};

export const BREAKPOINT_THRESHOLD = 768;

/** Folder where new dashboards are stored. Plain name (no emoji) so it's easy
 *  to type in paths; the file explorer shows an icon via CSS (styles.css). */
export const DASHBOARD_FOLDER = "Dashboards";
/** Subfolder for the backing `.base` files, kept apart from the `.dashboard`
 *  files so the Dashboards folder isn't cluttered with non-dashboard files. */
export const BASES_FOLDER = `${DASHBOARD_FOLDER}/Bases`;
export const DASHBOARD_EXT = ".dashboard";

/**
 * Context handed to every widget's `render()` (and indirectly to its
 * ConfigEditor). Carries the Obsidian `app` and the source `.dashboard` path so
 * widgets can render notes / base embeds and resolve relative links.
 */
export interface WidgetContext {
  app: App;
  plugin: GeminiHelperPlugin;
  /** Path of the `.dashboard` file (used as the link-resolution source path). */
  sourcePath: string;
  size: { w: number; h: number };
  /** True when the dashboard is in edit mode. */
  editMode?: boolean;
  /** The widget's own ID. */
  widgetId?: string;
  /**
   * Persist a change to this widget's config from the widget itself — works in
   * view mode too (not just the settings panel).
   */
  onConfigChange?: (config: unknown) => void;
  /** Request temporary maximized display for this widget. */
  requestMaximize?: (onRestore?: () => void) => void;
  /** Restore this widget from temporary maximized display. */
  restoreMaximized?: () => void;
}

export interface ConfigEditorProps {
  config: unknown;
  onChange: (next: unknown) => void;
  app: App;
  plugin: GeminiHelperPlugin;
  widgetId?: string;
  /** Path of the backing `.dashboard` file (e.g. for sidecar result caches). */
  sourcePath?: string;
}

export interface WidgetDef {
  type: string;
  /** Display name shown in the widget palette. */
  label: string;
  /** Optional icon for the palette. */
  icon?: ReactNode;
  /** Initial config inserted when a widget of this type is added. */
  defaultConfig: unknown;
  render: (config: unknown, ctx: WidgetContext) => ReactNode;
  defaultSize?: { w: number; h: number };
  /** Per-type settings form shown when editing a widget. Omit for "no settings". */
  ConfigEditor?: FC<ConfigEditorProps>;
}
