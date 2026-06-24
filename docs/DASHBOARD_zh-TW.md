# 儀表板

用響應式小工具網格建立你專屬的**首頁/概覽頁**。儀表板是一個 `.dashboard` 檔案，它將 **Bases 檢視**、**筆記**、**網頁**和**工作流輸出**排列在可拖曳和調整大小的網格中。像開啟任何筆記一樣開啟它，即可得到可即時編輯的面板。

![儀表板](images/dashboard.png)

- [儀表板 vs Canvas](#儀表板-vs-canvas)
- [建立儀表板](#建立儀表板)
- [編輯模式](#編輯模式)
- [小工具類型](#小工具類型)
  - [Base](#base--嵌入-bases-檢視)
  - [Markdown](#markdown--嵌入筆記)
  - [Web Embed](#web-embed--嵌入網頁)
  - [Workflow](#workflow--渲染工作流輸出)
  - [Kanban](#kanban--拖曳卡片以變更狀態)
- [響應式佈局](#響應式佈局)
- [用 AI 建立小工具](#用-ai-建立小工具)
- [`.dashboard` 檔案格式](#dashboard-檔案格式)
- [提示與注意事項](#提示與注意事項)

---

## 儀表板 vs Canvas

Obsidian 的 **Canvas** 和儀表板看起來相似，但解決的問題不同：

| | 儀表板 | Canvas |
|---|-----------|--------|
| **內容** | **即時** — Bases 檢視、工作流輸出和筆記會自行更新（由查詢驅動） | **靜態** — 卡片是手動放置的快照 |
| **佈局** | 響應式網格（12 欄；窄螢幕會重排為單欄） | 自由形式的無限平面，使用絕對位置 |
| **用途** | 結構化的**首頁/概覽**，用於開啟後快速查看狀態 | 用於**思考**的空間 — 排列想法並用箭頭連接 |
| **AI** | 從聊天中建立（`dashboard` 技能會建立檔案及其底層 `.base` 資料） | 手動放置 |
| **檢視** | 不會被誤動的唯讀檢視模式 | 永遠可編輯 |

簡而言之：使用**儀表板**取得即時、一目了然的概覽（任務、生成摘要、嵌入頁面）；使用 **Canvas** 進行自由形式的空間思考和關係整理。主要取捨是**動態 vs 靜態**以及**響應式網格 vs 自由放置**。

---

## 建立儀表板

有兩種方式可以建立儀表板：

1. **命令** — 從命令面板執行 **「Gemini Helper: 建立儀表板」**。這會在 `Dashboards/` 資料夾下建立新檔案（命名為 `Dashboard`、`Dashboard 2`…）並開啟。
2. **詢問 AI** — 外掛內建 **`dashboard`** 代理技能。在聊天中啟用它並描述你想要的內容（*「一個顯示我的進行中任務、歡迎筆記和今日天氣的首頁」*）。AI 會為你建立 `.dashboard` 檔案以及任何底層 `.base` 檔案。

儀表板以純 `.dashboard` 檔案儲存在你的 Vault 中，因此會像其他筆記一樣同步和版本管理。

---

## 編輯模式

每個儀表板都會以**檢視模式**開啟。使用工具列切換：

- **編輯** — 進入編輯模式：拖曳小工具以移動它們，拖曳小工具右下角以調整大小，按一下**齒輪**設定小工具，按一下**垃圾桶**刪除小工具。
- **+ 新增小工具** — 開啟小工具面板（僅編輯模式）。
- **復原 / 重做** — 逐步回到本次工作階段中的佈局變更。
- **完成** — 回到檢視模式。

> 所有編輯都會**自動儲存** — 沒有獨立的儲存按鈕。

---

## 小工具類型

在編輯模式中，按一下 **+ 新增小工具** 以選擇小工具類型：

![新增小工具面板](images/dashboard_widgets.png)

### Base — 嵌入 Bases 檢視

使用 Obsidian 的**原生 Bases UI**（表格 / 卡片 / 清單 / 地圖）渲染 `.base` 檔案的命名檢視。這是主要的資料小工具 — 對筆記清單、表格或卡片檢視，優先使用它，而不是重新實作一個。

![Base 小工具設定](images/dashboard_base.png)

| 設定 | 說明 |
|---------|-------------|
| **Base 檔案** | `.base` 檔案的 Vault 路徑 |
| **檢視** | 要渲染的檢視名稱；留空則使用 base 的第一個檢視 |
| **用 AI 建立** | 不離開面板即可建立新的 `.base` 檔案（或編輯已選取的檔案） |

同一個 `.base` 檔案可以被多個 Base 小工具參照，例如每個檢視一個小工具（Active / Done / Backlog）。

### Markdown — 嵌入筆記

將現有 Markdown 筆記以唯讀嵌入方式內嵌渲染（並附上開啟完整筆記的連結）。

![Markdown 小工具設定](images/dashboard_markdown.png)

| 設定 | 說明 |
|---------|-------------|
| **Markdown 筆記** | 要嵌入的筆記 Vault 路徑（可搜尋選擇器） |

### Web Embed — 嵌入網頁

在 iframe 中嵌入網頁。

![Web Embed 小工具設定](images/dashboard_web.png)

| 設定 | 說明 |
|---------|-------------|
| **URL** | 要嵌入的頁面 |

> [!NOTE]
> 有些網站會送出 `X-Frame-Options` / `Content-Security-Policy` 標頭來阻擋嵌入，因此會顯示空白。

### Workflow — 渲染工作流輸出

以**無頭**方式執行現有[工作流](WORKFLOW_NODES_zh-TW.md)，並將輸出渲染為 Markdown 或 HTML。這讓你可以把動態生成內容（摘要、報告）放到儀表板上。

![Workflow 小工具設定](images/dashboard_workflow.png)

| 設定 | 說明 |
|---------|-------------|
| **輸出格式** | `Markdown` 或 `HTML`（HTML 會在沙盒化 iframe 中渲染） |
| **Workflow** | 要執行的工作流筆記 |
| **用 AI 建立** | 為此小工具建立新的工作流（或編輯已選取的工作流） |
| **輸出變數** | 保存輸出字串的工作流變數（預設 `result`） |
| **執行** | 立即執行工作流並快取結果 |
| **自動重新整理間隔（分鐘）** | `0` = 僅手動；否則開啟時如果快取結果比此間隔更舊，會自動執行一次 |

> [!IMPORTANT]
> **工作流小工具從快取渲染，而不是即時執行。** 為避免每次開啟面板都重新執行耗時工作流，渲染路徑**只**讀取快取結果。只有在下列情況才會執行：
> - 按一下 **執行**（在小工具標頭或設定面板中），或
> - 開啟儀表板且快取結果早於自動重新整理間隔。
>
> 結果會儲存在儀表板旁的隱藏 **sidecar 檔案**中，因此重新開啟後輸出仍會保留，而不會讓 `.dashboard` 檔案膨脹。工作流必須將 Markdown/HTML 輸出儲存在字串變數中（預設 `result`）— 不支援卡片/表格輸出。由於它會無人值守執行，工作流不得使用互動節點（`prompt-*`、`dialog`）。

### Kanban — 拖曳卡片以變更狀態

將符合**標籤**和/或**資料夾**篩選的筆記渲染為卡片，並依 frontmatter 的**狀態屬性**分組到各欄。將卡片拖到另一欄即可更新該筆記的狀態（透過 `processFrontMatter` 寫入）。按一下卡片可在彈窗中預覽其筆記；彈窗的開啟圖示會在新分頁中開啟該筆記。看板在**檢視模式**下可互動 — 無需進入編輯模式即可拖曳卡片。

![看板](images/dashboard_kanban.png)

看板標頭會顯示可選的**標題**（當一個儀表板包含多個看板時很有用）和**新增**按鈕。新增會開啟小型彈窗以輸入卡片標題並選擇欄，然後建立一則已符合此看板篩選條件的筆記 — 放在設定的資料夾中、加上設定的標籤，並設為所選欄的狀態。新卡片會出現在看板上（你仍停留在儀表板）；想開啟筆記時再按一下它。

在編輯模式的小工具設定中設定看板：

![看板設定](images/dashboard_kanban_edit.png)

| 設定 | 說明 |
|---------|-------------|
| **看板標題** | 顯示在看板標頭。當多個看板共用一個儀表板時很有用。 |
| **標籤篩選** | 只顯示帶有此標籤的筆記（不含 `#`）。空白 = 所有標籤。 |
| **資料夾篩選** | 只顯示路徑以此前綴開頭的筆記。空白 = 整個 Vault。 |
| **狀態屬性** | 保存卡片狀態的 frontmatter 屬性（預設 `status`）。 |
| **標題屬性** | 作為卡片標題顯示的 frontmatter 屬性。空白 = 檔名。 |
| **欄** | 狀態值的有序清單。每欄都有一個**值**（與屬性比對）和一個**標籤**（顯示為標頭）。 |
| **顯示欄位** | 在每張卡片標題下方顯示的 frontmatter 屬性名有序清單（例如 `priority`、`due`）。每個欄位顯示為 `name: value`；空值會被跳過，清單值會用逗號連接。 |
| **顯示未符合卡片欄** | 啟用時，狀態不符合任何欄的卡片會顯示在額外的「未指定」欄中（預設啟用）。 |

未知的小工具類型（例如來自較新外掛版本）會在**儲存時保留**並渲染為佔位符，因此編輯不熟悉的儀表板不會遺失資料。

---

## 響應式佈局

網格有兩個依容器寬度切換的斷點：

| 斷點 | 條件 | 佈局 |
|------------|------|--------|
| **`lg`**（寬） | ≥ 768px | 你在編輯模式中安排的佈局（預設 12 欄） |
| **`sm`**（窄） | < 768px | 小工具重新排列為**全寬單欄**，從上到下堆疊 |

預設情況下，`sm` 佈局會從寬佈局**自動推導**（按垂直位置排序）。如果你在窄螢幕上移動小工具，這些明確的 `sm` 位置會被保留，其餘小工具會填補周圍空隙。

---

## 用 AI 建立小工具

**Base** 和 **Workflow** 小工具的設定面板中都有 **用 AI 建立** 按鈕：

- 對於 **Base** 小工具，它會開啟 `.base` 檔案的 AI 建立對話框。AI 可以使用唯讀工具（讀取、搜尋、列出）檢查你的筆記，在建立前發現合適的 frontmatter 屬性；例如，要求帶封面圖的卡片檢視時，無需你指定屬性名稱。如果已選取某個 base，按鈕會變為 **用 AI 編輯**：它會顯示擬議 `.base` 與目前檔案之間的 **diff**，並提供**額外指令**輸入框，以便在**套用**前繼續調整。
- 對於 **Workflow** 小工具，它會生成（或編輯）為該小工具量身打造的工作流 — AI 會被要求在輸出變數中產生單一 Markdown/HTML 字串並避免互動節點，因此結果可無頭渲染。生成後，小工具會**自動執行並重新整理**。

你也可以在聊天中使用內建的 **`dashboard`** 代理技能建立整個儀表板。該技能了解 `.dashboard` 結構和 Bases 建立參考。

---

## `.dashboard` 檔案格式

`.dashboard` 檔案是 YAML。通常你不需要手動編輯它（由視覺化編輯器和 AI 管理），但這裡記錄結構以供參考並確保往返安全。

```yaml
version: 1
grid:
  cols: 12        # column count (default 12)
  rowHeight: 80   # pixels per grid row
  gap: 8          # pixels between cells
widgets:
  - id: <uuid>                            # unique id (UUID-like string)
    type: base | markdown | web | workflow | kanban
    layout:
      lg: { x: 0, y: 0, w: 6, h: 4 }      # required: position on the wide grid
      sm: { x: 0, y: 0, w: 12, h: 4 }     # optional: auto-derived (stacked) if omitted
    config: { ... }                       # per-widget-type config (see below)
```

- **`layout.lg`** 是寬（≥768px）網格上的位置。`x`/`y` 是從 0 開始的左上角儲存格；`w`/`h` 是以網格儲存格為單位的寬度/高度。
- **`layout.sm`** 是窄螢幕上的位置。省略它則自動以全網格寬度堆疊。
- 放置小工具時避免重疊；透過增加 `y` 垂直堆疊。

### 每個小工具的 `config`

```yaml
# base
config:
  base: Dashboards/Bases/Tasks.base   # vault path to the .base file
  view: Active                     # view name; omit/empty = first view

# markdown
config:
  path: Home.md                    # vault path to a markdown note

# web
config:
  url: https://example.com

# workflow
config:
  workflow: workflows/Daily Digest.md  # vault path to the workflow note
  output: markdown                     # markdown | html
  outputVariable: result               # variable holding the output string
  refreshInterval: 60                  # minutes; 0/omit = manual refresh only

# kanban
config:
  tag: task                            # optional tag filter (without #)
  folder: ""                           # optional folder path prefix
  statusProperty: status               # frontmatter property holding the status
  titleProperty: ""                    # frontmatter property for card title (empty = file name)
  displayFields: [priority, due]       # frontmatter properties shown on each card
  columns:                             # ordered list of status values
    - value: todo
      label: To Do
    - value: in-progress
      label: In Progress
    - value: done
      label: Done
  showUnspecified: true                # show cards with no/unknown status
```

### 完整範例

```yaml
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
```

---

## 提示與注意事項

- **先建立資料。** 對於 Base 小工具，先建立 `.base` 檔案（及其檢視），再讓小工具指向它。AI 儀表板技能會一次完成這件事。
- **按檢視分組。** 在多個 Base 小工具（Active / Done / Backlog）之間重複使用同一個 `.base`，而不是複製資料。
- **保持工作流小工具輕量。** 它們會快取結果；設定合理的**自動重新整理間隔**，不要每次開啟都執行，並將輸出儲存在 `result`。
- **僅限桌面。** 儀表板（和外掛其他部分一樣）在 Obsidian 桌面版中執行。
- **檔案位於你的 Vault 中。** 儀表板以 `.dashboard` 檔案儲存在 `Dashboards/` 下，並與你的筆記同步/版本管理；每個儀表板的工作流快取位於旁邊的隱藏 sidecar 檔案中。

> 另見：[工作流節點](WORKFLOW_NODES_zh-TW.md) · [代理技能](SKILLS_zh-TW.md)
