import type { SidebarNode } from "./types";

const SAVE_PROPERTIES = [
  "saveTo", "saveFileTo", "savePathTo", "saveStatus",
  "saveImageTo", "saveSelectionTo", "saveUiTo",
];

/**
 * Infer a workflow's externally-required input variables from its nodes.
 *
 * A variable counts as "input" when it is read via `{{var}}` in a node
 * property but never initialized by a variable/set node or by a `save*`
 * target. Any name starting with `_` is excluded — that namespace is
 * reserved for runtime-provided system variables (hotkey/event/clock values
 * etc.), and the AI workflow spec tells authors not to use it for their own
 * inputs. Used when generating / updating a skill so `SKILL.md`'s
 * capabilities block keeps `inputVariables` in sync with the workflow the
 * author actually wrote.
 */
export function extractInputVariables(nodes: SidebarNode[]): string[] {
  const varPattern = /\{\{(\w[\w.[\]]*?)(?::json)?\}\}/g;
  const used = new Set<string>();
  const initialized = new Set<string>();

  for (const node of nodes) {
    if ((node.type === "variable" || node.type === "set") && node.properties.name) {
      initialized.add(node.properties.name);
    }
    for (const prop of SAVE_PROPERTIES) {
      const target = node.properties[prop];
      if (target) initialized.add(target);
    }
    for (const value of Object.values(node.properties)) {
      varPattern.lastIndex = 0;
      let match;
      while ((match = varPattern.exec(String(value))) !== null) {
        const rootVar = match[1].split(/[.[\]]/)[0];
        if (rootVar) used.add(rootVar);
      }
    }
  }

  const inputs: string[] = [];
  for (const v of used) {
    if (v.startsWith("_")) continue;
    if (!initialized.has(v)) inputs.push(v);
  }
  return inputs.sort();
}
