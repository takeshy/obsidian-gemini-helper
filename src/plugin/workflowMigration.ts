import type { WorkflowEventTrigger } from "src/types";

export interface LegacyWorkflowIdMigrationInput {
  enabledWorkflowHotkeys: string[];
  enabledWorkflowEventTriggers: WorkflowEventTrigger[];
}

export interface LegacyWorkflowIdMigrationResult {
  hotkeys: string[];
  triggers: WorkflowEventTrigger[];
  hotkeysChanged: boolean;
  triggersChanged: boolean;
}

/**
 * Pure core of `WorkflowManager.migrateLegacyWorkflowIds`. Strips any legacy
 * `#workflowName` suffix from persisted IDs and dedups triggers that become
 * identical after stripping. Exposed separately so we can unit-test the
 * migration shape without standing up an Obsidian plugin.
 *
 * Dedup semantics (triggers): `(workflowId, sorted events, filePattern)` is
 * unique. `filePattern: ""` and `filePattern: undefined` collapse to the same
 * key; `""` and `"*"` stay distinct.
 */
export function computeLegacyWorkflowIdMigration(
  input: LegacyWorkflowIdMigrationInput,
): LegacyWorkflowIdMigrationResult {
  const stripHash = (id: string) => {
    const hashIndex = id.lastIndexOf("#");
    return hashIndex === -1 ? id : id.substring(0, hashIndex);
  };

  const newHotkeys = Array.from(new Set(input.enabledWorkflowHotkeys.map(stripHash)));

  const seenTriggers = new Set<string>();
  const newTriggers: WorkflowEventTrigger[] = [];
  for (const trigger of input.enabledWorkflowEventTriggers) {
    const newId = stripHash(trigger.workflowId);
    const dedupKey = `${newId}|${trigger.events.slice().sort().join(",")}|${trigger.filePattern || ""}`;
    if (seenTriggers.has(dedupKey)) continue;
    seenTriggers.add(dedupKey);
    newTriggers.push({ ...trigger, workflowId: newId });
  }

  const hotkeysChanged =
    newHotkeys.length !== input.enabledWorkflowHotkeys.length ||
    newHotkeys.some((id, i) => id !== input.enabledWorkflowHotkeys[i]);
  const triggersChanged =
    newTriggers.length !== input.enabledWorkflowEventTriggers.length ||
    newTriggers.some((t, i) => t.workflowId !== input.enabledWorkflowEventTriggers[i].workflowId);

  return {
    hotkeys: newHotkeys,
    triggers: newTriggers,
    hotkeysChanged,
    triggersChanged,
  };
}
