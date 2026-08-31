---
type: Feature
title: AI Chat
description: Chat provides Gemini conversations with streaming, attachments, mentions, slash commands, vault operations, MCP tools, web search, RAG, and safe editing.
tags: [chat, tools, editing]
timestamp: 2026-07-04T00:00:00Z
---

# AI Chat

Open chat from the ribbon, the command "Gemini Helper: Open chat", or "Gemini Helper: Toggle chat / editor". Enter sends a message, Shift+Enter inserts a newline, the stop button aborts generation, the plus button starts a new chat, and the history button loads previous chats. The expand/shrink button toggles a desktop side dock between its normal width and a wider reading layout.

Slash commands are reusable prompt templates. They can insert `{selection}` and `{content}`, override the model or search setting, and are triggered by typing `/`. The default `/infographic` command turns selected or active-note content into an HTML infographic.

Mentions are inserted by typing `@`. `{selection}` expands to the captured editor selection when sent, `{content}` expands to the active note content when sent, and file mentions insert vault paths that the AI can read through tools.

Attachments can include images, PDFs, text files, audio, and video. Files are sent to Gemini as inline data where supported.

Vault tools let the AI read, create, search, rename, edit, and delete notes and folders. Editing and deletion use proposal tools by default: the user must approve changes before they are applied. Tool mode controls are:

- Vault: All - all vault tools.
- Vault: No search - read/write tools but no search or list tools.
- Vault: Off - no vault tools.

Chat can also use web search, selected RAG stores, MCP servers, active skills, and active OKF knowledge.

Chat history is stored as restoration-oriented Markdown files directly under the configured workspace folder when automatic history saving is enabled. The maximum saved history setting removes the oldest histories after the configured limit; zero means unlimited. Existing installations default to zero for backward compatibility, while new installations default to 100.

The Save as note button is separate from automatic history. It exports the current non-empty conversation as compact Markdown without frontmatter, creation metadata, timestamps, separators, or `msg-meta` comments. Files use `YYYYMMDD-HHmmss_Chat title.md`. Saving the same chat again during the session overwrites that export. The Chat settings section controls its vault-relative destination; an empty destination uses the vault root.

# Related

- [RAG Semantic Search](./rag.md) explains semantic retrieval.
- [OKF Knowledge Sources](./okf.md) explains curated prompt context.
- [MCP](./mcp.md) explains external tools.
- [Security and Privacy](../operations/security-privacy.md) explains confirmations and folder limits.
