---
type: Feature
title: Workflow Builder
description: Workflows automate multi-step tasks with Markdown YAML, visual editing, AI generation, event triggers, hotkeys, history, and skill integration.
tags: [workflow, automation, yaml]
timestamp: 2026-07-04T00:00:00Z
---

# Workflow Builder

Workflows are stored in Markdown files with a `workflow` code block. Each file should hold exactly one workflow. Users can run workflows from the Workflow / skill sidebar tab or from the command palette command "Gemini Helper: Run Workflow".

The visual workflow editor can create, edit, reload, and execute workflows. The AI creation flow asks for a natural-language description, produces a plan, generates YAML, runs a review pass, and saves the accepted result. Users can also copy the prompt to an external LLM and paste a generated response back.

Workflows use node types for variables, control flow, LLM calls, HTTP, JSON, JavaScript, notes, files, prompts, sub-workflows, RAG sync, MCP tools, Obsidian commands, and sleep. Important node examples:

- `command` sends a prompt to a model and can override model, search, vault tool mode, MCP servers, thinking, and attachments.
- `note`, `note-read`, `note-search`, `note-list`, `folder-list`, and `open` operate on vault files.
- `prompt-file`, `prompt-selection`, and `dialog` collect user input.
- `workflow` calls another workflow.
- `mcp` calls an MCP server tool.
- `rag-sync` syncs vault content to File Search.

Hotkeys can run workflows directly. Event triggers can run workflows on file create, modify, delete, rename, or open events, optionally filtered by glob patterns.

Workflow history records runs and can be exported or referenced when asking AI to modify a workflow. Skill workflows run through chat with the same interactive modals and return non-private variables to the chat model.

Legacy files with multiple `workflow` code blocks can be split into one workflow per file from the Workflow / skill panel. The original file keeps the first workflow; skill capabilities, hotkeys, and event triggers that pointed to the original path remain attached to that first workflow and should be rebound manually if needed.

Workflow execution is protected by an iteration limit of 1000 to prevent infinite loops.

# Related

- [Agent Skills](./agent-skills.md) explains skill workflows.
- [MCP](./mcp.md) explains MCP workflow nodes.
- [Workflow Authoring and Recovery](./workflow-authoring-recovery.md) explains AI generation, modification, history, and failure recovery.
- [Workflow Triggers and Inputs](./workflow-triggers-inputs.md) explains hotkeys, events, prompts, and skill inputs.
