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

MCP Apps are interactive UI resources declared by MCP tools or returned in tool-result metadata. When a tool provides a `ui://` resource URI, Gemini Helper fetches the resource and renders it in a sandboxed iframe. Chat shows MCP Apps inline in assistant messages with expand and collapse controls. Workflows show MCP Apps in a modal and continue after the modal closes.

The host advertises the MCP Apps client capability and implements the `ui/initialize` handshake. After the app sends `ui/notifications/initialized`, Gemini Helper delivers the complete tool result through `ui/notifications/tool-result`, including structured content when supplied by the server.

Security behavior: MCP App iframes are sandboxed with `allow-scripts` and `allow-forms`; they cannot access the parent DOM, cookies, or local storage. Apps communicate with MCP tools through a restricted JSON-RPC bridge. The host builds a deny-by-default Content Security Policy from the UI resource's declared connection, resource, frame, and base-URI domains. HTTPS scripts and styles referenced by the app are downloaded and inlined by the host because Electron's parent policy is inherited by `srcdoc` frames.

Agent Plugins can contribute Streamable HTTP MCP servers. A tested plugin-managed server is made available automatically only while a skill from the same enabled package is active.

# Related

- [Chat](./chat.md) explains MCP in chat.
- [Workflows](./workflows.md) explains the `mcp` workflow node.
