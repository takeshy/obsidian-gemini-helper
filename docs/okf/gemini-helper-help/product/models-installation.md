---
type: Product Reference
title: Models and Installation
description: Supported API plans, model availability, installation options, requirements, related plugins, and support links.
tags: [models, installation, requirements]
timestamp: 2026-11-13T00:00:00Z
---

# Models and Installation

Gemini Helper requires Obsidian v0.15.0 or later and a Google AI API key. Desktop and mobile Obsidian are supported, although absolute external OKF paths require desktop filesystem access.

Free API keys support basic chat, vault operations, web search, limited RAG sync, and workflows. Paid API keys add paid Gemini models and image generation.

# Paid Plan Models

- Gemini 4 Argon - efficient frontier reasoning with a unified 1M-token input, thinking, and output context window.
- Gemini 4 Carbon - deep reasoning for complex tasks with a unified 1M-token input, thinking, and output context window.
- Gemini 4 Hydrogen - fast agentic model with a unified 1M-token input, thinking, and output context window; supports thinking through `xhigh`.
- Gemini 3.8 Flash - fast 1M-context model.
- Gemini 3.1 Pro Preview - flagship model with 1M context; recommended for highest quality.
- Gemini 3.1 Pro Preview (Custom Tools) - optimized for agentic workflows with custom tools and bash.
- Gemini 3.5 Flash Lite - low-latency, cost-effective 1M-context model.
- Gemma 4 31B.
- Gemma 4 26B A4B MoE.
- Gemini 3 Pro (Image) - Pro image generation, up to 4K.
- Gemini 3.1 Flash (Image) - fast, low-cost image generation.
- Gemini 3.1 Flash Lite (Image) - fastest, lowest-cost image generation, up to 1K.

# Free Plan Models

- Gemini 4 Hydrogen (rate-limited free tier).
- Gemini 3.8 Flash.
- Gemini 3.5 Flash Lite.
- Gemma 4 31B.
- Gemma 4 26B A4B MoE.

# Thinking Mode

Choose a model's supported thinking level in the selector beside the model picker. Gemini 4 Hydrogen offers `default`, `low`, `medium`, `high`, and `xhigh`; `default` uses the API default of `high`. Hydrogen does not support `minimal` or disabling thinking; the legacy workflow thinking OFF option uses `low`. Other supported Gemini models offer levels up to `high`, with `minimal` where available. Gemini 3.1 Pro cannot disable thinking, so its lowest level is `low`. Gemma 4 and image models have no thinking selector. The level is remembered per model, and message keywords no longer change it.

See the [official Gemini 4 Hydrogen guide](https://aistudio.google.com/docs/whats-new-gemini-4-hydrogen) for model capabilities and thinking levels.

Gemini 4 Argon and Carbon require a paid API key. Both offer `default`, `low`, `medium`, and `high`; `default` uses the API default of `medium`. Neither supports `minimal`, `xhigh`, or disabling thinking. The legacy workflow thinking OFF option uses `low` for both models. See the official [Argon guide](https://aistudio.google.com/docs/whats-new-gemini-4-argon) and [Carbon guide](https://aistudio.google.com/docs/whats-new-gemini-4-carbon).

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
