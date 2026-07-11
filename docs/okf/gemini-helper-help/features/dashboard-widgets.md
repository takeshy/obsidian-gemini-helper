---
type: Feature Reference
title: Dashboard Widgets
description: Detailed behavior, settings, storage, and caveats for every built-in dashboard widget type.
tags: [dashboard, widgets, base, kanban, secret-manager, timeline]
timestamp: 2026-07-04T00:00:00Z
---

# Dashboard Widgets

Dashboard widgets are selected from the Add widget palette. Built-in types are `base`, `file`, `web`, `workflow`, `kanban`, `secret-manager`, `timeline`, and `memo-list`. Unknown widget types are preserved and shown as placeholders.

Widgets share common dashboard controls: drag to move, resize from the corner, open settings with the gear button, maximize/restore, delete from settings, and use toolbar undo/redo. The toolbar's horizontal and vertical align actions redistribute all widgets into balanced columns or rows.

# Base Widget

The Base widget renders a named view of an Obsidian `.base` file using Obsidian's native Bases UI. Use it for structured note lists, tables, card views, list views, and map views instead of rebuilding those views manually.

Settings and actions:

- Base file - vault path to the `.base` file.
- View - named view to render; empty uses the first view.
- New Base - creates a `.base` file under `Dashboards/Bases/`.
- View editor - edits view name, type, order, sort, limit, filters, card image, list indentation, and raw YAML.
- Create with AI / Edit with AI - generates or edits `.base` YAML and shows a diff before applying changes.

The same `.base` file can be used by multiple Base widgets, usually one widget per view such as Active, Done, or Backlog. If the `.base` file changed outside the settings panel, the editor reloads before saving to avoid overwriting newer content.

# File Widget

The File widget renders a vault file inline. Supported file types include Markdown, text, HTML, JSON, CSV/TSV, JavaScript/TypeScript, CSS, XML, YAML, images, PDF, and EPUB. Unsupported files show an open button.

Settings:

- File - searchable picker for the vault file path.
- Show header - shows a compact header with file path, open button, and memo button.

For document reading, selected text has context actions:

- Copy - copy selected text.
- Ask AI - prefill Chat with the selected text.
- Add to memo - attach the selected quote to a reading memo.

Memos are stored under `Dashboards/Memos/` using the source file path. Quote anchors include context when possible so memo links can jump back to repeated text more reliably. While the memo panel is open, saved memo ranges are highlighted. Empty memo text is allowed when a quote link is attached.

# Web Embed Widget

The Web widget embeds an `http` or `https` URL in an iframe.

Settings:

- URL - page URL to embed.
- Show header - shows a compact header with URL and browser-open button.

Some sites block iframes with `X-Frame-Options` or `Content-Security-Policy`; those pages may appear blank. Use the browser-open button for blocked pages.

# Workflow Widget

The Workflow widget runs an existing workflow headlessly and renders its output as Markdown or HTML. Use it for generated dashboard sections such as digests, reports, summaries, or status pages.

Settings and actions:

- Output format - `Markdown` or `HTML`; HTML renders in a sandboxed iframe.
- Workflow - workflow note to run.
- Create with AI / Edit with AI - authors or modifies a workflow for this widget.
- Output variable - workflow variable containing the output string; default is `result`.
- Run / test run - executes the workflow now and saves the sidecar cache.
- Auto-refresh interval - `0` means manual only; otherwise the widget re-runs once on open when the cache is older than the interval and can run periodically while mounted.

Workflow widgets render from cache, not directly from live execution. Results are stored in `Dashboards/Data/<encoded dashboard path>.json` so output survives reopening without bloating the `.dashboard` file. The workflow must produce a single Markdown or HTML string in the configured output variable. It should not use interactive nodes such as `prompt-file`, `prompt-selection`, or `dialog` because dashboard refresh is unattended.

# Kanban Widget

The Kanban widget renders notes matching a tag and/or folder filter as cards grouped by a frontmatter status property. Dragging a card to another column updates that note's frontmatter. Dragging within a column persists manual card order. Clicking a card opens a preview modal with an open-note action.

Settings:

- Board title - optional header title.
- Tag filter - only show notes with this tag; omit `#`; empty means all tags.
- Folder filter - only show notes whose path starts with this folder; empty means the whole vault.
- Status property - frontmatter property used for columns; default `status`.
- Title property - frontmatter property shown as card title; empty uses file name.
- Columns - ordered list of status values and labels.
- Display fields - ordered frontmatter fields shown below the title, such as `priority` or `due`.
- Show unmatched cards column - shows an "Unspecified" column for notes whose status matches no configured column.

The New button creates a note matching the board filters: folder, tag, and selected column status are written into the new note.

Kanban definitions are stored as reusable `.kanban` files under `Dashboards/Kanbans/`. Legacy inline widget definitions are migrated there when a dashboard is opened. The shared board definition stores filters, columns, title/display fields, and public board settings; per-widget card order remains in the `.dashboard` file.

# Secret Manager Widget

The Secret Manager widget lists `.encrypted` vault files and lets the user create, search, unlock, copy, edit, and open encrypted secrets from a dashboard. It uses the plugin encryption keys configured in Settings -> Encryption; chat-history and workflow-log encryption toggles do not need to be enabled.

Settings and behavior:

- Folder - optional root folder for `.encrypted` files; default is `Secrets`.
- Search - matches secret name, description, and public metadata without decrypting values.
- Detail modal - shows modified time instead of the vault path, includes an open-file action, and can unlock/copy/edit the secret.
- Public metadata - stored outside the ciphertext for search/listing and edited as frontmatter-style `key: value` pairs.
- Secret value - decrypted only in memory while unlocked and saved back encrypted.

# Timeline Widget

The Timeline widget stores short dated posts under `Dashboards/Timeline/<name>/`, one Markdown file per day. It renders a reverse-chronological feed with composer, filters, pinned posts, image attachments, inline editing, and AI-assisted rewriting.

Settings:

- Timeline name - folder name under `Dashboards/Timeline/`; sanitized for file paths.
- Latest posts to show - initial number of recent posts to render.
- Collapse after lines - visual line threshold for collapsed preview; default 8.
- Collapse after characters - character threshold for collapsed preview; default 440.

Posts can contain tags, images, and wikilinks. Long posts and embedded notes collapse with Show more / Show less. The composer and inline editor include Edit with AI, which sends the current draft plus the user instruction to Gemini and applies the rewrite only after a diff preview is accepted. Timeline image attachments are stored with the timeline data.

# MemoList Widget

The MemoList widget lists File-widget memo files under `Dashboards/Memos/`. Use it as an index for reading notes across PDFs, EPUBs, Markdown notes, and other files.

Clicking a memo row does not navigate away from the dashboard. The MemoList widget maximizes and temporarily displays the selected source file with its memo panel open. Restoring the widget returns to the MemoList.

# Unknown Widget Placeholder

If a dashboard contains a widget type that is not registered in the current plugin version, Gemini Helper renders an Unknown placeholder and preserves the widget config on save. This prevents data loss when opening dashboards created by newer versions or extensions.
