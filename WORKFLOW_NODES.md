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
| Files | `file-explorer`, `file-save` | File selection and saving (images, PDFs, etc.) |
| Prompts | `prompt-file`, `prompt-selection`, `dialog` | User input dialogs |
| Composition | `workflow` | Execute another workflow as a sub-workflow |
| RAG | `rag-sync` | Sync notes to RAG store |
| External | `mcp`, `obsidian-command` | Call external MCP servers or Obsidian commands |

---

## Workflow Options

You can add an `options` section to control workflow behavior:

```yaml
name: My Workflow
options:
  showProgress: false  # Hide execution progress modal (default: true)
nodes:
  - id: step1
    type: command
    ...
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `showProgress` | boolean | `true` | Show execution progress modal when running via hotkey or workflow list |

**Note:** The `showProgress` option only affects execution via hotkey or workflow list. The Visual Workflow panel always shows progress.

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
| `model` | Override the current model (e.g., `gemini-3-flash-preview`, `gemini-3-pro-image-preview`) |
| `ragSetting` | `__websearch__` (web search), `__none__` (no search), setting name, or omit for current |
| `attachments` | Comma-separated variable names containing FileExplorerData (from `file-explorer` node) |
| `saveTo` | Variable name to store text response |
| `saveImageTo` | Variable name to store generated image (FileExplorerData format, for image models) |

**Image generation example**:
```yaml
- id: generate
  type: command
  prompt: "Generate a cute cat illustration"
  model: gemini-3-pro-image-preview
  saveImageTo: generatedImage
- id: save-image
  type: note
  path: "images/cat"
  content: "![cat](data:{{generatedImage.mimeType}};base64,{{generatedImage.data}})"
```

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

### note-read

Read content from a note file.

```yaml
- id: read
  type: note-read
  path: "notes/config.md"
  saveTo: content
```

| Property | Description |
|----------|-------------|
| `path` | File path to read (required) |
| `saveTo` | Variable name to store the file content (required) |

**Encrypted File Support:**

If the target file is encrypted (via the plugin's encryption feature), the workflow will automatically:
1. Check if the password is already cached in the current session
2. If not cached, prompt the user to enter the password
3. Decrypt the file content and store it in the variable
4. Cache the password for subsequent reads (within the same Obsidian session)

Once you enter the password once, you don't need to re-enter it for other encrypted file reads until you restart Obsidian.

**Example: Read API key from encrypted file and call external API**

This workflow reads an API key stored in an encrypted file, calls an external API, and displays the result:

```yaml
name: Call API with encrypted key
nodes:
  - id: read-key
    type: note-read
    path: "secrets/api-key.md"
    saveTo: apiKey
    next: call-api

  - id: call-api
    type: http
    url: "https://api.example.com/data"
    method: GET
    headers: '{"Authorization": "Bearer {{apiKey}}"}'
    saveTo: response
    next: show-result

  - id: show-result
    type: dialog
    title: API Response
    message: "{{response}}"
    markdown: true
    button1: OK
```

> **Tip:** Store sensitive data like API keys in encrypted files. Use the "Encrypt file" command from the command palette to encrypt a file containing your secrets.

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

**form-data example** (binary file upload with file-explorer):

```yaml
- id: select-pdf
  type: file-explorer
  path: "{{__eventFilePath__}}"
  extensions: "pdf,png,jpg"
  saveTo: fileData
- id: upload
  type: http
  url: "https://example.com/upload"
  method: POST
  contentType: form-data
  body: '{"file": "{{fileData}}"}'
  saveTo: response
```

For `form-data`:
- FileExplorerData (from `file-explorer` node) is auto-detected and sent as binary
- Use `fieldName:filename` syntax for text file fields (e.g., `"file:report.html": "{{htmlContent}}"`)

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
| `saveTo` | Variable for result (see below) |

**Result format** (`saveTo` variable):
- `button`: string - clicked button text (e.g., "Confirm", "Cancel")
- `selected`: string[] - **always an array**, even for single select (e.g., `["Option A"]`)
- `input`: string - text input value (if `inputTitle` was set)

> **Important:** When checking selected value in an `if` condition:
> - For single option: `{{dialogResult.selected[0]}} == Option A`
> - For checking if array contains value (multiSelect): `{{dialogResult.selected}} contains Option A`
> - Wrong: `{{dialogResult.selected}} == Option A` (compares array to string, always false)

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

Sync a note to a RAG store.

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

### file-explorer

Select a file from vault or enter a new file path. Supports any file type including images and PDFs.

```yaml
- id: selectImage
  type: file-explorer
  mode: select
  title: "Select an image"
  extensions: "png,jpg,jpeg,gif,webp"
  default: "images/"
  saveTo: imageData
  savePathTo: imagePath
```

| Property | Description |
|----------|-------------|
| `path` | Direct file path - skips dialog when set (supports `{{variables}}`) |
| `mode` | `select` (pick existing file, default) or `create` (enter new path) |
| `title` | Dialog title |
| `extensions` | Comma-separated allowed extensions (e.g., `pdf,png,jpg`) |
| `default` | Default path (supports `{{variables}}`) |
| `saveTo` | Variable for FileExplorerData JSON |
| `savePathTo` | Variable for just the file path |

**FileExplorerData format:**
```json
{
  "path": "folder/image.png",
  "basename": "image.png",
  "name": "image",
  "extension": "png",
  "mimeType": "image/png",
  "contentType": "binary",
  "data": "base64-encoded-content"
}
```

**Example: Image Analysis (with dialog)**
```yaml
- id: selectImage
  type: file-explorer
  title: "Select an image to analyze"
  extensions: "png,jpg,jpeg,gif,webp"
  saveTo: imageData
- id: analyze
  type: command
  prompt: "Describe this image in detail"
  attachments: imageData
  saveTo: analysis
- id: save
  type: note
  path: "analysis/{{imageData.name}}.md"
  content: "# Image Analysis\n\n{{analysis}}"
```

**Example: Event-triggered (no dialog)**
```yaml
- id: loadImage
  type: file-explorer
  path: "{{__eventFilePath__}}"
  saveTo: imageData
- id: analyze
  type: command
  prompt: "Describe this image"
  attachments: imageData
  saveTo: result
```

### file-save

Save FileExplorerData as a file in the vault. Useful for saving generated images or copied files.

```yaml
- id: saveImage
  type: file-save
  source: generatedImage
  path: "images/output"
  savePathTo: savedPath
```

| Property | Description |
|----------|-------------|
| `source` | Variable name containing FileExplorerData (required) |
| `path` | Path to save the file (extension auto-added if missing) |
| `savePathTo` | Variable to store the final file path (optional) |

**Example: Generate and save image**
```yaml
- id: generate
  type: command
  prompt: "Generate a landscape image"
  model: gemini-3-pro-image-preview
  saveImageTo: generatedImage
- id: save
  type: file-save
  source: generatedImage
  path: "images/landscape"
  savePathTo: savedPath
- id: showResult
  type: dialog
  title: "Image Saved"
  message: "Image saved to {{savedPath}}"
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

**The `contains` operator** works with both strings and arrays:
- String: `{{text}} contains error` - checks if "error" is in the string
- Array: `{{dialogResult.selected}} contains Option A` - checks if "Option A" is in the array

> **Back-Reference Rule**: The `next` property can only reference earlier nodes if the target is a `while` node. This prevents spaghetti code and ensures proper loop structure. For example, `next: loop` is valid only if `loop` is a `while` node.

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

### mcp

Call a remote MCP (Model Context Protocol) server tool via HTTP.

```yaml
- id: search
  type: mcp
  url: "https://mcp.example.com/v1"
  tool: "web_search"
  args: '{"query": "{{searchTerm}}"}'
  headers: '{"Authorization": "Bearer {{apiKey}}"}'
  saveTo: searchResults
```

| Property | Description |
|----------|-------------|
| `url` | MCP server endpoint URL (required, supports `{{variables}}`) |
| `tool` | Tool name to call on the MCP server (required) |
| `args` | JSON object with tool arguments (supports `{{variables}}`) |
| `headers` | JSON object with HTTP headers (e.g., for authentication) |
| `saveTo` | Variable name for the result |

**Use case:** Call remote MCP servers for RAG queries, web search, API integrations, etc.

### obsidian-command

Execute an Obsidian command by its ID. This allows workflows to trigger any Obsidian command, including commands from other plugins.

```yaml
- id: toggle-fold
  type: obsidian-command
  command: "editor:toggle-fold"
  saveTo: result
```

| Property | Description |
|----------|-------------|
| `command` | Command ID to execute (required, supports `{{variables}}`) |
| `path` | File to open before executing command (optional, tab auto-closes after) |
| `saveTo` | Variable to store execution result (optional) |

**Finding command IDs:**
1. Open Obsidian Settings → Hotkeys
2. Search for the command you want
3. The command ID is shown (e.g., `editor:toggle-fold`, `app:reload`)

**Common command IDs:**
| Command ID | Description |
|------------|-------------|
| `editor:toggle-fold` | Toggle fold at cursor |
| `editor:fold-all` | Fold all headings |
| `editor:unfold-all` | Unfold all headings |
| `app:reload` | Reload Obsidian |
| `workspace:close` | Close current pane |
| `file-explorer:reveal-active-file` | Reveal file in explorer |

**Example: Workflow with plugin command**
```yaml
name: Write Work Log
nodes:
  - id: get-content
    type: dialog
    inputTitle: "Enter log content"
    multiline: true
    saveTo: logContent
  - id: copy-to-clipboard
    type: set
    name: "_clipboard"
    value: "{{logContent.input}}"
  - id: write-to-log
    type: obsidian-command
    command: "work-log:write-from-clipboard"
```

**Use case:** Trigger Obsidian core commands or commands from other plugins as part of a workflow.

**Example: Encrypt all files in a directory**

This workflow encrypts all markdown files in a specified folder using Gemini Helper's encryption command:

```yaml
name: encrypt-folder
nodes:
  - id: init-index
    type: variable
    name: index
    value: "0"
  - id: list-files
    type: note-list
    folder: "private"
    recursive: "true"
    saveTo: fileList
  - id: loop
    type: while
    condition: "{{index}} < {{fileList.count}}"
    trueNext: encrypt
    falseNext: done
  - id: encrypt
    type: obsidian-command
    command: "gemini-helper:encrypt-file"
    path: "{{fileList.notes[index].path}}"
  - id: increment
    type: set
    name: index
    value: "{{index}} + 1"
    next: loop
  - id: done
    type: dialog
    title: "Done"
    message: "Encrypted {{index}} files"
```

> **Note:** The `path` property opens the file, executes the command, then automatically closes the tab. Files already open remain open.

**Example: RAG query with ragujuary**

[ragujuary](https://github.com/takeshy/ragujuary) is a CLI tool for managing Gemini File Search Stores with MCP server support.

1. Install and setup:
```bash
go install github.com/takeshy/ragujuary@latest
export GEMINI_API_KEY=your-api-key

# Create a store and upload files
ragujuary upload --create -s mystore ./docs

# Start MCP server (use --transport http, not sse)
ragujuary serve --transport http --port 8080 --serve-api-key mysecretkey
```

2. Workflow example:
```yaml
name: RAG Search
nodes:
  - id: query
    type: mcp
    url: "http://localhost:8080"
    tool: "query"
    args: '{"store_name": "mystore", "question": "How does authentication work?", "show_citations": true}'
    headers: '{"X-API-Key": "mysecretkey"}'
    saveTo: result
  - id: show
    type: dialog
    title: "Search Result"
    message: "{{result}}"
    markdown: true
    button1: "OK"
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
