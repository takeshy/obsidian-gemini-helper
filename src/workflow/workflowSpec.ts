// Workflow specification for AI generation
// This is used as a system prompt when Gemini generates or modifies workflows

export const WORKFLOW_SPECIFICATION = `
# Obsidian Workflow Specification

## Format
Workflows are defined in YAML format. Output ONLY the YAML content starting with "name:".

## Basic Structure
\`\`\`yaml
name: workflow-name
nodes:
  - id: node-1
    type: variable
    name: myVar
    value: "initial value"
  - id: node-2
    type: command
    prompt: "Process {{myVar}}"
    saveTo: result
\`\`\`

## Node Types (20 total)

### 1. variable
Initialize a new variable.
- **name** (required): Variable name
- **value** (required): Initial value (string or number)

### 2. set
Update an existing variable with expression support.
- **name** (required): Variable name
- **value** (required): New value or expression (e.g., "{{counter}} + 1")

### 3. if
Conditional branching.
- **condition** (required): Condition to evaluate (e.g., "{{count}} < 10")
- **trueNext** (required): Node ID for true branch
- **falseNext** (optional): Node ID for false branch (defaults to next sequential node)

### 4. while
Loop while condition is true.
- **condition** (required): Loop condition
- **trueNext** (required): Node ID for loop body
- **falseNext** (optional): Node ID for exit (defaults to next sequential node)

### 5. command
Execute LLM prompt.
- **prompt** (required): Prompt template (supports {{variables}})
- **model** (optional): Model override (gemini-3-flash-preview, gemini-3-pro-image-preview, etc.)
- **ragSetting** (optional): Search setting (__websearch__, __none__, or setting name)
- **attachments** (optional): Comma-separated variable names containing FileExplorerData (from file-explorer node)
- **saveTo** (optional): Variable name to store text response
- **saveImageTo** (optional): Variable name to store generated image (FileExplorerData format, for image models)

**Image generation example**:
\`\`\`yaml
- id: generate
  type: command
  prompt: "Generate a cute cat illustration"
  model: gemini-3-pro-image-preview
  saveImageTo: generatedImage
- id: save-image
  type: note
  path: "images/cat"
  content: "![cat](data:{{generatedImage.mimeType}};base64,{{generatedImage.data}})"
\`\`\`

### 6. http
Make HTTP request.
- **url** (required): Request URL (supports {{variables}})
- **method** (optional): GET, POST, PUT, DELETE, PATCH (default: POST)
- **contentType** (optional): "json", "form-data", "text" (default: "json")
- **headers** (optional): JSON headers
- **body** (optional): Request body (supports {{variables}})
  - For "json": JSON string
  - For "form-data": JSON object. FileExplorerData is auto-detected and sent as binary.
  - For "text": Plain text
- **saveTo** (optional): Variable name for response
- **saveStatus** (optional): Variable name for HTTP status code
- **throwOnError** (optional): "true" to throw on 4xx/5xx

**form-data example** (binary file upload with file-explorer):
\`\`\`yaml
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
\`\`\`

### 7. json
Parse JSON string.
- **source** (required): Variable containing JSON string
- **saveTo** (required): Variable for parsed object

### 8. note
Write/create note.
- **path** (required): Note path without .md extension (supports {{variables}})
- **content** (required): Content to write (supports {{variables}})
- **mode** (optional): overwrite, append, create (default: overwrite)
- **confirm** (optional): "true"/"false" for confirmation dialog (default: "true")

### 9. note-read
Read note content.
- **path** (required): Note path. Use prompt-file first to get file path if needed.
- **saveTo** (required): Variable for content

### 10. note-search
Search notes.
- **query** (required): Search query
- **searchContent** (optional): "true"/"false" (default: "false" for filename search)
- **limit** (optional): Max results (default: "10")
- **saveTo** (required): Variable for results (JSON array)

### 11. note-list
List notes in folder.
- **folder** (optional): Folder path (empty for root)
- **recursive** (optional): "true"/"false"
- **tags** (optional): Comma-separated tags
- **tagMatch** (optional): "any"/"all"
- **createdWithin** (optional): e.g., "7d", "30m", "2h"
- **modifiedWithin** (optional): e.g., "1d"
- **sortBy** (optional): "modified", "created", "name"
- **sortOrder** (optional): "desc", "asc"
- **limit** (optional): Max results (default: "50")
- **saveTo** (required): Variable for results

**Result structure** (JSON object):
\`\`\`json
{
  "notes": [
    { "name": "note1", "path": "folder/note1.md", "created": 1234567890, "modified": 1234567890, "tags": ["#tag1"] }
  ],
  "count": 1,
  "totalCount": 10,
  "hasMore": true
}
\`\`\`
- Access notes array: \`{{fileList.notes[0].path}}\`
- Access count: \`{{fileList.count}}\`
- Loop with variable index: \`{{fileList.notes[index].path}}\` (where index is a variable)

### 12. folder-list
List folders.
- **folder** (optional): Parent folder (empty for all)
- **saveTo** (required): Variable for results

**Result structure** (JSON object):
\`\`\`json
{
  "folders": [
    { "name": "subfolder", "path": "parent/subfolder" }
  ],
  "count": 1
}
\`\`\`
- Access folders array: \`{{folderList.folders[0].path}}\`
- Access count: \`{{folderList.count}}\`

### 13. open
Open file in editor.
- **path** (required): File path (supports {{variables}})

### 14. dialog
Show dialog with options and optional text input. This node can replace prompt-value by using inputTitle with multiline.
- **title** (optional): Dialog title
- **message** (optional): Message content
- **markdown** (optional): "true"/"false" - render message as Markdown (default: "false")
- **options** (optional): Comma-separated options for checkboxes/radio
- **multiSelect** (optional): "true"/"false" (default: "false")
- **inputTitle** (optional): Label for text input field (if set, shows input field)
- **multiline** (optional): "true"/"false" - use multi-line text area (default: "false")
- **defaults** (optional): JSON for initial values, e.g., '{"input": "text", "selected": ["opt1", "opt2"]}'
- **button1** (optional): Primary button text (default: "OK")
- **button2** (optional): Secondary button text
- **saveTo** (optional): Variable for result (JSON with button, selected, and input)

### 15. prompt-file
Prompt user to select file and read its content.
- **title** (optional): Dialog title
- **default** (optional): Default path
- **forcePrompt** (optional): "true" to always show file picker, even in hotkey mode (default: "false")
- **saveTo** (required): Variable for file content
- **saveFileTo** (optional): Variable for file info (JSON with path, basename, name, extension)

**Behavior**:
- In hotkey mode: Automatically uses the active file without showing a dialog
- In panel mode: Shows a file picker dialog for user selection

### 16. prompt-selection
Prompt user to select text from a file.
- **title** (optional): Dialog title
- **saveTo** (required): Variable for selected text
- **saveSelectionTo** (optional): Variable for selection metadata (JSON with filePath, startLine, endLine, start, end)

**Behavior**:
- In hotkey mode: Automatically uses the current selection without showing a dialog
- In panel mode: Shows a file selection dialog for user to select text

### 17. workflow
Execute sub-workflow.
- **path** (required): Workflow file path
- **name** (optional): Workflow name (if file has multiple)
- **input** (optional): JSON mapping of input variables (e.g., '{"subVar": "{{parentVar}}"}')
- **output** (optional): JSON mapping of output variables (e.g., '{"parentVar": "subVar"}')
- **prefix** (optional): Prefix for all imported variables

### 18. rag-sync
Sync a note to RAG (File Search) store.
- **path** (required): Note path to sync (supports {{variables}})
- **ragSetting** (required): RAG setting name to use
- **saveTo** (optional): Variable for result (JSON with path, fileId, ragSetting, syncedAt)

**Use case**: After modifying a note with the \`note\` node, use \`rag-sync\` to update the RAG store with the new content.

**Example**:
\`\`\`yaml
- id: update-note
  type: note
  path: "{{notePath}}"
  content: "{{newContent}}"
  mode: overwrite
  confirm: "false"
- id: sync-to-rag
  type: rag-sync
  path: "{{notePath}}"
  ragSetting: "my-rag-store"
\`\`\`

### 19. file-explorer
Select a file from vault or enter a new file path.
- **path** (optional): Direct file path - skips dialog when set (supports {{variables}})
- **mode** (optional): "select" (pick existing file) or "create" (enter new path). Default: "select"
- **title** (optional): Dialog title
- **extensions** (optional): Comma-separated allowed extensions (e.g., "pdf,png,jpg")
- **default** (optional): Default path (supports {{variables}})
- **saveTo** (optional): Variable for FileExplorerData (JSON with path, basename, name, extension, mimeType, contentType, data)
- **savePathTo** (optional): Variable for just the file path

**FileExplorerData structure**:
\`\`\`json
{
  "path": "folder/file.pdf",
  "basename": "file.pdf",
  "name": "file",
  "extension": "pdf",
  "mimeType": "application/pdf",
  "contentType": "binary",
  "data": "base64-encoded-content or text-content"
}
\`\`\`

**Example** (image analysis with dialog):
\`\`\`yaml
- id: select-image
  type: file-explorer
  title: "Select an image to analyze"
  extensions: "png,jpg,jpeg,gif,webp"
  saveTo: imageData
  savePathTo: imagePath
- id: analyze
  type: command
  prompt: "Describe this image in detail"
  attachments: imageData
  saveTo: analysis
\`\`\`

**Example** (event-triggered, no dialog):
\`\`\`yaml
- id: load-image
  type: file-explorer
  path: "{{__eventFilePath__}}"
  saveTo: imageData
- id: analyze
  type: command
  prompt: "Describe this image"
  attachments: imageData
  saveTo: analysis
\`\`\`

### 20. file-save
Save FileExplorerData as a file in the vault.
- **source** (required): Variable name containing FileExplorerData (from file-explorer or saveImageTo)
- **path** (required): Path to save the file (extension auto-added if missing)
- **savePathTo** (optional): Variable to store the final file path

**Example** (save generated image):
\`\`\`yaml
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
\`\`\`

## Control Flow

### Sequential Flow
By default, nodes execute in order. Use **next** to jump:
\`\`\`yaml
- id: step1
  type: command
  prompt: "Do something"
  next: step3
\`\`\`

### Conditional Flow
Use **trueNext** and **falseNext** for if/while:
\`\`\`yaml
- id: check
  type: if
  condition: "{{count}} > 0"
  trueNext: process
  falseNext: end
\`\`\`

### Termination
Use "end" to explicitly terminate:
\`\`\`yaml
- id: finish
  type: note
  path: output
  content: "Done!"
  next: end
\`\`\`

## Variable Syntax

### Simple Reference
\`{{variableName}}\`

### Object Property Access
\`{{obj.property}}\`
\`{{obj.nested.value}}\`

### Array Access with Numeric Index
\`{{arr[0]}}\`
\`{{arr[0].name}}\`

### Array Access with Variable Index
Use a variable as array index for loops:
\`{{arr[index]}}\` (where \`index\` is a variable containing a number)
\`{{fileList.notes[i].path}}\` (access i-th note's path)

### Variables Set by Prompt Nodes

**prompt-file** reads file content and info:
- \`saveTo\`: Variable receives file content (string)
- \`saveFileTo\`: Variable receives file info JSON (path, basename, name, extension)
- In hotkey mode: auto-uses active file (no dialog)
- In panel mode: shows file picker dialog

**prompt-selection** captures selected text and metadata:
- \`saveTo\`: Variable receives selected text (string)
- \`saveSelectionTo\`: Variable receives selection metadata JSON (filePath, startLine, endLine, start, end)
- In hotkey mode: auto-uses current selection (no dialog)
- In panel mode: shows selection dialog

### Expression Support (in set node)
- Arithmetic: \`{{a}} + {{b}}\`, \`{{count}} * 2\`
- Operators: +, -, *, /, %

## Condition Syntax
Supported operators: ==, !=, <, >, <=, >=, contains
\`\`\`yaml
condition: "{{status}} == end"
condition: "{{count}} < 10"
condition: "{{text}} contains keyword"
\`\`\`

## Loop Example (note-list with variable index)
\`\`\`yaml
name: process-all-notes
nodes:
  - id: init-index
    type: variable
    name: "index"
    value: "0"
  - id: list-files
    type: note-list
    folder: "my-folder"
    recursive: "true"
    saveTo: "fileList"
  - id: check-loop
    type: if
    condition: "{{index}} < {{fileList.count}}"
    trueNext: read-note
    falseNext: finish
  - id: read-note
    type: note-read
    path: "{{fileList.notes[index].path}}"
    saveTo: "content"
  - id: process
    type: command
    prompt: "Process: {{content}}"
    saveTo: "result"
  - id: increment
    type: set
    name: "index"
    value: "{{index}} + 1"
    next: check-loop
  - id: finish
    type: dialog
    title: "Done"
    message: "Processed {{index}} files"
\`\`\`

**Key points:**
- Use \`{{fileList.notes[index].path}}\` to access each note (NOT \`{{fileList[index].path}}\`)
- Use \`{{fileList.count}}\` for loop condition (NOT \`{{fileList.length}}\`)
- Use \`set\` node with expression \`{{index}} + 1\` to increment

## Best Practices
1. Use descriptive node IDs (e.g., "read-input", "process-data", "save-result")
2. Initialize variables before use with variable node
3. Use prompt nodes for user input when needed
4. Use dialog for confirmations with options
5. Use confirm: "true" for destructive note operations
6. Always specify saveTo for nodes that produce output
7. Use meaningful workflow names
`;
