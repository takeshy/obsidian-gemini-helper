// Workflow specification for AI generation
// This is used as a system prompt when Gemini generates or modifies workflows

import { getAvailableModels, type ApiPlan, type McpServerConfig, CLI_MODEL, CLAUDE_CLI_MODEL, CODEX_CLI_MODEL, type CliProviderConfig } from "src/types";

export interface WorkflowSpecContext {
  apiPlan: ApiPlan;
  cliConfig?: CliProviderConfig;
  mcpServers: McpServerConfig[];
  ragSettingNames: string[];
}

export function getWorkflowSpecification(context: WorkflowSpecContext): string {
  // Build available models list
  const models = getAvailableModels(context.apiPlan);
  const modelNames = models.map(m => m.name);

  // Add CLI models if verified
  if (context.cliConfig?.cliVerified) modelNames.push(CLI_MODEL.name);
  if (context.cliConfig?.claudeCliVerified) modelNames.push(CLAUDE_CLI_MODEL.name);
  if (context.cliConfig?.codexCliVerified) modelNames.push(CODEX_CLI_MODEL.name);

  const modelList = modelNames.join(", ");

  // Build MCP servers list
  const mcpServerNames = context.mcpServers.map(s => s.name);
  const mcpServerList = mcpServerNames.length > 0
    ? `Available MCP servers: ${mcpServerNames.join(", ")}`
    : "No MCP servers configured";

  // Build RAG settings list
  const ragList = context.ragSettingNames.length > 0
    ? `Available RAG settings: ${context.ragSettingNames.join(", ")}`
    : "No RAG settings configured";

  return `
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

## Node Types (23 total)

### 1. variable
Initialize a new variable.
- **name** (required): Variable name
- **value** (required): Initial value (string or number)

### 2. set
Update an existing variable with expression support.
- **name** (required): Variable name (use "_clipboard" to copy value to system clipboard)
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
- **model** (optional): Model override. Available models: ${modelList}
- **ragSetting** (optional): Search setting (__websearch__, __none__, or RAG setting name). ${ragList}
- **vaultTools** (optional): Vault tools mode - "all" (search + read/write), "noSearch" (read/write only), "none" (disabled). Default: "all"
- **mcpServers** (optional): Comma-separated MCP server names to enable. ${mcpServerList}
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
- **history** (optional): "true"/"false" to record edit history (default: "true")

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
- **saveTo** (optional): Variable for result JSON object with:
  - **button**: string - the button that was clicked (e.g., "OK", "Cancel")
  - **selected**: string[] - ALWAYS an array of selected options, even for single select (e.g., ["Option1"])
  - **input**: string - text input value (if inputTitle was set)

**IMPORTANT**: When checking dialog selection in an if condition:
- For single option check: \`{{result.selected[0]}} == Option1\`
- For checking if array contains a value (especially with multiSelect): \`{{result.selected}} contains Option1\`
- Wrong: \`{{result.selected}} == Option1\` (this compares array to string, always false)

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
Sync a note to RAG (File Search) store, or delete from store.
- **path** (optional): Note path to sync (supports {{variables}}). Required unless using oldPath for delete-only.
- **ragSetting** (required): RAG setting name to use
- **oldPath** (optional): Old file path to delete from store. Supports {{variables}}. If only oldPath is specified (no path), performs delete only.
- **saveTo** (optional): Variable for result (JSON with path, oldPath, deletedOldPath, fileId, ragSetting, syncedAt, mode)

**Modes**:
- **sync**: path only - uploads file to RAG store
- **rename**: path + oldPath - deletes old path, uploads new path
- **delete**: oldPath only - deletes from RAG store without uploading

**Use case 1**: After modifying a note with the \`note\` node, use \`rag-sync\` to update the RAG store with the new content.

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

**Use case 2**: Handle file rename/move events by deleting old path and uploading with new path.

**Example with rename event trigger**:
\`\`\`yaml
name: rag-rename-handler
trigger:
  events: [rename]
  filePattern: "Notes/**/*.md"
nodes:
  - id: sync-renamed
    type: rag-sync
    path: "{{__eventFilePath__}}"
    oldPath: "{{__eventOldPath__}}"
    ragSetting: "my-rag-store"
\`\`\`

**Use case 3**: Handle file delete events by removing from RAG store.

**Example with delete event trigger**:
\`\`\`yaml
name: rag-delete-handler
trigger:
  events: [delete]
  filePattern: "Notes/**/*.md"
nodes:
  - id: delete-from-rag
    type: rag-sync
    oldPath: "{{__eventFilePath__}}"
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

### 21. mcp
Call a remote MCP (Model Context Protocol) server tool via HTTP.
- **url** (required): MCP server endpoint URL (supports {{variables}})
- **tool** (required): Tool name to call on the MCP server
- **args** (optional): JSON object with tool arguments (supports {{variables}})
- **headers** (optional): JSON object with HTTP headers (e.g., for authentication)
- **saveTo** (optional): Variable name for the result

**Example**:
\`\`\`yaml
- id: search-web
  type: mcp
  url: "https://mcp.example.com/v1"
  tool: "web_search"
  args: '{"query": "{{searchQuery}}"}'
  headers: '{"Authorization": "Bearer {{apiKey}}"}'
  saveTo: searchResults
\`\`\`

**Use case**: Call remote MCP servers for web search, API integrations, etc.

### 22. obsidian-command
Execute an Obsidian command by its ID.
- **command** (required): Command ID (e.g., "editor:toggle-fold", "app:reload")
- **path** (optional): File path to open before executing the command. The file is opened, the command is executed, and the tab is closed automatically. (supports {{variables}})
- **saveTo** (optional): Variable name to store execution result

**Output format** (when saveTo is set):
\`\`\`json
{
  "commandId": "editor:toggle-fold",
  "path": "notes/example.md",
  "executed": true,
  "timestamp": 1704067200000
}
\`\`\`

**Example**:
\`\`\`yaml
- id: toggle-fold
  type: obsidian-command
  command: "editor:toggle-fold"
\`\`\`

**Example** (encrypt all files in a directory):
\`\`\`yaml
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
\`\`\`

**Use case**: Trigger any Obsidian command, including commands from other plugins. Use the \`path\` property to open a file and set it as active before running the command. The tab remains open after execution.

### 23. sleep
Pause workflow execution for a specified duration.
- **duration** (required): Sleep duration in milliseconds (supports {{variables}})

**Example**:
\`\`\`yaml
- id: wait
  type: sleep
  duration: "1000"
\`\`\`

**Use case**: Wait for async operations to complete, rate limiting API calls, or adding delays between operations.

## Control Flow

### Sequential Flow
By default, nodes execute in order. Use **next** to jump:
\`\`\`yaml
- id: step1
  type: command
  prompt: "Do something"
  next: step3
\`\`\`

### Back-Reference Rule
**Important**: The \`next\` property can only reference earlier nodes if the target is a **while** node. This prevents spaghetti code and ensures proper loop structure.

✅ Valid - looping back to while node:
\`\`\`yaml
- id: loop-start
  type: while
  condition: "{{index}} < 10"
  trueNext: process
  falseNext: done
- id: process
  type: command
  prompt: "Process item"
- id: increment
  type: set
  name: index
  value: "{{index}} + 1"
  next: loop-start   # OK: targets a while node
\`\`\`

❌ Invalid - looping back to non-while node:
\`\`\`yaml
- id: step1
  type: command
  prompt: "Do something"
- id: step2
  type: command
  prompt: "Do more"
  next: step1   # ERROR: step1 is not a while node
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

### JSON Escape Modifier
Use \`{{variable:json}}\` to escape values for embedding in JSON strings:
\`\`\`yaml
# Safe for content with newlines, quotes, etc.
args: '{"text": "{{content:json}}"}'
\`\`\`

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
  - id: loop
    type: while
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
    next: loop
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
}

// Legacy export for backward compatibility (uses default context)
export const WORKFLOW_SPECIFICATION = getWorkflowSpecification({
  apiPlan: "paid",
  mcpServers: [],
  ragSettingNames: [],
});
