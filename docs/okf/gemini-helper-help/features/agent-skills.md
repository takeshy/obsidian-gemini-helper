---
type: Feature
title: Agent Skills
description: Skills add reusable instructions and references to chat through built-in skills, vault skills, external skills, and Agent Plugins.
tags: [skills, workflow, chat, agent-plugins]
timestamp: 2026-07-04T00:00:00Z
---

# Agent Skills

Agent Skills extend chat with reusable instructions, reference files, and executable workflows. A vault skill lives under `skills/<skill-id>/` and must have `SKILL.md`; it can also include `references/` and `workflows/`.

Built-in skills are available without vault setup. They teach the AI about Obsidian-specific formats:

- `obsidian-markdown` covers Obsidian Markdown extensions such as wikilinks, embeds, callouts, properties, tags, highlights, comments, math, and footnotes.
- `json-canvas` covers `.canvas` JSON Canvas files.
- `obsidian-bases` covers `.base` files and includes the Bases authoring reference.
- When the separate Dashboard Hub plugin is enabled, it contributes a `dashboard` skill at runtime for authoring `.dashboard` files and backing `.base` files.

External skills are installed from the official `takeshy/llm-hub-skills` repository into the vault `skills/` folder. Each external skill must include `SKILL.md` and `manifest.json`; versions are compared with semver for updates.

Agent Plugins v1.0.0 are portable packages installed from public GitHub repositories. Gemini Helper validates `plugin.json`, pins each installation to a Git commit, and stores files under `.gemini-helper/agent-plugins/<plugin-name>/`. Plugin data is preserved separately under `.gemini-helper/agent-plugin-data/<plugin-name>/` when a package is uninstalled. Installed skills are shown as `<plugin-name>.<skill-name>` so names from different packages do not collide.

An Agent Plugin can also declare Streamable HTTP MCP servers. Gemini Helper tests supported servers during installation and keeps them disabled in normal settings. When a skill from the same enabled package is active, its successfully tested MCP servers are enabled for that chat turn. Stdio Agent Plugin servers are skipped because Gemini Helper supports HTTP MCP transport only.

Users activate skills from the chat skill selector or by slash command using the skill folder name, for example `/weekly-report`. Built-in skills are fully inlined into the system prompt. Vault skills are lazy-loaded: chat initially sees only name, description, and `SKILL.md` path, then reads `SKILL.md` with `read_note` before invoking workflows. If a skill exposes workflows, chat gets a `run_skill_workflow` tool. Workflow results return all variables whose names do not start with `_`.

Skills can be created with AI from the Workflow / skill tab. The AI generates both the `SKILL.md` instructions and workflow YAML. Existing skills can be modified with AI from an active `SKILL.md`.

# Related

- [Workflows](./workflows.md) explains executable workflow capabilities.
- [Skill Authoring](./skill-authoring.md) explains SKILL.md and references.
- [Skill Chat and Workflows](./skill-chat-workflows.md) explains activation and workflow execution.
- [OKF Knowledge Sources](./okf.md) explains when to use OKF instead of skills.
- [MCP](./mcp.md) explains plugin-managed MCP tools and MCP Apps.
