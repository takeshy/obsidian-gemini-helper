# 工作流節點參考

本文件提供了所有工作流節點型別的詳細規格說明。對於大多數使用者來說，**您無需學習這些細節** - 只需用自然語言描述您想要的內容，AI 就會為您建立或修改工作流。

## 節點型別概覽

| 類別 | 節點 | 描述 |
|----------|-------|-------------|
| 變數 | `variable`, `set` | 宣告和更新變數 |
| 控制 | `if`, `while` | 條件分支和迴圈 |
| LLM | `command` | 執行帶有模型/搜尋選項的提示詞 |
| 資料 | `http`, `json`, `script` | HTTP 請求、JSON 解析和 JavaScript 執行 |
| 筆記 | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` | Vault 操作 |
| 檔案 | `file-explorer`, `file-save` | 檔案選擇和儲存（圖片、PDF 等） |
| 提示 | `prompt-file`, `prompt-selection`, `dialog` | 使用者輸入對話方塊 |
| 組合 | `workflow` | 將另一個工作流作為子工作流執行 |
| RAG | `rag-sync` | 同步筆記到 RAG 儲存 |
| 外部 | `mcp`, `obsidian-command` | 呼叫外部 MCP 伺服器或 Obsidian 命令 |
| 實用工具 | `sleep` | 暫停工作流執行 |

---

## 工作流選項

您可以新增 `options` 部分來控制工作流行為：

```yaml
name: My Workflow
options:
  showProgress: false  # 隱藏執行進度模態框（預設：true）
nodes:
  - id: step1
    type: command
    ...
```

| 選項 | 型別 | 預設值 | 描述 |
|------|------|--------|------|
| `showProgress` | boolean | `true` | 通過快捷鍵或工作流列表執行時顯示執行進度模態框 |

**注意：** `showProgress` 選項僅影響通過快捷鍵或工作流列表的執行。視覺化工作流面板始終顯示進度。

---

## 節點參考

### command

執行帶有可選模型、搜尋、Vault 工具和 MCP 設定的 LLM 提示詞。

```yaml
- id: search
  type: command
  model: gemini-3-flash-preview  # 可選：指定模型
  ragSetting: __websearch__      # 可選：__websearch__、__none__ 或設定名稱
  vaultTools: all                # 可選：all、noSearch、none
  mcpServers: "server1,server2"  # 可選：逗號分隔的 MCP 伺服器名稱
  prompt: "Search for {{topic}}"
  saveTo: result
```

| 屬性 | 描述 |
|----------|-------------|
| `prompt` | 傳送給 LLM 的提示詞（必填） |
| `model` | 覆蓋當前模型（可用模型取決於 API 計劃設定） |
| `ragSetting` | `__websearch__`（網路搜尋）、`__none__`（無搜尋）、RAG 設定名稱，或省略以使用當前設定 |
| `vaultTools` | Vault 工具模式：`all`（搜尋 + 讀寫）、`noSearch`（僅讀寫）、`none`（停用）。預設：`all` |
| `mcpServers` | 要啟用的 MCP 伺服器名稱，逗號分隔（必須在外掛設定中配置） |
| `attachments` | 包含 FileExplorerData 的變數名稱，用逗號分隔（來自 `file-explorer` 節點） |
| `enableThinking` | "true"（預設）或 "false"。啟用深度思考模式 |
| `saveTo` | 用於儲存文本響應的變數名 |
| `saveImageTo` | 用於儲存生成圖片的變數名（FileExplorerData 格式，用於影像模型） |

**影像生成示例**：
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

將內容寫入筆記檔案。

```yaml
- id: save
  type: note
  path: "output/{{filename}}.md"
  content: "{{result}}"
  mode: overwrite
  confirm: true
```

| 屬性 | 描述 |
|----------|-------------|
| `path` | 檔案路徑（必填） |
| `content` | 要寫入的內容 |
| `mode` | `overwrite`（預設）、`append` 或 `create`（如果存在則跳過） |
| `confirm` | `true`（預設）顯示確認對話方塊，`false` 立即寫入 |
| `history` | `true`（預設，遵循全域性設定）儲存到編輯歷史，`false` 停用此次寫入的歷史記錄 |

### note-read

從筆記檔案讀取內容。

```yaml
- id: read
  type: note-read
  path: "notes/config.md"
  saveTo: content
```

| 屬性 | 描述 |
|----------|-------------|
| `path` | 要讀取的檔案路徑（必填） |
| `saveTo` | 用於儲存檔案內容的變數名（必填） |

**加密檔案支援：**

如果目標檔案已加密（通過外掛的加密功能），工作流將自動：
1. 檢查當前會話中是否已快取密碼
2. 如果未快取，提示使用者輸入密碼
3. 解密檔案內容並存儲到變數中
4. 快取密碼用於後續讀取（在同一 Obsidian 會話內）

輸入一次密碼後，在重啟 Obsidian 之前，您無需再次輸入密碼即可讀取其他加密檔案。

**示例：從加密檔案讀取 API 金鑰並呼叫外部 API**

此工作流從加密檔案中讀取 API 金鑰，呼叫外部 API，並顯示結果：

```yaml
name: 使用加密金鑰呼叫 API
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
    title: API 響應
    message: "{{response}}"
    markdown: true
    button1: OK
```

> **提示：** 將 API 金鑰等敏感資料儲存在加密檔案中。使用命令面板中的「加密檔案」命令來加密包含敏感資訊的檔案。

### note-list

列出筆記，支援篩選和排序。

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

| 屬性 | 描述 |
|----------|-------------|
| `folder` | 資料夾路徑（留空表示整個 Vault） |
| `recursive` | `true` 包含子資料夾，`false`（預設）僅包含直接子項 |
| `tags` | 用於篩選的標籤，用逗號分隔（帶或不帶 `#`） |
| `tagMatch` | `any`（預設）或 `all` 標籤必須匹配 |
| `createdWithin` | 按建立時間篩選：`30m`、`24h`、`7d` |
| `modifiedWithin` | 按修改時間篩選 |
| `sortBy` | `created`、`modified` 或 `name` |
| `sortOrder` | `asc` 或 `desc`（預設） |
| `limit` | 最大結果數（預設：50） |
| `saveTo` | 用於儲存結果的變數 |

**輸出格式：**
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

### note-search

按名稱或內容搜尋筆記。

```yaml
- id: search
  type: note-search
  query: "{{searchTerm}}"
  searchContent: "true"
  limit: "20"
  saveTo: searchResults
```

| 屬性 | 描述 |
|------|------|
| `query` | 搜尋查詢字串（必需，支援 `{{variables}}`） |
| `searchContent` | `true` 搜尋檔案內容，`false`（預設）僅搜尋檔名 |
| `limit` | 最大結果數（預設：10） |
| `saveTo` | 用於儲存結果的變數（必需） |

**輸出格式：**
```json
{
  "count": 3,
  "results": [
    {"name": "Note1", "path": "folder/Note1.md", "matchedContent": "...匹配項周圍的上下文..."}
  ]
}
```

當 `searchContent` 為 `true` 時，`matchedContent` 包含匹配項前後約 50 個字元作為上下文。

### folder-list

列出 Vault 中的資料夾。

```yaml
- id: listFolders
  type: folder-list
  folder: "Projects"
  saveTo: folderList
```

| 屬性 | 描述 |
|------|------|
| `folder` | 父資料夾路徑（留空表示整個 Vault） |
| `saveTo` | 用於儲存結果的變數（必需） |

**輸出格式：**
```json
{
  "folders": ["Projects/Active", "Projects/Archive", "Projects/Ideas"],
  "count": 3
}
```

資料夾按字母順序排序。

### open

在 Obsidian 中開啟檔案。

```yaml
- id: openNote
  type: open
  path: "{{outputPath}}"
```

| 屬性 | 描述 |
|------|------|
| `path` | 要開啟的檔案路徑（必需，支援 `{{variables}}`） |

如果路徑沒有 `.md` 副檔名，會自動新增。

### http

傳送 HTTP 請求。

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

| 屬性 | 描述 |
|----------|-------------|
| `url` | 請求 URL（必填） |
| `method` | `GET`（預設）、`POST`、`PUT`、`PATCH`、`DELETE` |
| `contentType` | `json`（預設）、`form-data`、`text`、`binary` |
| `responseType` | `auto`（預設）、`text`、`binary`。覆蓋 Content-Type 自動檢測以處理響應 |
| `headers` | JSON 物件或 `Key: Value` 格式（每行一個） |
| `body` | 請求體（用於 POST/PUT/PATCH） |
| `saveTo` | 用於儲存響應體的變數 |
| `saveStatus` | 用於儲存 HTTP 狀態碼的變數 |
| `throwOnError` | `true` 在 4xx/5xx 響應時丟擲錯誤 |

**form-data 示例**（使用 file-explorer 上傳二進位制檔案）：

```yaml
- id: select-pdf
  type: file-explorer
  path: "{{_eventFilePath}}"
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

對於 `form-data`：
- FileExplorerData（來自 `file-explorer` 節點）會被自動檢測並作為二進位制傳送
- 對於文本檔案欄位使用 `fieldName:filename` 語法（例如 `"file:report.html": "{{htmlContent}}"`）

### json

將 JSON 字串解析為物件以訪問屬性。

```yaml
- id: parseResponse
  type: json
  source: response
  saveTo: data
```

| 屬性 | 描述 |
|------|------|
| `source` | 包含 JSON 字串的變數名（必需） |
| `saveTo` | 用於儲存解析結果的變數名（必需） |

解析後，使用點表示法訪問屬性：`{{data.items[0].name}}`

**Markdown 程式碼塊中的 JSON：**

`json` 節點會自動從 Markdown 程式碼塊中提取 JSON：

```yaml
# 如果響應包含：
# ```json
# {"status": "ok"}
# ```
# json 節點將僅提取和解析 JSON 內容
- id: parse
  type: json
  source: llmResponse
  saveTo: parsed
```

當 LLM 響應將 JSON 包裝在程式碼圍欄中時，這很有用。

### dialog

顯示帶有選項、按鈕和/或文本輸入的對話方塊。

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

| 屬性 | 描述 |
|----------|-------------|
| `title` | 對話方塊標題 |
| `message` | 訊息內容（支援 `{{variables}}`） |
| `markdown` | `true` 將訊息渲染為 Markdown |
| `options` | 用逗號分隔的選項列表（可選） |
| `multiSelect` | `true` 使用核取方塊，`false` 使用單選按鈕 |
| `inputTitle` | 文本輸入欄位的標籤（設定時顯示輸入框） |
| `multiline` | `true` 使用多行文本區域 |
| `defaults` | 包含 `input` 和 `selected` 初始值的 JSON |
| `button1` | 主按鈕標籤（預設："OK"） |
| `button2` | 次按鈕標籤（可選） |
| `saveTo` | 用於儲存結果的變數（見下文） |

**結果格式**（`saveTo` 變數）：
- `button`：string - 點選的按鈕文本（例如："確認"、"取消"）
- `selected`：string[] - **始終是陣列**，即使是單選（例如：`["選項 A"]`）
- `input`：string - 文本輸入值（如果設定了 `inputTitle`）

> **重要：** 在 `if` 條件中檢查選中值時：
> - 對於單個選項：`{{dialogResult.selected[0]}} == 選項 A`
> - 檢查陣列是否包含值（multiSelect）：`{{dialogResult.selected}} contains 選項 A`
> - 錯誤：`{{dialogResult.selected}} == 選項 A`（將陣列與字串比較，始終為 false）

**簡單文本輸入：**
```yaml
- id: input
  type: dialog
  title: Enter value
  inputTitle: Your input
  multiline: true
  saveTo: userInput
```

### workflow

將另一個工作流作為子工作流執行。

```yaml
- id: runSub
  type: workflow
  path: "workflows/summarize.md"
  name: "Summarizer"
  input: '{"text": "{{content}}"}'
  output: '{"result": "summary"}'
  prefix: "sub_"
```

| 屬性 | 描述 |
|----------|-------------|
| `path` | 工作流檔案路徑（必填） |
| `input` | 將子工作流變數對映到值的 JSON |
| `output` | 將父變數對映到子工作流結果的 JSON |
| `prefix` | 所有輸出變數的字首（當未指定 `output` 時） |

### rag-sync

將筆記同步到 RAG 儲存。

```yaml
- id: sync
  type: rag-sync
  path: "{{fileInfo.path}}"
  ragSetting: "My RAG Store"
  saveTo: syncResult
```

| 屬性 | 描述 |
|----------|-------------|
| `path` | 要同步的筆記路徑（除僅刪除外必填，支援 `{{variables}}`） |
| `ragSetting` | RAG 設定名稱（必填） |
| `oldPath` | 要刪除的舊路徑（可選，用於重新命名/刪除操作） |
| `saveTo` | 用於儲存結果的變數（可選） |

**輸出格式：**
```json
{
  "path": "folder/note.md",
  "fileId": "abc123...",
  "ragSetting": "My RAG Store",
  "syncedAt": "2025-01-01T12:00:00.000Z"
}
```

### file-explorer

從 Vault 中選擇檔案或輸入新檔案路徑。支援任何檔案型別，包括圖片和 PDF。

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

| 屬性 | 描述 |
|----------|-------------|
| `path` | 直接檔案路徑 - 設定時跳過對話方塊（支援 `{{variables}}`） |
| `mode` | `select`（選擇現有檔案，預設）或 `create`（輸入新路徑） |
| `title` | 對話方塊標題 |
| `extensions` | 允許的副檔名，用逗號分隔（例如 `pdf,png,jpg`） |
| `default` | 預設路徑（支援 `{{variables}}`） |
| `saveTo` | 用於儲存 FileExplorerData JSON 的變數 |
| `savePathTo` | 僅用於儲存檔案路徑的變數 |

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

**示例：影像分析（帶對話方塊）**
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

**示例：事件觸發（無對話方塊）**
```yaml
- id: loadImage
  type: file-explorer
  path: "{{_eventFilePath}}"
  saveTo: imageData
- id: analyze
  type: command
  prompt: "Describe this image"
  attachments: imageData
  saveTo: result
```

### file-save

將 FileExplorerData 儲存為 Vault 中的檔案。適用於儲存生成的圖片或複製的檔案。

```yaml
- id: saveImage
  type: file-save
  source: generatedImage
  path: "images/output"
  savePathTo: savedPath
```

| 屬性 | 描述 |
|----------|-------------|
| `source` | 包含 FileExplorerData 的變數名（必填） |
| `path` | 儲存檔案的路徑（如果缺少副檔名會自動新增） |
| `savePathTo` | 用於儲存最終檔案路徑的變數（可選） |

**示例：生成並儲存圖片**
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

顯示檔案選擇器，或在快捷鍵/事件模式下使用活動檔案。

```yaml
- id: selectFile
  type: prompt-file
  title: Select a note
  default: "notes/"
  forcePrompt: "true"
  saveTo: content
  saveFileTo: fileInfo
```

| 屬性 | 描述 |
|----------|-------------|
| `title` | 對話方塊標題 |
| `default` | 預設路徑 |
| `forcePrompt` | `true` 始終顯示對話方塊，即使在快捷鍵/事件模式下 |
| `saveTo` | 用於儲存檔案內容的變數 |
| `saveFileTo` | 用於儲存檔案資訊 JSON 的變數 |

**檔案資訊格式：** `{"path": "folder/note.md", "basename": "note.md", "name": "note", "extension": "md"}`

**按觸發模式的行為：**
| 模式 | 行為 |
|------|----------|
| 面板 | 顯示檔案選擇器對話方塊 |
| 快捷鍵 | 自動使用活動檔案 |
| 事件 | 自動使用事件檔案 |

### prompt-selection

獲取選中的文本或顯示選擇對話方塊。

```yaml
- id: getSelection
  type: prompt-selection
  saveTo: text
  saveSelectionTo: selectionInfo
```

| 屬性 | 描述 |
|----------|-------------|
| `saveTo` | 用於儲存選中文本的變數 |
| `saveSelectionTo` | 用於儲存選擇後設資料 JSON 的變數 |

**選擇資訊格式：** `{"filePath": "...", "startLine": 1, "endLine": 1, "start": 0, "end": 10}`

**按觸發模式的行為：**
| 模式 | 行為 |
|------|----------|
| 面板 | 顯示選擇對話方塊 |
| 快捷鍵（有選擇） | 使用當前選擇 |
| 快捷鍵（無選擇） | 使用整個檔案內容 |
| 事件 | 使用整個檔案內容 |

### if / while

條件分支和迴圈。

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

| 屬性 | 描述 |
|----------|-------------|
| `condition` | 包含運算子的表示式：`==`、`!=`、`<`、`>`、`<=`、`>=`、`contains` |
| `trueNext` | 條件為真時的節點 ID |
| `falseNext` | 條件為假時的節點 ID |

**`contains` 運算子**適用於字串和陣列：
- 字串：`{{text}} contains error` - 檢查 "error" 是否在字串中
- 陣列：`{{dialogResult.selected}} contains 選項 A` - 檢查 "選項 A" 是否在陣列中

> **反向引用規則**：`next` 屬性只能在目標是 `while` 節點時引用之前的節點。這可以防止義大利麵條式程式碼，確保正確的迴圈結構。

### variable / set

宣告和更新變數。

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

**`variable` 節點的 `value` 是可選的。** 省略它會帶來兩種有用的行為：

- **輸入宣告** — 如果變數已經由呼叫者（父工作流、技能呼叫、熱鍵觸發器）設定，則保留現有值。這允許工作流宣告它期望的輸入而不覆蓋它們。
- **空累加器** — 如果沒有呼叫者設定該變數，則初始化為 `""`。對於稍後將被追加的累加器是安全的。

```yaml
# 輸入宣告 — 使用呼叫者的值，如果未提供則為 ""
- id: declare-input
  type: variable
  name: inputText

# 累加器 — 以 "" 開始，後續追加
- id: init-output
  type: variable
  name: outputMarkdown

# 顯式初始值 — 無論呼叫者狀態如何，始終重置為 0
- id: init-counter
  type: variable
  name: counter
  value: 0
```

**特殊變數 `_clipboard`:**

如果設定名為 `_clipboard` 的變數，其值將被複制到系統剪貼簿：

```yaml
- id: copyToClipboard
  type: set
  name: _clipboard
  value: "{{result}}"
```

### mcp

通過 HTTP 呼叫遠端 MCP (Model Context Protocol) 伺服器工具。

```yaml
- id: search
  type: mcp
  url: "https://mcp.example.com/v1"
  tool: "web_search"
  args: '{"query": "{{searchTerm}}"}'
  headers: '{"Authorization": "Bearer {{apiKey}}"}'
  saveTo: searchResults
```

| 屬性 | 描述 |
|----------|-------------|
| `url` | MCP 伺服器端點 URL（必填，支援 `{{variables}}`） |
| `tool` | 在 MCP 伺服器上呼叫的工具名稱（必填） |
| `args` | 包含工具引數的 JSON 物件（支援 `{{variables}}`） |
| `headers` | 包含 HTTP 頭的 JSON 物件（例如用於身份驗證） |
| `saveTo` | 用於儲存結果的變數名 |

**用例：** 呼叫遠端 MCP 伺服器進行 RAG 查詢、網路搜尋、API 整合等。

### obsidian-command

通過 ID 執行 Obsidian 命令。這允許工作流觸發任何 Obsidian 命令，包括其他外掛的命令。

```yaml
- id: toggle-fold
  type: obsidian-command
  command: "editor:toggle-fold"
  saveTo: result
```

| 屬性 | 描述 |
|----------|-------------|
| `command` | 要執行的命令 ID（必填，支援 `{{variables}}`） |
| `path` | 執行命令前開啟的檔案（可選，標籤頁保持開啟） |
| `saveTo` | 用於儲存執行結果的變數（可選） |

**輸出格式**（當設定 `saveTo` 時）：
```json
{
  "commandId": "editor:toggle-fold",
  "path": "notes/example.md",
  "executed": true,
  "timestamp": 1704067200000
}
```

**查詢命令 ID：**
1. 開啟 Obsidian 設定 → 快捷鍵
2. 搜尋所需的命令
3. 命令 ID 會顯示（例如 `editor:toggle-fold`、`app:reload`）

**常用命令 ID：**
| 命令 ID | 描述 |
|------------|-------------|
| `editor:toggle-fold` | 在游標處切換摺疊 |
| `editor:fold-all` | 摺疊所有標題 |
| `editor:unfold-all` | 展開所有標題 |
| `app:reload` | 重新載入 Obsidian |
| `workspace:close` | 關閉當前面板 |
| `file-explorer:reveal-active-file` | 在資源管理器中顯示檔案 |

**示例：使用外掛命令的工作流**
```yaml
name: 寫工作日誌
nodes:
  - id: get-content
    type: dialog
    inputTitle: "輸入日誌內容"
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

**用例：** 在工作流中觸發 Obsidian 核心命令或其他外掛的命令。

**示例：加密目錄中的所有檔案**

此工作流使用 Gemini Helper 的加密命令加密指定資料夾中的所有 Markdown 檔案：

```yaml
name: 加密資料夾
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
  - id: wait
    type: sleep
    duration: "1000"
  - id: close-tab
    type: obsidian-command
    command: "workspace:close"
  - id: increment
    type: set
    name: index
    value: "{{index}} + 1"
    next: loop
  - id: done
    type: dialog
    title: "完成"
    message: "已加密 {{index}} 個檔案"
```

> **注意：** 由於加密命令是非同步執行的，因此使用 `sleep` 節點等待操作完成後再關閉標籤頁。

### sleep

暫停工作流執行指定的時間。適用於等待非同步操作完成。

```yaml
- id: wait
  type: sleep
  duration: "1000"
```

| 屬性 | 描述 |
|------|------|
| `duration` | 暫停時間（毫秒，必填，支援 `{{variables}}`） |

**示例：**
```yaml
- id: run-command
  type: obsidian-command
  command: "some-plugin:async-operation"
  path: "notes/file.md"
- id: wait-for-completion
  type: sleep
  duration: "2000"
- id: close
  type: obsidian-command
  command: "workspace:close"
```

### script

在沙盒環境中執行 JavaScript 程式碼（無 DOM、網路或儲存訪問）。適用於字串操作、資料轉換、計算和編碼/解碼等 `set` 節點無法處理的操作。

```yaml
- id: sort-items
  type: script
  code: |
    var items = '{{rawList}}'.split(',').map(function(s){ return s.trim(); });
    items.sort();
    return items.join('\n');
  saveTo: sortedList
```

| 屬性 | 描述 |
|----------|-------------|
| `code` | 要執行的 JavaScript 程式碼（必填，支援 `{{variables}}`）。使用 `return` 返回值。非字串返回值將被 JSON 序列化。 |
| `saveTo` | 用於儲存結果的變數名（可選） |
| `timeout` | 超時時間（毫秒，可選，預設：`10000`） |

**示例：Base64 編碼**
```yaml
- id: encode
  type: script
  code: "return btoa('{{plainText}}')"
  saveTo: encoded
```

---

**示例：使用 ragujuary 進行 RAG 查詢**

[ragujuary](https://github.com/takeshy/ragujuary) 是一個用於管理 Gemini File Search Stores 的 CLI 工具，支援 MCP 伺服器。

1. 安裝和設定：
```bash
go install github.com/takeshy/ragujuary@latest
export GEMINI_API_KEY=your-api-key

# 建立儲存並上傳檔案
ragujuary upload --create -s mystore ./docs

# 啟動 MCP 伺服器（使用 --transport http，而不是 sse）
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

## 工作流終止

使用 `next: end` 顯式終止工作流：

```yaml
- id: save
  type: note
  path: "output.md"
  content: "{{result}}"
  next: end    # 工作流在此結束

- id: branch
  type: if
  condition: "{{cancel}}"
  trueNext: end      # 在真分支上結束工作流
  falseNext: continue
```

## 變數展開

使用 `{{variable}}` 語法引用變數：

```yaml
# 基本用法
path: "{{folder}}/{{filename}}.md"

# 物件/陣列訪問
url: "https://api.example.com?lat={{geo.latitude}}"
content: "{{items[0].name}}"

# 巢狀變數（用於迴圈）
path: "{{parsed.notes[{{counter}}].path}}"
```

### JSON轉義修飾符

使用 `{{variable:json}}` 來轉義值以**嵌入字串字面量內部**。這可以正確轉義換行符、引號和其他特殊字元。

**重要：** `:json` 只轉義*內容* — 它**不會**新增外圍引號。在字串內部嵌入時，您必須自己提供引號。

```yaml
# 不使用 :json - 如果內容包含換行符/引號會出錯
args: '{"text": "{{content}}"}'  # 如果內容有特殊字元會出錯

# 使用 :json - 對任何內容都安全（周圍的 "..." 是您的字串字面量）
args: '{"text": "{{content:json}}"}'  # OK - 正確轉義
```

**在 `script` 節點（JavaScript）中：**

`:json` 在程式碼執行前替換為純文本，因此當值應為 JS 字串時，您必須用引號將其包起來：

```yaml
# ✅ 正確 — 包含已轉義內容的字串字面量
code: |
  var text = "{{userInput:json}}";
  var data = JSON.parse("{{jsonStr:json}}");

# ❌ 錯誤 — 缺少外圍引號，產生無效的 JS
code: |
  var text = {{userInput:json}};          # 語法錯誤
  JSON.parse({{jsonStr:json}});           # 需要字串引數
```

如果變數已經包含已解析的物件/陣列（例如來自先前的 `json` 節點），使用*不帶*引號的 `{{var:json}}`，使其成為 JS 物件/陣列字面量：

```yaml
code: |
  var arr = {{parsedArray:json}};         # 變為：var arr = [{"url":"..."}]
```

這在將檔案內容或使用者輸入傳遞給 `mcp`、`http` 或 `script` 節點時是必需的。

### `json` 節點 — `source` 是純變數名

`json` 節點的 `source` 屬性**僅接受變數名** — 不接受插值表示式、引號或方括號：

```yaml
# ✅ 正確
- id: parse-body
  type: json
  source: apiResponseBody
  saveTo: parsed

# ❌ 錯誤
- id: parse-body
  type: json
  source: "{{apiResponseBody}}"          # 這裡不會插值
  # 或: source: "[{{apiResponseBody}}]"  # 包裹會破壞有效的 JSON
```

## 智慧輸入節點

`prompt-selection` 和 `prompt-file` 節點會自動檢測執行上下文：

| 節點 | 面板模式 | 快捷鍵模式 | 事件模式 |
|------|------------|-------------|------------|
| `prompt-file` | 顯示檔案選擇器 | 使用活動檔案 | 使用事件檔案 |
| `prompt-selection` | 顯示選擇對話方塊 | 使用選擇或整個檔案 | 使用整個檔案內容 |

---

## 事件觸發器

工作流可以由 Obsidian 事件自動觸發。

![事件觸發器設定](event_setting.png)

### 可用事件

| 事件 | 描述 |
|-------|-------------|
| `create` | 檔案建立 |
| `modify` | 檔案修改/儲存（防抖 5 秒） |
| `delete` | 檔案刪除 |
| `rename` | 檔案重新命名 |
| `file-open` | 檔案開啟 |

### 事件變數

當由事件觸發時，這些變數會自動設定：

| 變數 | 描述 |
|----------|-------------|
| `_eventType` | 事件型別：`create`、`modify`、`delete`、`rename`、`file-open` |
| `_eventFilePath` | 受影響檔案的路徑 |
| `_eventFile` | JSON：`{"path": "...", "basename": "...", "name": "...", "extension": "..."}` |
| `_eventFileContent` | 檔案內容（用於 create/modify/file-open 事件） |
| `_eventOldPath` | 之前的路徑（僅用於 rename 事件） |

### 檔案模式語法

使用 glob 模式按檔案路徑篩選事件：

| 模式 | 匹配 |
|---------|---------|
| `**/*.md` | 任意資料夾中的所有 .md 檔案 |
| `journal/*.md` | journal 資料夾中直接的 .md 檔案 |
| `*.md` | 僅根資料夾中的 .md 檔案 |
| `**/{daily,weekly}/*.md` | daily 或 weekly 資料夾中的檔案 |
| `projects/[a-z]*.md` | 以小寫字母開頭的檔案 |
| `docs/**` | docs 資料夾下的所有檔案 |

### 事件觸發工作流示例

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
    path: "{{_eventFilePath}}"
    content: "---\ntags: {{tags}}\n---\n\n{{content}}"
    mode: overwrite
    confirm: false
```
````

**設定：** 在工作流面板中點選 ⚡ → 啟用"檔案建立" → 設定模式 `**/*.md`

---

## 實用示例

### 1. 筆記摘要

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

### 2. 網路研究

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

### 3. 條件處理

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

### 4. 批次處理筆記

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

### 5. API 整合

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

### 6. 翻譯選中內容（帶快捷鍵）

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

**快捷鍵設定：**
1. 為您的工作流新增 `name:` 欄位
2. 開啟工作流檔案並從下拉選單中選擇工作流
3. 點選工作流面板底部的鍵盤圖示
4. 進入設定 → 快捷鍵 → 搜尋"Workflow: Translate Selection"
5. 分配快捷鍵（例如 `Ctrl+Shift+T`）

### 7. 子工作流組合

**檔案：`workflows/translate.md`**
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

**檔案：`workflows/main.md`**
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
    input: '{"text": "{{userInput.input}}", "targetLang": "Japanese"}'
    output: '{"japaneseText": "translated"}'
  - id: toSpanish
    type: workflow
    path: "workflows/translate.md"
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

### 8. 互動式任務選擇

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
