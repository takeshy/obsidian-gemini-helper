---
type: Product Reference
title: Models and Installation
description: Supported API plans, model availability, installation options, requirements, related plugins, and support links.
tags: [models, installation, requirements]
timestamp: 2026-07-04T00:00:00Z
---

# Models and Installation

Gemini Helper requires Obsidian v0.15.0 or later and a Google AI API key. Desktop and mobile Obsidian are supported, although absolute external OKF paths require desktop filesystem access.

Free API keys support basic chat, vault operations, web search, limited RAG sync, and workflows. Paid API keys add paid Gemini models and image generation.

# Paid Plan Models

- Gemini 3.1 Pro Preview - flagship model with 1M context; recommended for highest quality.
- Gemini 3.1 Pro Preview (Custom Tools) - optimized for agentic workflows with custom tools and bash.
- Gemini 3.5 Flash - fast 1M-context model with strong cost performance.
- Gemini 3.1 Flash Lite - stable, low-latency, cost-effective 1M-context model.
- Gemini 2.5 Flash - fast 1M-context model.
- Gemini 2.5 Pro - Pro 1M-context model.
- Gemini 3 Pro (Image) - Pro image generation, up to 4K.
- Gemini 3.1 Flash (Image) - fast, low-cost image generation.

# Free Plan Models

- Gemini 2.5 Flash.
- Gemini 2.5 Flash Lite.
- Gemini 3.5 Flash.
- Gemini 3.1 Flash Lite.
- Gemma 4 31B.
- Gemma 4 26B A4B MoE.

# Thinking Mode

Chat can enable thinking based on message keywords such as "think", "analyze", or "consider". Gemini 3.1 Pro always uses thinking mode. Flash model families can also be forced to always think from the tool menu; Flash is off by default and Flash Lite is on by default.

# Installation

Recommended installation is through Obsidian Community plugins: Settings -> Community plugins -> Browse -> search "Gemini Helper" -> install and enable.

BRAT can install beta versions from `https://github.com/takeshy/obsidian-gemini-helper`.

Manual installation copies `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/gemini-helper/`.

Source installation:

```bash
git clone https://github.com/takeshy/obsidian-gemini-helper
cd obsidian-gemini-helper
npm install
npm run build
```

# Related Plugins

Gemini Helper focuses exclusively on Gemini-related features. For multi-LLM support, use `obsidian-llm-hub`. For local LLM only workflows, use `obsidian-local-llm-hub`.
