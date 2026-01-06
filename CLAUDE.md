# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Obsidian plugin for Google Gemini AI with Chat, Workflow Automation, and Semantic Search (RAG). Uses `@google/genai` SDK. Supports alternative CLI backends (Gemini CLI, Claude CLI, Codex CLI).

## Build Commands

```bash
npm run build    # Production build (tsc + esbuild) -> outputs main.js
npm run dev      # Development build with watch mode
npm run lint     # ESLint check
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
- **tools.ts** - Function calling tool definitions (13 tools for vault operations)
- **cliProvider.ts** - CLI backend abstraction for Gemini/Claude/Codex CLIs
  - `CliProviderManager` - Manages CLI provider instances
  - Uses `child_process.spawn` with `shell: false` for security
- **mcpClient.ts** - MCP (Model Context Protocol) client for external tool servers
  - Implements Streamable HTTP transport with JSON-RPC

### Vault Layer (`src/vault/`)
- **notes.ts** - Note CRUD operations + safe editing with `proposeEdit()`/`applyEdit()`/`discardEdit()`
- **search.ts** - Local vault search (filename and content)
- **toolExecutor.ts** - Maps tool calls to vault operations

### Workflow Layer (`src/workflow/`)
- **types.ts** - Workflow node types and execution context definitions
- **parser.ts** - Parses workflow YAML from markdown code blocks
- **executor.ts** - Stack-based workflow execution engine with MAX_ITERATIONS (1000) safety
- **nodeHandlers.ts** - Individual handlers for 21 node types
- **history.ts** - Execution history tracking
- **historyCanvas.ts** - Export execution history to Obsidian Canvas
- **codeblockSync.ts** - Sync workflow changes back to markdown

### UI Layer (`src/ui/`)
- **ChatView.tsx** - Obsidian ItemView wrapper for React
- **SettingsTab.tsx** - Plugin settings UI
- **components/** - React components (Chat, MessageList, MessageBubble, InputArea)
- **components/workflow/** - Workflow-specific modals and WorkflowPanel.tsx

### Key Data Flow (Chat)
1. User sends message → `Chat.tsx` → `GeminiClient.chatWithToolsStream()`
2. Gemini responds with text/function calls → streamed back to UI
3. Function calls → `toolExecutor.ts` → `notes.ts`/`search.ts` → results back to Gemini
4. RAG: If enabled, `fileSearch` tool added to Gemini request for semantic search

### Key Data Flow (Workflow)
1. User selects workflow → `WorkflowPanel.tsx` loads from markdown code block
2. `parseWorkflowFromMarkdown()` converts YAML to `Workflow` graph
3. `WorkflowExecutor.execute()` traverses nodes using stack-based execution
4. Each node type handled by specific handler in `nodeHandlers.ts`
5. Results saved to execution history, optionally exported to Canvas

## Important Implementation Details

### Safe Editing (`propose_edit` tool)
- Changes applied directly to file, original content backed up in memory
- User clicks Apply (confirm) or Discard (restore from backup)
- `update_note` tool disabled to force safe editing flow

### RAG Integration
- Multiple RAG settings stored in workspace state file (`.gemini-workspace.json`)
- Supports internal stores (auto-synced) and external store IDs
- `RagSetting.files` tracks checksums for incremental sync
- Store data persists on Google servers; use "Delete RAG Store" in settings to clean up

### Chat History
- Saved as Markdown files in `{workspaceFolder}/chats/{chatId}.md`
- YAML frontmatter with title, timestamps
- Messages parsed/serialized via `messagesToMarkdown()`/`parseMarkdownToMessages()`

### Streaming
- Uses SDK Chat (`this.ai.chats.create()`) for automatic thought signature handling
- AbortController for stop functionality
- `groundingMetadata` in response indicates RAG usage

### Workflow Execution
- Stack-based traversal with iteration counting for loop safety
- Conditional nodes (`if`, `while`) use labeled edges ("true"/"false")
- Variables interpolated via `{{varName}}` syntax in node properties
- Sub-workflows executed recursively with variable passing
- Event triggers support glob patterns for file filtering

### MCP Integration
- External MCP servers configured via settings (`mcpServers` array)
- `McpClient` implements Streamable HTTP transport
- Session management with `Mcp-Session-Id` header
- Available in workflow `mcp` nodes

## Key Types (`src/types/index.ts`)

- `Message` - Chat message with optional attachments, toolsUsed, pendingEdit, ragUsed
- `PendingEditInfo` - Tracks edit status (pending/applied/discarded)
- `StreamChunk` - Streaming response types (text, tool_call, tool_result, rag_used, error, done)
- `GeminiHelperSettings` - Plugin configuration
- `WorkspaceState` - Per-workspace state (selected model, RAG settings)
- `RagSetting` - Individual RAG store configuration

### Workflow Types (`src/workflow/types.ts`)

- `WorkflowNodeType` - 21 node types (command, http, note, dialog, mcp, etc.)
- `Workflow` - Node graph with edges and start node
- `ExecutionContext` - Variables map and execution logs
- `PromptCallbacks` - UI callbacks for interactive nodes

## Adding New Workflow Node Types

When adding a new workflow node type, **ALL** of the following files must be updated:

1. **`src/workflow/types.ts`** - Add to `WorkflowNodeType` union type
2. **`src/workflow/parser.ts`** - Add to `isWorkflowNodeType()` function (workflow parsing validation)
3. **`src/workflow/codeblockSync.ts`** - Add to `isWorkflowNodeType()` function (YAML parsing validation)
4. **`src/workflow/workflowSpec.ts`** - Add documentation for AI workflow generation
5. **`src/workflow/nodeHandlers.ts`** - Add `handle*Node()` function and import
6. **`src/workflow/executor.ts`** - Add `case` in the switch statement to call handler and log
7. **`src/ui/components/workflow/WorkflowPanel.tsx`**:
   - Add to `NODE_TYPE_LABELS` object
   - Add to `ADDABLE_NODE_TYPES` array
   - Add to `getDefaultProperties()` switch
   - Add to `getNodeSummary()` switch
8. **`src/ui/components/workflow/NodeEditorModal.ts`**:
   - Add to `NODE_TYPE_LABELS` object
   - Add `case` in `renderPropertyFields()` switch for editor UI

**Common mistakes**:
- Forgetting `parser.ts` causes nodes to be skipped during workflow execution
- Forgetting `codeblockSync.ts` causes nodes to disappear from visual workflow when Markdown is edited
- Forgetting `executor.ts` causes node execution to fail silently

## Notes

- Obsidian API accessed via `app.vault` (files) and `app.workspace` (UI)
- React components rendered inside Obsidian's ItemView
- File attachments converted to Base64 and sent as `inlineData` parts
- CLI providers dynamically import `child_process` (unavailable on mobile)
- Desktop and mobile supported; CLI mode is desktop-only
