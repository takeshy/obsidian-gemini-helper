---
type: Feature
title: Agent Skills
description: Skills add reusable instructions, references, and optional workflows to chat, with built-in Obsidian skills and installable external skills.
tags: [skills, workflow, chat]
timestamp: 2026-07-04T00:00:00Z
---

# Agent Skills

Agent Skills extend chat with reusable instructions, reference files, and executable workflows. A vault skill lives under `skills/<skill-id>/` and must have `SKILL.md`; it can also include `references/` and `workflows/`.

Built-in skills are available without vault setup. They teach the AI about Obsidian-specific formats:

- `obsidian-markdown` covers Obsidian Markdown extensions such as wikilinks, embeds, callouts, properties, tags, highlights, comments, math, and footnotes.
- `json-canvas` covers `.canvas` JSON Canvas files.
- `obsidian-bases` covers `.base` files and includes the Bases authoring reference.
- `dashboard` can author `.dashboard` files and backing `.base` files from chat.

External skills are installed from the official `takeshy/llm-hub-skills` repository into the vault `skills/` folder. Each external skill must include `SKILL.md` and `manifest.json`; versions are compared with semver for updates.

Users activate skills from the chat skill selector or by slash command using the skill folder name, for example `/weekly-report`. Built-in skills are fully inlined into the system prompt. Vault skills are lazy-loaded: chat initially sees only name, description, and `SKILL.md` path, then reads `SKILL.md` with `read_note` before invoking workflows. If a skill exposes workflows, chat gets a `run_skill_workflow` tool. Workflow results return all variables whose names do not start with `_`.

Skills can be created with AI from the Workflow / skill tab. The AI generates both the `SKILL.md` instructions and workflow YAML. Existing skills can be modified with AI from an active `SKILL.md`.

# Related

- [Workflows](./workflows.md) explains executable workflow capabilities.
- [Skill Authoring](./skill-authoring.md) explains SKILL.md and references.
- [Skill Chat and Workflows](./skill-chat-workflows.md) explains activation and workflow execution.
- [OKF Knowledge Sources](./okf.md) explains when to use OKF instead of skills.
