# Gemini Helper for Obsidian

**Free and open-source** AI assistant for Obsidian with **Chat**, **Workflow Automation**, and **RAG** powered by Google Gemini.

> **This plugin is completely free.** You only need a Google Gemini API key (free or paid) from [ai.google.dev](https://ai.google.dev), or use CLI tools: [Gemini CLI](https://github.com/google-gemini/gemini-cli), [Claude Code](https://github.com/anthropics/claude-code), or [Codex CLI](https://github.com/openai/codex).

## Highlights

- **AI Chat** - Streaming responses, file attachments, vault operations, slash commands
- **Workflow Builder** - Automate multi-step tasks with visual node editor and 22 node types
- **Edit History** - Track and restore AI-made changes with diff view
- **RAG** - Retrieval-Augmented Generation for intelligent search across your vault
- **Web Search** - Access up-to-date information via Google Search
- **Image Generation** - Create images with Gemini image models

## API Key / CLI Options

This plugin requires a Google Gemini API key or a CLI tool. You can choose between:

| Feature | Free API Key | Paid API Key | CLI |
|---------|--------------|--------------|-----|
| Basic chat | ✅ | ✅ | ✅ |
| Vault operations | ✅ | ✅ | Read/Search only |
| Web Search | ✅ | ✅ | ❌ |
| RAG | ✅ (limited) | ✅ | ❌ |
| Workflow | ✅ | ✅ | ✅ |
| Image Generation | ❌ | ✅ | ❌ |
| Models | Flash, Gemma | Flash, Pro, Image | Gemini CLI, Claude Code, Codex |
| Cost | **Free** | Pay per use | **Free** |

> [!TIP]
> **CLI Options** let you use flagship models with just an account - no API key needed!
> - **Gemini CLI**: Install [Gemini CLI](https://github.com/google-gemini/gemini-cli), run `gemini` and authenticate with `/auth`
> - **Claude CLI**: Install [Claude Code](https://github.com/anthropics/claude-code) (`npm install -g @anthropic-ai/claude-code`), run `claude` and authenticate
> - **Codex CLI**: Install [Codex CLI](https://github.com/openai/codex) (`npm install -g @openai/codex`), run `codex` and authenticate

### Free API Key Tips

- **Rate limits** are per-model and reset daily. Switch models to continue working.
- **RAG sync** is limited. Run "Sync Vault" daily - already uploaded files are skipped.
- **Gemma models** and **Gemini CLI** don't support vault operations in Chat, but **Workflows can still read/write notes** using `note`, `note-read`, and other node types. `{content}` and `{selection}` variables also work.

---

# AI Chat

The AI Chat feature provides an interactive conversation interface with Google Gemini, integrated with your Obsidian vault.

![Chat Interface](chat.png)

## Slash Commands

Create reusable prompt templates triggered by `/`:

- Define templates with `{selection}` (selected text) and `{content}` (active note)
- Optional model and search override per command
- Type `/` to see available commands

**Default:** `/infographic` - Converts content to HTML infographic

![Infographic Example](chat_infographic.png)

## @ Mentions

Reference files and variables by typing `@`:

- `{selection}` - Selected text
- `{content}` - Active note content
- Any vault file - Browse and insert (path only; AI reads content via tools)

> [!NOTE]
> Vault file @mentions insert only the file path - the AI reads content via tools. This doesn't work with Gemma models (no vault tool support). Gemini CLI can read files via shell, but response format may differ.

## File Attachments

Attach files directly: Images (PNG, JPEG, GIF, WebP), PDFs, Text files

## Function Calling (Vault Operations)

The AI can interact with your vault using these tools:

| Tool | Description |
|------|-------------|
| `read_note` | Read note content |
| `create_note` | Create new notes |
| `propose_edit` | Edit with confirmation dialog |
| `propose_delete` | Delete with confirmation dialog |
| `bulk_propose_edit` | Bulk edit multiple files with selection dialog |
| `bulk_propose_delete` | Bulk delete multiple files with selection dialog |
| `search_notes` | Search vault by name or content |
| `list_notes` | List notes in folder |
| `rename_note` | Rename/move notes |
| `create_folder` | Create new folders |
| `list_folders` | List folders in vault |
| `get_active_note_info` | Get info about active note |
| `get_rag_sync_status` | Check RAG sync status |

### Vault Tool Mode

Control which vault tools the AI can use via the Database icon (📦) below the attachment button:

| Mode | Description | Tools Available |
|------|-------------|-----------------|
| **Vault: All** | Full vault access | All tools |
| **Vault: No search** | Exclude search tools | All except `search_notes`, `list_notes` |
| **Vault: Off** | No vault access | None |

**Automatic mode selection:**

| Condition | Default Mode | Changeable |
|-----------|--------------|------------|
| CLI models (Gemini/Claude/Codex CLI) | Vault: Off | No |
| Gemma models | Vault: Off | No |
| Web Search enabled | Vault: Off | No |
| Flash Lite + RAG | Vault: Off | No |
| RAG enabled | Vault: No search | Yes |
| No RAG | Vault: All | Yes |

> **Tip:** When using RAG, "Vault: No search" is recommended to avoid redundant searches - RAG already provides semantic search across your vault.

## Safe Editing

When AI uses `propose_edit`:
1. A confirmation dialog shows the proposed changes
2. Click **Apply** to write changes to the file
3. Click **Discard** to cancel without modifying the file

> Changes are NOT written until you confirm.

## Edit History

Track and restore changes made to your notes:

- **Automatic tracking** - All AI edits (chat, workflow) and manual changes are recorded
- **View history** - Command: "Show edit history" or use the command palette
- **Diff view** - See exactly what changed with color-coded additions/deletions
- **Restore** - Revert to any previous version with one click
- **Resizable modal** - Drag to move, resize from corners

**Diff display:**
- `+` lines existed in the older version
- `-` lines were added in the newer version

**How it works:**

Edit history uses a snapshot-based approach:

1. **Snapshot creation** - When a file is first opened or modified by AI, a snapshot of its content is saved
2. **Diff recording** - When the file is modified, the difference between the new content and the snapshot is recorded as a history entry
3. **Snapshot update** - The snapshot is updated to the new content after each modification
4. **Restore** - To restore to a previous version, diffs are applied in reverse from the snapshot

**When history is recorded:**
- AI chat edits (`propose_edit` tool)
- Workflow note modifications (`note` node)
- Manual saves via command
- Auto-detection when file differs from snapshot on open

**Storage location:**
- History files: `{workspaceFolder}/history/{filename}.history.md`
- Snapshot files: `{workspaceFolder}/history/{filename}.snapshot.md`

**Settings:**
- Enable/disable in plugin settings
- Configure context lines for diffs
- Set retention limits (max entries per file, max age)

![Edit History Modal](edit_history.png)

## RAG

Retrieval-Augmented Generation for intelligent vault search:

- **Supported files** - Markdown, PDF, Images (PNG, JPEG, GIF, WebP)
- **Internal mode** - Sync vault files to Google File Search
- **External mode** - Use existing store IDs
- **Incremental sync** - Only upload changed files
- **Target folders** - Specify folders to include
- **Exclude patterns** - Regex patterns to exclude files

![RAG Settings](setting_rag.png)

---

# Workflow Builder

Build automated multi-step workflows directly in Markdown files. **No programming knowledge required** - just describe what you want in natural language, and the AI will create the workflow for you.

![Visual Workflow Editor](visual_workflow.png)

## AI-Powered Workflow Creation

**You don't need to learn YAML syntax or node types.** Simply describe your workflow in plain language:

1. Open the **Workflow** tab in the Gemini sidebar
2. Select **+ New (AI)** from the dropdown
3. Describe what you want: *"Create a workflow that summarizes the selected note and saves it to a summaries folder"*
4. Click **Generate** - the AI creates the complete workflow

![Create Workflow with AI](create_workflow_with_ai.png)

**Modify existing workflows the same way:**
1. Load any workflow
2. Click the **AI Modify** button
3. Describe changes: *"Add a step to translate the summary to Japanese"*
4. Review and apply

![AI Workflow Modification](modify_workflow_with_ai.png)

## Quick Start (Manual)

You can also write workflows manually. Add a workflow code block to any Markdown file:

````markdown
```workflow
name: Quick Summary
nodes:
  - id: input
    type: dialog
    title: Enter topic
    inputTitle: Topic
    saveTo: topic
  - id: generate
    type: command
    prompt: "Write a brief summary about {{topic.input}}"
    saveTo: result
  - id: save
    type: note
    path: "summaries/{{topic.input}}.md"
    content: "{{result}}"
    mode: create
```
````

Open the **Workflow** tab in the Gemini sidebar to run it.

## Available Node Types

22 node types are available for building workflows:

| Category | Nodes |
|----------|-------|
| Variables | `variable`, `set` |
| Control | `if`, `while` |
| LLM | `command` |
| Data | `http`, `json` |
| Notes | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` |
| Files | `file-explorer`, `file-save` |
| Prompts | `prompt-file`, `prompt-selection`, `dialog` |
| Composition | `workflow` |
| RAG | `rag-sync` |
| External | `mcp`, `obsidian-command` |

> **For detailed node specifications and examples, see [WORKFLOW_NODES.md](WORKFLOW_NODES.md)**

## Hotkey Mode

Assign keyboard shortcuts to run workflows instantly:

1. Add a `name:` field to your workflow
2. Open the workflow file and select the workflow from dropdown
3. Click the keyboard icon (⌨️) in the Workflow panel footer
4. Go to Settings → Hotkeys → search "Workflow: [Your Workflow Name]"
5. Assign a hotkey (e.g., `Ctrl+Shift+T`)

When triggered by hotkey:
- `prompt-file` uses the active file automatically (no dialog)
- `prompt-selection` uses the current selection, or full file content if no selection

## Event Triggers

Workflows can be automatically triggered by Obsidian events:

![Event Trigger Settings](event_setting.png)

| Event | Description |
|-------|-------------|
| File Created | Triggered when a new file is created |
| File Modified | Triggered when a file is saved (debounced 5s) |
| File Deleted | Triggered when a file is deleted |
| File Renamed | Triggered when a file is renamed |
| File Opened | Triggered when a file is opened |

**Event trigger setup:**
1. Add a `name:` field to your workflow
2. Open the workflow file and select the workflow from dropdown
3. Click the zap icon (⚡) in the Workflow panel footer
4. Select which events should trigger the workflow
5. Optionally add a file pattern filter

**File pattern examples:**
- `**/*.md` - All Markdown files in any folder
- `journal/*.md` - Markdown files in journal folder only
- `*.md` - Markdown files in root folder only
- `**/{daily,weekly}/*.md` - Files in daily or weekly folders
- `projects/[a-z]*.md` - Files starting with lowercase letter

**Event variables:** When triggered by an event, these variables are set automatically:

| Variable | Description |
|----------|-------------|
| `__eventType__` | Event type: `create`, `modify`, `delete`, `rename`, `file-open` |
| `__eventFilePath__` | Path of the affected file |
| `__eventFile__` | JSON with file info (path, basename, name, extension) |
| `__eventFileContent__` | File content (for create/modify/file-open events) |
| `__eventOldPath__` | Previous path (for rename events only) |

> **Note:** `prompt-file` and `prompt-selection` nodes automatically use the event file when triggered by events. `prompt-selection` uses the entire file content as the selection.

---

# Common

## Supported Models

### Paid Plan
| Model | Description |
|-------|-------------|
| Gemini 3 Flash Preview | Fast model, 1M context (default) |
| Gemini 3 Pro Preview | Flagship model, 1M context |
| Gemini 2.5 Flash Lite | Lightweight flash model |
| Gemini 2.5 Flash (Image) | Image generation, 1024px |
| Gemini 3 Pro (Image) | Pro image generation, 4K |

### Free Plan
| Model | Vault Operations |
|-------|------------------|
| Gemini 2.5 Flash | ✅ |
| Gemini 2.5 Flash Lite | ✅ |
| Gemini 3 Flash Preview | ✅ |
| Gemma 3 (27B/12B/4B/1B) | ❌ |

## Installation

### BRAT (Recommended)
1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. Open BRAT settings → "Add Beta plugin"
3. Enter: `https://github.com/takeshy/obsidian-gemini-helper`
4. Enable the plugin in Community plugins settings

### Manual
1. Download `main.js`, `manifest.json`, `styles.css` from releases
2. Create `gemini-helper` folder in `.obsidian/plugins/`
3. Copy files and enable in Obsidian settings

### From Source
```bash
git clone https://github.com/takeshy/obsidian-gemini-helper
cd obsidian-gemini-helper
npm install
npm run build
```

## Configuration

### API Settings
1. Get API key from [ai.google.dev](https://ai.google.dev)
2. Enter in plugin settings
3. Select API plan (Free/Paid)

![Basic Settings](setting_basic.png)

### CLI Mode (Gemini / Claude / Codex)

**Gemini CLI:**
1. Install [Gemini CLI](https://github.com/google-gemini/gemini-cli)
2. Authenticate with `gemini` → `/auth`
3. Click "Verify" in Gemini CLI section

**Claude CLI:**
1. Install [Claude Code](https://github.com/anthropics/claude-code): `npm install -g @anthropic-ai/claude-code`
2. Authenticate with `claude`
3. Click "Verify" in Claude CLI section

**Codex CLI:**
1. Install [Codex CLI](https://github.com/openai/codex): `npm install -g @openai/codex`
2. Authenticate with `codex`
3. Click "Verify" in Codex CLI section

**CLI Limitations:** Read-only vault operations, no semantic/web search

### Workspace Settings
- **Workspace Folder** - Chat history and settings location
- **System Prompt** - Additional AI instructions
- **Tool Limits** - Control function call limits
- **Edit History** - Track and restore AI-made changes

![Tool Limits & Edit History](setting_tool_history.png)

### Slash Commands
- Define custom prompt templates triggered by `/`
- Optional model and search override per command

![Slash Commands](setting_slash_command.png)

## Usage

### Opening Chat
- Click Gemini icon in ribbon
- Command: "Gemini Helper: Open chat"
- Toggle: "Gemini Helper: Toggle chat / editor"

### Chat Controls
- **Enter** - Send message
- **Shift+Enter** - New line
- **Stop button** - Stop generation
- **+ button** - New chat
- **History button** - Load previous chats

### Using Workflows
1. Open **Workflow** tab in sidebar
2. Open a file with `workflow` code block
3. Select workflow from dropdown
4. Click **Run** to execute
5. Click **History** to view past runs

![Workflow History](workflow_history.png)

**Export to Canvas:** View execution history as an Obsidian Canvas for visual analysis.

![History Canvas View](history_canvas.png)

### AI Workflow Generation

**Create New Workflow with AI:**
1. Select **+ New (AI)** from the workflow dropdown
2. Enter workflow name and output path (supports `{{name}}` variable)
3. Describe what the workflow should do in natural language
4. Select a model and click **Generate**
5. The workflow is automatically created and saved

**Modify Existing Workflow with AI:**
1. Load an existing workflow
2. Click the **AI Modify** button (sparkle icon)
3. Describe the changes you want
4. Review the before/after comparison
5. Click **Apply Changes** to update

![AI Workflow Modification](modify_workflow_with_ai.png)

**Manual Workflow Editing:**

Edit workflows directly in the visual node editor with drag-and-drop interface.

![Manual Workflow Editing](modify_workflow_manual.png)

**Reload from File:**
- Select **Reload from file** from the dropdown to re-import workflow from the markdown file

## Requirements

- Obsidian v0.15.0+
- Google AI API key, or CLI tool (Gemini CLI / Claude CLI / Codex CLI)
- Desktop and mobile supported (CLI mode: desktop only)

## Privacy

**Data stored locally:**
- API key (stored in Obsidian settings)
- Chat history (as Markdown files)
- Workflow execution history

**Data sent to Google:**
- All chat messages and file attachments are sent to Google Gemini API for processing
- When RAG is enabled, vault files are uploaded to Google File Search
- When Web Search is enabled, queries are sent to Google Search

**Data sent to third-party services:**
- Workflow `http` nodes can send data to any URL specified in the workflow

**CLI providers (optional):**
- When CLI mode is enabled, external CLI tools (gemini, claude, codex) are executed via child_process
- This only occurs when explicitly configured and verified by the user
- CLI mode is desktop-only (not available on mobile)

**Security notes:**
- Review workflows before running - `http` nodes can transmit vault data to external endpoints
- Workflow `note` nodes show a confirmation dialog before writing files (default behavior)
- Slash commands with `confirmEdits: false` will auto-apply file edits without showing Apply/Discard buttons

See [Google AI Terms of Service](https://ai.google.dev/terms) for data retention policies.

## License

MIT

## Links

- [Gemini API Docs](https://ai.google.dev/docs)
- [Obsidian Plugin Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## Support

If you find this plugin useful, consider buying me a coffee!

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee)](https://buymeacoffee.com/takeshy)
