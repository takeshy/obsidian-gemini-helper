// Widget registry — maps widget type strings to WidgetDef implementations.
// Core widgets are registered here; plugins/extensions can add more via
// registerWidget.

import React from "react";
import { Database, FileText, Globe, Kanban, Puzzle, Workflow } from "lucide-react";
import type { WidgetDef } from "../types";
import BaseWidget from "./BaseWidget";
import MarkdownWidget from "./MarkdownWidget";
import WebWidget from "./WebWidget";
import WorkflowWidget from "./WorkflowWidget";
import KanbanWidget from "./KanbanWidget";
import UnknownWidget from "./UnknownWidget";
import { BaseConfigEditor } from "./config-editors/BaseConfigEditor";
import { MarkdownConfigEditor } from "./config-editors/MarkdownConfigEditor";
import { WebConfigEditor } from "./config-editors/WebConfigEditor";
import { WorkflowConfigEditor } from "./config-editors/WorkflowConfigEditor";
import { KanbanConfigEditor } from "./config-editors/KanbanConfigEditor";

const registry = new Map<string, WidgetDef>();

/**
 * Register a widget type. Emits a change signal so mounted DashboardCanvas
 * instances re-render and swap a previously-unknown type for the real one.
 */
export function registerWidget(def: WidgetDef): void {
  registry.set(def.type, def);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("dashboard-widgets-changed"));
  }
}

/**
 * Get a widget definition by type. Falls back to UnknownWidget for unregistered
 * types so the config is preserved on round-trip.
 */
export function getWidgetDef(type: string): WidgetDef {
  return registry.get(type) ?? {
    type: "__unknown__",
    label: `Unknown (${type})`,
    icon: React.createElement(Puzzle, { size: 16 }),
    defaultConfig: {},
    render: (config, ctx) => React.createElement(UnknownWidget, { type, config, ctx }),
  };
}

/** Check if a widget type is registered. */
export function isKnownWidgetType(type: string): boolean {
  return registry.has(type);
}

/** List all registered widget definitions (for the palette). */
export function listWidgetDefs(): WidgetDef[] {
  return Array.from(registry.values());
}

let coreRegistered = false;

/** Register the built-in widget types (idempotent). */
export function registerCoreWidgets(): void {
  if (coreRegistered) return;
  coreRegistered = true;

  registerWidget({
    type: "base",
    label: "Base",
    icon: React.createElement(Database, { size: 16 }),
    defaultConfig: { base: "", view: "" },
    render: (config, ctx) => React.createElement(BaseWidget, { config, ctx }),
    defaultSize: { w: 6, h: 5 },
    ConfigEditor: BaseConfigEditor,
  });

  registerWidget({
    type: "markdown",
    label: "Markdown",
    icon: React.createElement(FileText, { size: 16 }),
    defaultConfig: { path: "" },
    render: (config, ctx) => React.createElement(MarkdownWidget, { config, ctx }),
    defaultSize: { w: 6, h: 3 },
    ConfigEditor: MarkdownConfigEditor,
  });

  registerWidget({
    type: "web",
    label: "Web Embed",
    icon: React.createElement(Globe, { size: 16 }),
    defaultConfig: { url: "" },
    render: (config, ctx) => React.createElement(WebWidget, { config, ctx }),
    defaultSize: { w: 6, h: 4 },
    ConfigEditor: WebConfigEditor,
  });

  registerWidget({
    type: "workflow",
    label: "Workflow",
    icon: React.createElement(Workflow, { size: 16 }),
    defaultConfig: { workflow: "", output: "markdown", outputVariable: "result" },
    render: (config, ctx) => React.createElement(WorkflowWidget, { config, ctx }),
    defaultSize: { w: 6, h: 5 },
    ConfigEditor: WorkflowConfigEditor,
  });

  registerWidget({
    type: "kanban",
    label: "Kanban",
    icon: React.createElement(Kanban, { size: 16 }),
    defaultConfig: {
      title: "",
      tag: "",
      folder: "",
      statusProperty: "status",
      titleProperty: "",
      columns: [
        { value: "todo", label: "To Do" },
        { value: "in-progress", label: "In Progress" },
        { value: "done", label: "Done" },
      ],
      showUnspecified: true,
      displayFields: [],
    },
    render: (config, ctx) => React.createElement(KanbanWidget, { config, ctx }),
    defaultSize: { w: 12, h: 6 },
    ConfigEditor: KanbanConfigEditor,
  });
}
