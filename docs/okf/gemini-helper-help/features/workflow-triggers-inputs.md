---
type: Feature Reference
title: Workflow Triggers and Inputs
description: Hotkey execution, event triggers, event variables, prompt behavior, and skill workflow input variable handling.
tags: [workflow, hotkeys, events, inputs]
timestamp: 2026-07-04T00:00:00Z
---

# Workflow Triggers and Inputs

Workflows can run manually, from hotkeys, from Obsidian events, through integrations such as Dashboard Hub, as sub-workflows, or as skill workflow tools called from chat.

# Hotkeys

To enable a hotkey, open the workflow file, click the keyboard icon in the Workflow panel footer, then assign the command in Obsidian Settings -> Hotkeys. The workflow filename is used as the hotkey display name.

When a hotkey run reaches `prompt-file`, it uses the active file automatically. When it reaches `prompt-selection`, it uses the current selection or the full active file content if no selection exists.

# Event Triggers

Event triggers can run workflows on:

- `create` - file created.
- `modify` - file modified, debounced.
- `delete` - file deleted.
- `rename` - file renamed.
- `file-open` - file opened.

Triggers can include a glob file pattern such as `**/*.md`, `journal/*.md`, `*.md`, `**/{daily,weekly}/*.md`, or `projects/[a-z]*.md`.

# Event Variables

Event-triggered workflows receive:

- `_eventType` - event type.
- `_eventFilePath` - path of the affected file.
- `_eventFile` - JSON with path, basename, name, and extension.
- `_eventFileContent` - file content for create, modify, and file-open events.
- `_eventOldPath` - previous path for rename events.

For event runs, `prompt-file` and `prompt-selection` automatically use the event file; `prompt-selection` uses the entire event file content.

# Skill Workflow Inputs

For skill workflows, any variable read via `{{var}}` before it is initialized by a `variable` or `set` node and before it is written by `saveTo` becomes an input variable. Gemini Helper extracts these inputs and writes them into the skill's `skill-capabilities` fenced block as `inputVariables`.

The chat model sees these input variable names when deciding how to call `run_skill_workflow`. Skill instructions should reference each input by exact variable name.

# Dashboard Hub Workflow Inputs

When Dashboard Hub asks Gemini Helper to execute a Workflow for a widget, it runs headlessly and returns a Markdown or HTML string. Such workflows should not rely on interactive prompt nodes because no user interaction is available during background refresh. The output should be stored in a string variable, usually `result`. Dashboard behavior and caching are documented in the Dashboard Hub repository.
