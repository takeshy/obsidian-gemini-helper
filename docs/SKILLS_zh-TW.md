# 代理技能

代理技能通過提供自訂指令、參考資料和可執行工作流來擴展 AI 的能力。技能遵循 [OpenAI Codex](https://github.com/openai/codex) 等工具使用的業界標準模式。

## 內建技能

外掛包含三個基於 [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) 的內建技能，教 AI 瞭解 Obsidian 特定的檔案格式。無需 vault 設定 — 它們立即可用。

| 技能 | 描述 | 預設 |
|------|------|------|
| **obsidian-markdown** | Obsidian 風格 Markdown：維基連結 `[[]]`、標註 `> [!note]`、嵌入 `![[]]`、屬性（frontmatter）、標籤、高亮、註釋 | 開啟 |
| **json-canvas** | JSON Canvas 檔案（`.canvas`）：節點、邊、組、顏色、佈局 | 關閉 |
| **obsidian-bases** | Obsidian Bases 檔案（`.base`）：過濾器、公式、檢視（表格/卡片/列表/地圖）、摘要 | 關閉 |

內建技能在技能選擇器下拉選單中顯示，帶有 **built-in** 徽章。像其他技能一樣開啟或關閉它們。將滑鼠懸停在活動技能標籤上可檢視其描述。

啟用 **obsidian-markdown**（預設）後，AI 將使用維基連結而非標準 Markdown 連結，正確格式化標註，並在建立或編輯筆記時遵循 Obsidian 的 frontmatter 約定。

## 自訂技能

### 資料夾結構

技能儲存在 vault 中的可配置資料夾中（預設：`skills/`）。每個技能是一個包含 `SKILL.md` 檔案的子資料夾：

```
skills/
├── code-review/
│   ├── SKILL.md            # 技能定義（必需）
│   ├── references/          # 參考文件（可選）
│   │   ├── style-guide.md
│   │   └── checklist.md
│   └── workflows/           # 可執行工作流（可選）
│       └── run-lint.md
├── meeting-notes/
│   ├── SKILL.md
│   └── references/
│       └── template.md
```

## SKILL.md 格式

每個 `SKILL.md` 檔案包含用於後設資料的 YAML frontmatter 和用於指令的 markdown 正文：

```markdown
---
name: Code Review
description: Reviews code blocks in notes for quality and best practices
workflows:
  - path: workflows/run-lint.md
    description: Run linting on the current note
---

You are a code review assistant. When reviewing code:

1. Check for common bugs and anti-patterns
2. Suggest improvements for readability
3. Verify error handling is adequate
4. Reference the style guide for formatting rules
```

### Frontmatter 欄位

| 欄位 | 必需 | 描述 |
|------|------|------|
| `name` | 否 | 技能的顯示名稱。預設為資料夾名稱 |
| `description` | 否 | 在技能選擇器中顯示的簡短描述 |
| `workflows` | 否 | 工作流引用列表（見下文） |

### 工作流引用

在 frontmatter 中宣告的工作流會被註冊為 AI 可以呼叫的 Function Calling 工具：

```yaml
workflows:
  - path: workflows/run-lint.md
    description: Run linting on the current note
```

`workflows/` 子目錄中的工作流即使沒有 frontmatter 宣告也會被自動發現。自動發現的工作流使用檔案基本名稱作為描述。

## 參考資料

將參考文件放在 `references/` 子資料夾中。當技能處於活動狀態時，這些文件會被自動載入幷包含在 AI 的上下文中。參考資料可用於：

- 風格指南和編碼規範
- 模板和示例
- 檢查清單和流程
- 特定領域的知識

## 工作流

技能工作流使用與[工作流構建器](../README_zh-TW.md#工作流構建器)相同的格式。將工作流 markdown 檔案放在 `workflows/` 子資料夾中：

````markdown
```workflow
name: Run Lint
nodes:
  - id: read
    type: prompt-file
    saveTo: file
  - id: lint
    type: command
    prompt: "Check the following for lint issues:\n{{file.content}}"
    saveTo: result
  - id: show
    type: dialog
    title: Lint Results
    message: "{{result}}"
```
````

當包含工作流的技能處於活動狀態時，AI 會獲得一個 `run_skill_workflow` 工具，可以用來執行這些工作流。工作流 ID 格式為 `skillName/workflowName`（例如 `Code Review/workflows_run-lint`）。

### 互動式執行

技能工作流以互動式模態視窗執行（與工作流面板相同）：

- 顯示即時狀態的執行進度模態視窗
- 互動式提示（`dialog`、`prompt-file`、`prompt-selection`）會向用戶顯示
- 確認對話方塊需要使用者批准
- AI 接收工作流執行日誌作為工具結果

### 向聊天返回值

當 AI 通過 `run_skill_workflow` 呼叫技能工作流時，**名稱不以 `_` 開頭的每個變數都會自動作為工具結果返回給聊天 AI**。您不需要新增一個末尾的 `command` 節點來"輸出"結果 — 只需使用 `saveTo:` 儲存您希望聊天 AI 看到的值即可。

`command` 節點在工作流*內部*執行一次獨立的 LLM 呼叫，並將其輸出儲存到變數中；它不會直接寫入聊天。如果使用者需要某個特定變數按原樣呈現在聊天回覆中，請將該指令寫入 SKILL.md 的指令正文，例如：

> 工作流完成後，請將 `ogpMarkdown` 的值按原樣輸出給使用者，不要新增任何附加評論。

聊天端 AI 在這些指令的引導下，會將變數包含在其響應中。

### 錯誤恢復

如果技能工作流在聊天期間失敗，失敗的工具呼叫會顯示 **開啟工作流** 按鈕。點選它會開啟工作流檔案*並*將 Gemini 檢視切換到 Workflow / skill 標籤，以便您可以編輯流程並重新執行。下方的提示行還會指向"使用 AI 修改工作流" → "參考執行歷史"以修復失敗的步驟。

## 在聊天中使用技能

### 設定

內建技能開箱即用 — 無需設定。要新增自訂技能，請在 vault 根目錄建立 `skills` 資料夾。

### 啟用技能

當技能可用時，它們會顯示在聊天輸入區域中：

1. 點選技能標籤區域旁邊的 **+** 按鈕
2. 從下拉選單中選擇技能以啟用
3. 活動技能顯示為標籤，點選 **x** 可以移除

當技能處於活動狀態時：

- 技能指令和參考資料會注入到系統提示詞中
- 如果技能包含工作流，`run_skill_workflow` 工具將變為可用
- 助手訊息會顯示使用了哪些技能

### 斜槓命令

您可以在聊天輸入中輸入 `/folder-name` 直接呼叫技能：

- **`/folder-name`** — 啟用技能並立即傳送。AI 會主動使用該技能的指令和工作流。
- **`/folder-name 您的訊息`** — 啟用技能並同時傳送「您的訊息」。
- 輸入 `/` 時自動補全會顯示可用技能。從自動補全中選擇後立即傳送。

命令使用資料夾名稱（而非技能的顯示名稱）— 例如，位於 `skills/weekly-report/` 的技能通過 `/weekly-report` 呼叫。

### 示例：建立技能

1. 建立資料夾：`skills/summarizer/`
2. 建立 `skills/summarizer/SKILL.md`：

```markdown
---
name: Summarizer
description: Summarizes notes in bullet-point format
---

When asked to summarize, follow these rules:

- Use concise bullet points
- Group related items under headings
- Include key dates and action items
- Keep summaries under 500 words
```

3. 開啟聊天，點選 **+** 啟用"Summarizer"技能
4. 要求 AI 總結一篇筆記 - 它會遵循該技能的指令

## 技能示例

### 寫作風格指南（指令 + 參考資料）

使用參考文件來保持一致寫作風格的技能。

#### 資料夾結構

```
skills/
└── writing-style/
    ├── SKILL.md
    └── references/
        └── style-guide.md
```

#### `SKILL.md`

```markdown
---
name: Writing Style
description: 為部落格文章保持一致的語氣和格式
---

你是一個寫作助手。請始終遵循參考資料中的風格指南。

在審閱或撰寫文本時：

1. 使用風格指南中指定的語氣和語調
2. 遵循格式規則（標題、列表、強調）
3. 套用詞彙偏好（推薦用詞/避免用詞）
4. 審閱現有文本時指出任何風格違規之處
```

#### `references/style-guide.md`

```markdown
# 部落格風格指南

## 語氣與語調
- 對話式但保持專業
- 優先使用主動語態
- 教程中使用第二人稱（"你"），公告中使用第一人稱複數（"我們"）

## 格式
- 主要章節使用 H2，子章節使用 H3
- 3 個或更多專案使用專案符號列表
- UI 元素和關鍵術語使用粗體
- 程式碼塊標註語言標籤

## 詞彙
- 推薦：使用簡潔的表達而非冗長的表達
- 避免：未經解釋的術語、被動語態、填充詞（"非常"、"真的"、"就是"）
```

---

### 每日日誌（指令 + 工作流）

通過工作流建立當天條目的每日日誌技能。

#### 資料夾結構

```
skills/
└── daily-journal/
    ├── SKILL.md
    └── workflows/
        └── create-entry.md
```

#### `SKILL.md`

```markdown
---
name: Daily Journal
description: 帶有條目建立功能的每日日誌助手
workflows:
  - path: workflows/create-entry.md
    description: 從模板建立今天的日誌條目
---

你是一個日誌助手。幫助使用者回顧和反思他們的一天。

當用戶要求撰寫日誌條目時：

1. 首先使用工作流建立今天的筆記檔案
2. 詢問亮點、挑戰和收穫
3. 使用 ## 亮點 / ## 挑戰 / ## 收穫 結構來格式化條目
4. 保持溫暖、鼓勵的語氣
5. 如果使用者似乎卡住了，建議反思提示
```

#### `workflows/create-entry.md`

````markdown
```workflow
name: 建立日誌條目
nodes:
  - id: date
    type: set
    name: today
    value: "{{_date}}"
  - id: create
    type: note
    path: "Journal/{{today}}.md"
    content: |
      # {{today}}

      ## 亮點


      ## 挑戰


      ## 收穫


      ## 明天
    mode: create
    saveTo: result
  - id: open
    type: open
    path: "Journal/{{today}}.md"
```
````

用法：啟用技能，然後要求"建立今天的日誌條目"——AI 會呼叫工作流建立檔案，然後幫助你填寫內容。

---

### 會議記錄（指令 + 參考資料 + 工作流）

結合自訂指令、模板參考資料和建立工作流的完整功能技能。

#### 資料夾結構

```
skills/
└── meeting-notes/
    ├── SKILL.md
    ├── references/
    │   └── template.md
    └── workflows/
        └── create-meeting.md
```

#### `SKILL.md`

```markdown
---
name: Meeting Notes
description: 帶模板和自動建立功能的結構化會議記錄
workflows:
  - path: workflows/create-meeting.md
    description: 建立包含參會者和議程的新會議記錄
---

你是一個會議記錄助手。請遵循參考資料中的模板。

在協助記錄會議時：

1. 使用工作流建立會議記錄檔案
2. 嚴格遵循模板結構
3. 記錄待辦事項，包含負責人和截止日期，格式為：`- [ ] [負責人] 待辦事項 (截止: YYYY-MM-DD)`
4. 將決議與討論分開，清晰地總結
5. 會議結束後，提議將待辦事項提取為任務
```

#### `references/template.md`

```markdown
# 會議記錄模板

## 必需章節

### 頭部資訊
- **標題**：會議主題
- **日期**：YYYY-MM-DD
- **參會者**：參與者列表

### 議程
討論主題的編號列表。

### 筆記
按議程專案組織的討論詳情。使用子標題。

### 決議
已做出決定的專案符號列表。每項決議必須清晰且可執行。

### 待辦事項
帶有負責人和截止日期的核取方塊列表：
- [ ] [負責人] 描述 (截止: YYYY-MM-DD)

### 後續步驟
後續跟進事項的簡要總結，以及下次會議日期（如適用）。
```

#### `workflows/create-meeting.md`

````markdown
```workflow
name: 建立會議記錄
nodes:
  - id: date
    type: set
    name: today
    value: "{{_date}}"
  - id: gen
    type: command
    prompt: |
      生成會議記錄檔案路徑和初始內容。
      今天的日期是 {{today}}。
      會議主題是：{{topic}}
      參會者：{{attendees}}

      僅返回一個 JSON 物件：
      {"path": "Meetings/YYYY-MM-DD Topic.md", "content": "...遵循模板的 markdown 內容..."}

      使用模板結構：包含日期/參會者的頭部資訊、議程（來自主題）、空的筆記/決議/待辦事項/後續步驟章節。
    saveTo: generated
  - id: parse
    type: json
    source: generated
    saveTo: parsed
  - id: create
    type: note
    path: "{{parsed.path}}"
    content: "{{parsed.content}}"
    mode: create
    saveTo: result
  - id: open
    type: open
    path: "{{parsed.path}}"
```
````

用法：啟用技能，然後說"建立與 Alice、Bob 和 Carol 的設計評審會議記錄"——AI 會使用主題/參會者呼叫工作流，建立結構化筆記並開啟它。

---
