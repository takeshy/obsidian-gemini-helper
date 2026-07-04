---
type: Playbook
title: Troubleshooting User Questions
description: Common practical answers for users who are unsure how Gemini Helper features work or why something is unavailable.
tags: [troubleshooting, support]
timestamp: 2026-07-04T00:00:00Z
---

# Troubleshooting User Questions

If image generation is unavailable, check that the API plan is paid and an image model is selected. Free API keys do not support image generation.

If the AI cannot find vault content, check vault tool mode, AI Folder Access restrictions, RAG selection, and whether the file was explicitly attached or mentioned. Vault: Off disables vault tools. Vault: No search disables search and list tools.

If RAG misses content, check whether the target folder is included, the file type is supported, exclude patterns do not match the file, and sync has run after the latest edits. Free API keys may have limited RAG sync capacity.

If OKF knowledge is not appearing, check Settings -> Knowledge sources, confirm OKF is enabled, confirm the path is vault-relative or an accessible absolute desktop path, and confirm the bundle has `index.md` files and concept files with `type` frontmatter. Built-in Gemini Helper OKF is always available for plugin help.

If a skill does not appear, check that it is under the vault `skills/` folder and contains `SKILL.md`. External skills also need `manifest.json`.

If a skill workflow fails, use the Open workflow button shown on the failed tool call. It opens the workflow file and switches to the Workflow / skill tab. Use Modify workflow with AI and reference execution history for the failing step.

If a workflow does not parse or disappears from the visual editor, check that its node types are valid and that each workflow file contains one `workflow` code block.

If edits are not applied, check for a pending confirmation dialog. Proposal tools do not write changes until the user clicks Apply.
