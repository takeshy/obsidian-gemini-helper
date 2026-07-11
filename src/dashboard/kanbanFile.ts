import { parseYaml, stringifyYaml } from "obsidian";

export const KANBAN_EXT = ".kanban";
export const KANBAN_FOLDER = "Dashboards/Kanbans";

export interface KanbanBoardDefinition {
  title?: string;
  tag?: string;
  folder?: string;
  statusProperty?: string;
  titleProperty?: string;
  columns?: Array<{ value: string; label: string }>;
  showUnspecified?: boolean;
  displayFields?: Array<string | { field: string; label?: string; maxLength?: number }>;
  [key: string]: unknown;
}

/** Remove dashboard-only presentation state before writing a shared board. */
export function kanbanDefinitionFromConfig(
  config: object & { kanban?: unknown; cardOrder?: unknown },
): KanbanBoardDefinition {
  const { kanban: _kanban, cardOrder: _cardOrder, ...definition } = config;
  return definition as KanbanBoardDefinition;
}

export function parseKanbanFile(content: string): KanbanBoardDefinition | null {
  try {
    const value = parseYaml(content) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as KanbanBoardDefinition : null;
  } catch {
    return null;
  }
}

export function serializeKanbanFile(definition: KanbanBoardDefinition): string {
  return stringifyYaml(definition);
}
