# Gemini Helper for Obsidian

[![DeepWiki](https://img.shields.io/badge/DeepWiki-takeshy%2Fobsidian--gemini--helper-blue.svg?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTQgMTloMTZhMiAyIDAgMCAwIDItMlY3YTIgMiAwIDAgMC0yLTJINWEyIDIgMCAwIDAtMiAydjEyYTIgMiAwIDAgMSAyLTJ6Ii8+PHBhdGggZD0iTTkgMTV2LTQiLz48cGF0aCBkPSJNMTIgMTV2LTIiLz48cGF0aCBkPSJNMTUgMTV2LTQiLz48L3N2Zz4=)](https://deepwiki.com/takeshy/obsidian-gemini-helper)

**免費開源的** Obsidian AI 助手，提供由 Google Gemini 驅動的**聊天**、**工作流自動化**和 **RAG** 功能。

> **本外掛完全免費。** 您只需要從 [ai.google.dev](https://ai.google.dev) 取得 Google Gemini API 金鑰（免費或付費）。

## 主要特色

- **AI 聊天** - 串流回應、檔案附件、Vault 操作、斜線命令
- **用量追蹤** - 顯示每次聊天和工作流執行的 API token 數量與預估費用
- **Agent Skills** - 以可用技能擴充聊天；基於 [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) 的 Obsidian Markdown 技能預設啟用
- **工作流建構器** - 使用視覺化節點編輯器和 24 種節點類型自動化多步驟任務
- **MCP 支援** - 在工作流中使用 MCP 工具，並在 Obsidian 內呈現 MCP UI 資源
- **RAG** - 檢索增強生成，在您的 Vault 中進行智慧搜尋
- **AI 資料夾存取** - 當您不希望 AI 存取整個 Vault 時，限制 AI 可自動讀取的資料夾
- **加密** - 使用密碼保護聊天記錄和工作流執行紀錄
- **編輯歷史** - 使用差異檢視追蹤和還原 AI 所做的變更
- **儀表板** - 將 Bases 檢視、筆記、網頁和工作流輸出排列在響應式小工具網格中

![聊天介面](docs/images/chat.png)

## API 金鑰

本外掛需要 Google Gemini API 金鑰。您可以選擇：

| 功能 | 免費 API 金鑰 | 付費 API 金鑰 |
|---------|--------------|--------------|
| 基礎聊天 | ✅ | ✅ |
| Vault 操作 | ✅ | ✅ |
| 網頁搜尋 | ✅ | ✅ |
| RAG | ✅（有限制） | ✅ |
| 工作流 | ✅ | ✅ |
| 圖片生成 | ❌ | ✅ |
| 模型 | Flash, Gemma | Flash, Pro, Image |
| 費用 | **免費** | 依用量付費 |

### 免費 API 金鑰使用技巧

- **速率限制**依模型計算，每日重置。切換模型可繼續使用。
- **RAG 同步**有限制。每天執行「同步 Vault」- 已上傳的檔案會被略過。

---

# AI 聊天

AI 聊天功能提供與 Google Gemini 的互動式對話介面，與您的 Obsidian Vault 深度整合。

![聊天中的圖片生成](docs/images/chat_image.png)

## 開啟聊天
- 點選功能區中的 Gemini 圖示
- 命令：「Gemini Helper: Open chat」
- 切換：「Gemini Helper: Toggle chat / editor」

## 聊天控制
- **Enter** - 傳送訊息
- **Shift+Enter** - 換行
- **停止按鈕** - 停止生成
- **+ 按鈕** - 新建聊天
- **歷史按鈕** - 載入先前的聊天

## 斜線命令

建立可透過 `/` 觸發的可重複使用提示詞範本：

- 使用 `{selection}`（選取文字）和 `{content}`（目前筆記）定義範本
- 可為每個命令單獨設定模型和搜尋覆寫
- 輸入 `/` 檢視可用命令

**預設命令：** `/infographic` - 將內容轉換為 HTML 資訊圖

![資訊圖範例](docs/images/chat_infographic.png)

## @ 提及

輸入 `@` 來參照檔案和變數：

- `{selection}` - 選取的文字
- `{content}` - 目前筆記內容
- 任意 Vault 檔案 - 瀏覽並插入（僅路徑；AI 透過工具讀取內容）

> [!NOTE]
> **`{selection}` 和 `{content}` 的運作原理：** 當您從 Markdown 檢視切換到聊天檢視時，由於焦點變更，選取通常會被清除。為了保留您的選取，外掛會在切換檢視時擷取它，並在 Markdown 檢視中以背景色醒目標示選取區域。`{selection}` 選項僅在有文字被選取時才會出現在 @ 建議中。
>
> `{selection}` 和 `{content}` 都**刻意不在輸入區域展開** ── 由於聊天輸入框較小，展開長文字會使輸入變得困難。內容會在您傳送訊息時展開，您可以透過檢視聊天中已傳送的訊息來驗證這一點。

> [!NOTE]
> Vault 檔案的 @ 提及僅插入檔案路徑 — AI 透過工具讀取內容。

## 檔案附件

直接附加檔案：圖片（PNG、JPEG、GIF、WebP）、PDF、文字檔、音訊（MP3、WAV、FLAC、AAC、Opus、OGG）、影片（MP4、WebM、MOV、AVI、MKV）

## 函式呼叫（Vault 操作）

AI 可以使用以下工具與您的 Vault 互動：

| 工具 | 說明 |
|------|-------------|
| `read_note` | 讀取筆記內容 |
| `create_note` | 建立新筆記 |
| `propose_edit` | 附確認對話框的編輯 |
| `propose_delete` | 附確認對話框的刪除 |
| `bulk_propose_edit` | 附選擇對話框的批次編輯多個檔案 |
| `bulk_propose_delete` | 附選擇對話框的批次刪除多個檔案 |
| `search_notes` | 依名稱或內容搜尋 Vault |
| `list_notes` | 列出資料夾中的筆記 |
| `rename_note` | 重新命名 / 移動筆記 |
| `create_folder` | 建立新資料夾 |
| `list_folders` | 列出 Vault 中的資料夾 |
| `get_active_note_info` | 取得目前筆記的資訊 |
| `get_rag_sync_status` | 檢查 RAG 同步狀態 |
| `bulk_propose_rename` | 透過選擇對話框批次重新命名多個檔案 |

### Vault 工具模式

當 AI 在聊天中處理筆記時，會使用 Vault 工具。透過附件按鈕下方的資料庫圖示（📦）控制 AI 可以使用哪些 Vault 工具：

| 模式 | 說明 | 可用工具 |
|------|------|----------|
| **Vault: 全部** | 完整存取 Vault | 所有工具 |
| **Vault: 無搜尋** | 排除搜尋工具 | 除 `search_notes`、`list_notes` 外的所有工具 |
| **Vault: 關閉** | 無 Vault 存取 | 無 |

**何時使用各模式：**

- **Vault: 全部** - 通用預設模式。AI 可以讀取、寫入和搜尋您的 Vault。
- **Vault: 無搜尋** - 當您只想使用 RAG 搜尋，或者已經知道目標檔案時使用。這可以避免多餘的 Vault 搜尋，節省 token 並提升回應速度。
- **Vault: 關閉** - 當您完全不需要存取 Vault 時使用。

> **注意：** RAG、Web Search、Vault 工具和 MCP 都可以透過 Interactions API 同時使用。

### AI 資料夾存取

在 **設定 → 工作區 → AI 可自動存取的資料夾** 中，您可以選擇 AI 可自動讀取哪些資料夾。當您不希望 AI 讀取某些目錄，除非您明確附加或參照檔案時，請使用此設定。

- 留空表示允許 AI 透過自動 Vault 操作存取整個 Vault
- 輸入相對於 Vault 的資料夾，例如 `Public` 或 `Shared/Docs`，以逗號分隔
- 根資料夾存取不使用 `/`、`.` 或空路徑指定。空值表示不限制資料夾，允許存取整個 Vault
- `.` 和 `..` 路徑片段會被拒絕
- 此設定限制 Chat 和 AI 命令工作流中的自動 Vault 操作。它不限制 RAG 檢索、手動檔案附件、MCP 工具、指令碼或直接的工作流 note 節點
- 對於 AI 永遠不應讀取的檔案，請使用加密，而不要只依賴資料夾範圍

## 安全編輯

當 AI 使用 `propose_edit` 時：
1. 確認對話框會顯示建議的變更
2. 點選**套用**將變更寫入檔案
3. 點選**捨棄**取消而不修改檔案

> 在您確認之前，變更不會被寫入。

## 編輯歷史

追蹤和還原對筆記所做的變更：

- **自動追蹤** - 所有 AI 編輯（聊天、工作流）和手動變更都會被記錄
- **檔案選單存取** - 在 markdown 檔案上按右鍵可存取：
  - **快照** - 將目前狀態儲存為快照
  - **歷史** - 開啟編輯歷史對話框

- **命令面板** - 也可透過「Show edit history」命令存取
- **差異檢視** - 使用色彩標示的新增 / 刪除準確顯示變更內容
- **還原** - 一鍵還原到任何先前的版本
- **複製** - 將歷史版本儲存為新檔案（預設名稱：`{filename}_{datetime}.md`）
- **可調整大小的對話框** - 拖曳移動，從角落調整大小

**差異顯示：**
- `+` 行存在於舊版本中
- `-` 行是在新版本中新增的

**運作原理：**

編輯歷史使用基於快照的方法：

1. **快照建立** - 當檔案首次開啟或被 AI 修改時，其內容的快照會被儲存
2. **差異記錄** - 當檔案被修改時，新內容與快照之間的差異會作為歷史項目記錄
3. **快照更新** - 每次修改後，快照會更新為新內容
4. **還原** - 要還原到先前的版本，從快照反向套用差異

**何時記錄歷史：**
- AI 聊天編輯（`propose_edit` 工具）
- 工作流筆記修改（`note` 節點）
- 透過命令手動儲存
- 開啟檔案時如果與快照不同則自動偵測

**儲存：** 編輯歷史儲存在記憶體中，Obsidian 重新啟動時會被清除。持久的版本追蹤由 Obsidian 內建的檔案復原功能涵蓋。

![編輯歷史對話框](docs/images/edit_history.png)

## RAG

檢索增強生成，用於智慧 Vault 搜尋：

- **支援的檔案** - Markdown、PDF、Office 文件（Doc、Docx、XLS、XLSX、PPTX）
- **內部模式** - 將 Vault 檔案同步到 Google File Search
- **外部模式** - 使用現有的儲存 ID
- **增量同步** - 僅上傳變更的檔案
- **目標資料夾** - 指定要包含的資料夾
- **排除模式** - 使用正規表示式模式排除檔案

![RAG 設定](docs/images/setting_rag.png)

## MCP 伺服器

MCP（Model Context Protocol）伺服器提供額外的工具，擴充 AI 在 Vault 操作之外的能力。

**設定：**

1. 開啟外掛設定 → **MCP 伺服器**區段
2. 點選**新增伺服器**
3. 輸入伺服器名稱和 URL
4. 設定可選的驗證標頭（JSON 格式）
5. 點選**測試連線**以驗證並取得可用工具
6. 儲存伺服器設定

> **注意：** 儲存前必須測試連線。這確保伺服器可存取並顯示可用工具。

![MCP 伺服器設定](docs/images/setting_mcp.png)

**使用 MCP 工具：**

- **在聊天中：** 點選資料庫圖示（📦）開啟工具設定。依對話啟用 / 停用 MCP 伺服器。
- **在工作流中：** 使用 `mcp` 節點呼叫 MCP 伺服器工具。

**工具提示：** 連線測試成功後，可用工具名稱會被儲存，並在設定和聊天介面中顯示以供參考。

### MCP Apps（互動式 UI）

部分 MCP 工具會傳回互動式 UI，讓您以視覺化方式與工具結果互動。此功能基於 [MCP Apps 規範](https://github.com/anthropics/anthropic-cookbook/tree/main/misc/mcp_apps)。

**運作原理：**

- 當 MCP 工具在回應中繼資料中傳回 `ui://` 資源 URI 時，外掛會擷取並呈現 HTML 內容
- UI 在沙箱 iframe 中顯示以確保安全（`sandbox="allow-scripts allow-forms"`）
- 互動式應用可以透過 JSON-RPC 橋接呼叫其他 MCP 工具並更新上下文

**在聊天中：**
- MCP Apps 在助理訊息中內嵌顯示，附有展開 / 收合按鈕
- 點選 ⊕ 展開為全螢幕，⊖ 收合

**在工作流中：**
- MCP Apps 在工作流執行期間以對話框形式顯示
- 工作流會暫停以允許使用者互動，然後在關閉對話框後繼續

> **安全性：** 所有 MCP App 內容都在具有受限權限的沙箱 iframe 中執行。iframe 無法存取父頁面的 DOM、Cookie 或本機儲存。僅啟用 `allow-scripts` 和 `allow-forms`。

## 代理技能

透過自訂指令、參考資料和可執行工作流擴充 AI 的能力。技能遵循業界標準的代理技能模式（如 [OpenAI Codex](https://github.com/openai/codex) 的 `.codex/skills/`）。

- **內建技能** - 開箱即用的 Obsidian 專屬知識（Markdown、Canvas、Bases）。基於 [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills)
- **自訂指令** - 透過 `SKILL.md` 檔案定義特定領域的行為
- **參考資料** - 在 `references/` 中包含風格指南、範本和檢查清單
- **工作流整合** - 技能可以將工作流作為 Function Calling 工具公開
- **斜線命令** - 輸入 `/folder-name` 即可立即呼叫技能並傳送
- **選擇性啟動** - 依對話選擇哪些技能處於啟用狀態
- **可點選的技能標籤** - 輸入區和助理訊息中顯示的已啟用技能標籤可以點選開啟對應的 `SKILL.md`（內建技能顯示為靜態標籤）
- **工作流錯誤復原** - 如果技能工作流在聊天中失敗，失敗的工具呼叫會顯示**開啟工作流**按鈕，點選後會開啟檔案*並*將 Gemini 檢視切換到 Workflow / skill 分頁，您可以立即編輯並重新執行

建立技能的方式與工作流相同 — 選擇 **+ New (AI)**，勾選**「作為代理技能建立」**，然後描述您想要的功能。AI 會同時生成 `SKILL.md` 指令和工作流。若要編輯現有技能，請開啟其 `SKILL.md` 並在 Workflow / skill 分頁中點選**使用 AI 修改技能** — AI 會同時更新指令內文和參照的工作流。

> **有關設定說明和範例，請參閱 [SKILLS.md](docs/SKILLS_zh-TW.md)**

---

# 工作流建構器

直接在 Markdown 檔案中建構自動化多步驟工作流。**無需程式設計知識** - 只需用自然語言描述您想要的內容，AI 就會為您建立工作流。

![視覺化工作流編輯器](docs/images/visual_workflow.png)

## 執行工作流

**從側邊欄：**
1. 在側邊欄中開啟 **Workflow / skill** 分頁
2. 開啟包含 `workflow` 程式碼區塊的檔案
3. 從下拉選單中選擇工作流（或選擇 **Browse all workflows** 搜尋 Vault 中的所有工作流）
4. 點選**執行**
5. 點選**歷史**檢視過去的執行記錄

**從命令面板（Run Workflow）：**

使用「Gemini Helper: Run Workflow」命令從任何位置瀏覽和執行工作流：

1. 開啟命令面板並搜尋「Run Workflow」
2. 瀏覽所有包含工作流程式碼區塊的 Vault 檔案（`workflows/` 資料夾中的檔案優先顯示）
3. 預覽工作流內容和 AI 生成歷史
4. 選擇工作流並點選 **Run** 執行

![執行工作流對話框](docs/images/workflow_list.png)

這對於快速執行工作流而無需先導覽到工作流檔案非常有用。

![工作流歷史](docs/images/workflow_history.png)

**匯出執行歷史：** 將執行歷史視覺化為 Obsidian Canvas 進行視覺分析。在歷史對話框中點選 **Open Canvas view** 建立 Canvas 檔案。

> **注意：** Canvas 檔案會動態建立在 workspace 資料夾中。檢視後如不再需要，請手動刪除。

![歷史 Canvas 檢視](docs/images/history_canvas.png)

## AI 驅動的工作流和技能建立

**您不需要學習 YAML 語法或節點類型。** 只需用自然語言描述您的工作流：

1. 在 Gemini 側邊欄中開啟 **Workflow / skill** 分頁
2. 從下拉選單中選擇 **+ New (AI)**
3. 描述您想要的內容：*「建立一個工作流，摘要選取的筆記並儲存到 summaries 資料夾」*
4. 如果要建立代理技能而非獨立工作流，請勾選**「作為代理技能建立」**
5. 選擇模型並點選**生成**
6. AI 首先會用自然語言生成**計畫** — 檢查後點選 **OK** 繼續，點選**重新規劃**以提供回饋並重新生成計畫，或點選**取消**中止
7. 生成後，AI 會對結果進行**審查**。如果發現問題，您可以選擇 **OK**（附確認對話框）、**再修正**（使用審查回饋重新生成）或**取消**。沒有問題的審查會自動繼續
8. 確認最終預覽後工作流會被儲存

> **提示：** 在已有工作流的檔案上使用下拉選單中的 **+ New (AI)** 時，輸出路徑會預設為目前檔案。生成的工作流將附加到該檔案中。

**從任意檔案建立工作流：**

當在沒有工作流程式碼區塊的檔案上開啟 Workflow / skill 分頁時，會顯示 **「Create workflow with AI」** 按鈕。點選它可以生成新的工作流（預設輸出：`workflows/{{name}}.md`）。

**@ 檔案參照：**

在描述欄位中輸入 `@` 以參照檔案：
- `@{selection}` - 目前編輯器選取內容
- `@{content}` - 目前筆記內容
- `@path/to/file.md` - Vault 中的任意檔案

點選生成時，檔案內容會直接嵌入到 AI 請求中。YAML 前置資訊會自動移除。

> **提示：** 這對於基於 Vault 中現有的工作流範例或範本建立工作流非常有用。

**檔案附件：**

點選附件按鈕可以附加檔案（圖片、PDF、文字檔）到您的工作流生成請求中。這對於向 AI 提供視覺上下文或範例非常有用。

**使用外部 LLM（複製提示詞 / 貼上回應）：**

您可以使用任何外部 LLM（Claude、GPT 等）來生成工作流：

1. 如同往常填寫工作流名稱和描述
2. 點選 **Copy Prompt** - 完整提示詞將複製到剪貼簿
3. 將提示詞貼上到您偏好的 LLM 中
4. 複製 LLM 的回應
5. 貼上到出現的**貼上回應**文字框中
6. 點選**套用**建立工作流

貼上的回應可以是原始 YAML 或包含 `` ```workflow `` 程式碼區塊的完整 Markdown 文件。Markdown 回應將按原樣儲存，保留 LLM 包含的所有文件。

![使用 AI 建立工作流](docs/images/create_workflow_with_ai.png)

**對話框控制：**

AI 工作流對話框支援拖放定位和從角落調整大小，以提供更好的編輯體驗。

**請求歷史：**

每個 AI 生成的工作流都會在工作流程式碼區塊上方儲存歷史記錄，包括：
- 時間戳記和操作（已建立 / 已修改）
- 您的請求描述
- 參照的檔案內容（在可收合區段中）

**以同樣的方式修改現有工作流：**
1. 載入任意工作流
2. 點選 **AI Modify** 按鈕（星形圖示）
3. 描述變更：*「新增一個步驟將摘要翻譯成日語」*
4. 執行相同的計畫 → 生成 → 審查流程。您可以對審查結果點選任意次**再修正**；每次再修正都會觸發一次新的生成過程和一次新的審查，因此顯示的審查始終與最終的 YAML 一致
5. 檢視前後差異
6. 點選**套用變更**進行更新

**使用 AI 修改技能：**

當作用中檔案為 `SKILL.md` 時，Workflow / skill 分頁會顯示**「使用 AI 修改技能」**按鈕，取代（或同時顯示）常規的工作流修改按鈕。它會一次性編輯整個技能 — 同時編輯 SKILL.md 指令內文*和*參照的工作流檔案 — 並保留技能的 frontmatter（name、description、workflows 項目）。

**執行歷史參照：**

使用 AI 修改工作流時，您可以參照先前的執行結果來協助 AI 理解問題：

1. 點選**參照執行歷史**按鈕
2. 從清單中選擇一次執行記錄（錯誤執行會醒目標示）
3. 選擇要包含的步驟（錯誤步驟預設已選取）
4. AI 會收到步驟的輸入 / 輸出資料，以了解哪裡出了問題

這對於偵錯工作流特別有用 - 您可以告訴 AI「修正步驟 2 中的錯誤」，它會準確地看到是什麼輸入導致了失敗。

**請求歷史：**

重新生成工作流時（在預覽中點選「否」），工作階段中所有先前的請求都會傳遞給 AI。這有助於 AI 理解您在多次迭代中修改的完整上下文。

**手動工作流編輯：**

使用拖放介面在視覺化節點編輯器中直接編輯工作流。

![手動工作流編輯](docs/images/modify_workflow_manual.png)

**從檔案重新載入：**
- 從下拉選單中選擇 **Reload from file** 以從 markdown 檔案重新匯入工作流

## 快速入門（手動）

您也可以手動撰寫工作流。在任意 Markdown 檔案中新增工作流程式碼區塊：

````markdown
```workflow
name: Quick Summary
nodes:
  - id: input
    type: dialog
    title: Enter topic
    inputTitle: Topic
    saveTo: topic
  - id: generate
    type: command
    prompt: "Write a brief summary about {{topic.input}}"
    saveTo: result
  - id: save
    type: note
    path: "summaries/{{topic.input}}.md"
    content: "{{result}}"
    mode: create
```
````

在 Gemini 側邊欄中開啟 **Workflow / skill** 分頁來執行它。

## 可用節點類型

24 種節點類型可用於建構工作流：

| 類別 | 節點 |
|----------|-------|
| 變數 | `variable`, `set` |
| 控制 | `if`, `while` |
| LLM | `command` |
| 資料 | `http`, `json`, `script` |
| 筆記 | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` |
| 檔案 | `file-explorer`, `file-save` |
| 提示 | `prompt-file`, `prompt-selection`, `dialog` |
| 組合 | `workflow` |
| RAG | `rag-sync` |
| 外部 | `mcp`, `obsidian-command` |
| 公用程式 | `sleep` |

> **詳細的節點規格和範例，請參閱 [WORKFLOW_NODES.md](docs/WORKFLOW_NODES_zh-TW.md)**

## 快速鍵模式

指定鍵盤快速鍵以即時執行工作流：

1. 在工作流中新增 `name:` 欄位
2. 開啟工作流檔案並從下拉選單中選擇工作流
3. 點選工作流面板底部的鍵盤圖示（⌨️）
4. 前往設定 → 快速鍵 → 搜尋「Workflow: [您的工作流名稱]」
5. 指定快速鍵（例如 `Ctrl+Shift+T`）

透過快速鍵觸發時：
- `prompt-file` 自動使用目前檔案（無對話框）
- `prompt-selection` 使用目前選取，如果沒有選取則使用完整檔案內容

## 事件觸發器

工作流可以由 Obsidian 事件自動觸發：

![事件觸發器設定](docs/images/event_setting.png)

| 事件 | 說明 |
|-------|-------------|
| File Created | 建立新檔案時觸發 |
| File Modified | 儲存檔案時觸發（5 秒防抖） |
| File Deleted | 刪除檔案時觸發 |
| File Renamed | 重新命名檔案時觸發 |
| File Opened | 開啟檔案時觸發 |

**事件觸發器設定：**
1. 在工作流中新增 `name:` 欄位
2. 開啟工作流檔案並從下拉選單中選擇工作流
3. 點選工作流面板底部的閃電圖示（⚡）
4. 選擇哪些事件應觸發工作流
5. 可選擇新增檔案模式篩選器

**檔案模式範例：**
- `**/*.md` - 任意資料夾中的所有 Markdown 檔案
- `journal/*.md` - 僅 journal 資料夾中的 Markdown 檔案
- `*.md` - 僅根資料夾中的 Markdown 檔案
- `**/{daily,weekly}/*.md` - daily 或 weekly 資料夾中的檔案
- `projects/[a-z]*.md` - 以小寫字母開頭的檔案

**事件變數：** 當由事件觸發時，以下變數會自動設定：

| 變數 | 說明 |
|----------|-------------|
| `_eventType` | 事件類型：`create`、`modify`、`delete`、`rename`、`file-open` |
| `_eventFilePath` | 受影響檔案的路徑 |
| `_eventFile` | 包含檔案資訊的 JSON（path、basename、name、extension） |
| `_eventFileContent` | 檔案內容（用於 create/modify/file-open 事件） |
| `_eventOldPath` | 先前的路徑（僅用於 rename 事件） |

> **注意：** `prompt-file` 和 `prompt-selection` 節點在由事件觸發時會自動使用事件檔案。`prompt-selection` 使用整個檔案內容作為選取。

---

# 儀表板

用響應式小工具網格建立你專屬的**首頁/概覽頁**。儀表板是一個 `.dashboard` 檔案，它將 **Bases 檢視**、**筆記**、**網頁**、**工作流輸出**和**看板**排列在可拖曳和調整大小的網格中——像開啟任何筆記一樣開啟它，即可看到可即時編輯的面板。

![儀表板](docs/images/dashboard.png)

**建立儀表板：**
- 命令：**「Gemini Helper: 建立儀表板」** — 在 `Dashboards/` 下建立新面板並開啟
- 或在聊天中請 AI 建立（內建的 **dashboard** 代理技能會為你建立 `.dashboard` 檔案及其底層 `.base` 檔案）

**編輯模式：** 按一下 **編輯** 以移動、調整大小、新增和設定小工具；按 **完成** 回到檢視。網格是響應式的——在窄螢幕上小工具會換成單欄。所有變更都會自動儲存。

## 小工具類型

在編輯模式中按一下 **+ 新增小工具** 以選擇類型：

![新增小工具](docs/images/dashboard_widgets.png)

| 小工具 | 顯示 | 主要設定 |
|--------|-------|------------|
| **Base** | 透過 Obsidian 原生 Bases UI（表格 / 卡片 / 清單）顯示 `.base` 檔案的命名檢視 | `base` 路徑、`view` 名稱 |
| **Markdown** | 內嵌渲染現有筆記 | 筆記的 `path` |
| **Web Embed** | iframe 中的網頁 | `url` |
| **Workflow** | 以無頭方式執行工作流，並將輸出渲染為 Markdown 或 HTML | `workflow` 路徑、`output`、`refreshInterval` |
| **Kanban** | 將筆記顯示為可拖曳的卡片，按狀態欄分組 | `tag`/`folder` 篩選、`statusProperty`、`columns`、`displayFields` |

**Base** 和 **Workflow** 小工具包含 **用 AI 建立** 按鈕，可在不離開設定面板的情況下建立作為基礎的 `.base` 檔案或工作流。對於 Base，AI 可以在建立前使用唯讀工具檢查你的筆記；**用 AI 編輯** 會在套用前顯示 diff，並提供額外指令輸入框以便繼續調整。

## 看板

將筆記變成拖放式看板。卡片是符合 **標籤** 和/或 **資料夾** 篩選的筆記，按 frontmatter 中的 **狀態屬性** 分組到各欄。將卡片拖到另一欄即可更新該筆記的狀態——直接寫回筆記的 frontmatter。看板在 **檢視模式** 下完全可互動；無需進入編輯模式即可移動卡片。

![看板](docs/images/dashboard_kanban.png)

- **標題與新增** — 頂部顯示可選的看板標題（當一個儀表板包含多個看板時很有用）以及 **新增** 按鈕。新增按鈕會開啟一個對話框，用於輸入標題並選擇一欄，然後建立一條已符合看板篩選條件（資料夾、標籤、狀態）的筆記。
- **預覽與開啟** — 按一下卡片可在對話框中預覽其筆記；對話框中的開啟圖示會在新分頁中開啟該筆記。
- **欄** — 以顏色區分且完全可設定；可選的「未指定」欄會收集狀態與任何欄都不符合的卡片。
- **顯示欄位** — 列出額外的 frontmatter 屬性（例如 `priority`、`due`），顯示在每張卡片標題下方。

在編輯模式下透過小工具設定進行全部設定：

![看板設定](docs/images/dashboard_kanban_edit.png)

> [!NOTE]
> **工作流小工具讀取快取，而不是即時執行。** 工作流小工具只會在按下 **執行** 按鈕、設定編輯器的測試執行，或開啟時快取結果早於**自動重新整理間隔**（分鐘；`0` = 僅手動）時執行一次。結果會儲存在儀表板旁的隱藏 sidecar 檔案中，因此重新開啟後輸出仍會保留。工作流必須將 Markdown/HTML 輸出儲存在變數中（預設 `result`）。

> **關於 `.dashboard` 檔案格式、完整 YAML 結構和 AI 生成提示，請參閱[儀表板文件](docs/DASHBOARD.md)**

---

# 一般設定

## 支援的模型

### 付費方案
| 模型 | 說明 |
|-------|-------------|
| Gemini 3.1 Pro Preview | 最新旗艦模型，1M 上下文（推薦） |
| Gemini 3.1 Pro Preview (Custom Tools) | 針對自訂工具和 bash 的代理工作流最佳化 |
| Gemini 3 Flash Preview | 快速模型，1M 上下文，最佳性價比 |
| Gemini 3.1 Flash Lite Preview | 最具成本效益的高效能模型 |
| Gemini 2.5 Flash | 快速模型，1M 上下文 |
| Gemini 2.5 Pro | Pro 模型，1M 上下文 |
| Gemini 3 Pro (Image) | Pro 圖片生成，4K |
| Gemini 3.1 Flash (Image) | 快速、低成本圖片生成 |

> **Thinking 模式：** 在聊天中，當訊息包含「思考」、「分析一下」或「考慮」等關鍵字時會觸發 Thinking 模式。但是，**Gemini 3.1 Pro** 無論是否包含關鍵字都始終使用 Thinking 模式 — 這些模型不支援停用 Thinking。

**Always Think 開關：**

您可以不使用關鍵字，直接強制為 Flash 模型開啟 Thinking 模式。點選資料庫圖示（📦）開啟工具選單，在 **Always Think** 下勾選對應的開關：

- **Flash** — 預設關閉。勾選後，Flash 模型將始終啟用 Thinking。
- **Flash Lite** — 預設開啟。啟用 Thinking 後，Flash Lite 的成本和速度幾乎沒有差異，建議保持開啟。

開關處於開啟狀態時，無論訊息內容如何，該模型系列都將始終啟用 Thinking。關閉時，將使用現有的基於關鍵字的偵測機制。

![Always Think Settings](docs/images/setting_thinking.png)

### 免費方案
| 模型 | Vault 操作 |
|-------|------------------|
| Gemini 2.5 Flash | ✅ |
| Gemini 2.5 Flash Lite | ✅ |
| Gemini 3 Flash Preview | ✅ |
| Gemini 3.1 Flash Lite Preview | ✅ |
| Gemma 4 (31B, 26B A4B MoE) | ✅ |

## 安裝

### 社群外掛（建議）
1. 開啟 Obsidian 的 **設定 → 社群外掛**
2. 選擇 **瀏覽**
3. 搜尋 `Gemini Helper`
4. 安裝並啟用外掛

### BRAT
如果您想直接從此儲存庫測試 beta 版本，請使用 BRAT。

1. 安裝 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 外掛
2. 開啟 BRAT 設定 → 「Add Beta plugin」
3. 輸入：`https://github.com/takeshy/obsidian-gemini-helper`
4. 在社群外掛設定中啟用該外掛

### 手動安裝
1. 從 releases 下載 `main.js`、`manifest.json`、`styles.css`
2. 在 `.obsidian/plugins/` 中建立 `gemini-helper` 資料夾
3. 複製檔案並在 Obsidian 設定中啟用

### 從原始碼建置
```bash
git clone https://github.com/takeshy/obsidian-gemini-helper
cd obsidian-gemini-helper
npm install
npm run build
```

## 設定

### API 設定
1. 從 [ai.google.dev](https://ai.google.dev) 取得 API 金鑰
2. 在外掛設定中輸入
3. 選擇 API 方案（免費 / 付費）

![基本設定](docs/images/setting_basic.png)

### 工作區設定
- **系統提示詞** - 額外的 AI 指令
- **工具限制** - 控制函式呼叫限制
- **AI 可自動存取的資料夾** - 自動 AI Vault 存取的可選資料夾允許清單。留空表示允許整個 Vault；對於 AI 永遠不應讀取的檔案，請使用加密

![工具限制](docs/images/setting_tool_history.png)

### 加密

分別使用密碼保護您的聊天記錄和工作流執行紀錄。

**設定步驟：**

1. 在外掛設定中設定密碼（使用公鑰加密安全儲存）

![加密初始設定](docs/images/setting_initial_encryption.png)

2. 設定後，為每種紀錄類型切換加密：
   - **加密 AI 聊天記錄** - 加密聊天對話檔案
   - **加密工作流執行紀錄** - 加密工作流歷史檔案

![加密設定](docs/images/setting_encryption.png)

每個設定可以獨立啟用 / 停用。

**功能：**
- **獨立控制** - 選擇要加密的紀錄（聊天、工作流或兩者）
- **自動加密** - 根據設定，新檔案在儲存時加密
- **密碼快取** - 每個工作階段只需輸入一次密碼
- **專用檢視器** - 加密檔案在附預覽的安全編輯器中開啟
- **解密選項** - 需要時可從個別檔案移除加密

**運作原理：**

```
【設定 - 設定密碼時僅一次】
密碼 → 生成金鑰對（RSA） → 加密私鑰 → 儲存在設定中

【加密 - 每個檔案】
檔案內容 → 用新 AES 金鑰加密 → 用公鑰加密 AES 金鑰
→ 儲存到檔案：加密資料 + 加密私鑰（從設定複製） + salt

【解密】
密碼 + salt → 還原私鑰 → 解密 AES 金鑰 → 解密檔案內容
```

- 金鑰對只生成一次（RSA 生成較慢），AES 金鑰為每個檔案生成
- 每個檔案儲存：加密內容 + 加密私鑰（從設定複製） + salt
- 檔案是自包含的 — 僅需密碼即可解密，無需外掛依賴

<details>
<summary>Python 解密指令碼（點選展開）</summary>

```python
#!/usr/bin/env python3
"""無需外掛解密 Gemini Helper 加密檔案"""
import base64, sys, re, getpass
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric import padding

def decrypt_file(filepath: str, password: str) -> str:
    with open(filepath, 'r') as f:
        content = f.read()

    match = re.match(r'^---\n([\s\S]*?)\n---\n([\s\S]*)$', content)
    if not match:
        raise ValueError("無效的加密檔案格式")

    frontmatter, encrypted_data = match.groups()
    key_match = re.search(r'key:\s*(.+)', frontmatter)
    salt_match = re.search(r'salt:\s*(.+)', frontmatter)
    if not key_match or not salt_match:
        raise ValueError("frontmatter 中缺少 key 或 salt")

    enc_private_key = base64.b64decode(key_match.group(1).strip())
    salt = base64.b64decode(salt_match.group(1).strip())
    data = base64.b64decode(encrypted_data.strip())

    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100000)
    derived_key = kdf.derive(password.encode())

    iv, enc_priv = enc_private_key[:12], enc_private_key[12:]
    private_key_pem = AESGCM(derived_key).decrypt(iv, enc_priv, None)
    private_key = serialization.load_der_private_key(base64.b64decode(private_key_pem), None)

    key_len = (data[0] << 8) | data[1]
    enc_aes_key = data[2:2+key_len]
    content_iv = data[2+key_len:2+key_len+12]
    enc_content = data[2+key_len+12:]

    aes_key = private_key.decrypt(enc_aes_key, padding.OAEP(
        mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None))

    return AESGCM(aes_key).decrypt(content_iv, enc_content, None).decode('utf-8')

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"用法: {sys.argv[0]} <加密檔案>")
        sys.exit(1)
    password = getpass.getpass("密碼: ")
    print(decrypt_file(sys.argv[1], password))
```

需要：`pip install cryptography`

</details>

> **警告：** 如果您忘記密碼，加密檔案將無法復原。請妥善保管您的密碼。

> **提示：** 要一次加密目錄中的所有檔案，請使用工作流。參見 [WORKFLOW_NODES_zh-TW.md](docs/WORKFLOW_NODES_zh-TW.md#obsidian-command) 中的「加密目錄中的所有檔案」範例。

![檔案加密工作流](docs/images/enc.png)

**安全優勢：**
- **受 AI 聊天保護** - 加密檔案無法被 AI Vault 操作（`read_note` 工具）讀取。這可以保護 API 金鑰等敏感資料在聊天過程中不會意外洩露。
- **工作流透過密碼存取** - 工作流可以使用 `note-read` 節點讀取加密檔案。存取時會彈出密碼對話框，密碼會在工作階段期間快取。
- **安全儲存機密** - 無需在工作流中直接寫入 API 金鑰，而是將其儲存在加密檔案中。工作流在密碼驗證後執行時讀取金鑰。

### 斜線命令
- 定義透過 `/` 觸發的自訂提示詞範本
- 可為每個命令單獨設定模型和搜尋

![斜線命令](docs/images/setting_slash_command.png)

## 系統需求

- Obsidian v0.15.0+
- Google AI API 金鑰
- 支援桌面版和行動版

## 隱私權

**本機儲存的資料：**
- API 金鑰（儲存在 Obsidian 設定中）
- 聊天記錄（Markdown 檔案，可選加密）
- 工作流執行歷史（可選加密）
- 加密金鑰（私鑰使用您的密碼加密）

**傳送到 Google 的資料：**
- 所有聊天訊息和檔案附件都會傳送到 Google Gemini API 進行處理
- 啟用 RAG 時，Vault 檔案會上傳到 Google File Search
- 啟用網頁搜尋時，查詢會傳送到 Google 搜尋

**傳送到第三方服務的資料：**
- 工作流 `http` 節點可以向工作流中指定的任何 URL 傳送資料

**MCP 伺服器（可選）：**
- MCP（Model Context Protocol）伺服器可以在外掛設定中為工作流 `mcp` 節點設定
- MCP 伺服器是提供額外工具和功能的外部服務

**安全注意事項：**
- 執行前請審查工作流 - `http` 節點可以將 Vault 資料傳輸到外部端點
- 工作流 `note` 節點在寫入檔案前會顯示確認對話框（預設行為）
- 設定 `confirmEdits: false` 的斜線命令將自動套用檔案編輯，不顯示套用 / 捨棄按鈕
- 敏感憑證：不要將 API 金鑰或權杖直接儲存在工作流 YAML 中（`http` 標頭、`mcp` 設定等）。請將它們儲存在加密檔案中，並使用 `note-read` 節點在執行時取得。工作流可以透過密碼提示讀取加密檔案。

有關資料保留政策，請參閱 [Google AI 服務條款](https://ai.google.dev/terms)。

## 授權條款

MIT

## 連結

- [Gemini API 文件](https://ai.google.dev/docs)
- [Obsidian 外掛文件](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## 相關外掛

> **從 v1.11.0 起，本外掛專注於 Gemini 相關功能。**
> CLI 支援已被移除。已建立新外掛 [obsidian-llm-hub](https://github.com/takeshy/obsidian-llm-hub)，支援 CLI 和多種 LLM 提供者（OpenAI、Claude、OpenRouter、Local LLM）。

| 外掛 | 說明 |
|------|------|
| obsidian-gemini-helper | 專注於 Gemini（RAG 透過 File Search API） |
| obsidian-llm-hub | 多 LLM 支援，僅限桌面版（RAG 透過 Embedding，支援 gemini-embedding-2-preview） |
| obsidian-local-llm-hub | 僅限本機 LLM（RAG 僅透過本機 Embedding） |

## 支持

如果您覺得這個外掛有用，請考慮請我喝杯咖啡！

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee)](https://buymeacoffee.com/takeshy)
