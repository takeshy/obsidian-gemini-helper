# Gemini Helper for Obsidian

An AI-powered assistant plugin for Obsidian using Google Gemini with File Search RAG capabilities.

## Screenshots

### AI Chat Interface
![Chat Interface](chat.png)

### Settings
![Settings](settings.png)

## Features

### AI Chat Interface
- **Streaming responses** - Real-time response streaming for natural conversation flow
- **Model selection** - Switch between Gemini models directly from the chat interface
- **Chat history** - Automatically saves chat sessions in Markdown format (viewable and editable)
- **Conversation threading** - Maintains context across messages in the same chat
- **Stop generation** - Stop AI responses mid-generation with the stop button
- **Copy messages** - Easily copy any message to clipboard

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
| `get_rag_sync_status` | Check RAG sync status for files |

### Safe Editing
When the AI edits a note using `propose_edit`:
1. Changes are applied directly to the file
2. The original content is backed up in memory
3. You can review the changes and click **Apply** to confirm or **Discard** to restore

### RAG (File Search) Integration
- **Semantic search** - Search your entire vault using AI-powered semantic search
- **RAG indicator** - Shows when RAG was used to answer a question
- **Incremental sync** - Only upload changed files (checksum-based detection)
- **Target folders** - Specify which folders to include in RAG indexing
- **Exclude patterns** - Use regex patterns to exclude specific files
- **Sync progress** - Real-time progress display with cancel support
- **Store management** - Delete RAG store from settings when needed

## Supported Models

| Model | Description |
|-------|-------------|
| Gemini 3 Pro Preview | Latest flagship model with 1M context |
| Gemini 2.5 Pro | Stable pro model for complex tasks |
| Gemini 2.5 Flash | Fast and capable model |
| Gemini 2.5 Flash Lite | Lightweight flash model |
| Gemini 2.0 Flash | Fast and efficient model |
| Gemini 2.0 Flash Lite | Lightweight model for simple tasks |

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
3. Select your preferred default model

### Chat Settings
- **Chat History Folder** - Where to save chat session files (as Markdown)
- **System Prompt** - Additional instructions for the AI (e.g., "Always respond in Japanese")

### RAG Settings
- **Enable RAG** - Toggle File Search RAG feature
- **Auto Sync** - Automatically sync changed files
- **Target Folders** - Comma-separated list of folders to include (empty = all folders)
- **Excluded Patterns** - Regex patterns to exclude files (one per line)
  - Example: `^daily/` excludes files in the daily folder
  - Example: `\.excalidraw\.md$` excludes Excalidraw files

### Advanced RAG Settings
- **Reset Sync State** - Clear local sync state (re-upload all files on next sync)
- **Delete RAG Store** - Permanently delete the RAG store from Google's servers

## Usage

### Opening the Chat
- Click the Gemini icon in the left ribbon
- Or use the command palette: "Gemini Helper: Open Chat"

### Chat Commands
- **Enter** - Send message
- **Shift+Enter** - New line
- **Paperclip icon** - Attach files
- **Stop button** - Stop generation (appears while generating)
- **+ button** - Start new chat
- **History button** - View/load previous chats

### Model Selection
Use the dropdown below the input area to switch between models during a conversation.

### RAG Sync
1. Enable RAG in settings
2. Configure target folders and exclude patterns
3. Click "Sync Vault" to index your files
4. The AI will now use semantic search when answering questions
5. Look for the "RAG" indicator to see when RAG was used

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
- Desktop only (not available on mobile)

## Privacy

- Your API key is stored locally in your vault's settings
- Files are uploaded to Google's File Search API when RAG is enabled
- Chat history is stored locally in your vault as Markdown files

## License

MIT

## Links

- [Gemini API Documentation](https://ai.google.dev/docs)
- [Gemini File Search API](https://ai.google.dev/gemini-api/docs/file-search)
- [Obsidian Plugin Developer Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
