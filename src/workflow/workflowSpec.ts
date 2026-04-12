// Workflow specification for AI generation
// This is used as a system prompt when Gemini generates or modifies workflows

import { getAvailableModels, type ApiPlan, type McpServerConfig } from "src/types";

export interface WorkflowSpecContext {
  apiPlan: ApiPlan;
  mcpServers: McpServerConfig[];
  ragSettingNames: string[];
  hasApiKey?: boolean;
}

export function getWorkflowSpecification(context: WorkflowSpecContext): string {
  // Build available models list (only include API models if API key is configured)
  const modelNames: string[] = [];
  if (context.hasApiKey !== false) {
    const models = getAvailableModels(context.apiPlan);
    modelNames.push(...models.map(m => m.name));
  }

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

## Variable Syntax
- Simple: \`{{variableName}}\`
- Object: \`{{obj.property}}\`, \`{{obj.nested.value}}\`
- Array: \`{{arr[0]}}\`, \`{{arr[0].name}}\`
- Variable index: \`{{arr[index]}}\` (where index is a variable)
- JSON escape: \`{{variable:json}}\` — escapes content to be safely embedded **inside a string literal** (escapes quotes, newlines, etc.)
- Expression (in set node): \`{{a}} + {{b}}\`, operators: +, -, *, /, %

### CRITICAL: \`:json\` does NOT add surrounding quotes
\`{{var:json}}\` only ESCAPES the content — it does not add outer quotes. You must provide the quotes yourself when embedding inside a string.

✅ Correct (inside a JSON string):
\`\`\`yaml
args: '{"text": "{{content:json}}"}'   # the "..." around it provides the string literal
\`\`\`

✅ Correct (inside JavaScript code in a script node):
\`\`\`yaml
code: |
  var text = "{{content:json}}";       # wrap in quotes to make it a JS string
  return JSON.parse("{{jsonStr:json}}"); # quotes turn it into a parseable string
\`\`\`

❌ Wrong — missing quotes produces invalid JavaScript:
\`\`\`yaml
code: |
  var text = {{content:json}};          # syntax error — bare escaped text isn't valid JS
  return JSON.parse({{jsonStr:json}});  # same error
\`\`\`

**Rule of thumb for script/http/json-string contexts**: if the variable holds a plain string that should become a string literal, always write \`"{{var:json}}"\` with the surrounding quotes.

## System Variables

System variables are prefixed with \`_\` and automatically set by the runtime depending on trigger mode.

### Event Trigger Variables
Set when workflow is triggered by a file event (create, modify, delete, rename, file-open):
- \`_eventType\` - Event type: "create", "modify", "delete", "rename", "file-open"
- \`_eventFilePath\` - Path of the affected file (e.g., "folder/note.md")
- \`_eventFile\` - JSON object: \`{"path": "...", "basename": "...", "name": "...", "extension": "..."}\`
- \`_eventFileContent\` - Full file content (available for create, modify, file-open events)
- \`_eventOldPath\` - Previous file path (available for rename events only)

### Hotkey Trigger Variables
Set when workflow is triggered via hotkey with an active editor:
- \`_hotkeyContent\` - Full content of the active file
- \`_hotkeySelection\` - Currently selected text (empty if no selection)
- \`_hotkeyActiveFile\` - JSON object: \`{"path": "...", "basename": "...", "name": "...", "extension": "..."}\`
- \`_hotkeySelectionInfo\` - JSON object: \`{"filePath": "...", "startLine": 1, "endLine": 5, "start": 0, "end": 120}\`

### Other System Variables
- \`_clipboard\` - Setting this variable copies the value to system clipboard (use with set node)
- \`_workflowName\` - Name of the currently executing workflow
- \`_lastModel\` - Model used by the last command node

**Note**: \`prompt-file\` and \`prompt-selection\` nodes automatically use these variables when available, so you rarely need to reference hotkey/event variables directly. Use them in other nodes (e.g., \`note\`, \`file-explorer\`) when needed.

## Condition Syntax
Operators: ==, !=, <, >, <=, >=, contains
\`\`\`yaml
condition: "{{status}} == done"
condition: "{{count}} < 10"
condition: "{{text}} contains keyword"
\`\`\`

## Node Types

### Control Flow

#### variable
Initialize or declare a variable.
- **name** (required): Variable name
- **value** (optional): Initial value (string or number).
  - Omit to declare an INPUT variable: keeps the value passed by the caller (parent workflow / skill / hotkey); defaults to "" if no caller value was provided.
  - Specify \`value: ""\` (or a number/string) to force a known initial value regardless of caller state.
  - Omitting \`value\` is perfectly valid for accumulators that will be appended to later — the node writes "" if the variable doesn't exist yet.

#### set
Update a variable with expression support.
- **name** (required): Variable name (use "_clipboard" to copy to system clipboard)
- **value** (required): New value or expression (e.g., "{{counter}} + 1")

#### if
Conditional branching.
- **condition** (required): Condition to evaluate
- **trueNext** (required): Node ID for true branch
- **falseNext** (optional): Node ID for false branch (defaults to next node)

#### while
Loop while condition is true.
- **condition** (required): Loop condition
- **trueNext** (required): Node ID for loop body
- **falseNext** (optional): Node ID for exit (defaults to next node)

#### sleep
Pause execution.
- **duration** (required): Sleep duration in milliseconds (supports {{variables}})

### AI & LLM

#### command
Execute LLM prompt.
- **prompt** (required): Prompt template (supports {{variables}})
- **model** (optional): Model override. Available: ${modelList}
- **ragSetting** (optional): __websearch__, __none__, or RAG setting name. ${ragList}
- **vaultTools** (optional): "all" (default), "noSearch", "none"
- **mcpServers** (optional): Comma-separated MCP server names. ${mcpServerList}
- **enableThinking** (optional): "true" (default) or "false". Enable deep thinking mode
- **attachments** (optional): Comma-separated variable names containing FileExplorerData
- **saveTo** (optional): Variable for text response
- **saveImageTo** (optional): Variable for generated image (FileExplorerData format). Use with file-save node to save.

### HTTP & External Services

#### http
Make HTTP request.
- **url** (required): Request URL (supports {{variables}})
- **method** (optional): GET, POST, PUT, DELETE, PATCH (default: GET)
- **contentType** (optional): "json", "form-data", "text", "binary" (default: "json")
- **responseType** (optional): "auto", "text", "binary" (default: "auto"). Override Content-Type auto-detection for response handling.
- **headers** (optional): JSON headers
- **body** (optional): Request body (supports {{variables}})
  - For "json": JSON string
  - For "form-data": JSON object. FileExplorerData is auto-detected and sent as binary.
  - For "text": Plain text
  - For "binary": FileExplorerData JSON (sends raw binary, uses mimeType as Content-Type)
- **saveTo** (optional): Variable for response (text as string, binary as FileExplorerData)
- **saveStatus** (optional): Variable for HTTP status code
- **throwOnError** (optional): "true" to throw on 4xx/5xx

**form-data example** (binary file upload):
\`\`\`yaml
- id: select-pdf
  type: file-explorer
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

#### mcp
Call MCP server tool.
- **url** (required): MCP server endpoint URL (supports {{variables}})
- **tool** (required): Tool name to call
- **args** (optional): JSON object with arguments (supports {{variables}})
- **headers** (optional): JSON headers (e.g., authentication)
- **saveTo** (optional): Variable for result
- **saveUiTo** (optional): Variable for MCP Apps UI info (if server returns UI resources)

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

### Note Operations

#### note
Write/create note.
- **path** (required): Note path without .md extension (supports {{variables}})
- **content** (required): Content to write (supports {{variables}})
- **mode** (optional): overwrite (default), append, create
- **confirm** (optional): "true" (default) / "false" for confirmation dialog
- **history** (optional): "true" (default) / "false" to record edit history

#### note-read
Read note content. Encrypted files (.md.encrypted) are automatically detected — specify the path without the .encrypted extension and the content is decrypted transparently (a password prompt appears if needed).
- **path** (required): Note path. Use prompt-file first to get file path if needed.
- **saveTo** (required): Variable for content

**Example** (read encrypted file with dialog):
\`\`\`yaml
- id: select-file
  type: prompt-file
  title: "Select encrypted file"
  saveTo: content
  saveFileTo: fileInfo
- id: process
  type: command
  prompt: "Summarize: {{content}}"
  saveTo: summary
\`\`\`

#### note-search
Search notes.
- **query** (required): Search query
- **searchContent** (optional): "true"/"false" (default: "false" for filename search)
- **limit** (optional): Max results (default: "10")
- **saveTo** (required): Variable for results (JSON array)

#### note-list
List notes in folder.
- **folder** (optional): Folder path (empty for root)
- **recursive** (optional): "true"/"false"
- **tags** (optional): Comma-separated tags
- **tagMatch** (optional): "any"/"all"
- **createdWithin** / **modifiedWithin** (optional): e.g., "7d", "30m", "2h"
- **sortBy** (optional): "modified", "created", "name"
- **sortOrder** (optional): "desc", "asc"
- **limit** (optional): Max results (default: "50")
- **saveTo** (required): Variable for results

**Result structure**:
\`\`\`json
{
  "notes": [{ "name": "note1", "path": "folder/note1.md", "created": 1234567890, "modified": 1234567890, "tags": ["#tag1"] }],
  "count": 1,
  "totalCount": 10,
  "hasMore": true
}
\`\`\`
Access: \`{{fileList.notes[0].path}}\`, \`{{fileList.count}}\`, \`{{fileList.notes[index].path}}\`

#### folder-list
List folders.
- **folder** (optional): Parent folder (empty for all)
- **saveTo** (required): Variable for results

**Result structure**: \`{ "folders": ["parent/subfolder1", "parent/subfolder2"], "count": 2 }\`

### File Operations

#### file-explorer
Select file from vault or enter new path.
- **path** (optional): Direct file path - skips dialog when set (supports {{variables}})
- **mode** (optional): "select" (default) or "create"
- **title** (optional): Dialog title
- **extensions** (optional): Comma-separated extensions (e.g., "pdf,png,jpg")
- **default** (optional): Default path (supports {{variables}})
- **saveTo** (optional): Variable for FileExplorerData
- **savePathTo** (optional): Variable for file path only

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
  path: "{{_eventFilePath}}"
  saveTo: imageData
- id: analyze
  type: command
  prompt: "Describe this image"
  attachments: imageData
  saveTo: analysis
\`\`\`

#### file-save
Save FileExplorerData as file.
- **source** (required): Variable containing FileExplorerData
- **path** (required): Path to save (extension auto-added if missing)
- **savePathTo** (optional): Variable for final file path

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

#### open
Open file in editor.
- **path** (required): File path (supports {{variables}})

### User Interaction

#### dialog
Show dialog with options and optional text input.
- **title** (optional): Dialog title
- **message** (optional): Message content
- **markdown** (optional): "true"/"false" - render as Markdown (default: "false")
- **options** (optional): Comma-separated options for checkboxes/radio
- **multiSelect** (optional): "true"/"false" (default: "false")
- **inputTitle** (optional): Label for text input field
- **multiline** (optional): "true"/"false" for text area (default: "false")
- **defaults** (optional): JSON, e.g., '{"input": "text", "selected": ["opt1"]}'
- **button1** (optional): Primary button text (default: "OK")
- **button2** (optional): Secondary button text
- **saveTo** (optional): Variable for result JSON object with:
  - **button**: string - the button that was clicked (e.g., "OK", "Cancel")
  - **selected**: string[] - ALWAYS an array of selected options, even for single select
  - **input**: string - text input value (if inputTitle was set)

**IMPORTANT**: When checking dialog selection in an if condition:
- For single option check: \`{{result.selected[0]}} == Option1\`
- For checking if array contains a value (especially with multiSelect): \`{{result.selected}} contains Option1\`
- Wrong: \`{{result.selected}} == Option1\` (this compares array to string, always false)

#### prompt-file
Prompt user to select file and read its content.
- **title** (optional): Dialog title
- **default** (optional): Default path
- **forcePrompt** (optional): "true" to always show picker (default: "false")
- **saveTo** (required): Variable for file content
- **saveFileTo** (optional): Variable for file info (path, basename, name, extension)

**Behavior**:
- In hotkey mode: Automatically uses the active file without showing a dialog
- In panel mode: Shows a file picker dialog for user selection

#### prompt-selection
Prompt user to select text from a file.
- **title** (optional): Dialog title
- **saveTo** (required): Variable for selected text
- **saveSelectionTo** (optional): Variable for selection metadata (filePath, startLine, endLine, start, end)

**Behavior**:
- In hotkey mode: Automatically uses the current selection without showing a dialog
- In panel mode: Shows a file selection dialog for user to select text

### Integration

#### workflow
Execute sub-workflow.
- **path** (required): Workflow file path
- **name** (optional): Workflow name (if file has multiple)
- **input** (optional): JSON mapping, e.g., '{"subVar": "{{parentVar}}"}'
- **output** (optional): JSON mapping, e.g., '{"parentVar": "subVar"}'
- **prefix** (optional): Prefix for all imported variables

#### rag-sync
Sync note to RAG store.
- **path** (optional): Note path to sync (required unless delete-only)
- **ragSetting** (required): RAG setting name
- **oldPath** (optional): Old path to delete (for rename/delete operations)
- **saveTo** (optional): Variable for result

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

#### obsidian-command
Execute Obsidian command.
- **command** (required): Command ID (e.g., "editor:toggle-fold")
- **path** (optional): File to open before executing (supports {{variables}})
- **saveTo** (optional): Variable for result { commandId, path, executed, timestamp }

**Example** (encrypt all files in a directory):
\`\`\`yaml
name: encrypt-folder
nodes:
  - id: init
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

### Data Processing

#### script
Execute JavaScript code in a sandboxed environment (no DOM, network, or storage access). Useful for string manipulation, data transformation, calculations, and encoding/decoding that the set node cannot handle.
- **code** (required): JavaScript code. \`{{variable}}\` is substituted as plain text BEFORE the code runs. Use \`return\` to return a value. Non-string return values are JSON-serialized.
- **saveTo** (optional): Variable for the result
- **timeout** (optional): Timeout in milliseconds (default: "10000")

### Variable interpolation in script code — READ CAREFULLY

The substitution is a plain text replace. Pay attention to what makes valid JavaScript AFTER substitution.

- If the variable is a **plain string** and you want it as a JS string, wrap in quotes with \`:json\`:
\`\`\`yaml
code: |
  var text = "{{userInput:json}}";      # becomes: var text = "hello \\"world\\"";
\`\`\`

- If the variable is a **JSON string that you want to parse**, wrap in quotes with \`:json\` and pass to \`JSON.parse\`:
\`\`\`yaml
code: |
  var data = JSON.parse("{{jsonStr:json}}");  # becomes: JSON.parse("[{\\"url\\":\\"...\\"}]")
\`\`\`

- If the variable already holds a **parsed object/array** (e.g., from a previous \`json\` node), use it directly without quotes:
\`\`\`yaml
code: |
  var arr = {{parsedArray:json}};       # becomes: var arr = [{"url":"..."}];  (valid JS literal)
\`\`\`

❌ Common mistakes:
\`\`\`yaml
code: |
  var text = {{userInput:json}};        # WRONG — missing quotes, invalid JS
  JSON.parse({{jsonStr:json}});         # WRONG — JSON.parse needs a string, you removed the quotes
  var html = '{{content}}';             # RISKY — breaks if content contains a single quote or newline; prefer "{{content:json}}"
\`\`\`

Example — split and sort a comma-separated list:
\`\`\`yaml
- id: sort-items
  type: script
  code: |
    var items = "{{rawList:json}}".split(',').map(function(s){ return s.trim(); });
    items.sort();
    return items.join('\\n');
  saveTo: sortedList
\`\`\`

Example — Base64 encode:
\`\`\`yaml
- id: encode
  type: script
  code: return btoa("{{plainText:json}}")
  saveTo: encoded
\`\`\`

#### json
Parse a JSON string into an object/array.
- **source** (required): The **variable name** holding the JSON string — NOT an interpolated expression, NOT wrapped in quotes, NOT with \`{{...}}\`. Just the bare name.
- **saveTo** (required): Variable for the parsed object

✅ Correct:
\`\`\`yaml
- id: parse-result
  type: json
  source: apiResponseBody     # just the variable name
  saveTo: parsed
\`\`\`

❌ Wrong:
\`\`\`yaml
- id: parse-result
  type: json
  source: "{{apiResponseBody}}"       # WRONG — no interpolation here
  source: "[{{apiResponseBody}}]"     # WRONG — you'll corrupt valid JSON by wrapping it
  saveTo: parsed
\`\`\`

## Control Flow

### Sequential Flow
Nodes execute in order. Use **next** to jump:
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

### Termination
Use "end" to explicitly terminate: \`next: end\`

## Complete Loop Example
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
8. **One task per command node**: Each command node should request ONE task only. Don't combine multiple tasks (e.g., "translate AND create infographic"). Split into separate command nodes for better results and debugging.
9. **Use comment field**: Add a \`comment\` property to nodes to describe their purpose. This is displayed in the sidebar for readability. Example: \`comment: "Fetch latest articles from RSS feed"\`

## How workflow output reaches the user

When a workflow is invoked by a skill (via the \`run_skill_workflow\` tool), the
runtime **automatically returns every variable whose name does NOT start with
\`_\`** back to the chat AI. The chat AI then decides how to present those
values to the user, guided by the SKILL.md instructions.

- You do NOT need to add a final \`command\` node just to "output" a variable.
  The chat-side AI already receives it.
- A \`command\` node runs a separate LLM call **inside** the workflow; its
  output gets saved to a variable — it does not bypass the chat AI to write
  directly to the chat.
- If the user wants a specific variable (e.g. \`ogpMarkdown\`) rendered verbatim
  in the chat reply, write that requirement into the SKILL.md instructions
  body: _"After the workflow completes, output the value of \`ogpMarkdown\` to
  the user verbatim."_ The instructions steer the chat AI's behavior.
- For plain workflows triggered from the Workflow panel (not via a skill),
  variables are not surfaced to the chat — in that case use UI-producing
  nodes such as \`dialog\`, \`note\`, or \`file-save\` for visible results.
`;
}

// Legacy export for backward compatibility (uses default context)
export const WORKFLOW_SPECIFICATION = getWorkflowSpecification({
  apiPlan: "paid",
  mcpServers: [],
  ragSettingNames: [],
});
