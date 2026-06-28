# Dashboard

Build a personal **home / overview page** from a responsive grid of widgets. A
dashboard is a `.dashboard` file that arranges **Bases views**, **notes**, **web
pages**, **timelines**, **kanban boards**, and **workflow output** in a
drag-and-resize grid. Open it like any note to get a live, editable board.

![Dashboard](images/dashboard.png)

- [Dashboard vs Canvas](#dashboard-vs-canvas)
- [Creating a Dashboard](#creating-a-dashboard)
- [Edit Mode](#edit-mode)
- [Widget Types](#widget-types)
  - [Base](#base--embed-a-bases-view)
  - [Markdown](#markdown--embed-a-note)
  - [Web Embed](#web-embed--embed-a-web-page)
  - [Workflow](#workflow--render-workflow-output)
  - [Kanban](#kanban--drag-cards-to-change-status)
  - [Timeline](#timeline--capture-dated-posts)
- [Responsive Layout](#responsive-layout)
- [Creating Widgets with AI](#creating-widgets-with-ai)
- [The `.dashboard` File Format](#the-dashboard-file-format)
- [Tips & Notes](#tips--notes)

---

## Dashboard vs Canvas

Obsidian's **Canvas** and a Dashboard look similar but solve different problems:

| | Dashboard | Canvas |
|---|-----------|--------|
| **Content** | **Live** — Bases views, timelines, kanban boards, workflow output, and notes update on their own | **Static** — cards are snapshots placed by hand |
| **Layout** | Responsive grid (12 columns; reflows to a single column on narrow screens) | Free-form infinite plane with absolute positions |
| **Purpose** | A structured **home / overview** page you open to check status | A space to **think** — arrange ideas and connect them with arrows |
| **AI** | Authored from chat (the `dashboard` skill builds the file and its backing `.base` data) | Manual placement |
| **Viewing** | A read-only view mode that can't be disturbed | Always editable |

In short: use a **Dashboard** for a live, at-a-glance overview (tasks, generated digests, embedded pages); use a **Canvas** for free-form, spatial thinking and relationships. The key trade-offs are **dynamic vs static** and **responsive grid vs free placement**.

---

## Creating a Dashboard

There are two ways to create a dashboard:

1. **Command** — run **"Gemini Helper: Create dashboard"** from the command palette.
   This creates a new file under the `Dashboards/` folder (named `Dashboard`,
   `Dashboard 2`, …) and opens it.
2. **Ask the AI** — the plugin ships a built-in **`dashboard`** agent skill.
   Activate it in chat and describe what you want (*"a home page with my active
   tasks, a welcome note, and today's weather"*). The AI authors the
   `.dashboard` file — and any backing `.base` files — for you.

Dashboards are stored as plain `.dashboard` files in your vault, so they sync and
version like any other note. Workflow widget results are stored separately under
`Dashboards/Data/` as normal vault files.

---

## Edit Mode

Each dashboard opens in **view mode**. Use the toolbar to switch:

- **Edit** — enter edit mode: drag widgets to move them, drag a widget's
  bottom-right corner to resize, click the **gear** to configure a widget, and
  click the **trash** to delete one.
- **+ Add widget** — open the widget palette (edit mode only).
- **Undo / Redo** — step through layout changes made this session.
- **Done** — return to view mode.

> All edits **save automatically** — there is no separate save button.

---

## Widget Types

In edit mode, click **+ Add widget** to choose a widget type:

![Add widget palette](images/dashboard_widgets.png)

### Base — embed a Bases view

Renders a named view of a `.base` file using Obsidian's **native Bases UI**
(table / cards / list / map). This is the primary data widget — use it for any
list, table, or card view of notes rather than reimplementing one.

![Base widget settings](images/dashboard_base.png)

| Setting | Description |
|---------|-------------|
| **Base file** | Vault path to the `.base` file |
| **View** | The view name to render; leave empty to use the base's first view |
| **New Base** | Create a new `.base` file under `Dashboards/Bases/` |
| **View editor** | Edit the selected view's name, type, order, sort, limit, filters, card image, list indentation, and raw YAML |
| **Create with AI / Edit with AI** | Author a new `.base` file or propose edits to the selected one with a diff before applying |

The same `.base` file can be referenced by multiple Base widgets — for example,
one widget per view (Active / Done / Backlog). If the `.base` file changes
outside the settings panel, the editor reloads it before saving so it does not
overwrite newer content with stale state.

### Markdown — embed a note

Renders an existing markdown note inline as a read-only embed (with a link to
open the full note).

![Markdown widget settings](images/dashboard_markdown.png)

| Setting | Description |
|---------|-------------|
| **Markdown note** | Vault path to the note to embed (searchable picker) |

### Web Embed — embed a web page

Embeds a web page in an iframe.

![Web Embed widget settings](images/dashboard_web.png)

| Setting | Description |
|---------|-------------|
| **URL** | The page to embed |
| **Show header** | Show a compact header with the URL and a browser-open button. Existing widgets default to on. |

> [!NOTE]
> Some sites send `X-Frame-Options` / `Content-Security-Policy` headers that
> block embedding and will appear blank.

### Workflow — render workflow output

Runs an existing [workflow](WORKFLOW_NODES.md) **headlessly** and renders its
output as Markdown or HTML. This lets you put dynamic, generated content
(digests, summaries, reports) on a dashboard.

![Workflow widget settings](images/dashboard_workflow.png)

| Setting | Description |
|---------|-------------|
| **Output format** | `Markdown` or `HTML` (HTML renders in a sandboxed iframe) |
| **Workflow** | The workflow note to run |
| **Create with AI** | Author a new workflow (or edit the selected one) for this widget |
| **Output variable** | The workflow variable that holds the output string (default `result`) |
| **Run** | Execute the workflow now and cache the result |
| **Auto-refresh interval (minutes)** | `0` = manual only; otherwise auto-runs once on open if the cached result is older than this |

> [!IMPORTANT]
> **Workflow widgets render from a cache, not live.** To avoid re-running heavy
> workflows every time the board opens, the render path reads **only** from a
> cached result. A run happens only when you:
> - click **Run** (in the widget header or the settings panel), or
> - open the dashboard and the cached result is older than the auto-refresh
>   interval.
>
> Results are stored in `Dashboards/Data/<encoded dashboard path>.json` as a
> normal vault file, so output survives reopening without bloating the
> `.dashboard` file and can be synced, pushed, pulled, reviewed, or versioned
> like any other file. The workflow must store its Markdown/HTML output in a
> string variable (default `result`) — card/table outputs are not supported.
> Because it runs unattended, the workflow must not use interactive nodes
> (`prompt-*`, `dialog`).

### Kanban — drag cards to change status

Renders notes matching a **tag** and/or **folder** filter as cards grouped into
columns by a frontmatter **status property**. Drag a card to another column to
update that note's status (written via `processFrontMatter`). Drag a card
up/down within a column to persist a manual order for that board. Click a card
to preview its note in a modal; the modal's open icon navigates to the note in a
new tab. The board is interactive in **view mode** — no need to enter edit mode
to drag cards.

![Kanban board](images/dashboard_kanban.png)

The board header shows an optional **title** (handy when a dashboard holds
several boards) and a **New** button. New opens a small modal to enter the card
title and pick its column, then creates a note already matching this board's
filters — placed in the configured folder, tagged with the configured tag, and
set to the chosen column's status. The new card appears on the board (you stay
on the dashboard); click it when you want to open the note.

Configure the board from the widget settings in edit mode:

![Kanban settings](images/dashboard_kanban_edit.png)

| Setting | Description |
|---------|-------------|
| **Board title** | Shown in the board header. Useful when several boards share a dashboard. |
| **Tag filter** | Only show notes with this tag (without `#`). Empty = all tags. |
| **Folder filter** | Only show notes whose path starts with this prefix. Empty = whole vault. |
| **Status property** | Frontmatter property that holds the card's status (default `status`). |
| **Title property** | Frontmatter property shown as the card title. Empty = file name. |
| **Columns** | Ordered list of status values. Each column has a **value** (matched against the property) and a **label** (shown as the header). |
| **Display fields** | Ordered list of frontmatter property names shown on each card below the title (e.g. `priority`, `due`). Each is shown as `name: value`; empty values are skipped, and list values are joined with commas. |
| **Show unmatched cards column** | When on, cards whose status doesn't match any column appear in an extra "Unspecified" column (default on). |

The board stores manual card order in the widget config as `cardOrder`. The
values are note paths, so the order round-trips with the `.dashboard` file.

### Timeline — capture dated posts

Stores short dated posts under `Dashboards/Timeline/<name>/`, one Markdown file
per day. Posts can include `#tags`, image attachments, and pinned items. The
widget renders a reverse-chronological feed with text/tag/date filters and a
composer for new posts. Long posts and embedded notes are collapsed by default,
with **Show more / Show less** controls and configurable line/character limits.
The composer and inline editor also include **Edit with AI** next to the image
attachment button: enter an instruction, review the generated diff in a modal,
then apply it back to the textarea.

![Timeline composer](images/timeline_input.png)

| Setting | Description |
|---------|-------------|
| **Timeline name** | Folder name under `Dashboards/Timeline/` |
| **Latest posts to show** | Initial number of recent posts to render before loading older entries |
| **Collapse after lines** | Estimated visual line threshold for showing the collapsed preview (default `8`) |
| **Collapse after characters** | Character threshold for showing the collapsed preview (default `440`) |

Each daily file is named `<YYYY-MM-DD>.md`. Posts are separated with `---` only
when the separator is followed by a timeline marker or ISO timestamp, so normal
Markdown horizontal rules inside a post body are preserved.

When a post contains `[[wikilinks]]`, clicking the link opens a preview modal
with an open icon; embedded article links can be opened separately in a new tab.

![Timeline inline editor](images/timeline_edit.png)

Use **Edit with AI** from either the composer or inline editor to send the
current draft plus your instruction to the model. The generated rewrite is shown
as a diff before it is applied back to the textarea.

![Timeline AI rewrite](images/timeline_ai.png)

Unknown widget types (e.g. from a newer plugin version) are **preserved on
save** and render as a placeholder, so editing an unfamiliar dashboard never
drops data.

---

## Responsive Layout

The grid has two breakpoints, switched by the container width:

| Breakpoint | When | Layout |
|------------|------|--------|
| **`lg`** (wide) | ≥ 768px | The layout you arrange in edit mode (default 12 columns) |
| **`sm`** (narrow) | < 768px | Widgets reflow into a **single full-width column**, stacked top-to-bottom |

By default the `sm` layout is **derived automatically** from the wide layout
(ordered by vertical position). If you move widgets while on a narrow screen,
those explicit `sm` positions are kept and the remaining widgets fill the gaps
around them.

---

## Creating Widgets with AI

Both the **Base** and **Workflow** widgets have a **Create with AI** button in
their settings panel:

- For a **Base** widget, it opens the AI authoring dialog for a `.base` file. The
  AI can inspect your notes with read-only tools (read, search, list) to discover
  the right frontmatter properties before authoring — so, for example, asking for
  a card view with cover images works without you naming the property. If a base
  is already selected, the button becomes **Edit with AI**: it shows a **diff** of
  the proposed `.base` against the current one, with an **additional instruction**
  box to refine it before you **Apply**.
- For a **Workflow** widget, it generates (or edits) a workflow tailored to the
  widget — the AI is told to produce a single Markdown/HTML string in the output
  variable and to avoid interactive nodes, so the result renders headlessly.
  After generating, the widget **runs and refreshes automatically**.

You can also author an entire dashboard from chat using the built-in
**`dashboard`** agent skill, which knows the `.dashboard` schema and the Bases
authoring reference.

---

## The `.dashboard` File Format

A `.dashboard` file is YAML. You normally never edit it by hand (the visual
editor and AI manage it), but the schema is documented here for reference and
round-trip safety.

```yaml
version: 1
grid:
  cols: 12        # column count (default 12)
  rowHeight: 80   # pixels per grid row
  gap: 8          # pixels between cells
widgets:
  - id: <uuid>                            # unique id (UUID-like string)
    type: base | markdown | web | workflow | kanban | timeline
    layout:
      lg: { x: 0, y: 0, w: 6, h: 4 }      # required: position on the wide grid
      sm: { x: 0, y: 0, w: 12, h: 4 }     # optional: auto-derived (stacked) if omitted
    config: { ... }                       # per-widget-type config (see below)
```

- **`layout.lg`** is the position on the wide (≥768px) grid. `x`/`y` are the
  0-based top-left cell; `w`/`h` are width/height in grid cells.
- **`layout.sm`** is the narrow-screen position. Omit it to auto-stack at full
  grid width.
- Place widgets so they don't overlap; stack vertically by increasing `y`.

### Per-widget `config`

```yaml
# base
config:
  base: Dashboards/Bases/Tasks.base   # vault path to the .base file
  view: Active                     # view name; omit/empty = first view

# markdown
config:
  path: Home.md                    # vault path to a markdown note

# web
config:
  url: https://example.com
  showHeader: true                    # optional; false hides the URL/open header

# workflow
config:
  workflow: workflows/Daily Digest.md  # vault path to the workflow note
  output: markdown                     # markdown | html
  outputVariable: result               # variable holding the output string
  refreshInterval: 60                  # minutes; 0/omit = manual refresh only

# kanban
config:
  tag: task                            # optional tag filter (without #)
  folder: ""                           # optional folder path prefix
  statusProperty: status               # frontmatter property holding the status
  titleProperty: ""                    # frontmatter property for card title (empty = file name)
  displayFields: [priority, due]       # frontmatter properties shown on each card
  cardOrder: [Tasks/A.md, Tasks/B.md]   # optional manual order persisted by drag/drop
  columns:                             # ordered list of status values
    - value: todo
      label: To Do
    - value: in-progress
      label: In Progress
    - value: done
      label: Done
  showUnspecified: true                # show cards with no/unknown status

# timeline
config:
  name: Journal                        # stores posts under Dashboards/Timeline/Journal/
  latestCount: 20
  collapseLineLimit: 8
  collapseCharLimit: 440
```

### Complete example

```yaml
version: 1
grid:
  cols: 12
  rowHeight: 80
  gap: 8
widgets:
  - id: tasks-active
    type: base
    layout: { lg: { x: 0, y: 0, w: 8, h: 6 } }
    config:
      base: Dashboards/Bases/Tasks.base
      view: Active
  - id: readme
    type: markdown
    layout: { lg: { x: 8, y: 0, w: 4, h: 6 } }
    config:
      path: Home.md
  - id: docs
    type: web
    layout: { lg: { x: 0, y: 6, w: 12, h: 4 } }
    config:
      url: https://help.obsidian.md
      showHeader: true
  - id: journal
    type: timeline
    layout: { lg: { x: 0, y: 10, w: 6, h: 6 } }
    config:
      name: Journal
      latestCount: 20
      collapseLineLimit: 8
      collapseCharLimit: 440
```

---

## Tips & Notes

- **Build or edit the data first.** For a Base widget, author the `.base` file
  and its views from the settings panel, or let the AI dashboard skill do it in
  one pass.
- **Group by view.** Reuse one `.base` across several Base widgets (Active /
  Done / Backlog) instead of duplicating data.
- **Keep workflow widgets cheap.** They cache results; set a sensible
  **Auto-refresh interval** instead of running them on every open, and store the
  output in `result`.
- **Desktop only.** Dashboards (like the rest of the plugin) run on Obsidian
  desktop.
- **Files live in your vault.** Dashboards are stored under `Dashboards/` as
  `.dashboard` files, workflow results under `Dashboards/Data/`, timeline posts
  under `Dashboards/Timeline/`, and generated Bases under `Dashboards/Bases/`.
  They are normal vault files and sync/version with your notes.

> See also: [Workflow Nodes](WORKFLOW_NODES.md) · [Agent Skills](SKILLS.md)
