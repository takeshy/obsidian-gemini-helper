---
type: Operations
title: Privacy and Data Flow
description: Explains what data remains local, what is sent to Google, and what can be sent to third-party services.
tags: [privacy, data-flow, google]
timestamp: 2026-07-04T00:00:00Z
---

# Privacy and Data Flow

Data stored locally includes the Google API key in Obsidian settings, chat history Markdown files when saving is enabled, workflow execution history, workspace RAG state, dashboard YAML files, dashboard sidecar data, and encryption settings. Chat and workflow history can be encrypted.

Data sent to Google includes chat messages, selected context, tool results included in the model conversation, and file attachments sent to the Gemini API. When RAG is enabled and synced, selected vault files are uploaded to Google File Search. When Web Search is enabled, search queries are sent to Google Search.

Data sent to third parties can include any payload sent by workflow `http` nodes, any data sent to configured MCP servers, and content loaded by web embeds or MCP Apps. Users should review workflows and MCP server configuration before running them with sensitive data.

Encrypted files cannot be read by normal AI vault chat tools. Workflows can read encrypted files through `note-read` after a password prompt, which caches the password for the current Obsidian session.

Sensitive credentials should not be stored directly in workflow YAML, HTTP headers, or MCP settings. Store secrets in encrypted files and read them at runtime.
