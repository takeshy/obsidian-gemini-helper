# Workflow Node Reference

This document provides detailed specifications for all workflow node types. For most users, **you don't need to learn these details** - just describe what you want in natural language, and the AI will create or modify workflows for you.

## Node Types Overview

| Category | Nodes | Description |
|----------|-------|-------------|
| Variables | `variable`, `set` | Declare and update variables |
| Control | `if`, `while` | Conditional branching and loops |
| LLM | `command` | Execute prompts with model/search options |
| Data | `http`, `json` | HTTP requests and JSON parsing |
| Notes | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` | Vault operations |
| Prompts | `prompt-file`, `prompt-selection`, `dialog` | User input dialogs |
| Composition | `workflow` | Execute another workflow as a sub-workflow |
| RAG | `rag-sync` | Sync notes to semantic search store |

---

## Node Reference

### command

Execute an LLM prompt with optional model and search settings.

```yaml
- id: search
  type: command
  model: gemini-3-flash-preview  # Optional: specific model
  ragSetting: __websearch__      # Optional: __websearch__, __none__, or setting name
  prompt: "Search for {{topic}}"
  saveTo: result
```

| Property | Description |
|----------|-------------|
| `prompt` | The prompt to send to the LLM (required) |
| `model` | Override the current model (e.g., `gemini-3-flash-preview`) |
| `ragSetting` | `__websearch__` (web search), `__none__` (no search), setting name, or omit for current |
| `saveTo` | Variable name to store the response |

### note

Write content to a note file.

```yaml
- id: save
  type: note
  path: "output/{{filename}}.md"
  content: "{{result}}"
  mode: overwrite
  confirm: true
```

| Property | Description |
|----------|-------------|
| `path` | File path (required) |
| `content` | Content to write |
| `mode` | `overwrite` (default), `append`, or `create` (skip if exists) |
| `confirm` | `true` (default) shows confirmation dialog, `false` writes immediately |

### note-list

List notes with filtering and sorting.

```yaml
- id: list
  type: note-list
  folder: "Projects"
  recursive: true
  tags: "todo, project"
  tagMatch: all
  createdWithin: "7d"
  modifiedWithin: "24h"
  sortBy: modified
  sortOrder: desc
  limit: 20
  saveTo: noteList
```

| Property | Description |
|----------|-------------|
| `folder` | Folder path (empty for entire vault) |
| `recursive` | `true` includes subfolders, `false` (default) only direct children |
| `tags` | Comma-separated tags to filter (with or without `#`) |
| `tagMatch` | `any` (default) or `all` tags must match |
| `createdWithin` | Filter by creation time: `30m`, `24h`, `7d` |
| `modifiedWithin` | Filter by modification time |
| `sortBy` | `created`, `modified`, or `name` |
| `sortOrder` | `asc` or `desc` (default) |
| `limit` | Maximum results (default: 50) |
| `saveTo` | Variable for results |

**Output format:**
```json
{
  "count": 5,
  "totalCount": 12,
  "hasMore": true,
  "notes": [
    {"name": "Note1", "path": "folder/Note1.md", "created": 1234567890, "modified": 1234567900, "tags": ["#todo"]}
  ]
}
```

### http

Make HTTP requests.

```yaml
- id: fetch
  type: http
  url: "https://api.example.com/data"
  method: POST
  contentType: json
  headers: '{"Authorization": "Bearer {{token}}"}'
  body: '{"query": "{{searchTerm}}"}'
  saveTo: response
  saveStatus: statusCode
  throwOnError: "true"
```

| Property | Description |
|----------|-------------|
| `url` | Request URL (required) |
| `method` | `GET` (default), `POST`, `PUT`, `PATCH`, `DELETE` |
| `contentType` | `json` (default), `form-data`, `text` |
| `headers` | JSON object or `Key: Value` format (one per line) |
| `body` | Request body (for POST/PUT/PATCH) |
| `saveTo` | Variable for response body |
| `saveStatus` | Variable for HTTP status code |
| `throwOnError` | `true` to throw error on 4xx/5xx responses |

**form-data example** (file upload):

```yaml
- id: upload
  type: http
  url: "https://example.com/upload"
  method: POST
  contentType: form-data
  headers: '{"X-API-Key": "{{apiKey}}"}'
  body: '{"file:{{filename}}": "{{content}}"}'
  saveTo: response
```

For `form-data`, use `fieldName:filename` syntax for file fields (e.g., `"file:report.html": "{{htmlContent}}"`)

### dialog

Display a dialog with options, buttons, and/or text input.

```yaml
- id: ask
  type: dialog
  title: Select Options
  message: Choose items to process
  markdown: true
  options: "Option A, Option B, Option C"
  multiSelect: true
  inputTitle: "Additional notes"
  multiline: true
  defaults: '{"input": "default text", "selected": ["Option A"]}'
  button1: Confirm
  button2: Cancel
  saveTo: dialogResult
```

| Property | Description |
|----------|-------------|
| `title` | Dialog title |
| `message` | Message content (supports `{{variables}}`) |
| `markdown` | `true` renders message as Markdown |
| `options` | Comma-separated list of choices (optional) |
| `multiSelect` | `true` for checkboxes, `false` for radio buttons |
| `inputTitle` | Label for text input field (shows input when set) |
| `multiline` | `true` for multi-line text area |
| `defaults` | JSON with `input` and `selected` initial values |
| `button1` | Primary button label (default: "OK") |
| `button2` | Secondary button label (optional) |
| `saveTo` | Variable for result: `{"button": "Confirm", "selected": [...], "input": "..."}` |

**Simple text input:**
```yaml
- id: input
  type: dialog
  title: Enter value
  inputTitle: Your input
  multiline: true
  saveTo: userInput
```

### workflow

Execute another workflow as a sub-workflow.

```yaml
- id: runSub
  type: workflow
  path: "workflows/summarize.md"
  name: "Summarizer"
  input: '{"text": "{{content}}"}'
  output: '{"result": "summary"}'
  prefix: "sub_"
```

| Property | Description |
|----------|-------------|
| `path` | Path to workflow file (required) |
| `name` | Workflow name (for files with multiple workflows) |
| `input` | JSON mapping sub-workflow variables to values |
| `output` | JSON mapping parent variables to sub-workflow results |
| `prefix` | Prefix for all output variables (when `output` not specified) |

### rag-sync

Sync a note to a RAG (semantic search) store.

```yaml
- id: sync
  type: rag-sync
  path: "{{fileInfo.path}}"
  ragSetting: "My RAG Store"
  saveTo: syncResult
```

| Property | Description |
|----------|-------------|
| `path` | Note path to sync (required, supports `{{variables}}`) |
| `ragSetting` | RAG setting name (required) |
| `saveTo` | Variable to store result (optional) |

**Output format:**
```json
{
  "path": "folder/note.md",
  "fileId": "abc123...",
  "ragSetting": "My RAG Store",
  "syncedAt": "2025-01-01T12:00:00.000Z"
}
```

### prompt-file

Show file picker or use active file in hotkey/event mode.

```yaml
- id: selectFile
  type: prompt-file
  title: Select a note
  default: "notes/"
  forcePrompt: "true"
  saveTo: content
  saveFileTo: fileInfo
```

| Property | Description |
|----------|-------------|
| `title` | Dialog title |
| `default` | Default path |
| `forcePrompt` | `true` always shows dialog, even in hotkey/event mode |
| `saveTo` | Variable for file content |
| `saveFileTo` | Variable for file info JSON |

**File info format:** `{"path": "folder/note.md", "basename": "note.md", "name": "note", "extension": "md"}`

**Behavior by trigger mode:**
| Mode | Behavior |
|------|----------|
| Panel | Shows file picker dialog |
| Hotkey | Uses active file automatically |
| Event | Uses event file automatically |

### prompt-selection

Get selected text or show selection dialog.

```yaml
- id: getSelection
  type: prompt-selection
  saveTo: text
  saveSelectionTo: selectionInfo
```

| Property | Description |
|----------|-------------|
| `saveTo` | Variable for selected text |
| `saveSelectionTo` | Variable for selection metadata JSON |

**Selection info format:** `{"filePath": "...", "startLine": 1, "endLine": 1, "start": 0, "end": 10}`

**Behavior by trigger mode:**
| Mode | Behavior |
|------|----------|
| Panel | Shows selection dialog |
| Hotkey (with selection) | Uses current selection |
| Hotkey (no selection) | Uses full file content |
| Event | Uses full file content |

### if / while

Conditional branching and loops.

```yaml
- id: branch
  type: if
  condition: "{{count}} > 10"
  trueNext: handleMany
  falseNext: handleFew

- id: loop
  type: while
  condition: "{{counter}} < {{total}}"
  trueNext: processItem
  falseNext: done
```

| Property | Description |
|----------|-------------|
| `condition` | Expression with operators: `==`, `!=`, `<`, `>`, `<=`, `>=`, `contains` |
| `trueNext` | Node ID when condition is true |
| `falseNext` | Node ID when condition is false |

### variable / set

Declare and update variables.

```yaml
- id: init
  type: variable
  name: counter
  value: 0

- id: increment
  type: set
  name: counter
  value: "{{counter}} + 1"
```

### Other Nodes

| Node | Properties |
|------|------------|
| `note-read` | `path`, `saveTo` |
| `note-search` | `query`, `searchContent`, `limit`, `saveTo` |
| `folder-list` | `folder`, `saveTo` |
| `open` | `path` |
| `json` | `source`, `saveTo` |

---

## Workflow Termination

Use `next: end` to explicitly terminate the workflow:

```yaml
- id: save
  type: note
  path: "output.md"
  content: "{{result}}"
  next: end    # Workflow ends here

- id: branch
  type: if
  condition: "{{cancel}}"
  trueNext: end      # End workflow on true branch
  falseNext: continue
```

## Variable Expansion

Use `{{variable}}` syntax to reference variables:

```yaml
# Basic
path: "{{folder}}/{{filename}}.md"

# Object/Array access
url: "https://api.example.com?lat={{geo.latitude}}"
content: "{{items[0].name}}"

# Nested variables (for loops)
path: "{{parsed.notes[{{counter}}].path}}"
```

## Smart Input Nodes

`prompt-selection` and `prompt-file` nodes automatically detect execution context:

| Node | Panel Mode | Hotkey Mode | Event Mode |
|------|------------|-------------|------------|
| `prompt-file` | Shows file picker | Uses active file | Uses event file |
| `prompt-selection` | Shows selection dialog | Uses selection or full file | Uses full file content |

---

## Event Triggers

Workflows can be triggered automatically by Obsidian events.

![Event Trigger Settings](event_setting.png)

### Available Events

| Event | Description |
|-------|-------------|
| `create` | File created |
| `modify` | File modified/saved (debounced 5s) |
| `delete` | File deleted |
| `rename` | File renamed |
| `file-open` | File opened |

### Event Variables

When triggered by an event, these variables are automatically set:

| Variable | Description |
|----------|-------------|
| `__eventType__` | Event type: `create`, `modify`, `delete`, `rename`, `file-open` |
| `__eventFilePath__` | Path of the affected file |
| `__eventFile__` | JSON: `{"path": "...", "basename": "...", "name": "...", "extension": "..."}` |
| `__eventFileContent__` | File content (for create/modify/file-open events) |
| `__eventOldPath__` | Previous path (for rename events only) |

### File Pattern Syntax

Filter events by file path using glob patterns:

| Pattern | Matches |
|---------|---------|
| `**/*.md` | All .md files in any folder |
| `journal/*.md` | .md files directly in journal folder |
| `*.md` | .md files in root folder only |
| `**/{daily,weekly}/*.md` | Files in daily or weekly folders |
| `projects/[a-z]*.md` | Files starting with lowercase letter |
| `docs/**` | All files under docs folder |

### Event-Triggered Workflow Example

````markdown
```workflow
name: Auto-Tag New Notes
nodes:
  - id: getContent
    type: prompt-selection
    saveTo: content
  - id: analyze
    type: command
    prompt: "Suggest 3 tags for this note:\n\n{{content}}"
    saveTo: tags
  - id: prepend
    type: note
    path: "{{__eventFilePath__}}"
    content: "---\ntags: {{tags}}\n---\n\n{{content}}"
    mode: overwrite
    confirm: false
```
````

**Setup:** Click ⚡ in Workflow panel → enable "File Created" → set pattern `**/*.md`

---

## Practical Examples

### 1. Note Summary

````markdown
```workflow
name: Note Summary
nodes:
  - id: select
    type: prompt-file
    title: Select note
    saveTo: content
    saveFileTo: fileInfo
  - id: parseFile
    type: json
    source: fileInfo
    saveTo: file
  - id: summarize
    type: command
    prompt: "Summarize this note:\n\n{{content}}"
    saveTo: summary
  - id: save
    type: note
    path: "summaries/{{file.name}}"
    content: "# Summary\n\n{{summary}}\n\n---\n*Source: {{file.path}}*"
    mode: create
```
````

### 2. Web Research

````markdown
```workflow
name: Web Research
nodes:
  - id: topic
    type: dialog
    title: Research topic
    inputTitle: Topic
    saveTo: input
  - id: search
    type: command
    model: gemini-3-flash-preview
    ragSetting: __websearch__
    prompt: |
      Search the web for: {{input.input}}

      Include key facts, recent developments, and sources.
    saveTo: research
  - id: save
    type: note
    path: "research/{{input.input}}.md"
    content: "# {{input.input}}\n\n{{research}}"
    mode: overwrite
```
````

### 3. Conditional Processing

````markdown
```workflow
name: Smart Summarizer
nodes:
  - id: input
    type: dialog
    title: Enter text to process
    inputTitle: Text
    multiline: true
    saveTo: userInput
  - id: branch
    type: if
    condition: "{{userInput.input.length}} > 500"
    trueNext: summarize
    falseNext: enhance
  - id: summarize
    type: command
    prompt: "Summarize this long text:\n\n{{userInput.input}}"
    saveTo: result
    next: save
  - id: enhance
    type: command
    prompt: "Expand and enhance this short text:\n\n{{userInput.input}}"
    saveTo: result
    next: save
  - id: save
    type: note
    path: "processed/output.md"
    content: "{{result}}"
    mode: overwrite
```
````

### 4. Batch Process Notes

````markdown
```workflow
name: Tag Analyzer
nodes:
  - id: init
    type: variable
    name: counter
    value: 0
  - id: initReport
    type: variable
    name: report
    value: "# Tag Suggestions\n\n"
  - id: list
    type: note-list
    folder: Clippings
    limit: 5
    saveTo: notes
  - id: json
    type: json
    source: notes
    saveTo: parsed
  - id: loop
    type: while
    condition: "{{counter}} < {{parsed.count}}"
    trueNext: read
    falseNext: finish
  - id: read
    type: note-read
    path: "{{parsed.notes[{{counter}}].path}}"
    saveTo: content
  - id: analyze
    type: command
    prompt: "Suggest 3 tags for:\n\n{{content}}"
    saveTo: tags
  - id: append
    type: set
    name: report
    value: "{{report}}## {{parsed.notes[{{counter}}].name}}\n{{tags}}\n\n"
  - id: increment
    type: set
    name: counter
    value: "{{counter}} + 1"
    next: loop
  - id: finish
    type: note
    path: "reports/tag-suggestions.md"
    content: "{{report}}"
    mode: overwrite
```
````

### 5. API Integration

````markdown
```workflow
name: Weather Report
nodes:
  - id: city
    type: dialog
    title: City name
    inputTitle: City
    saveTo: cityInput
  - id: geocode
    type: http
    url: "https://geocoding-api.open-meteo.com/v1/search?name={{cityInput.input}}&count=1"
    method: GET
    saveTo: geoResponse
  - id: parseGeo
    type: json
    source: geoResponse
    saveTo: geo
  - id: weather
    type: http
    url: "https://api.open-meteo.com/v1/forecast?latitude={{geo.results[0].latitude}}&longitude={{geo.results[0].longitude}}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto"
    method: GET
    saveTo: weatherData
  - id: parse
    type: json
    source: weatherData
    saveTo: data
  - id: report
    type: command
    prompt: "Create a weather report:\n{{data}}"
    saveTo: summary
  - id: save
    type: note
    path: "weather/{{cityInput.input}}.md"
    content: "# Weather: {{cityInput.input}}\n\n{{summary}}"
    mode: overwrite
```
````

### 6. Translate Selection (with Hotkey)

````markdown
```workflow
name: Translate Selection
nodes:
  - id: getSelection
    type: prompt-selection
    saveTo: text
  - id: translate
    type: command
    prompt: "Translate the following text to English:\n\n{{text}}"
    saveTo: translated
  - id: output
    type: note
    path: "translations/translated.md"
    content: "## Original\n{{text}}\n\n## Translation\n{{translated}}\n\n---\n"
    mode: append
  - id: show
    type: open
    path: "translations/translated.md"
```
````

**Hotkey setup:**
1. Add a `name:` field to your workflow
2. Open the workflow file and select the workflow from dropdown
3. Click the keyboard icon in the Workflow panel footer
4. Go to Settings → Hotkeys → search "Workflow: Translate Selection"
5. Assign a hotkey (e.g., `Ctrl+Shift+T`)

### 7. Sub-Workflow Composition

**File: `workflows/translate.md`**
````markdown
```workflow
name: Translator
nodes:
  - id: translate
    type: command
    prompt: "Translate to {{targetLang}}:\n\n{{text}}"
    saveTo: translated
```
````

**File: `workflows/main.md`**
````markdown
```workflow
name: Multi-Language Export
nodes:
  - id: input
    type: dialog
    title: Enter text to translate
    inputTitle: Text
    multiline: true
    saveTo: userInput
  - id: toJapanese
    type: workflow
    path: "workflows/translate.md"
    name: "Translator"
    input: '{"text": "{{userInput.input}}", "targetLang": "Japanese"}'
    output: '{"japaneseText": "translated"}'
  - id: toSpanish
    type: workflow
    path: "workflows/translate.md"
    name: "Translator"
    input: '{"text": "{{userInput.input}}", "targetLang": "Spanish"}'
    output: '{"spanishText": "translated"}'
  - id: save
    type: note
    path: "translations/output.md"
    content: |
      # Original
      {{userInput.input}}

      ## Japanese
      {{japaneseText}}

      ## Spanish
      {{spanishText}}
    mode: overwrite
```
````

### 8. Interactive Task Selection

````markdown
```workflow
name: Task Processor
nodes:
  - id: selectTasks
    type: dialog
    title: Select Tasks
    message: Choose which tasks to perform on the current note
    options: "Summarize, Extract key points, Translate to English, Fix grammar"
    multiSelect: true
    button1: Process
    button2: Cancel
    saveTo: selection
  - id: checkCancel
    type: if
    condition: "{{selection.button}} == 'Cancel'"
    trueNext: cancelled
    falseNext: getFile
  - id: getFile
    type: prompt-file
    saveTo: content
  - id: process
    type: command
    prompt: |
      Perform the following tasks on this text:
      Tasks: {{selection.selected}}

      Text:
      {{content}}
    saveTo: result
  - id: save
    type: note
    path: "processed/result.md"
    content: "{{result}}"
    mode: create
    next: end
  - id: cancelled
    type: dialog
    title: Cancelled
    message: Operation was cancelled by user.
    button1: OK
    next: end
```
````
