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
// obsidian-bases
// ---------------------------------------------------------------------------

const OBSIDIAN_BASES: BuiltinSkillDefinition = {
  id: "obsidian-bases",
  name: "obsidian-bases",
  description: "Create and edit Obsidian Bases (.base files) with views, filters, formulas, and summaries. Use when working with .base files, creating database-like views of notes, or when the user mentions Bases, table views, card views, filters, or formulas in Obsidian.",
  instructions: `# Obsidian Bases Skill

## Workflow

1. **Create the file**: Create a \`.base\` file in the vault with valid YAML content
2. **Define scope**: Add \`filters\` to select which notes appear (by tag, folder, property, or date)
3. **Add formulas** (optional): Define computed properties in the \`formulas\` section
4. **Configure views**: Add one or more views (\`table\`, \`cards\`, \`list\`, or \`map\`)
5. **Validate**: Verify valid YAML with no syntax errors

## Schema

\`\`\`yaml
filters:
  and: []
  or: []
  not: []

formulas:
  formula_name: 'expression'

properties:
  property_name:
    displayName: "Display Name"

summaries:
  custom_summary_name: 'values.mean().round(3)'

views:
  - type: table | cards | list | map
    name: "View Name"
    limit: 10
    groupBy:
      property: property_name
      direction: ASC | DESC
    filters:
      and: []
    order:
      - file.name
      - property_name
      - formula.formula_name
    summaries:
      property_name: Average
\`\`\`

## Filter Syntax

\`\`\`yaml
# Single filter
filters: 'status == "done"'

# AND - all conditions must be true
filters:
  and:
    - 'status == "done"'
    - 'priority > 3'

# OR / NOT / Nested
filters:
  or:
    - file.hasTag("tag")
    - and:
        - file.hasTag("book")
        - file.hasLink("Textbook")
    - not:
        - file.hasTag("archived")
\`\`\`

### Filter Operators

| Operator | Description |
|----------|-------------|
| \`==\` | equals |
| \`!=\` | not equal |
| \`>\`, \`<\`, \`>=\`, \`<=\` | comparison |
| \`&&\`, \`\\|\\|\`, \`!\` | logical |

## Properties

### Three Types

1. **Note properties** - From frontmatter: \`author\` or \`note.author\`
2. **File properties** - File metadata: \`file.name\`, \`file.mtime\`, etc.
3. **Formula properties** - Computed: \`formula.my_formula\`

### File Properties

| Property | Type | Description |
|----------|------|-------------|
| \`file.name\` | String | File name |
| \`file.basename\` | String | Name without extension |
| \`file.path\` | String | Full path |
| \`file.folder\` | String | Parent folder |
| \`file.ext\` | String | Extension |
| \`file.size\` | Number | Size in bytes |
| \`file.ctime\` | Date | Created time |
| \`file.mtime\` | Date | Modified time |
| \`file.tags\` | List | All tags |
| \`file.links\` | List | Internal links |
| \`file.backlinks\` | List | Files linking to this |

## Formula Syntax

\`\`\`yaml
formulas:
  total: "price * quantity"
  status_icon: 'if(done, "✅", "⏳")'
  created: 'file.ctime.format("YYYY-MM-DD")'
  days_old: '(now() - file.ctime).days'
  days_until_due: 'if(due_date, (date(due_date) - today()).days, "")'
\`\`\`

**Duration**: Subtracting dates returns Duration, not a number. Always access \`.days\`, \`.hours\`, etc. before using number functions.

## View Types

### Table
\`\`\`yaml
views:
  - type: table
    name: "My Table"
    order: [file.name, status, due_date]
    summaries:
      price: Sum
\`\`\`

### Cards
\`\`\`yaml
views:
  - type: cards
    name: "Gallery"
    order: [file.name, cover_image, description]
\`\`\`

### List
\`\`\`yaml
views:
  - type: list
    name: "Simple List"
    order: [file.name, status]
\`\`\`

## Default Summary Formulas

\`Average\`, \`Min\`, \`Max\`, \`Sum\`, \`Range\`, \`Median\`, \`Stddev\`, \`Earliest\`, \`Latest\`, \`Checked\`, \`Unchecked\`, \`Empty\`, \`Filled\`, \`Unique\`

## Complete Example

\`\`\`yaml
filters:
  and:
    - file.hasTag("task")
    - 'file.ext == "md"'

formulas:
  days_until_due: 'if(due, (date(due) - today()).days, "")'
  is_overdue: 'if(due, date(due) < today() && status != "done", false)'
  priority_label: 'if(priority == 1, "🔴 High", if(priority == 2, "🟡 Medium", "🟢 Low"))'

views:
  - type: table
    name: "Active Tasks"
    filters:
      and:
        - 'status != "done"'
    order:
      - file.name
      - status
      - formula.priority_label
      - due
      - formula.days_until_due
    groupBy:
      property: status
      direction: ASC
    summaries:
      formula.days_until_due: Average
\`\`\`

## YAML Quoting Rules

- Use single quotes for formulas containing double quotes: \`'if(done, "Yes", "No")'\`
- Use double quotes for simple strings: \`"My View Name"\`
- Strings containing \`:\`, \`{\`, \`}\`, \`[\`, \`]\`, \`#\`, etc. must be quoted

## Embedding Bases

\`\`\`markdown
![[MyBase.base]]
![[MyBase.base#View Name]]
\`\`\``,
  references: [
    `[FUNCTIONS_REFERENCE.md]
# Functions Reference

## Global Functions

| Function | Description |
|----------|-------------|
| \`date(string)\` | Parse string to date (YYYY-MM-DD HH:mm:ss) |
| \`duration(string)\` | Parse duration string |
| \`now()\` | Current date and time |
| \`today()\` | Current date (time = 00:00:00) |
| \`if(condition, trueResult, falseResult?)\` | Conditional |
| \`min(n1, n2, ...)\` | Smallest number |
| \`max(n1, n2, ...)\` | Largest number |
| \`number(any)\` | Convert to number |
| \`link(path, display?)\` | Create a link |
| \`file(path)\` | Get file object |
| \`image(path)\` | Create image for rendering |

## Date Functions

Fields: \`year\`, \`month\`, \`day\`, \`hour\`, \`minute\`, \`second\`

| Function | Description |
|----------|-------------|
| \`format(pattern)\` | Format with Moment.js pattern |
| \`relative()\` | Human-readable relative time |

Duration fields: \`days\`, \`hours\`, \`minutes\`, \`seconds\`, \`milliseconds\`

Date arithmetic:
\`\`\`
"now() + \\"1 day\\""       # Tomorrow
"today() + \\"7d\\""        # A week from today
"(now() - file.ctime).days"  # Days since created
\`\`\`

## String Functions

| Function | Description |
|----------|-------------|
| \`contains(value)\` | Check substring |
| \`startsWith(query)\` | Starts with query |
| \`endsWith(query)\` | Ends with query |
| \`isEmpty()\` | Empty or not present |
| \`lower()\` | To lowercase |
| \`replace(pattern, replacement)\` | Replace pattern |
| \`split(separator)\` | Split to list |
| \`slice(start, end?)\` | Substring |

## Number Functions

| Function | Description |
|----------|-------------|
| \`abs()\` | Absolute value |
| \`ceil()\` | Round up |
| \`floor()\` | Round down |
| \`round(digits?)\` | Round to digits |
| \`toFixed(precision)\` | Fixed-point notation |

## List Functions

| Function | Description |
|----------|-------------|
| \`contains(value)\` | Element exists |
| \`filter(expression)\` | Filter by condition (uses \`value\`, \`index\`) |
| \`map(expression)\` | Transform elements |
| \`join(separator)\` | Join to string |
| \`sort()\` | Sort ascending |
| \`unique()\` | Remove duplicates |
| \`flat()\` | Flatten nested lists |

## File Functions

| Function | Description |
|----------|-------------|
| \`hasTag(...tags)\` | Has any of the tags |
| \`hasLink(otherFile)\` | Has link to file |
| \`hasProperty(name)\` | Has property |
| \`inFolder(folder)\` | In folder or subfolder |`,
  ],
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const ALL_BUILTIN_SKILLS: BuiltinSkillDefinition[] = [
  OBSIDIAN_MARKDOWN,
  JSON_CANVAS,
  OBSIDIAN_BASES,
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
