---
name: add-tool
description: Add a new function calling tool (vault operation) for the Gemini chat. Use when adding new tools like read_note, create_note, etc.
argument-hint: "[tool-name]"
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---

# Add New Function Calling Tool

Add a new function calling tool called `$ARGUMENTS` to the Gemini chat integration.

## Required File Changes

### 1. `src/core/tools.ts`
- Add `ToolDefinition` to the appropriate tools array (read/write/delete)
- Define `name`, `description`, and `parameters` schema
- Property types: `STRING`, `BOOLEAN`, `INTEGER`, `ARRAY`, `OBJECT`
- Add to `getEnabledTools()` logic if it needs conditional enabling

### 2. `src/vault/toolExecutor.ts`
- Add `case` in `executeToolCall()` switch for the new tool name
- Implement the execution logic (typically calling methods from `notes.ts` or `search.ts`)

### 3. `src/vault/notes.ts` or `src/vault/search.ts` (if needed)
- Add the underlying vault operation method if it doesn't exist yet
- Use `app.vault` for file operations, `app.workspace` for UI operations

### 4. System prompt in `src/ui/components/Chat.tsx`
- Update the system prompt to mention the new tool's capabilities
- This helps the model know when to use the tool

## Tool Design Guidelines

- **Safe editing**: Use `propose_edit` pattern (apply changes, backup original, user confirms)
- **Read-only tools**: Always enabled; add to read tools array
- **Write tools**: Gated by `allowWrite` option
- **Delete tools**: Gated by `allowDelete` option (opt-in)
- **Naming**: Use `snake_case` (e.g., `read_note`, `create_folder`)
- **Results**: Return structured objects; large results will be truncated to 500 chars in tracing

## Verification

1. Run `npm run lint`
2. Run `npm run build`
3. Verify the tool appears in enabled tools based on its category
