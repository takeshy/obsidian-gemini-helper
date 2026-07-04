---
type: Operations
title: Settings and Operations
description: Operational reference for API plans, workspace storage, knowledge sources, build commands, version bumping, and plugin reloads.
tags: [settings, build, operations]
timestamp: 2026-07-04T00:00:00Z
---

# Settings and Operations

Important settings areas:

- API settings store the Google API key and API plan.
- Workspace settings control workspace folder, hidden workspace behavior, chat history, system prompt, and AI folder access.
- RAG settings manage File Search stores, sync, top-K, folders, exclusions, metadata filters, and external store IDs.
- Knowledge sources configure an external OKF directory.
- External skills install versioned skills from the official repository.
- MCP servers configure Streamable HTTP MCP endpoints.
- Encryption settings configure keys and encrypted chat or workflow history.
- Langfuse settings configure optional observability.
- Slash command settings configure reusable chat commands.
- Edit history is always enabled internally; there is no visible settings UI for it.

Chat histories are saved as Markdown files under `{workspaceFolder}/chats/{chatId}.md` when saving is enabled. RAG workspace state is stored in `.gemini-workspace.json`.

# API Settings

- Google API key - stored in Obsidian settings; password-style field with show/hide button.
- API plan - `paid` or `free`. Changing the plan also switches the selected model if the current model is not allowed by the new plan.

# Workspace Settings

- Workspace folder - vault-relative folder for Gemini Helper data. Defaults to `GeminiHelper`. Absolute paths and `..` traversal are rejected. If the old folder exists, the user can move existing data or skip moving.
- Hide workspace folder - available only when the workspace folder is the default `GeminiHelper`; hides or shows that folder in Obsidian.
- Save chat history - toggles chat history file persistence. Turning it off asks whether to delete existing chat history files.
- System prompt - additional user-defined instructions appended to the chat system prompt.
- Folders AI can access automatically - comma-separated vault-relative allowlist for automatic AI vault tool access. Empty means whole-vault access. Invalid traversal paths are rejected.

# Tool Limit Settings

These are under the Workspace tool limits details section:

- Max tool calls - maximum function calls per chat response. Default 20, range 1-50.
- Tool call warning threshold - remaining call count where the UI can warn or offer extension. Default 5, capped by Max tool calls.
- List notes limit - default result limit for `list_notes`. Default 50, range 10-200.
- Max note characters - maximum characters read from a note. Default 20000, range 1000-100000.

# Slash Command Settings

The Slash Commands section manages reusable `/command` prompts. Each command can configure:

- Command name - slash command identifier; normalized to lowercase letters, numbers, `_`, and `-`.
- Description - optional autocomplete/help text.
- Prompt template - required prompt body; can use placeholders such as `{selection}` and `{content}`.
- Model - optional fixed model, or use the current model.
- Search setting - current setting, none, web search when available, or a configured RAG setting when RAG is enabled.
- Confirm edits - whether edits triggered by the command require confirmation.
- Vault tool mode - current setting, all tools, no search tools, or no vault tools.
- MCP servers - current setting or an explicit subset of configured MCP servers.

# External Skills Settings

- Official repository - fixed to `takeshy/llm-hub-skills`.
- Install a skill - select a compatible catalog entry and install it.
- Installed skills - show installed version, available update status, and per-skill update check/install action.

# Knowledge Source Settings

- OKF enabled - turns the external OKF knowledge source on or off.
- OKF source path - vault-relative path such as `Knowledge` or `.Knowledge`, or an absolute desktop path. The built-in Gemini Helper OKF bundle is available independently of this setting.

# RAG Settings

- Enable RAG - shows or hides RAG controls.
- Retrieved chunks limit - top-K chunks to retrieve from File Search. Default 5, range 1-20.
- RAG setting - select, create, rename, or delete named RAG settings.

Each selected RAG setting can configure:

- Store mode - internal store managed by the plugin, or external store IDs.
- Metadata filter - query-time File Search metadata filter. Supported metadata keys include `path`, `extension`, `basename`, `folder`, `modified`, and `size`.
- External store IDs - newline-separated File Search store IDs when using external mode.
- Current store ID - shown for internal stores after creation, with copy button.
- Target folders - comma-separated vault folders to include in internal sync; empty means all eligible vault files.
- Excluded patterns - newline-separated regex patterns for files to exclude.
- Sync Vault - starts internal store sync, with progress, cancel button, and view-files button when files are tracked.
- Reset sync state - clears local sync tracking without necessarily deleting the remote store.
- Delete store - deletes the internal File Search store when one exists.

# Encryption Settings

Before setup:

- Encryption password - password used to encrypt the private key.
- Confirm password - confirmation field.
- Setup encryption - generates keys and enables encryption for chat and workflow history by default.

After setup:

- Encryption configured status - indicates key material exists.
- Encrypt AI chat history - encrypts newly saved chat history.
- Encrypt workflow execution logs - encrypts newly saved workflow history.
- Reset encryption keys - clears encryption settings after confirmation. Existing encrypted files require the old password/key material to decrypt.

# Langfuse Settings

Shown only when Langfuse tracing support is available:

- Public key - enables the detailed Langfuse settings section.
- Secret key - password-style field with show/hide button.
- Base URL - defaults to `https://cloud.langfuse.com`.
- Log prompts - whether to send prompts to Langfuse.
- Log responses - whether to send responses to Langfuse.
- Test connection - sends a test trace.

# MCP Server Settings

The MCP Servers section can add, edit, and delete Streamable HTTP MCP servers. Each server can configure:

- Server name.
- Server URL.
- Headers - optional JSON object for authentication or custom headers.
- Test connection - required before saving a new or untested server; retrieves tool names as tool hints.

Saved server rows show URL and tool hints, and include edit/delete actions. Updating MCP servers clears the cached MCP tool list.

# Workflow-Related Settings Outside The Settings Tab

Workflow hotkeys and event triggers are stored in plugin settings but configured from the Workflow / skill panel:

- Workflow hotkeys - enabled per workflow, then assigned in Obsidian's Hotkeys settings.
- Workflow event triggers - enabled per workflow with event types and optional file pattern filters.

Development commands:

```bash
npm run build
npm run dev
npm run lint
```

After building, reload the plugin in Obsidian to test changes.

Version bumps should use npm's version command so `package.json`, `manifest.json`, and `versions.json` stay aligned:

```bash
npm version patch
npm version minor
npm version major
```

# Related

- [RAG Semantic Search](../features/rag.md) explains File Search settings.
- [OKF Knowledge Sources](../features/okf.md) explains OKF settings.
- [Agent Skills](../features/agent-skills.md) explains skill installation.
