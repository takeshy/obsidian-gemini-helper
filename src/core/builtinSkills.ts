/**
 * Built-in agent skills based on https://github.com/kepano/obsidian-skills
 * These provide Gemini with knowledge of Obsidian-specific file formats.
 */

import type { LoadedSkill, SkillMetadata } from "./skillsLoader";

export const BUILTIN_SKILL_PREFIX = "__builtin__/";

export interface BuiltinSkillDefinition {
  id: string;           // e.g. "obsidian-markdown"
  name: string;
  description: string;
  instructions: string; // markdown body
  references: string[]; // reference file contents
}

// ---------------------------------------------------------------------------
// obsidian-markdown
// ---------------------------------------------------------------------------

const OBSIDIAN_MARKDOWN: BuiltinSkillDefinition = {
  id: "obsidian-markdown",
  name: "obsidian-markdown",
  description: "Create and edit Obsidian Flavored Markdown with wikilinks, embeds, callouts, properties, and other Obsidian-specific syntax. Use when working with .md files in Obsidian, or when the user mentions wikilinks, callouts, frontmatter, tags, embeds, or Obsidian notes.",
  instructions: `# Obsidian Flavored Markdown Skill

Create and edit valid Obsidian Flavored Markdown. Obsidian extends CommonMark and GFM with wikilinks, embeds, callouts, properties, comments, and other syntax. This skill covers only Obsidian-specific extensions -- standard Markdown (headings, bold, italic, lists, quotes, code blocks, tables) is assumed knowledge.

## Workflow: Creating an Obsidian Note

1. **Add frontmatter** with properties (title, tags, aliases) at the top of the file.
2. **Write content** using standard Markdown for structure, plus Obsidian-specific syntax below.
3. **Link related notes** using wikilinks (\`[[Note]]\`) for internal vault connections, or standard Markdown links for external URLs.
4. **Embed content** from other notes, images, or PDFs using the \`![[embed]]\` syntax.
5. **Add callouts** for highlighted information using \`> [!type]\` syntax.

> When choosing between wikilinks and Markdown links: use \`[[wikilinks]]\` for notes within the vault (Obsidian tracks renames automatically) and \`[text](url)\` for external URLs only.

## Internal Links (Wikilinks)

\`\`\`markdown
[[Note Name]]                          Link to note
[[Note Name|Display Text]]             Custom display text
[[Note Name#Heading]]                  Link to heading
[[Note Name#^block-id]]                Link to block
[[#Heading in same note]]              Same-note heading link
\`\`\`

Define a block ID by appending \`^block-id\` to any paragraph:

\`\`\`markdown
This paragraph can be linked to. ^my-block-id
\`\`\`

## Embeds

Prefix any wikilink with \`!\` to embed its content inline:

\`\`\`markdown
![[Note Name]]                         Embed full note
![[Note Name#Heading]]                 Embed section
![[image.png]]                         Embed image
![[image.png|300]]                     Embed image with width
![[document.pdf#page=3]]               Embed PDF page
\`\`\`

## Callouts

\`\`\`markdown
> [!note]
> Basic callout.

> [!warning] Custom Title
> Callout with a custom title.

> [!faq]- Collapsed by default
> Foldable callout (- collapsed, + expanded).
\`\`\`

Common types: \`note\`, \`tip\`, \`warning\`, \`info\`, \`example\`, \`quote\`, \`bug\`, \`danger\`, \`success\`, \`failure\`, \`question\`, \`abstract\`, \`todo\`.

## Properties (Frontmatter)

\`\`\`yaml
---
title: My Note
date: 2024-01-15
tags:
  - project
  - active
aliases:
  - Alternative Name
cssclasses:
  - custom-class
---
\`\`\`

Default properties: \`tags\` (searchable labels), \`aliases\` (alternative note names for link suggestions), \`cssclasses\` (CSS classes for styling).

## Tags

\`\`\`markdown
#tag                    Inline tag
#nested/tag             Nested tag with hierarchy
\`\`\`

Tags can contain letters, numbers (not first character), underscores, hyphens, and forward slashes.

## Comments

\`\`\`markdown
This is visible %%but this is hidden%% text.

%%
This entire block is hidden in reading view.
%%
\`\`\`

## Obsidian-Specific Formatting

\`\`\`markdown
==Highlighted text==                   Highlight syntax
\`\`\`

## Math (LaTeX)

\`\`\`markdown
Inline: $e^{i\\pi} + 1 = 0$

Block:
$$
\\frac{a}{b} = c
$$
\`\`\`

## Footnotes

\`\`\`markdown
Text with a footnote[^1].

[^1]: Footnote content.

Inline footnote.^[This is inline.]
\`\`\``,
  references: [
    `[CALLOUTS.md]
# Callouts Reference

## Supported Callout Types

| Type | Aliases |
|------|---------|
| \`note\` | - |
| \`abstract\` | \`summary\`, \`tldr\` |
| \`info\` | - |
| \`todo\` | - |
| \`tip\` | \`hint\`, \`important\` |
| \`success\` | \`check\`, \`done\` |
| \`question\` | \`help\`, \`faq\` |
| \`warning\` | \`caution\`, \`attention\` |
| \`failure\` | \`fail\`, \`missing\` |
| \`danger\` | \`error\` |
| \`bug\` | - |
| \`example\` | - |
| \`quote\` | \`cite\` |

## Foldable Callouts

\`\`\`markdown
> [!faq]- Collapsed by default
> [!faq]+ Expanded by default
\`\`\`

## Nested Callouts

\`\`\`markdown
> [!question] Outer callout
> > [!note] Inner callout
> > Nested content
\`\`\``,

    `[EMBEDS.md]
# Embeds Reference

## Notes
\`\`\`markdown
![[Note Name]]
![[Note Name#Heading]]
![[Note Name#^block-id]]
\`\`\`

## Images
\`\`\`markdown
![[image.png]]
![[image.png|640x480]]    Width x Height
![[image.png|300]]        Width only
![Alt text](https://example.com/image.png)
![Alt text|300](https://example.com/image.png)
\`\`\`

## Audio & PDF
\`\`\`markdown
![[audio.mp3]]
![[document.pdf]]
![[document.pdf#page=3]]
![[document.pdf#height=400]]
\`\`\``,

    `[PROPERTIES.md]
# Properties (Frontmatter) Reference

## Property Types

| Type | Example |
|------|---------|
| Text | \`title: My Title\` |
| Number | \`rating: 4.5\` |
| Checkbox | \`completed: true\` |
| Date | \`date: 2024-01-15\` |
| Date & Time | \`due: 2024-01-15T14:30:00\` |
| List | \`tags: [one, two]\` or YAML list |
| Links | \`related: "[[Other Note]]"\` |

## Default Properties

- \`tags\` - Note tags (searchable, shown in graph view)
- \`aliases\` - Alternative names for the note (used in link suggestions)
- \`cssclasses\` - CSS classes applied to the note

## Tags in Frontmatter

\`\`\`yaml
---
tags:
  - tag1
  - nested/tag2
---
\`\`\`

Tags can contain: letters (any language), numbers (not first character), underscores \`_\`, hyphens \`-\`, forward slashes \`/\` (for nesting).`,
  ],
};

// ---------------------------------------------------------------------------
// json-canvas
// ---------------------------------------------------------------------------

const JSON_CANVAS: BuiltinSkillDefinition = {
  id: "json-canvas",
  name: "json-canvas",
  description: "Create and edit JSON Canvas files (.canvas) with nodes, edges, groups, and connections. Use when working with .canvas files, creating visual canvases, mind maps, flowcharts, or when the user mentions Canvas files in Obsidian.",
  instructions: `# JSON Canvas Skill

## File Structure

A canvas file (\`.canvas\`) contains two top-level arrays following the JSON Canvas Spec 1.0:

\`\`\`json
{
  "nodes": [],
  "edges": []
}
\`\`\`

## Nodes

### Generic Node Attributes

| Attribute | Required | Type | Description |
|-----------|----------|------|-------------|
| \`id\` | Yes | string | Unique 16-char hex identifier |
| \`type\` | Yes | string | \`text\`, \`file\`, \`link\`, or \`group\` |
| \`x\` | Yes | integer | X position in pixels |
| \`y\` | Yes | integer | Y position in pixels |
| \`width\` | Yes | integer | Width in pixels |
| \`height\` | Yes | integer | Height in pixels |
| \`color\` | No | canvasColor | Preset \`"1"\`-\`"6"\` or hex (e.g., \`"#FF0000"\`) |

### Text Nodes

\`\`\`json
{
  "id": "6f0ad84f44ce9c17",
  "type": "text",
  "x": 0, "y": 0, "width": 400, "height": 200,
  "text": "# Hello World\\n\\nThis is **Markdown** content."
}
\`\`\`

**Newline pitfall**: Use \`\\n\` for line breaks in JSON strings. Do **not** use the literal \`\\\\n\`.

### File Nodes

| Attribute | Required | Description |
|-----------|----------|-------------|
| \`file\` | Yes | Path to file within the system |
| \`subpath\` | No | Link to heading or block (starts with \`#\`) |

### Link Nodes

| Attribute | Required | Description |
|-----------|----------|-------------|
| \`url\` | Yes | External URL |

### Group Nodes

| Attribute | Required | Description |
|-----------|----------|-------------|
| \`label\` | No | Text label for the group |
| \`background\` | No | Path to background image |
| \`backgroundStyle\` | No | \`cover\`, \`ratio\`, or \`repeat\` |

## Edges

| Attribute | Required | Default | Description |
|-----------|----------|---------|-------------|
| \`id\` | Yes | - | Unique identifier |
| \`fromNode\` | Yes | - | Source node ID |
| \`fromSide\` | No | - | \`top\`, \`right\`, \`bottom\`, or \`left\` |
| \`fromEnd\` | No | \`none\` | \`none\` or \`arrow\` |
| \`toNode\` | Yes | - | Target node ID |
| \`toSide\` | No | - | \`top\`, \`right\`, \`bottom\`, or \`left\` |
| \`toEnd\` | No | \`arrow\` | \`none\` or \`arrow\` |
| \`color\` | No | - | Line color |
| \`label\` | No | - | Text label |

## Colors

| Preset | Color |
|--------|-------|
| \`"1"\` | Red |
| \`"2"\` | Orange |
| \`"3"\` | Yellow |
| \`"4"\` | Green |
| \`"5"\` | Cyan |
| \`"6"\` | Purple |

## Layout Guidelines

- Coordinates can be negative (canvas extends infinitely)
- \`x\` increases right, \`y\` increases down; position is the top-left corner
- Space nodes 50-100px apart; leave 20-50px padding inside groups
- Align to grid (multiples of 20) for cleaner layouts

## Validation Checklist

1. All \`id\` values are unique across both nodes and edges
2. Every \`fromNode\` and \`toNode\` references an existing node ID
3. Required fields are present for each node type
4. \`type\` is one of: \`text\`, \`file\`, \`link\`, \`group\`
5. JSON is valid and parseable`,
  references: [
    `[EXAMPLES.md]
# JSON Canvas Examples

## Simple Canvas with Connections

\`\`\`json
{
  "nodes": [
    {"id": "8a9b0c1d2e3f4a5b", "type": "text", "x": 0, "y": 0, "width": 300, "height": 150, "text": "# Main Idea\\n\\nThis is the central concept."},
    {"id": "1a2b3c4d5e6f7a8b", "type": "text", "x": 400, "y": -100, "width": 250, "height": 100, "text": "## Supporting Point A"},
    {"id": "2b3c4d5e6f7a8b9c", "type": "text", "x": 400, "y": 100, "width": 250, "height": 100, "text": "## Supporting Point B"}
  ],
  "edges": [
    {"id": "3c4d5e6f7a8b9c0d", "fromNode": "8a9b0c1d2e3f4a5b", "fromSide": "right", "toNode": "1a2b3c4d5e6f7a8b", "toSide": "left"},
    {"id": "4d5e6f7a8b9c0d1e", "fromNode": "8a9b0c1d2e3f4a5b", "fromSide": "right", "toNode": "2b3c4d5e6f7a8b9c", "toSide": "left"}
  ]
}
\`\`\`

## Project Board with Groups

\`\`\`json
{
  "nodes": [
    {"id": "5e6f7a8b9c0d1e2f", "type": "group", "x": 0, "y": 0, "width": 300, "height": 500, "label": "To Do", "color": "1"},
    {"id": "6f7a8b9c0d1e2f3a", "type": "group", "x": 350, "y": 0, "width": 300, "height": 500, "label": "In Progress", "color": "3"},
    {"id": "7a8b9c0d1e2f3a4b", "type": "group", "x": 700, "y": 0, "width": 300, "height": 500, "label": "Done", "color": "4"},
    {"id": "8b9c0d1e2f3a4b5c", "type": "text", "x": 20, "y": 50, "width": 260, "height": 80, "text": "## Task 1\\n\\nImplement feature X"},
    {"id": "9c0d1e2f3a4b5c6d", "type": "text", "x": 370, "y": 50, "width": 260, "height": 80, "text": "## Task 2\\n\\nReview PR #123", "color": "2"}
  ],
  "edges": []
}
\`\`\``,
  ],
};

// ---------------------------------------------------------------------------
// base + dashboard
// ---------------------------------------------------------------------------

const BASE: BuiltinSkillDefinition = {
  id: "base",
  name: "base",
  description: "Create and edit Obsidian Bases (.base files) with views, filters, formulas, and summaries. Use when working with .base files, creating database-like views of notes, or when the user mentions Bases, table views, card views, filters, or formulas in Obsidian.",
  instructions: `# Obsidian Bases Skill

Create Obsidian Bases (\`.base\`) files that display dynamic, filtered views of vault content.

## Workflow

1. **Clarify the use case** — ask what data to show, how to filter, and how to group/sort if not clear.
2. **Create the file** — use \`create_note\` with \`name: "<Name>.base"\` and \`folder: "Dashboards/Bases"\`.
3. **Define filters** — narrow down which notes appear (by tag, folder, property, or date).
4. **Add formulas** (optional) — compute derived values in the \`formulas\` section.
5. **Configure views** — add one or more views (\`table\`, \`cards\`, \`list\`, or \`map\`).
6. **Validate YAML** — ensure valid YAML with no syntax errors, proper quoting.

## File Structure

A \`.base\` file is YAML with these top-level sections (all optional):

\`\`\`yaml
filters:    # Global filters applied to all views
formulas:   # Computed properties reusable across views
properties: # Display configuration per property
summaries:  # Custom summary formula definitions
views:      # List of view configurations
\`\`\`

## Complete Example

\`\`\`yaml
filters:
  or:
    - file.hasTag("tag")
    - and:
        - file.hasTag("book")
        - file.hasLink("Textbook")
    - not:
        - file.hasTag("book")
        - file.inFolder("Required Reading")
formulas:
  formatted_price: 'if(price, price.toFixed(2) + " dollars")'
  ppu: "(price / age).toFixed(2)"
properties:
  status:
    displayName: Status
  formula.formatted_price:
    displayName: "Price"
  file.ext:
    displayName: Extension
summaries:
  customAverage: 'values.mean().round(3)'
views:
  - type: table
    name: "My table"
    limit: 10
    groupBy:
      property: note.age
      direction: DESC
    filters:
      and:
        - 'status != "done"'
        - or:
            - "formula.ppu > 5"
            - "price > 2.1"
    order:
      - file.name
      - file.ext
      - note.age
      - formula.ppu
      - formula.formatted_price
    summaries:
      formula.ppu: Average
\`\`\`

## Filters

By default a base includes every file in the vault (no \`from\`/\`source\` like SQL or Dataview). Use \`filters\` to narrow down.

Filters can be applied at two levels:
1. **Global \`filters\`** — apply to all views in the base.
2. **View-level \`filters\`** — apply only to a specific view.

Both are concatenated with \`AND\` when evaluating a view.

### Filter Structure

A filter is either a single string statement, or a recursively defined object with \`and\`, \`or\`, or \`not\` keys containing lists of filter objects or string statements.

\`\`\`yaml
# Simple
filters:
  and:
    - file.hasTag("tag")

# Complex nested
filters:
  or:
    - file.hasTag("tag")
    - and:
        - file.hasTag("book")
        - file.hasLink("Textbook")
    - not:
        - file.hasTag("book")
        - file.inFolder("Required Reading")
\`\`\`

### Filter Statements

A filter statement is a string that evaluates to truthy/falsey. It can be:
- A basic comparison using arithmetic/comparison operators.
- A function call (e.g., \`file.hasTag("book")\`).

## Formulas

Formula properties are computed values displayed across views. Stored as strings in YAML; output type depends on data and functions used.

\`\`\`yaml
formulas:
  formatted_price: 'if(price, price.toFixed(2) + " dollars")'
  ppu: "(price / age).toFixed(2)"
\`\`\`

### Property References

| Kind | Prefix | Example |
|------|--------|---------|
| Note properties (frontmatter) | \`note.\` or none | \`note.price\`, \`price\` |
| File properties | \`file.\` | \`file.size\`, \`file.ext\` |
| Formula properties | \`formula.\` | \`formula.formatted_price\` |

- Formulas can reference other formulas as long as there is no circular reference.
- Use nested quotes for text literals: \`'if(status, "Done")'\`.

## Properties

Stores display configuration per property. Used by views (e.g., table column headers use \`displayName\`).

\`\`\`yaml
properties:
  status:
    displayName: Status
  formula.formatted_price:
    displayName: "Price"
  file.ext:
    displayName: Extension
\`\`\`

Display names are NOT used in filters or formulas.

## Summaries

### Custom Summary Formulas

\`\`\`yaml
summaries:
  customAverage: 'values.mean().round(3)'
\`\`\`

In summary formulas, \`values\` is a list of all values for that property across every note in the result set. The formula should return a single Value.

### Default Summary Formulas

| Name | Input Type | Description |
|------|-----------|-------------|
| Average | Number | Mathematical mean |
| Min | Number | Smallest value |
| Max | Number | Largest value |
| Sum | Number | Sum of all numbers |
| Range | Number | Max - Min |
| Range | Date | Latest - Earliest |
| Median | Number | Mathematical median |
| Stddev | Number | Standard deviation |
| Earliest | Date | Earliest date |
| Latest | Date | Latest date |
| Checked | Boolean | Count of true values |
| Unchecked | Boolean | Count of false values |
| Empty | Any | Count of empty values |
| Filled | Any | Count of non-empty values |
| Unique | Any | Count of unique values |

## Views

Each entry in \`views\` defines a separate view of the same data.

\`\`\`yaml
views:
  - type: table
    name: "My table"
    limit: 10
    groupBy:
      property: note.age
      direction: DESC
    filters:
      and:
        - 'status != "done"'
    order:
      - file.name
      - note.age
    summaries:
      formula.ppu: Average
\`\`\`

### View Fields

| Field | Description |
|-------|-------------|
| \`type\` | View layout: \`table\`, \`cards\`, \`list\`, \`map\` |
| \`name\` | Display name; first view in list loads by default |
| \`limit\` | Max number of rows |
| \`filters\` | View-level filters (same syntax as global, concatenated with AND) |
| \`groupBy\` | Object with \`property\` and \`direction\` (\`ASC\`/\`DESC\`) |
| \`order\` | List of property names to sort by |
| \`summaries\` | Map of property names to summary formula names |

### View Types

| Type | Description | App version |
|------|-------------|-------------|
| \`table\` | Rows in a table, columns from properties | 1.9 |
| \`cards\` | Grid of cards, gallery-like with images | 1.9 |
| \`list\` | Bulleted or numbered list | 1.10 |
| \`map\` | Pins on interactive map (requires Maps plugin) | 1.10 |

### Embedding

Embed a base in any file: \`![[File.base]]\` (uses first view) or \`![[File.base#View]]\` (specific view).

## File Properties

Available for all file types (including attachments):

| Property | Type | Description |
|----------|------|-------------|
| \`file.backlinks\` | List | List of backlink files (performance heavy; prefer \`file.links\` reverse) |
| \`file.ctime\` | Date | Created time |
| \`file.embeds\` | List | List of all embeds in the note |
| \`file.ext\` | String | File extension |
| \`file.file\` | File | File object, only usable in specific functions |
| \`file.folder\` | String | Path of the file folder |
| \`file.links\` | List | List of all internal links (including frontmatter) |
| \`file.mtime\` | Date | Modified time |
| \`file.name\` | String | File name |
| \`file.basename\` | String | File name without extension |
| \`file.path\` | String | Path of the file |
| \`file.properties\` | Object | All properties on the file |
| \`file.size\` | Number | File size |
| \`file.tags\` | List | List of all tags in content and frontmatter |

### The \`this\` Object

\`this\` refers to different things depending on context:
- **Main content area**: properties of the base file itself (e.g., \`this.file.folder\`).
- **Embedded in another file**: properties of the embedding file.
- **Sidebar**: properties of the active file in main content area.

Use case: \`file.hasLink(this.file)\` replicates the backlinks pane.

## Operators

### Arithmetic

| Operator | Description |
|----------|-------------|
| \`+\` | plus |
| \`-\` | minus |
| \`*\` | multiply |
| \`/\` | divide |
| \`%\` | modulo |
| \`( )\` | parenthesis |

### Date Arithmetic

Add/subtract durations using \`+\`/\`-\` with duration strings:

| Unit | Duration |
|------|----------|
| \`y\`, \`year\`, \`years\` | year |
| \`M\`, \`month\`, \`months\` | month |
| \`d\`, \`day\`, \`days\` | day |
| \`w\`, \`week\`, \`weeks\` | week |
| \`h\`, \`hour\`, \`hours\` | hour |
| \`m\`, \`minute\`, \`minutes\` | minute |
| \`s\`, \`second\`, \`seconds\` | second |

Examples:
- \`now() + "1 day"\` — 24 hours from now
- \`file.mtime > now() - "1 week"\` — modified within last week
- \`date("2024-12-01") + "1M" + "4h" + "3m"\` — 2025-01-01 04:03:00
- Subtract two dates for millisecond difference: \`now() - file.ctime\`
- \`datetime.date()\` — date portion only
- \`datetime.format("YYYY-MM-DD")\` — formatted string

### Comparison

| Operator | Description |
|----------|-------------|
| \`==\` | equals (any type) |
| \`!=\` | not equal (any type) |
| \`>\` | greater than |
| \`<\` | less than |
| \`>=\` | greater than or equal |
| \`<=\` | less than or equal |

### Boolean

| Operator | Description |
|----------|-------------|
| \`!\` | logical not |
| \`&&\` | logical and |
| \`\\|\\|\` | logical or |

## Types

- **Strings**: \`"message"\` (single or double quotes)
- **Numbers**: \`1\`, \`(2.5)\` (parenthesis optional for clarity)
- **Booleans**: \`true\` / \`false\` (no quotes)
- **Dates**: via \`date("2025-01-01 12:00:00")\`, \`now()\`, \`today()\`
- **Lists**: \`list()\` function, access via \`[index]\`
- **Objects**: access via \`.prop\` or \`["prop"]\`
- **Links**: auto-recognized from wikilinks in frontmatter; \`link("filename")\`
- **Files**: via \`file()\` function; \`file.asLink()\` to convert

## Common Dashboard Patterns

**Task tracker** (notes with status frontmatter):
\`\`\`yaml
filters:
  and:
    - file.hasTag("task")
    - 'status != "done"'
views:
  - type: table
    name: "Active tasks"
    order:
      - file.name
      - note.priority
      - note.due
    groupBy:
      property: note.status
      direction: ASC
\`\`\`

**Recently modified notes**:
\`\`\`yaml
filters:
  and:
    - 'file.mtime > now() - "7 days"'
    - 'file.ext == "md"'
views:
  - type: table
    name: "Recently modified"
    order:
      - file.name
      - file.mtime
    limit: 20
\`\`\`

**Books by reading status**:
\`\`\`yaml
filters:
  and:
    - file.hasTag("book")
formulas:
  pages_read: 'if(read, pages, 0)'
  progress: '(pages_read / pages * 100).round(1)'
properties:
  formula.progress:
    displayName: "Progress %"
views:
  - type: cards
    name: "Library"
    order:
      - file.name
      - note.author
      - formula.progress
  - type: table
    name: "Reading list"
    filters:
      and:
        - 'status == "reading"'
    order:
      - file.name
      - note.author
      - formula.progress
\`\`\`

**Backlinks for active file** (sidebar use):
\`\`\`yaml
filters:
  and:
    - file.hasLink(this.file)
views:
  - type: list
    name: "Backlinks"
\`\`\`

## YAML Quoting Rules

- Use single quotes for formulas containing double quotes: \`'if(done, "Yes", "No")'\`
- Use double quotes for simple strings: \`"My View Name"\`
- Strings containing \`:\`, \`{\`, \`}\`, \`[\`, \`]\`, \`#\`, etc. must be quoted
- No tabs allowed; use consistent spaces for indentation

## Validation Checklist

- [ ] Valid YAML (no tabs, consistent indentation)
- [ ] Filter statements are strings (quoted)
- [ ] Formula strings properly quoted with nested quotes for literals
- [ ] Property references use correct prefix (\`note.\`, \`file.\`, \`formula.\`)
- [ ] View \`type\` is valid (\`table\`, \`cards\`, \`list\`, \`map\`)
- [ ] No circular formula references
- [ ] \`groupBy.direction\` is \`ASC\` or \`DESC\``,
  references: [
    `[FUNCTIONS_REFERENCE.md]
# Functions Reference

## Global Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| \`escapeHTML()\` | \`escapeHTML(html: string): string\` | Escape HTML special characters |
| \`date()\` | \`date(date: string): date\` | Parse YYYY-MM-DD HH:mm:ss to date |
| \`duration()\` | \`duration(value: string): duration\` | Parse duration string |
| \`file()\` | \`file(path: string | file | url): file\` | Get file object from path/link/url |
| \`html()\` | \`html(html: string): html\` | Render string as HTML |
| \`if()\` | \`if(condition, trueResult, falseResult?): any\` | Conditional; false defaults to null |
| \`image()\` | \`image(path: string | file | url): image\` | Image object for rendering |
| \`icon()\` | \`icon(name: string): icon\` | Lucide icon for display |
| \`link()\` | \`link(path: string, display?: value): Link\` | Create a Link object |
| \`list()\` | \`list(element: any): List\` | Wrap single value in a list |
| \`max()\` | \`max(value1, value2, ...): number\` | Largest of provided numbers |
| \`min()\` | \`min(value1, value2, ...): number\` | Smallest of provided numbers |
| \`now()\` | \`now(): date\` | Current date and time |
| \`number()\` | \`number(input: any): number\` | Convert to number |
| \`today()\` | \`today(): date\` | Current date at midnight |
| \`random()\` | \`random(): number\` | Random 0-1 |

## Date Functions

### Fields

| Field | Type | Description |
|------|------|-------------|
| \`.year\` | number | Year of the date |
| \`.month\` | number | Month (1-12) |
| \`.day\` | number | Day of the month |
| \`.hour\` | number | Hour (0-23) |
| \`.minute\` | number | Minute (0-59) |
| \`.second\` | number | Second (0-59) |
| \`.millisecond\` | number | Millisecond (0-999) |

### Methods

| Function | Description |
|----------|-------------|
| \`.date()\` | Date with time removed |
| \`.format(format)\` | Format with Moment.js pattern |
| \`.time()\` | Time portion as string |
| \`.relative()\` | Human-readable relative time (e.g., "3 days ago") |
| \`.isEmpty()\` | Returns false |

### Date Arithmetic

\`\`\`
now() + "1 day"              # Tomorrow
today() + "7d"               # A week from today
now() - file.ctime           # Milliseconds since created
file.mtime > now() - "1 week"  # Modified within last week
date("2024-12-01") + "1M" + "4h" + "3m"  # 2025-01-01 04:03:00
\`\`\`

Duration units: y/year/years, M/month/months, d/day/days, w/week/weeks, h/hour/hours, m/minute/minutes, s/second/seconds

## String Functions

### Fields

| Field | Type | Description |
|------|------|-------------|
| \`.length\` | number | Character count |

### Methods

| Function | Description |
|----------|-------------|
| \`.contains(value)\` | Substring check |
| \`.containsAll(...values)\` | Contains all substrings |
| \`.containsAny(...values)\` | Contains at least one |
| \`.endsWith(query)\` | Suffix check |
| \`.startsWith(query)\` | Prefix check |
| \`.isEmpty()\` | True if empty |
| \`.lower()\` | To lowercase |
| \`.upper()\` | To uppercase |
| \`.replace(pattern, replacement)\` | Replace (string or Regexp; $1, $2 for capture groups) |
| \`.repeat(count)\` | Repeat string |
| \`.reverse()\` | Reverse string |
| \`.split(separator)\` | Split to list |
| \`.slice(start, end?)\` | Substring |
| \`.title()\` | Title case (first letter of each word) |
| \`.trim()\` | Remove whitespace from both ends |

## Number Functions

| Function | Description |
|----------|-------------|
| \`.abs()\` | Absolute value |
| \`.ceil()\` | Round up |
| \`.floor()\` | Round down |
| \`.round(digits?)\` | Round to digits |
| \`.toFixed(precision)\` | Fixed-point notation |
| \`.isEmpty()\` | True if number is not present |

## List Functions

| Function | Description |
|----------|-------------|
| \`[index]\` | Access element (0-based) |
| \`.length\` | List length (field) |
| \`.contains(value)\` | Check if list contains value |
| \`.containsAll(...values)\` | Contains all of the values |
| \`.containsAny(...values)\` | Contains at least one of the values |
| \`.mean()\` | Average of numeric list |
| \`.filter(expression)\` | Filter by condition (uses value, index) |
| \`.flat()\` | Flatten nested lists |
| \`.isEmpty()\` | True if list has no elements |
| \`.join(separator)\` | Join into string |
| \`.map(expression)\` | Transform elements (uses value, index) |
| \`.reduce(expression, acc)\` | Reduce to single value (uses value, index, acc) |
| \`.reverse()\` | Reverse list |
| \`.slice(start, end?)\` | Sublist from start (inclusive) to end (exclusive) |
| \`.sort()\` | Sort list |
| \`.unique()\` | Remove duplicates |

## Any Type Functions

| Function | Description |
|----------|-------------|
| \`.isTruthy()\` | Coerce to boolean |
| \`.isType(type)\` | Type check (e.g., "string") |
| \`.toString()\` | String representation |

## File Functions

| Function | Description |
|----------|-------------|
| \`file.hasTag(...tags)\` | Has any of the tags |
| \`file.hasLink(otherFile)\` | Has link to file |
| \`file.hasProperty(name)\` | Has property |
| \`file.inFolder(folder)\` | In folder or subfolder |
| \`file.asLink(display?)\` | Convert file to Link |

## Link Functions

| Function | Description |
|----------|-------------|
| \`link.asFile()\` | Return file object if link refers to valid local file |
| \`link.linksTo(file)\` | True if the link's file has a link to the given file |

## Object Functions

| Function | Description |
|----------|-------------|
| \`object.isEmpty()\` | True if object has no own properties |
| \`object.keys()\` | List of object keys |
| \`object.values()\` | List of object values |

## Regular Expression Functions

| Function | Description |
|----------|-------------|
| \`regexp.matches(value)\` | True if regexp matches the value string |`,

    `[VIEWS_REFERENCE.md]
# Views Reference

## View Types

| Type | Description | App version |
|------|-------------|-------------|
| table | Rows in a table, columns from properties | 1.9 |
| cards | Grid of cards, gallery-like with images | 1.9 |
| list | Bulleted or numbered list | 1.10 |
| map | Pins on interactive map (requires Maps plugin) | 1.10 |

## View Configuration

| Field | Description |
|-------|-------------|
| \`type\` | View layout type |
| \`name\` | Display name; first view loads by default |
| \`limit\` | Max number of rows |
| \`filters\` | View-level filters (concatenated with AND alongside global filters) |
| \`groupBy\` | Object with \`property\` and \`direction\` (\`ASC\`/\`DESC\`) |
| \`order\` | List of property names to sort by |
| \`summaries\` | Map of property names to summary formula names |

## Sort and Group

- Sort by one or more properties in ascending or descending order.
- Group by one property to organize similar items into sections.
- Only one groupBy property is supported at a time.

Sort direction depends on property type:
- Text: A->Z or Z->A
- Number: 0->1 or 1->0
- Date: old->new or new->old

## Embedding Bases

\`\`\`markdown
![[MyBase.base]]           # Uses first view
![[MyBase.base#View Name]]  # Specific view
\`\`\`

## Toolbar

- View menu: create, edit, switch views
- Results: limit, copy, export files
- Sort: sort and group files
- Filter: filter files
- Properties: choose properties to display, create formulas
- Search: search displayed properties
- New: create a new file in the current view`,
  ],
};

// ---------------------------------------------------------------------------
// dashboard
// ---------------------------------------------------------------------------

const DASHBOARD: BuiltinSkillDefinition = {
  id: "dashboard",
  name: "dashboard",
  description: "Create Obsidian Gemini Helper Dashboards (.dashboard files): a grid of widgets that embed Bases views, notes, and web pages. Use when the user asks for a dashboard, a home/overview page, or to arrange .base views, notes, or web embeds in a grid.",
  instructions: `# Dashboard Skill

Create \`.dashboard\` files for the Gemini Helper plugin: a grid of widgets that embed
Obsidian **Bases** views, markdown notes, and web pages. Opening a \`.dashboard\`
file shows an editable widget grid (drag/resize in edit mode).

## Workflow

1. **Clarify the goal** — what should the dashboard show (tasks, notes, links)?
2. **Create the backing data first** — for data widgets, author a \`.base\` file
   (stored under \`Dashboards/Bases\`). Note its view names. You do **not** need a
   separate Bases skill: the full \`.base\` authoring reference is included below.
3. **Create the file** — use \`create_note\` with \`name: "<Name>.dashboard"\` and
   \`folder: "Dashboards"\`. The content is YAML (schema below).
4. **Lay out widgets** — give each widget an \`lg\` layout on a 12-column grid.
5. **Validate YAML** — valid YAML, every widget has \`id\`, \`type\`, \`layout.lg\`.

## File Structure

A \`.dashboard\` file is YAML (version 1):

\`\`\`yaml
version: 1
grid:
  cols: 12        # column count (default 12)
  rowHeight: 80   # pixels per grid row
  gap: 8          # pixels between cells
widgets:
  - id: <uuid>
    type: base | markdown | web | workflow | kanban
    layout:
      lg: { x: 0, y: 0, w: 6, h: 4 }   # required: position on the wide grid
      sm: { x: 0, y: 0, w: 12, h: 4 }  # optional: auto-derived (stacked) if omitted
    config: { ... }                    # per-widget-type config (see below)
\`\`\`

- \`id\` must be unique — use a UUID-like string.
- \`layout.lg\` is the position on the wide (≥768px) grid: \`x\`/\`y\` are the
  top-left cell (0-based), \`w\`/\`h\` are width/height in grid cells.
- \`sm\` (narrow screens) is auto-derived as a full-width stack if omitted.
- Place widgets so they don't overlap; stack vertically by increasing \`y\`.

## Widget Types

### \`base\` — embed an Obsidian Bases view (the primary data widget)

Renders a named view of a \`.base\` file using Obsidian's native Bases UI
(table / cards / list / map). **Use this for any list/table/card of notes** —
do not reimplement those; create a \`.base\` and point a \`base\` widget at it.

\`\`\`yaml
- id: tasks-1
  type: base
  layout: { lg: { x: 0, y: 0, w: 8, h: 6 } }
  config:
    base: Dashboards/Bases/Tasks.base   # vault path to the .base file
    view: Active                     # view name; omit/empty = the base's first view
\`\`\`

### \`markdown\` — embed an existing note

Renders an existing markdown note inline (read-only embed with a link to open).

\`\`\`yaml
- id: notes-1
  type: markdown
  layout: { lg: { x: 8, y: 0, w: 4, h: 6 } }
  config:
    path: Welcome.md              # vault path to a markdown note
\`\`\`

### \`web\` — embed a web page

\`\`\`yaml
- id: web-1
  type: web
  layout: { lg: { x: 0, y: 6, w: 6, h: 4 } }
  config:
    url: https://example.com
\`\`\`

### \`workflow\` — run a workflow and render its output

Runs an existing workflow (from \`workflows/\`) headlessly and renders the result
as Markdown or HTML. The workflow must store its output string in a variable
(default \`result\`). Card/table outputs are not supported — produce a Markdown or
HTML string.

\`\`\`yaml
- id: digest-1
  type: workflow
  layout: { lg: { x: 0, y: 6, w: 6, h: 5 } }
  config:
    workflow: workflows/Daily Digest.md  # vault path to the workflow note
    output: markdown                     # markdown | html
    outputVariable: result               # variable holding the output string
    refreshInterval: 60                  # minutes; 0/omit = manual refresh only; re-runs periodically while the dashboard is open
\`\`\`

Unknown widget types are preserved on save but render as a placeholder.

### \`kanban\` — drag-and-drop board of notes by status

Renders notes matching a tag/folder filter as cards grouped into columns by a
frontmatter status property. Drag cards between columns to update the status
(writes via \`processFrontMatter\`). Click a card to preview its note in a modal
(with an icon to open it). The header
shows an optional board title plus a **New** button that opens a modal (title +
column) and creates a note already matching the board's filters (placed in
\`folder\`, tagged with \`tag\`, set to the chosen column's status). Works in view
mode — the board is interactive without entering edit mode.

\`\`\`yaml
- id: board-1
  type: kanban
  layout: { lg: { x: 0, y: 0, w: 12, h: 6 } }
  config:
    title: Tasks                   # optional board title shown in the header
    tag: task                      # optional tag filter (without #)
    folder: ""                     # optional folder path prefix
    statusProperty: status         # frontmatter property holding the status
    titleProperty: ""              # frontmatter property for card title (empty = file name)
    columns:                       # ordered list of status values
      - value: todo
        label: To Do
      - value: in-progress
        label: In Progress
      - value: done
        label: Done
    showUnspecified: true          # show cards with no/unknown status in an extra column
\`\`\`

## Importing a .base into a Dashboard

The \`base\` widget **is** the import mechanism: set \`config.base\` to the
\`.base\` file's vault path and \`config.view\` to the view name. The same \`.base\`
can be referenced by multiple \`base\` widgets (e.g. one per view).

Recommended flow:
1. Author \`Dashboards/Bases/Tasks.base\` (defining views such as "Active", "Done").
   The \`.base\` authoring reference is included with this skill — no separate
   Bases skill needs to be activated.
2. Add \`base\` widgets to the dashboard referencing \`Dashboards/Bases/Tasks.base\`
   with each view name.

## Complete Example

\`\`\`yaml
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
\`\`\`

## Validation Checklist

- [ ] Valid YAML (no tabs, consistent indentation)
- [ ] \`version: 1\`, and \`grid\` with \`cols\`/\`rowHeight\`/\`gap\`
- [ ] Every widget has a unique \`id\`, a \`type\`, and \`layout.lg\`
- [ ] \`type\` is one of \`base\`, \`markdown\`, \`web\`, \`workflow\`, \`kanban\`
- [ ] \`base\` widgets point at an existing \`.base\` path; \`view\` matches a view name
- [ ] \`markdown\` widgets point at an existing note path
- [ ] \`kanban\` widgets define \`statusProperty\` and at least one column with \`value\` and \`label\`
- [ ] Widgets don't overlap (increase \`y\` to stack)`,
  // Fold the full Bases authoring guide in as references so the `dashboard`
  // skill is self-sufficient: activating it alone gives the model everything it
  // needs to author the backing `.base` files, without also activating `base`.
  references: [
    `[BASE_SKILL.md]\n${BASE.instructions}`,
    ...BASE.references,
  ],
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const ALL_BUILTIN_SKILLS: BuiltinSkillDefinition[] = [
  OBSIDIAN_MARKDOWN,
  JSON_CANVAS,
  BASE,
  DASHBOARD,
];

/** Default built-in skills to auto-activate in new chats. */
export const DEFAULT_BUILTIN_SKILL_IDS = ["obsidian-markdown"];

/** Get the folder path used as identifier for a built-in skill. */
export function builtinFolderPath(id: string): string {
  return `${BUILTIN_SKILL_PREFIX}${id}`;
}

/** Check if a folder path refers to a built-in skill. */
export function isBuiltinSkillPath(folderPath: string): boolean {
  return folderPath.startsWith(BUILTIN_SKILL_PREFIX);
}

/** Get metadata for all built-in skills. */
export function getBuiltinSkillMetadata(): SkillMetadata[] {
  return ALL_BUILTIN_SKILLS.map(skill => ({
    name: skill.name,
    description: skill.description,
    folderPath: builtinFolderPath(skill.id),
    skillFilePath: `${builtinFolderPath(skill.id)}/SKILL.md`,
    workflows: [],
  }));
}

/** Load a built-in skill by its folder path. Returns null if not found. */
export function loadBuiltinSkill(folderPath: string): LoadedSkill | null {
  if (!isBuiltinSkillPath(folderPath)) return null;

  const id = folderPath.slice(BUILTIN_SKILL_PREFIX.length);
  const skill = ALL_BUILTIN_SKILLS.find(s => s.id === id);
  if (!skill) return null;

  return {
    name: skill.name,
    description: skill.description,
    folderPath,
    skillFilePath: `${folderPath}/SKILL.md`,
    workflows: [],
    instructions: skill.instructions,
    references: skill.references,
  };
}

/** Get all built-in skill IDs. */
export function getBuiltinSkillIds(): string[] {
  return ALL_BUILTIN_SKILLS.map(s => s.id);
}
