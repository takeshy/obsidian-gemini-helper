---
type: Feature Reference
title: Workflow Authoring and Recovery
description: AI workflow creation, AI modification, legacy migration, execution history, encryption, and failure recovery behavior.
tags: [workflow, ai-generation, history, recovery]
timestamp: 2026-07-04T00:00:00Z
---

# Workflow Authoring and Recovery

Users do not need to write workflow YAML manually. The Workflow / skill tab can create or modify workflows with AI.

# AI Creation

The `+ New (AI)` flow asks for a workflow name and natural-language description. It defaults output to `workflows/{{name}}.md` and expects each file to contain one workflow. Users can reference files with `@{selection}`, `@{content}`, or `@path/to/file.md`; referenced file contents are embedded into the AI request with frontmatter stripped. Users can attach images, PDFs, or text files for extra context.

The generation flow produces a plan first. The user can accept, ask for a new plan, or cancel. After YAML generation, a review pass checks the workflow. If issues are found, the user can accept with confirmation, refine using review feedback, or cancel.

Users can also use external LLMs by copying the generated prompt, pasting it into another model, then pasting the response back. The pasted response can be raw YAML or Markdown containing a `workflow` code block.

# AI Modification

Existing workflows can be modified with the AI Modify button. The user describes the requested change, reviews a before/after diff, and applies the update. Modification can reference execution history so the AI can see failing step input, output, and errors.

AI-generated or AI-modified workflows store an "AI Workflow History" callout above the workflow code block with timestamp, action, request, and referenced file information.

# Skill Modification

When the active file is `SKILL.md`, the panel uses Modify skill with AI. It edits the skill instructions and related workflow together while preserving frontmatter and the `skill-capabilities` block. The workflow's uninitialized `{{var}}` references are used to derive `inputVariables`.

# Legacy Migration

Older files may contain multiple `workflow` code blocks. The panel can split blocks 2..N into new sibling workflow files. The original file keeps the first workflow. Existing skill capabilities, hotkeys, and event triggers that referenced the original path remain bound to that first workflow and should be rebound to the new files manually.

# Execution History

Workflow runs are recorded with status, step inputs, outputs, errors, usage, elapsed time, and variable snapshots. History can be opened from the Workflow / skill tab. Workflow execution logs can be encrypted if encryption is enabled.

When workflow history is not encrypted, decrypted content read from encrypted files is not stored in unencrypted history snapshots.

# Failure Recovery

If a workflow fails, inspect the execution history and failing node. If a skill workflow fails during chat, the failed tool call shows an Open workflow button that opens the workflow file and switches to the Workflow / skill tab. Use AI Modify with referenced execution history to repair the failing step.
