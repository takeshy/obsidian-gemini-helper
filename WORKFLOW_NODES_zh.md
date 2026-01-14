# 工作流节点参考

本文档提供了所有工作流节点类型的详细规格说明。对于大多数用户来说，**您无需学习这些细节** - 只需用自然语言描述您想要的内容，AI 就会为您创建或修改工作流。

## 节点类型概览

| 类别 | 节点 | 描述 |
|----------|-------|-------------|
| 变量 | `variable`, `set` | 声明和更新变量 |
| 控制 | `if`, `while` | 条件分支和循环 |
| LLM | `command` | 执行带有模型/搜索选项的提示词 |
| 数据 | `http`, `json` | HTTP 请求和 JSON 解析 |
| 笔记 | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` | 仓库操作 |
| 文件 | `file-explorer`, `file-save` | 文件选择和保存（图片、PDF 等） |
| 提示 | `prompt-file`, `prompt-selection`, `dialog` | 用户输入对话框 |
| 组合 | `workflow` | 将另一个工作流作为子工作流执行 |
| RAG | `rag-sync` | 同步笔记到 RAG 存储 |
| 外部 | `mcp`, `obsidian-command` | 调用外部 MCP 服务器或 Obsidian 命令 |

---

## 节点参考

### command

执行带有可选模型和搜索设置的 LLM 提示词。

```yaml
- id: search
  type: command
  model: gemini-3-flash-preview  # 可选：指定模型
  ragSetting: __websearch__      # 可选：__websearch__、__none__ 或设置名称
  prompt: "Search for {{topic}}"
  saveTo: result
```

| 属性 | 描述 |
|----------|-------------|
| `prompt` | 发送给 LLM 的提示词（必填） |
| `model` | 覆盖当前模型（例如 `gemini-3-flash-preview`、`gemini-3-pro-image-preview`） |
| `ragSetting` | `__websearch__`（网络搜索）、`__none__`（无搜索）、设置名称，或省略以使用当前设置 |
| `attachments` | 包含 FileExplorerData 的变量名称，用逗号分隔（来自 `file-explorer` 节点） |
| `saveTo` | 用于存储文本响应的变量名 |
| `saveImageTo` | 用于存储生成图片的变量名（FileExplorerData 格式，用于图像模型） |

**图像生成示例**：
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

将内容写入笔记文件。

```yaml
- id: save
  type: note
  path: "output/{{filename}}.md"
  content: "{{result}}"
  mode: overwrite
  confirm: true
```

| 属性 | 描述 |
|----------|-------------|
| `path` | 文件路径（必填） |
| `content` | 要写入的内容 |
| `mode` | `overwrite`（默认）、`append` 或 `create`（如果存在则跳过） |
| `confirm` | `true`（默认）显示确认对话框，`false` 立即写入 |

### note-read

从笔记文件读取内容。

```yaml
- id: read
  type: note-read
  path: "notes/config.md"
  saveTo: content
```

| 属性 | 描述 |
|----------|-------------|
| `path` | 要读取的文件路径（必填） |
| `saveTo` | 用于存储文件内容的变量名（必填） |

**加密文件支持：**

如果目标文件已加密（通过插件的加密功能），工作流将自动：
1. 检查当前会话中是否已缓存密码
2. 如果未缓存，提示用户输入密码
3. 解密文件内容并存储到变量中
4. 缓存密码用于后续读取（在同一 Obsidian 会话内）

输入一次密码后，在重启 Obsidian 之前，您无需再次输入密码即可读取其他加密文件。

**示例：从加密文件读取 API 密钥并调用外部 API**

此工作流从加密文件中读取 API 密钥，调用外部 API，并显示结果：

```yaml
name: 使用加密密钥调用 API
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
    title: API 响应
    message: "{{response}}"
    markdown: true
    button1: OK
```

> **提示：** 将 API 密钥等敏感数据存储在加密文件中。使用命令面板中的「加密文件」命令来加密包含敏感信息的文件。

### note-list

列出笔记，支持筛选和排序。

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

| 属性 | 描述 |
|----------|-------------|
| `folder` | 文件夹路径（留空表示整个仓库） |
| `recursive` | `true` 包含子文件夹，`false`（默认）仅包含直接子项 |
| `tags` | 用于筛选的标签，用逗号分隔（带或不带 `#`） |
| `tagMatch` | `any`（默认）或 `all` 标签必须匹配 |
| `createdWithin` | 按创建时间筛选：`30m`、`24h`、`7d` |
| `modifiedWithin` | 按修改时间筛选 |
| `sortBy` | `created`、`modified` 或 `name` |
| `sortOrder` | `asc` 或 `desc`（默认） |
| `limit` | 最大结果数（默认：50） |
| `saveTo` | 用于存储结果的变量 |

**输出格式：**
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

发送 HTTP 请求。

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

| 属性 | 描述 |
|----------|-------------|
| `url` | 请求 URL（必填） |
| `method` | `GET`（默认）、`POST`、`PUT`、`PATCH`、`DELETE` |
| `contentType` | `json`（默认）、`form-data`、`text` |
| `headers` | JSON 对象或 `Key: Value` 格式（每行一个） |
| `body` | 请求体（用于 POST/PUT/PATCH） |
| `saveTo` | 用于存储响应体的变量 |
| `saveStatus` | 用于存储 HTTP 状态码的变量 |
| `throwOnError` | `true` 在 4xx/5xx 响应时抛出错误 |

**form-data 示例**（使用 file-explorer 上传二进制文件）：

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

对于 `form-data`：
- FileExplorerData（来自 `file-explorer` 节点）会被自动检测并作为二进制发送
- 对于文本文件字段使用 `fieldName:filename` 语法（例如 `"file:report.html": "{{htmlContent}}"`）

### dialog

显示带有选项、按钮和/或文本输入的对话框。

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

| 属性 | 描述 |
|----------|-------------|
| `title` | 对话框标题 |
| `message` | 消息内容（支持 `{{variables}}`） |
| `markdown` | `true` 将消息渲染为 Markdown |
| `options` | 用逗号分隔的选项列表（可选） |
| `multiSelect` | `true` 使用复选框，`false` 使用单选按钮 |
| `inputTitle` | 文本输入字段的标签（设置时显示输入框） |
| `multiline` | `true` 使用多行文本区域 |
| `defaults` | 包含 `input` 和 `selected` 初始值的 JSON |
| `button1` | 主按钮标签（默认："OK"） |
| `button2` | 次按钮标签（可选） |
| `saveTo` | 用于存储结果的变量（见下文） |

**结果格式**（`saveTo` 变量）：
- `button`：string - 点击的按钮文本（例如："确认"、"取消"）
- `selected`：string[] - **始终是数组**，即使是单选（例如：`["选项 A"]`）
- `input`：string - 文本输入值（如果设置了 `inputTitle`）

> **重要：** 在 `if` 条件中检查选中值时：
> - 对于单个选项：`{{dialogResult.selected[0]}} == 选项 A`
> - 检查数组是否包含值（multiSelect）：`{{dialogResult.selected}} contains 选项 A`
> - 错误：`{{dialogResult.selected}} == 选项 A`（将数组与字符串比较，始终为 false）

**简单文本输入：**
```yaml
- id: input
  type: dialog
  title: Enter value
  inputTitle: Your input
  multiline: true
  saveTo: userInput
```

### workflow

将另一个工作流作为子工作流执行。

```yaml
- id: runSub
  type: workflow
  path: "workflows/summarize.md"
  name: "Summarizer"
  input: '{"text": "{{content}}"}'
  output: '{"result": "summary"}'
  prefix: "sub_"
```

| 属性 | 描述 |
|----------|-------------|
| `path` | 工作流文件路径（必填） |
| `name` | 工作流名称（用于包含多个工作流的文件） |
| `input` | 将子工作流变量映射到值的 JSON |
| `output` | 将父变量映射到子工作流结果的 JSON |
| `prefix` | 所有输出变量的前缀（当未指定 `output` 时） |

### rag-sync

将笔记同步到 RAG 存储。

```yaml
- id: sync
  type: rag-sync
  path: "{{fileInfo.path}}"
  ragSetting: "My RAG Store"
  saveTo: syncResult
```

| 属性 | 描述 |
|----------|-------------|
| `path` | 要同步的笔记路径（必填，支持 `{{variables}}`） |
| `ragSetting` | RAG 设置名称（必填） |
| `saveTo` | 用于存储结果的变量（可选） |

**输出格式：**
```json
{
  "path": "folder/note.md",
  "fileId": "abc123...",
  "ragSetting": "My RAG Store",
  "syncedAt": "2025-01-01T12:00:00.000Z"
}
```

### file-explorer

从仓库中选择文件或输入新文件路径。支持任何文件类型，包括图片和 PDF。

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

| 属性 | 描述 |
|----------|-------------|
| `path` | 直接文件路径 - 设置时跳过对话框（支持 `{{variables}}`） |
| `mode` | `select`（选择现有文件，默认）或 `create`（输入新路径） |
| `title` | 对话框标题 |
| `extensions` | 允许的扩展名，用逗号分隔（例如 `pdf,png,jpg`） |
| `default` | 默认路径（支持 `{{variables}}`） |
| `saveTo` | 用于存储 FileExplorerData JSON 的变量 |
| `savePathTo` | 仅用于存储文件路径的变量 |

**FileExplorerData 格式：**
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

**示例：图像分析（带对话框）**
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

**示例：事件触发（无对话框）**
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

将 FileExplorerData 保存为仓库中的文件。适用于保存生成的图片或复制的文件。

```yaml
- id: saveImage
  type: file-save
  source: generatedImage
  path: "images/output"
  savePathTo: savedPath
```

| 属性 | 描述 |
|----------|-------------|
| `source` | 包含 FileExplorerData 的变量名（必填） |
| `path` | 保存文件的路径（如果缺少扩展名会自动添加） |
| `savePathTo` | 用于存储最终文件路径的变量（可选） |

**示例：生成并保存图片**
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

显示文件选择器，或在快捷键/事件模式下使用活动文件。

```yaml
- id: selectFile
  type: prompt-file
  title: Select a note
  default: "notes/"
  forcePrompt: "true"
  saveTo: content
  saveFileTo: fileInfo
```

| 属性 | 描述 |
|----------|-------------|
| `title` | 对话框标题 |
| `default` | 默认路径 |
| `forcePrompt` | `true` 始终显示对话框，即使在快捷键/事件模式下 |
| `saveTo` | 用于存储文件内容的变量 |
| `saveFileTo` | 用于存储文件信息 JSON 的变量 |

**文件信息格式：** `{"path": "folder/note.md", "basename": "note.md", "name": "note", "extension": "md"}`

**按触发模式的行为：**
| 模式 | 行为 |
|------|----------|
| 面板 | 显示文件选择器对话框 |
| 快捷键 | 自动使用活动文件 |
| 事件 | 自动使用事件文件 |

### prompt-selection

获取选中的文本或显示选择对话框。

```yaml
- id: getSelection
  type: prompt-selection
  saveTo: text
  saveSelectionTo: selectionInfo
```

| 属性 | 描述 |
|----------|-------------|
| `saveTo` | 用于存储选中文本的变量 |
| `saveSelectionTo` | 用于存储选择元数据 JSON 的变量 |

**选择信息格式：** `{"filePath": "...", "startLine": 1, "endLine": 1, "start": 0, "end": 10}`

**按触发模式的行为：**
| 模式 | 行为 |
|------|----------|
| 面板 | 显示选择对话框 |
| 快捷键（有选择） | 使用当前选择 |
| 快捷键（无选择） | 使用整个文件内容 |
| 事件 | 使用整个文件内容 |

### if / while

条件分支和循环。

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

| 属性 | 描述 |
|----------|-------------|
| `condition` | 包含运算符的表达式：`==`、`!=`、`<`、`>`、`<=`、`>=`、`contains` |
| `trueNext` | 条件为真时的节点 ID |
| `falseNext` | 条件为假时的节点 ID |

**`contains` 运算符**适用于字符串和数组：
- 字符串：`{{text}} contains error` - 检查 "error" 是否在字符串中
- 数组：`{{dialogResult.selected}} contains 选项 A` - 检查 "选项 A" 是否在数组中

> **反向引用规则**：`next` 属性只能在目标是 `while` 节点时引用之前的节点。这可以防止意大利面条式代码，确保正确的循环结构。

### variable / set

声明和更新变量。

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

通过 HTTP 调用远程 MCP (Model Context Protocol) 服务器工具。

```yaml
- id: search
  type: mcp
  url: "https://mcp.example.com/v1"
  tool: "web_search"
  args: '{"query": "{{searchTerm}}"}'
  headers: '{"Authorization": "Bearer {{apiKey}}"}'
  saveTo: searchResults
```

| 属性 | 描述 |
|----------|-------------|
| `url` | MCP 服务器端点 URL（必填，支持 `{{variables}}`） |
| `tool` | 在 MCP 服务器上调用的工具名称（必填） |
| `args` | 包含工具参数的 JSON 对象（支持 `{{variables}}`） |
| `headers` | 包含 HTTP 头的 JSON 对象（例如用于身份验证） |
| `saveTo` | 用于存储结果的变量名 |

**用例：** 调用远程 MCP 服务器进行 RAG 查询、网络搜索、API 集成等。

### obsidian-command

通过 ID 执行 Obsidian 命令。这允许工作流触发任何 Obsidian 命令，包括其他插件的命令。

```yaml
- id: toggle-fold
  type: obsidian-command
  command: "editor:toggle-fold"
  saveTo: result
```

| 属性 | 描述 |
|----------|-------------|
| `command` | 要执行的命令 ID（必填，支持 `{{variables}}`） |
| `path` | 执行命令前打开的文件（可选，执行后标签页自动关闭） |
| `saveTo` | 用于存储执行结果的变量（可选） |

**查找命令 ID：**
1. 打开 Obsidian 设置 → 快捷键
2. 搜索所需的命令
3. 命令 ID 会显示（例如 `editor:toggle-fold`、`app:reload`）

**常用命令 ID：**
| 命令 ID | 描述 |
|------------|-------------|
| `editor:toggle-fold` | 在光标处切换折叠 |
| `editor:fold-all` | 折叠所有标题 |
| `editor:unfold-all` | 展开所有标题 |
| `app:reload` | 重新加载 Obsidian |
| `workspace:close` | 关闭当前面板 |
| `file-explorer:reveal-active-file` | 在资源管理器中显示文件 |

**示例：使用插件命令的工作流**
```yaml
name: 写工作日志
nodes:
  - id: get-content
    type: dialog
    inputTitle: "输入日志内容"
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

**用例：** 在工作流中触发 Obsidian 核心命令或其他插件的命令。

**示例：加密目录中的所有文件**

此工作流使用 Gemini Helper 的加密命令加密指定文件夹中的所有 Markdown 文件：

```yaml
name: 加密文件夹
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
    title: "完成"
    message: "已加密 {{index}} 个文件"
```

> **注意：** `path` 属性会打开文件、执行命令，然后自动关闭标签页。已打开的文件将保持打开状态。

---

**示例：使用 ragujuary 进行 RAG 查询**

[ragujuary](https://github.com/takeshy/ragujuary) 是一个用于管理 Gemini File Search Stores 的 CLI 工具，支持 MCP 服务器。

1. 安装和设置：
```bash
go install github.com/takeshy/ragujuary@latest
export GEMINI_API_KEY=your-api-key

# 创建存储并上传文件
ragujuary upload --create -s mystore ./docs

# 启动 MCP 服务器（使用 --transport http，而不是 sse）
ragujuary serve --transport http --port 8080 --serve-api-key mysecretkey
```

2. 工作流示例：
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

### 其他节点

| 节点 | 属性 |
|------|------------|
| `note-read` | `path`, `saveTo` |
| `note-search` | `query`, `searchContent`, `limit`, `saveTo` |
| `folder-list` | `folder`, `saveTo` |
| `open` | `path` |
| `json` | `source`, `saveTo` |

---

## 工作流终止

使用 `next: end` 显式终止工作流：

```yaml
- id: save
  type: note
  path: "output.md"
  content: "{{result}}"
  next: end    # 工作流在此结束

- id: branch
  type: if
  condition: "{{cancel}}"
  trueNext: end      # 在真分支上结束工作流
  falseNext: continue
```

## 变量展开

使用 `{{variable}}` 语法引用变量：

```yaml
# 基本用法
path: "{{folder}}/{{filename}}.md"

# 对象/数组访问
url: "https://api.example.com?lat={{geo.latitude}}"
content: "{{items[0].name}}"

# 嵌套变量（用于循环）
path: "{{parsed.notes[{{counter}}].path}}"
```

## 智能输入节点

`prompt-selection` 和 `prompt-file` 节点会自动检测执行上下文：

| 节点 | 面板模式 | 快捷键模式 | 事件模式 |
|------|------------|-------------|------------|
| `prompt-file` | 显示文件选择器 | 使用活动文件 | 使用事件文件 |
| `prompt-selection` | 显示选择对话框 | 使用选择或整个文件 | 使用整个文件内容 |

---

## 事件触发器

工作流可以由 Obsidian 事件自动触发。

![事件触发器设置](event_setting.png)

### 可用事件

| 事件 | 描述 |
|-------|-------------|
| `create` | 文件创建 |
| `modify` | 文件修改/保存（防抖 5 秒） |
| `delete` | 文件删除 |
| `rename` | 文件重命名 |
| `file-open` | 文件打开 |

### 事件变量

当由事件触发时，这些变量会自动设置：

| 变量 | 描述 |
|----------|-------------|
| `__eventType__` | 事件类型：`create`、`modify`、`delete`、`rename`、`file-open` |
| `__eventFilePath__` | 受影响文件的路径 |
| `__eventFile__` | JSON：`{"path": "...", "basename": "...", "name": "...", "extension": "..."}` |
| `__eventFileContent__` | 文件内容（用于 create/modify/file-open 事件） |
| `__eventOldPath__` | 之前的路径（仅用于 rename 事件） |

### 文件模式语法

使用 glob 模式按文件路径筛选事件：

| 模式 | 匹配 |
|---------|---------|
| `**/*.md` | 任意文件夹中的所有 .md 文件 |
| `journal/*.md` | journal 文件夹中直接的 .md 文件 |
| `*.md` | 仅根文件夹中的 .md 文件 |
| `**/{daily,weekly}/*.md` | daily 或 weekly 文件夹中的文件 |
| `projects/[a-z]*.md` | 以小写字母开头的文件 |
| `docs/**` | docs 文件夹下的所有文件 |

### 事件触发工作流示例

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

**设置：** 在工作流面板中点击 ⚡ → 启用"文件创建" → 设置模式 `**/*.md`

---

## 实用示例

### 1. 笔记摘要

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

### 2. 网络研究

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

### 3. 条件处理

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

### 4. 批量处理笔记

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

### 5. API 集成

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

### 6. 翻译选中内容（带快捷键）

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

**快捷键设置：**
1. 为您的工作流添加 `name:` 字段
2. 打开工作流文件并从下拉菜单中选择工作流
3. 点击工作流面板底部的键盘图标
4. 进入设置 → 快捷键 → 搜索"Workflow: Translate Selection"
5. 分配快捷键（例如 `Ctrl+Shift+T`）

### 7. 子工作流组合

**文件：`workflows/translate.md`**
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

**文件：`workflows/main.md`**
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

### 8. 交互式任务选择

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
