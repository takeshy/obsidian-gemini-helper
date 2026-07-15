---
type: Feature
title: OKF Knowledge Sources
description: OKF injects curated Open Knowledge Format Markdown bundles into chat as compact domain context.
tags: [okf, knowledge, markdown]
timestamp: 2026-07-04T00:00:00Z
---

# OKF Knowledge Sources

OKF is Open Knowledge Format: a vendor-neutral Markdown directory format for curated knowledge. Gemini Helper uses OKF as chat context, not as a remote File Search index. OKF is best for stable definitions, product knowledge, glossaries, metrics, datasets, playbooks, and domain concepts that should consistently guide answers.

Use OKF when the knowledge should be read as curated context. Use RAG when the assistant should semantically search a larger vault corpus. Use skills when the assistant needs reusable behavior, references, or executable workflows.

# Bundle Structure

An OKF bundle is a directory tree of Markdown files:

```text
bundle/
  index.md
  log.md
  concept.md
  group/
    index.md
    another-concept.md
```

Reserved files:

- `index.md` - directory listing for progressive disclosure.
- `log.md` - chronological update history.

Every non-reserved concept file should have YAML frontmatter with a non-empty `type` field. Recommended fields are `title`, `description`, `resource`, `tags`, and `timestamp`. Unknown frontmatter fields are allowed and should be preserved.

Root `index.md` may declare:

```yaml
---
okf_version: "0.1"
---
```

# Links and Body

Concept bodies are standard Markdown. Use normal Markdown links to connect concepts. Bundle-relative absolute links such as `/features/chat.md` and relative links such as `./chat.md` are both valid. Broken links are allowed by the OKF spec because they can represent knowledge not written yet.

Conventional headings include `# Schema`, `# Examples`, and `# Citations` when applicable.

# Configure External OKF

Settings -> Knowledge sources contains:

- OKF enabled - turn the external OKF source on or off.
- Directory - vault-relative path such as `Knowledge` or `.Knowledge`, or an absolute desktop path.

Absolute filesystem paths require desktop Obsidian because mobile Obsidian does not expose filesystem access outside the vault.

# Bundle Discovery

Gemini Helper discovers selectable bundles by finding top-level directories that directly contain `index.md`. Nested `index.md` files are treated as progressive-disclosure documents inside their parent bundle. The bundle ID is the directory path relative to the configured root. A root-level `index.md` produces the root bundle. The display name comes from `index.md` frontmatter `title` when present, otherwise the folder name.

Users can select active bundle IDs from chat. The active bundle selection is persisted on the OKF knowledge source as `activeBundleIds`.

# Prompt Loading

When a bundle is active, Gemini Helper injects only that bundle's `index.md` into the system prompt. The index acts as a table of contents; other documents stay out of the prompt until they are needed.

To read a specific document, Gemini calls `read_okf_document` with the `bundleId` shown in the prompt and a path referenced by the index. Leading slashes are accepted, and directory links resolve to their `index.md`. The tool returns the document's title, description, path, and Markdown body.

Fetched document bodies are limited to 20,000 characters so one unexpectedly large file cannot dominate a tool result. `log.md` is never returned. A clear, complete index is important because it guides the model to the documents relevant to each question.

# Built-In OKF

Gemini Helper ships a built-in OKF bundle about this plugin. It is always available as the `Gemini Helper Help` OKF option in chat, independently of the external OKF setting, but it is injected only after the user selects it or clicks the help question button. Users can then ask chat about Gemini Helper setup, chat tools, skills, workflows, RAG, OKF, MCP, dashboards, settings, security, and troubleshooting without configuring an OKF directory.

The source copy for the built-in bundle is the English OKF bundle under `docs/okf/gemini-helper-help/`. During `npm run build` and `npm run dev`, `scripts/generate-builtin-okf.mjs` reads that bundle, skips `log.md`, caps each document body at 20,000 characters, and writes a gzip+base64 generated module. Chat injects its root index and reads the bundled documents on demand.

# Relationship To RAG And Skills

OKF is prompt context. It is not uploaded to Gemini File Search automatically. RAG stores are remote File Search indexes. Skills are instruction bundles that may include references and executable workflows. These can be combined: OKF supplies domain knowledge, RAG retrieves large document evidence, and skills guide behavior or run workflows.

# Related

- [RAG Semantic Search](./rag.md) explains File Search retrieval.
- [Agent Skills](./agent-skills.md) explains skill behavior and workflows.
- [Settings](../operations/settings.md) lists OKF settings.
