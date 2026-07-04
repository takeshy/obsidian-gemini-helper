---
type: Feature
title: MCP Support
description: MCP servers add external tools to chat and workflows, and MCP Apps render sandboxed interactive UI resources inside Obsidian.
tags: [mcp, tools, integrations]
timestamp: 2026-07-04T00:00:00Z
---

# MCP Support

MCP servers are configured in Settings -> MCP Servers with a name, Streamable HTTP URL, optional JSON headers, and an enabled flag. The Test connection action verifies the server and stores tool hints for display.

In chat, users enable MCP servers from the tool settings opened by the Database icon. In workflows, the `mcp` node calls configured MCP server tools.

The MCP client implements Streamable HTTP JSON-RPC and manages `Mcp-Session-Id` sessions. Tool results can include text, images, or resources.

MCP Apps are interactive UI resources returned by MCP tools. When a tool result includes a `ui://` resource URI, Gemini Helper fetches the resource and renders it in a sandboxed iframe. Chat shows MCP Apps inline in assistant messages with expand and collapse controls. Workflows show MCP Apps in a modal and continue after the modal closes.

Security behavior: MCP App iframes are sandboxed with `allow-scripts` and `allow-forms`; they cannot access the parent DOM, cookies, or local storage. Apps communicate with MCP tools through a restricted JSON-RPC bridge.

# Related

- [Chat](./chat.md) explains MCP in chat.
- [Workflows](./workflows.md) explains the `mcp` workflow node.
