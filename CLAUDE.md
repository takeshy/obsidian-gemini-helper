# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Obsidian plugin for Google Gemini AI with File Search RAG capabilities. Uses `@google/genai` SDK. 

## Build Commands

```bash
npm run build    # Production build (tsc + esbuild) -> outputs main.js
npm run dev      # Development build with watch mode
```

After building, reload the plugin in Obsidian to test changes.

## Architecture

### Core Layer (`src/core/`)
- **gemini.ts** - Gemini API client wrapper
  - `GeminiClient` class with streaming chat, function calling, and RAG integration
  - `chatWithToolsStream()` - Main method for chat with tools and optional RAG
  - `messagesToHistory()` - Converts Message[] to Gemini Content[] format
- **fileSearch.ts** - File Search RAG management
  - `FileSearchManager` - Handles store creation, file sync, deletion
  - `smartSync()` - Checksum-based incremental sync with parallel uploads
- **tools.ts** - Function calling tool definitions (11 tools for vault operations)

### Vault Layer (`src/vault/`)
- **notes.ts** - Note CRUD operations + safe editing with `proposeEdit()`/`applyEdit()`/`discardEdit()`
- **search.ts** - Local vault search (filename and content)
- **toolExecutor.ts** - Maps tool calls to vault operations

### UI Layer (`src/ui/`)
- **ChatView.tsx** - Obsidian ItemView wrapper for React
- **SettingsTab.tsx** - Plugin settings UI
- **components/** - React components (Chat, MessageList, MessageBubble, InputArea)

### Key Data Flow
1. User sends message → `Chat.tsx` → `GeminiClient.chatWithToolsStream()`
2. Gemini responds with text/function calls → streamed back to UI
3. Function calls → `toolExecutor.ts` → `notes.ts`/`search.ts` → results back to Gemini
4. RAG: If enabled, `fileSearch` tool added to Gemini request for semantic search

## Important Implementation Details

### Safe Editing (`propose_edit` tool)
- Changes applied directly to file, original content backed up in memory
- User clicks Apply (confirm) or Discard (restore from backup)
- `update_note` tool disabled to force safe editing flow

### RAG Integration
- File Search Store ID stored in settings as `ragStoreId`
- Pass to `chatWithToolsStream()` to enable retrieval tool
- Store data persists on Google servers; use "Delete RAG Store" in settings to clean up

### Chat History
- Saved as Markdown files in `{chatsFolder}/{chatId}.md`
- YAML frontmatter with title, timestamps
- Messages parsed/serialized via `messagesToMarkdown()`/`parseMarkdownToMessages()`

### Streaming
- Uses SDK Chat (`this.ai.chats.create()`) for automatic thought signature handling
- AbortController for stop functionality
- `groundingMetadata` in response indicates RAG usage

## Key Types (`src/types/index.ts`)

- `Message` - Chat message with optional attachments, toolsUsed, pendingEdit, ragUsed
- `PendingEditInfo` - Tracks edit status (pending/applied/discarded)
- `StreamChunk` - Streaming response types (text, tool_call, tool_result, rag_used, error, done)
- `GeminiHelperSettings` - Plugin configuration including RAG sync state

## Notes

- Obsidian API accessed via `app.vault` (files) and `app.workspace` (UI)
- React components rendered inside Obsidian's ItemView
- File attachments converted to Base64 and sent as `inlineData` parts
