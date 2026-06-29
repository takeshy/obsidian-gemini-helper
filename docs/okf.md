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

Gemini Helper reads registered OKF directories and injects a compact summary of the selected bundles into the chat system prompt. This gives Gemini curated domain context without requiring a separate server.

## Configure OKF Sources

1. Open Gemini Helper settings.
2. Go to **Knowledge sources**.
3. Under **OKF sources**, click **Add OKF source**.
4. Enter a display name and a directory path.
5. In chat, use the knowledge selector next to the skill selector to choose which OKF bundles are active.

Paths can be:

- Vault-relative, such as `Knowledge/okf`
- Absolute desktop paths, such as `C:\repos\knowledge-catalog\okf`

Absolute paths require desktop Obsidian because mobile Obsidian does not expose filesystem access outside the vault.

## What Gets Loaded

For each active OKF source, Gemini Helper loads Markdown files from the directory recursively and includes:

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

1. Maintain OKF bundles in the vault or in a local repository.
2. Register each OKF bundle in Gemini Helper settings.
3. In chat, activate the relevant OKF bundle for the task.
4. Combine OKF with skills when the task needs both domain context and reusable actions.

## Limitations

- OKF content is injected as prompt context, not uploaded to Gemini File Search automatically.
- Large OKF bundles are summarized with file and character limits.
- Absolute filesystem paths only work on desktop Obsidian.
