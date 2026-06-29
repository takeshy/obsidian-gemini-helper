# OKF Knowledge Sources

Gemini Helper can use Open Knowledge Format (OKF) bundles as chat knowledge sources.

OKF is a Markdown-based knowledge bundle format. Each concept is usually a Markdown file with YAML frontmatter, for example:

```markdown
---
type: Metric
title: Monthly recurring revenue
description: Recurring subscription revenue normalized to a monthly value.
tags:
  - revenue
  - finance
---

# Monthly recurring revenue

MRR is calculated from active paid subscriptions...
```

Gemini Helper reads the configured OKF directory and injects a compact summary into the chat system prompt. This gives Gemini curated domain context without requiring a separate server.

## Configure OKF

1. Open Gemini Helper settings.
2. Go to **Knowledge sources**.
3. Turn **OKF** on.
4. Set the OKF directory path.

Paths can be:

- `Knowledge` (default)
- `.Knowledge` if you want Obsidian to hide the folder
- Another vault-relative directory, such as `Knowledge/okf`
- An absolute desktop path, such as `C:\repos\knowledge-catalog\okf`

Absolute paths require desktop Obsidian because mobile Obsidian does not expose filesystem access outside the vault.

## What Gets Loaded

When OKF is enabled, Gemini Helper loads Markdown files from the configured directory recursively and includes:

- `type`
- `title`
- `description`
- `tags`
- file path
- a short excerpt from the body

`log.md` is skipped. `index.md` is treated as an index document. The loader uses conservative limits so large OKF bundles do not overwhelm the model context.

## Recommended OKF Layout

```text
okf/
  index.md
  metrics/
    mrr.md
    churn-rate.md
  datasets/
    subscriptions.md
  playbooks/
    investigate-revenue-drop.md
  log.md
```

Recommended frontmatter:

```yaml
---
type: Metric
title: Churn rate
description: Percentage of customers lost during a period.
tags:
  - revenue
  - retention
resource: bigquery://project.dataset.table
timestamp: 2026-06-29
---
```

Use normal Markdown links for relationships between OKF documents. If the OKF bundle lives inside the vault, Obsidian wikilinks are also usable, but plain Markdown links are more portable.

## Suggested Workflow

1. Maintain an OKF bundle in `Knowledge`, `.Knowledge`, or another directory.
2. Enable OKF in Gemini Helper settings.
3. Combine OKF with skills when the task needs both domain context and reusable actions.

## Limitations

- OKF content is injected as prompt context, not uploaded to Gemini File Search automatically.
- Large OKF bundles are summarized with file and character limits.
- Absolute filesystem paths only work on desktop Obsidian.
