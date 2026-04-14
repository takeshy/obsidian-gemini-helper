import type { SidebarNode } from "./types";

const SYSTEM_VARS: ReadonlySet<string> = new Set([
  "_hotkeyContent", "_hotkeySelection", "_hotkeyActiveFile", "_hotkeySelectionInfo",
  "_eventType", "_eventFilePath", "_eventFile", "_eventOldPath", "_eventFileContent",
  "_workflowName", "_lastModel", "_date", "_time", "_datetime", "_clipboard",
  "__hotkeyContent__", "__hotkeySelection__", "__hotkeyActiveFile__", "__hotkeySelectionInfo__",
  "__eventType__", "__eventFilePath__", "__eventFile__", "__eventOldPath__", "__eventFileContent__",
  "__workflowName__", "__lastModel__", "__date__", "__time__", "__datetime__",
]);

const SAVE_PROPERTIES = [
  "saveTo", "saveFileTo", "savePathTo", "saveStatus",
  "saveImageTo", "saveSelectionTo", "saveUiTo",
];

/**
 * Infer a workflow's externally-required input variables from its nodes.
 *
 * A variable counts as "input" when it is read via `{{var}}` in a node
 * property but never initialized by a variable/set node or by a `save*`
 * target. System-provided variables (prefixed with `_`) are excluded. Used
 * when generating / updating a skill so `SKILL.md`'s capabilities block keeps
 * `inputVariables` in sync with the workflow the author actually wrote.
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
    if (!initialized.has(v) && !SYSTEM_VARS.has(v)) inputs.push(v);
  }
  return inputs.sort();
}
