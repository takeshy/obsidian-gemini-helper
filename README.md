# Gemini Helper for Obsidian

An AI-powered assistant plugin for Obsidian using Google Gemini with File Search RAG capabilities.

> **Free API Key Supported!** You can use this plugin with Google's free API key. Get your free API key at [ai.google.dev](https://ai.google.dev) - no credit card required.

## Free Plan vs Paid Plan

| Feature | Free Plan | Paid Plan |
|---------|-----------|-----------|
| Basic chat | ✅ | ✅ |
| Vault operations (Function Calling) | ✅ (Gemini models only) | ✅ |
| Web Search | ✅ | ✅ |
| Semantic Search | ✅ (with limitations) | ✅ |
| Image Generation | ❌ | ✅ |
| Available Models | Gemini 2.5 Flash, Flash Lite, 3 Flash Preview, Gemma 3 series | Gemini 3 Flash/Pro Preview, 2.5 Flash Lite, Image models |

### Free Plan Limitations

**Rate Limits (per model, resets daily)**
- When you hit a rate limit error, it only affects that specific model
- **Tip**: Switch to a different model to continue working immediately
- Limits reset once per day, so the blocked model will be available again the next day
- **Check usage**: View your token and rate limit status at [Google AI Studio API Keys](https://aistudio.google.com/apikey) → click "View Usage" button

**Semantic Search Sync**
- File uploads are limited (only a few files per sync on free plan)
- **Workaround**: Run "Sync Vault" daily - already uploaded files are skipped, so each sync continues from where it left off
- After several days of daily syncing, all your files will be indexed

**Gemma Models**
- Gemma models (3 27B/12B/4B/1B) do not support vault operations or semantic search
- However, `{content}` and `{selection}` variables still work (via @ mentions)
- This allows Obsidian-native workflows like "summarize this note" or "explain selected text"

**Search + Vault Operations Limitations**
- Web Search and vault operations cannot be used together (API limitation, applies to all models including Pro)
- Semantic Search (RAG) and vault operations can be used together on Pro models, but may not work on Flash models

## Screenshots

### AI Chat Interface
![Chat Interface](chat.png)

### Settings
![Settings](settings1.png)

### Semantic Search Settings
![Semantic Search Settings](settings2.png)

## Features

### AI Chat Interface
- **Streaming responses** - Real-time response streaming for natural conversation flow
- **Model selection** - Switch between Gemini models directly from the chat interface (selection persisted)
- **Image generation** - Generate images using Gemini image models with copy/save buttons
- **Web Search** - Search the web using Google Search for up-to-date information
- **Semantic search setting selection** - Switch between semantic search configurations from the chat interface
- **Slash commands** - Create reusable prompt templates triggered by typing `/` in chat
- **Chat history** - Automatically saves chat sessions in Markdown format (viewable and editable)
- **Conversation threading** - Maintains context across messages in the same chat
- **Stop generation** - Stop AI responses mid-generation with the stop button
- **Copy messages** - Easily copy any message to clipboard
- **Clickable links** - Internal links in AI responses can be clicked to open notes
- **Tool usage details** - Click on tool indicators to see which files were accessed

### Slash Commands
Create custom prompt templates that can be triggered by typing `/` in the chat input:
- **Custom prompts** - Define reusable prompt templates with variables
- **Model override** - Optionally set a specific model for each command
- **Search override** - Optionally set Web Search or semantic search for each command
- **Variables** - Use `{content}` for active note content, `{selection}` for selected text
- **Autocomplete** - Type `/` to see available commands, filter by typing more characters

### @ Mentions
Reference files and variables directly in your messages by typing `@`:
- **Variables** - `{selection}` (only shown when text is selected), `{content}` (active note)
- **Vault files** - Browse and insert any markdown file from your vault
- **Autocomplete** - Type `@` to see suggestions, continue typing to filter
- **Navigation** - Use Tab/Shift+Tab or arrow keys, Enter to select
- **File preview** - Press Ctrl+Shift+O or click the eye icon to preview a file before selecting
- Variables and file paths are automatically resolved when the message is sent

### File Attachments
Attach files directly to your messages:
- **Images** - PNG, JPEG, GIF, WebP
- **Documents** - PDF files
- **Text files** - Plain text, Markdown, CSV, JSON

### Function Calling (Vault Operations)
The AI can directly interact with your vault through these tools:

| Tool | Description |
|------|-------------|
| `read_note` | Read note content by name or active note |
| `create_note` | Create new notes with content and tags |
| `propose_edit` | Edit notes with preview (apply/discard buttons) |
| `search_notes` | Search by filename or content |
| `list_notes` | List notes in a folder or entire vault |
| `create_folder` | Create new folders |
| `list_folders` | List all folders in vault |
| `get_active_note_info` | Get active note metadata |
| `rename_note` | Rename or move notes |
| `delete_note` | Delete notes (disabled by default) |
| `get_rag_sync_status` | Check semantic search sync status for files |

### Safe Editing
When the AI edits a note using `propose_edit`:
1. Changes are applied directly to the file
2. The original content is backed up in memory
3. You can review the changes and click **Apply** to confirm or **Discard** to restore

### Semantic Search Integration
Semantic search uses RAG (Retrieval-Augmented Generation) to search your vault intelligently.

- **Multiple settings** - Create and manage multiple semantic search configurations
- **Semantic search** - Search your entire vault using AI-powered semantic search
- **Semantic search indicator** - Shows when semantic search was used to answer a question
- **Internal mode** - Sync your vault files to a new semantic search store
- **External mode** - Use existing semantic search stores (supports multiple store IDs)
- **Incremental sync** - Only upload changed files (checksum-based detection)
- **Target folders** - Specify which folders to include in indexing
- **Exclude patterns** - Use regex patterns to exclude specific files
- **Sync progress** - Real-time progress display with cancel support
- **Store management** - Delete semantic search store from settings when needed

## Supported Models

### Paid Plan Models
| Model | Description |
|-------|-------------|
| Gemini 3 Flash Preview | Latest fast model with 1M context (default, recommended) |
| Gemini 3 Pro Preview | Latest flagship model with 1M context |
| Gemini 2.5 Flash Lite | Lightweight flash model |
| Gemini 2.5 Flash (Image) | Fast image generation, max 1024px |
| Gemini 3 Pro (Image) | Pro quality image generation, up to 4K, Web Search supported |

### Free Plan Models
| Model | Description | Vault Operations |
|-------|-------------|------------------|
| Gemini 2.5 Flash | Free tier fast model | ✅ |
| Gemini 2.5 Flash Lite | Free tier lightweight model | ✅ |
| Gemini 3 Flash Preview | Free tier preview model | ✅ |
| Gemma 3 27B | Free tier Gemma model | ❌ |
| Gemma 3 12B | Free tier Gemma model | ❌ |
| Gemma 3 4B | Free tier Gemma model | ❌ |
| Gemma 3 1B | Free tier Gemma model | ❌ |

**Note**:
- Model selection is persisted across sessions
- Gemma models do not support vault operations (function calling) or semantic search
- Switch API plan in settings based on your API key type

## Installation

### Manual Installation
1. Download the latest release (`main.js`, `manifest.json`, `styles.css`)
2. Create a folder `gemini-helper` in your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into the folder
4. Enable the plugin in Obsidian Settings > Community Plugins

### From Source
```bash
git clone https://github.com/your-repo/obsidian-gemini-helper
cd obsidian-gemini-helper
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugin folder.

## Configuration

### API Settings
1. Get a Google AI API key from [ai.google.dev](https://ai.google.dev)
2. Enter the API key in plugin settings
3. Select your API plan (Paid or Free) based on your API key type
4. Select your preferred default model

### Workspace Settings
- **Workspace Folder** - Where to save chat histories and semantic search settings
- **Save Chat History** - Toggle to enable/disable saving chat sessions
- **System Prompt** - Additional instructions for the AI (e.g., "Always respond in Japanese")

### Slash Commands Settings
1. Go to **Slash commands** section in settings
2. Click **Add command** to create a new slash command
3. Configure:
   - **Command name** - The trigger name (e.g., `translate` for `/translate`)
   - **Description** - Brief description shown in autocomplete
   - **Prompt template** - The prompt text with optional variables:
     - `{content}` - Replaced with the active note's content
     - `{selection}` - Replaced with the currently selected text
   - **Model** (optional) - Override the current model when using this command
   - **Search** (optional) - Override the current search setting (None, Web search, or semantic search)
4. Use pencil icon to edit, trash icon to delete commands

### Semantic Search Settings
1. **Enable semantic search** - Toggle semantic search feature
2. **Semantic search setting** - Select or create a semantic search configuration
3. Click the **+** button to create a new semantic search setting
4. Use pencil icon to rename, trash icon to delete

#### Store Mode
- **Internal (Vault Sync)** - Sync your vault files to Google's File Search
  - **Target Folders** - Comma-separated list of folders to include (empty = all folders)
  - **Excluded Patterns** - Regex patterns to exclude files (one per line)
    - Example: `^daily/` excludes files in the daily folder
    - Example: `\.excalidraw\.md$` excludes Excalidraw files
  - **Sync Vault** - Upload files to the semantic search store
  - **Reset Sync State** - Clear local sync state (re-upload all files on next sync)
  - **Delete semantic search store** - Permanently delete the store from Google's servers

- **External (Existing Store)** - Use existing semantic search stores
  - **Semantic search store IDs** - Enter one or more store IDs (one per line)
  - Useful for sharing stores across vaults or using pre-built stores

### Tool Call Limits (Rate Limit Protection)
These settings help prevent rate limit errors when using function calling:
- **Max tool calls per message** - Maximum number of tool calls allowed per message (default: 20)
- **Tool call warning threshold** - Show warning when remaining calls are at or below this number (default: 5)
- **Default list_notes limit** - Maximum notes returned by list_notes when no limit specified (default: 50)
- **Semantic search chunks (Top K)** - Number of chunks to retrieve for semantic search (default: 5, max: 20)

## Usage

### Opening the Chat
- Click the Gemini icon in the left ribbon
- Or use the command palette: "Gemini Helper: Open chat"
- Or use "Gemini Helper: Toggle chat / editor" to quickly switch between chat and your last active note (assign a hotkey in Obsidian settings for quick access)

### Chat Commands
- **Enter** - Send message
- **Shift+Enter** - New line
- **Paperclip icon** - Attach files
- **Stop button** - Stop generation (appears while generating)
- **+ button** - Start new chat
- **History button** - View/load previous chats

### Model & Search Selection
Use the dropdowns below the input area:
- **Model dropdown** - Switch between Gemini models during a conversation
- **Search dropdown** - Select Web Search or semantic search setting to use

### Using Slash Commands
1. Type `/` in the chat input to see available commands
2. Continue typing to filter commands (e.g., `/tr` shows commands starting with "tr")
3. Use arrow keys to navigate, Tab or Enter to select
4. The prompt template is inserted into the input with variables resolved
5. Edit if needed, then press Enter or click Send

Example commands you might create:
- `/translate` - "Translate the following to English: {selection}"
- `/summarize` - "Summarize this note: {content}"
- `/explain` - "Explain this concept: {selection}"

### Semantic Search Sync
1. Enable semantic search in settings
2. Create a new semantic search setting or select an existing one
3. Configure target folders and exclude patterns (Internal mode)
4. Click "Sync Vault" to index your files
5. Select the semantic search setting in the chat interface
6. The AI will now use semantic search when answering questions
7. Look for the semantic search indicator to see when it was used

## Project Structure

```
src/
├── main.ts              # Entry point
├── plugin.ts            # Main plugin class
├── types/
│   └── index.ts         # Type definitions
├── core/
│   ├── gemini.ts        # Gemini API client
│   ├── fileSearch.ts    # File Search RAG management
│   └── tools.ts         # Function Calling tool definitions
├── vault/
│   ├── notes.ts         # Note operations
│   ├── search.ts        # Local search
│   └── toolExecutor.ts  # Tool execution
└── ui/
    ├── ChatView.tsx     # Chat view
    ├── SettingsTab.tsx  # Settings tab
    └── components/      # React components
```

## Development

```bash
# Install dependencies
npm install

# Development build (watch mode)
npm run dev

# Production build
npm run build
```

## Tech Stack

- TypeScript
- React 19
- @google/genai (Gemini API SDK)
- esbuild
- Obsidian API

## Requirements

- Obsidian v0.15.0 or higher
- Google AI API key
- Works on both desktop and mobile

## Privacy

- Your API key is stored locally in your vault's settings
- Files are uploaded to Google's File Search API when semantic search is enabled
- Chat history is stored locally in your vault as Markdown files
- Semantic search settings are stored in `gemini-workspace.json` in your workspace folder

## License

MIT

## Links

- [Gemini API Documentation](https://ai.google.dev/docs)
- [Gemini File Search API](https://ai.google.dev/gemini-api/docs/file-search)
- [Obsidian Plugin Developer Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
