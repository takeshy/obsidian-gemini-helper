---
type: Feature
title: RAG Semantic Search
description: RAG uses Gemini File Search stores for semantic retrieval over synced vault files, with internal and external store modes.
tags: [rag, semantic-search, file-search]
timestamp: 2026-07-04T00:00:00Z
---

# RAG Semantic Search

RAG is Gemini Helper's semantic search feature. It syncs selected vault files to Google Gemini File Search and retrieves relevant chunks before the main chat response. Retrieved contexts are injected into the system prompt and emitted back to the UI as RAG sources.

Use RAG when the user wants broad retrieval over vault files, PDFs, Office documents, or images. Use vault tools when the target file is known or exact file operations are needed. Use OKF for curated concepts and stable domain knowledge.

# Supported Files

Internal sync supports:

- Markdown: `md`
- PDF: `pdf`
- Images: `png`, `jpg`, `jpeg`
- Microsoft Office: `doc`, `docx`, `xls`, `xlsx`, `pptx`

Image RAG uses the multimodal embedding model `models/gemini-embedding-2`.

# Store Modes

Internal mode creates and manages a File Search store for the selected RAG setting. Gemini Helper creates the store, uploads files, tracks checksums, deletes stale remote files, and stores sync state locally.

External mode uses existing File Search store IDs. Multiple store IDs can be configured. Gemini Helper queries them but does not sync vault files into them.

# Sync Behavior

Internal sync is checksum-based and incremental:

- Files matching supported extensions are considered.
- `targetFolders` limits sync to selected vault folders; empty means the whole vault.
- `excludePatterns` are regex patterns; invalid regexes are skipped.
- Changed files are uploaded.
- Unchanged files are skipped.
- Files removed or excluded are deleted from the remote internal store.
- Sync progress reports upload, skip, and delete actions.
- Sync can be cancelled from the settings UI.

Each synced file stores checksum, upload timestamp, and remote file ID in the RAG setting state. Full sync time is stored as `lastFullSync`.

# Metadata

Uploaded internal files include custom metadata:

- `path` - vault-relative path.
- `extension` - lowercase extension.
- `basename` - file name without extension.
- `folder` - parent folder path.
- `modified` - Obsidian mtime in Unix epoch milliseconds.
- `size` - file size in bytes.

The Metadata filter setting applies at query time. Example filters:

```text
extension = "md"
folder = "Projects" AND extension = "md"
extension = "pdf" OR folder = "notes"
size < 100000
modified > 1719763200000
new Date("2024-07-01T00:00:00Z").getTime()
```

# Chat Retrieval

Chat can use RAG and function calling together. For Gemini models where direct File Search with function calling is not supported, Gemini Helper pre-retrieves RAG context with `generateContent` and injects that context into the main request. RAG top-K is clamped to the configured limit.

Gemma image/text model paths may not support RAG; image generation does not use RAG.

# Status Tool

The `get_rag_sync_status` chat tool answers:

- A specific file's sync status.
- Unsynced files in a directory.
- Vault-level sync summary.

It can report whether a file is synced, when it was imported, whether it has changed, current checksum, stored checksum, unsynced count, files with diffs, and last full sync.

# Operations

Settings can reset sync state without deleting the remote store. For internal stores, Delete Store removes indexed data from Google File Search. Deleting a RAG setting does not automatically delete the server-side store.

Free API keys may have limited RAG sync capacity; users can run sync periodically because unchanged files are skipped.

# Related

- [OKF Knowledge Sources](./okf.md) explains curated Markdown knowledge bundles.
- [Settings](../operations/settings.md) lists all RAG settings.
- [Vault Tools](./vault-tools.md) explains exact vault operations.
