---
type: Feature Reference
title: Skill Chat and Workflows
description: How skills are activated in chat, how slash commands work, and how skill workflows execute and return results.
tags: [skills, chat, run-skill-workflow, slash-command]
timestamp: 2026-07-04T00:00:00Z
---

# Skill Chat and Workflows

Skills appear in the chat input area when available. Users click the `+` skill selector to activate skills. Active skills show as chips and can be removed. Assistant messages show which skills were used.

Vault skill chips on assistant messages are clickable and open the skill's `SKILL.md`. Built-in skill chips are static labels because their bodies are bundled in memory.

# Slash Invocation

Skills can be invoked by typing the skill folder name as a slash command:

- `/folder-name` - activate the skill and send immediately.
- `/folder-name your message` - activate the skill and send the remaining message.

Autocomplete shows matching skill folder names. The folder name is used, not necessarily the display name in frontmatter.

# Prompt Loading Behavior

Built-in skills are fully inlined into the system prompt with instructions, references, and workflow listings.

Vault skills are intentionally lightweight in the initial prompt. The model sees the skill name, description, and `SKILL.md` path. It must call `read_note` on `SKILL.md` before invoking workflows because workflow IDs, descriptions, and required input variables live in the `skill-capabilities` block.

# run_skill_workflow

When active skills expose workflows, chat gets the `run_skill_workflow` tool.

The workflow ID format is:

```text
<skill name>/<workflow path without .md, slashes replaced by underscores>
```

Example: skill name `Code Review` with `workflows/run-lint.md` becomes:

```text
Code Review/workflows_run-lint
```

The tool accepts:

- `workflowId` - required workflow ID.
- `variables` - JSON object of input variables, such as `{ "filePath": "notes/todo.md" }`.

The model should infer input values from the user request when possible. If a required input cannot be inferred, it should ask before running the workflow.

# Execution Behavior

Skill workflows run with the same interactive modals as workflows from the Workflow / skill panel:

- Execution progress is shown.
- `dialog`, `prompt-file`, and `prompt-selection` can ask the user for input.
- Confirmation dialogs require user approval.
- The chat model receives execution logs and output variables as the tool result.

# Returning Values

Every workflow variable whose name does not start with `_` is returned to chat after `run_skill_workflow`. A final `command` node just to display output is unnecessary. If a variable must be shown verbatim, put that rule in the `SKILL.md` instructions body.

Example instruction:

```markdown
After the workflow completes, output `ogpMarkdown` verbatim with no additional commentary.
```

# Multiple Workflow Protocol

When multiple workflows must run in sequence, the assistant should plan the order, execute one workflow at a time, inspect each result, and verify modified files after all workflows complete. For a single explicit workflow request, it should run immediately without asking for extra confirmation.

# Failure Recovery

If `run_skill_workflow` fails, the model should not retry automatically. It should report the error. In the UI, the failed tool call can show an Open workflow button. Clicking it opens the workflow file and switches Gemini Helper to the Workflow / skill tab so the user can inspect, modify, and re-run the workflow.
