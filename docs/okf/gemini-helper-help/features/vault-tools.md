---
type: Feature Reference
title: Vault Tools
description: Function-calling tools available to chat for reading, searching, creating, editing, deleting, renaming, and inspecting vault files.
tags: [chat, vault-tools, editing]
timestamp: 2026-07-04T00:00:00Z
---

# Vault Tools

Vault tools are Gemini function-calling tools used by chat to operate on the Obsidian vault. Users control them from the Database icon tool menu.

# Tool Modes

- Vault: All - full vault access through available tools.
- Vault: No search - disables `search_notes` and `list_notes` while keeping direct read/write tools.
- Vault: Off - disables vault tools.

# Chat Tools

- `read_note` - read note content.
- `create_note` - create a new note.
- `propose_edit` - propose a safe edit with Apply/Discard confirmation.
- `propose_delete` - propose file deletion with confirmation.
- `bulk_propose_edit` - propose edits to multiple files with selection UI.
- `bulk_propose_delete` - propose deletion of multiple files with selection UI.
- `search_notes` - search by name or content.
- `list_notes` - list notes in a folder.
- `rename_note` - rename or move a note.
- `bulk_propose_rename` - propose renames for multiple files.
- `create_folder` - create a vault folder.
- `list_folders` - list vault folders.
- `get_active_note_info` - inspect the active note.
- `get_rag_sync_status` - inspect RAG sync status for files, folders, or the whole store.

# Safe Editing

Chat uses proposal tools for edits and deletes by default. A file is not changed until the user confirms. `propose_edit` backs up original content in memory so Discard can restore it.

# Folder Access

Settings -> Workspace -> Folders AI can access automatically can restrict automatic chat and AI command workflow vault operations to specified vault-relative folders. Empty means whole-vault access. This does not restrict RAG, manual attachments, explicit mentions, MCP tools, scripts, or direct workflow note nodes.
