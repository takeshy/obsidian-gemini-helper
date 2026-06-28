# 仪表板

用响应式小组件网格构建你的个人**主页/概览页**。仪表板是一个 `.dashboard` 文件，它将 **Bases 视图**、**笔记**、**网页**、**时间线**、**看板**和**工作流输出**排列在可拖拽和调整大小的网格中。像打开任何笔记一样打开它，即可看到实时可编辑的面板。

![仪表板](images/dashboard.png)

---

## 仪表板 vs Canvas

Obsidian 的 **Canvas** 和仪表板看起来相似，但解决不同的问题：

| | 仪表板 | Canvas |
|---|-----------|--------|
| **内容** | **实时** — Bases 视图、时间线、看板、工作流输出和笔记会自动更新 | **静态** — 卡片是手动放置的快照 |
| **布局** | 响应式网格（12 列；窄屏时重排为单列） | 绝对定位的自由无限平面 |
| **目的** | 结构化的**主页/概览**页面，打开即可查看状态 | **思考**的空间——排列想法并用箭头连接 |
| **AI** | 从聊天中创建（`dashboard` 技能构建文件及其底层的 `.base` 数据） | 手动放置 |
| **查看** | 只读查看模式，不会被干扰 | 始终可编辑 |

简而言之：**仪表板**用于实时一览的概览（任务、生成的摘要、嵌入页面）；**Canvas**用于自由的空间思考和关系建立。关键权衡是**动态 vs 静态**和**响应式网格 vs 自由放置**。

---

## 创建仪表板

有两种创建仪表板的方式：

1. **命令** — 从命令面板运行 **“Gemini Helper: 创建仪表板”**。这会在 `Dashboards/` 文件夹下创建一个新文件（命名为 `Dashboard`、`Dashboard 2`…）并打开它。
2. **请求 AI** — 插件内置了 **`dashboard`** 智能体技能。在聊天中启用它并描述你想要的内容（*“一个显示我的活动任务、欢迎笔记和今日天气的主页”*）。AI 会为你创建 `.dashboard` 文件以及任何作为基础的 `.base` 文件。

仪表板以普通 `.dashboard` 文件存储在你的仓库中，因此会像其他笔记一样同步和版本管理。Workflow 小组件结果会作为普通仓库文件单独存储在 `Dashboards/Data/` 下。

---

## 编辑模式

每个仪表板都以**查看模式**打开。使用工具栏进行切换：

- **编辑** — 进入编辑模式：拖动小组件以移动，拖动小组件右下角以调整大小，点击**齿轮**配置小组件，点击**垃圾桶**删除它。
- **+ 添加小组件** — 打开小组件面板（仅限编辑模式）。
- **撤销 / 重做** — 逐步浏览本次会话中所做的布局更改。
- **完成** — 返回查看模式。

> 所有编辑都会**自动保存**——没有单独的保存按钮。

---

## 小组件类型

在编辑模式下点击 **+ 添加小组件** 以选择小组件类型：

![添加小组件面板](images/dashboard_widgets.png)

### Base — 嵌入 Bases 视图

通过 Obsidian 的**原生 Bases UI**（表格 / 卡片 / 列表 / 地图）渲染 `.base` 文件的命名视图。这是主要的数据小组件——对于笔记的任何列表、表格或卡片视图，请使用它而不要自行重新实现。

![Base 小组件设置](images/dashboard_base.png)

| 设置 | 说明 |
|---------|-------------|
| **Base 文件** | `.base` 文件的仓库路径 |
| **视图** | 要渲染的视图名称；留空则使用该 base 的第一个视图 |
| **New Base** | Create a new `.base` file under `Dashboards/Bases/` |
| **View editor** | Edit the selected view's name, type, order, sort, limit, filters, card image, list indentation, and raw YAML |
| **Create with AI / Edit with AI** | Author a new `.base` file or propose edits to the selected one with a diff before applying |

The same `.base` file can be referenced by multiple Base widgets — for example, one widget per view (Active / Done / Backlog). If the `.base` file changes outside the settings panel, the editor reloads it before saving so it does not overwrite newer content with stale state.

### Markdown — 嵌入笔记

将现有的 Markdown 笔记以只读嵌入方式内联渲染（附带打开完整笔记的链接）。

![Markdown 小组件设置](images/dashboard_markdown.png)

| 设置 | 说明 |
|---------|-------------|
| **Markdown 笔记** | 要嵌入的笔记的仓库路径（可搜索的选择器） |

### Web Embed — 嵌入网页

将网页嵌入到 iframe 中。

![Web Embed 小组件设置](images/dashboard_web.png)

| 设置 | 说明 |
|---------|-------------|
| **URL** | 要嵌入的页面 |
| **Show header** | Show a compact header with the URL and a browser-open button. Existing widgets default to on. |

> [!NOTE]
> 某些网站会发送 `X-Frame-Options` / `Content-Security-Policy` 标头来阻止嵌入，从而显示为空白。

### Workflow — 渲染工作流输出

以**无头**方式运行现有的[工作流](WORKFLOW_NODES_zh.md)，并将其输出渲染为 Markdown 或 HTML。这让你可以在仪表板上放置动态生成的内容（摘要、报告）。

![Workflow 小组件设置](images/dashboard_workflow.png)

| 设置 | 说明 |
|---------|-------------|
| **输出格式** | `Markdown` 或 `HTML`（HTML 在沙盒化的 iframe 中渲染） |
| **Workflow** | 要运行的工作流笔记 |
| **用 AI 创建** | 为此小组件创建新工作流（或编辑所选工作流） |
| **输出变量** | 保存输出字符串的工作流变量（默认 `result`） |
| **运行** | 立即运行工作流并缓存结果 |
| **自动刷新间隔（分钟）** | `0` = 仅手动；否则在打开时如果缓存结果早于此值则运行一次 |

> [!IMPORTANT]
> **工作流小组件从缓存渲染，而非实时运行。** 为避免每次打开面板时都重新运行繁重的工作流，渲染路径**仅**从缓存结果读取。仅在以下情况下才会运行：
> - 你点击**运行**（在小组件标题或设置面板中），或
> - 你打开仪表板且缓存结果早于自动刷新间隔。
>
> Los resultados se almacenan en `Dashboards/Data/<encoded dashboard path>.json` como archivo normal de la bóveda. Así la salida sobrevive a la reapertura sin inflar el archivo `.dashboard`, y puede sincronizarse, subirse/bajarse, revisarse o versionarse como cualquier otro archivo. El workflow debe almacenar su salida Markdown/HTML en una variable de cadena (predeterminado `result`) — no se admiten salidas de tarjetas/tablas. Como se ejecuta sin supervisión, no debe usar nodos interactivos (`prompt-*`, `dialog`).

### Kanban — 拖动卡片以更改状态

将匹配 **标签** 和/或 **文件夹** 筛选的笔记渲染为卡片，并按 frontmatter 中的 **状态属性** 分组到各列。将卡片拖到另一列即可更新该笔记的状态（通过 `processFrontMatter` 写入）。 Drag a card up/down within a column to persist a manual order for that board.点击卡片可在对话框中预览其笔记；对话框中的打开图标会在新标签页中打开该笔记。看板在 **查看模式** 下即可交互——无需进入编辑模式即可拖动卡片。

![看板](images/dashboard_kanban.png)

看板顶部显示可选的 **标题**（当一个仪表板包含多个看板时很有用）和 **新建** 按钮。新建会打开一个小对话框，用于输入卡片标题并选择其所在列，然后创建一条已匹配此看板筛选条件的笔记——放入配置的文件夹、添加配置的标签，并设置为所选列的状态。新卡片会显示在看板上（你仍留在仪表板）；想打开笔记时点击它即可。

在编辑模式下通过小组件设置配置看板：

![看板设置](images/dashboard_kanban_edit.png)

| 设置 | 说明 |
|---------|-------------|
| **看板标题** | 显示在看板顶部。当多个看板共享一个仪表板时很有用。 |
| **标签筛选** | 仅显示带此标签的笔记（不含 `#`）。留空 = 所有标签。 |
| **文件夹筛选** | 仅显示路径以此前缀开头的笔记。留空 = 整个 vault。 |
| **状态属性** | 保存卡片状态的 frontmatter 属性（默认 `status`）。 |
| **标题属性** | 作为卡片标题显示的 frontmatter 属性。留空 = 文件名。 |
| **列** | 状态值的有序列表。每列有一个 **值**（与属性匹配）和一个 **标签名**（显示为表头）。 |
| **显示字段** | 在每张卡片标题下方显示的 frontmatter 属性名有序列表（例如 `priority`、`due`）。每个字段显示为 `name: value`；空值会被跳过，列表值会用逗号连接。 |
| **显示未匹配卡片列** | 启用时，状态与任何列都不匹配的卡片会显示在额外的“未指定”列中（默认启用）。 |

The board stores manual card order in the widget config as `cardOrder`. The values are note paths, so the order round-trips with the `.dashboard` file.

### Timeline — 记录带日期的帖子

将短的日期帖子存储在 `Dashboards/Timeline/<name>/` 下，每天一个 Markdown 文件。帖子可以包含 `#tags`、图片附件和置顶项。小组件会显示倒序时间流，并提供文本/标签/日期筛选和新建帖子编辑器。长帖和嵌入笔记默认折叠，可用 **显示更多 / 显示更少** 展开。新帖编辑器和内联编辑器也会在图片附件按钮旁显示 **用 AI 编辑**：输入指令，在模态框中查看生成结果的 diff，然后再应用回 textarea。

![时间线编辑器](images/timeline_input.png)

| 设置 | 说明 |
|---------|-------------|
| **时间线名称** | `Dashboards/Timeline/` 下的文件夹名称 |
| **要显示的最新帖子数** | 加载更早条目前先显示的最近帖子数量 |
| **超过行数后折叠** | 显示折叠预览的估算可视行数阈值（默认 `8`） |
| **超过字符数后折叠** | 显示折叠预览的字符数阈值（默认 `440`） |

每日文件名为 `<YYYY-MM-DD>.md`。只有当 `---` 后面跟着 timeline marker 或 ISO timestamp 时才会作为帖子分隔符，因此正文中的普通 Markdown 分隔线会被保留。

![时间线内联编辑](images/timeline_edit.png)

可以从新帖编辑器或内联编辑器使用 **用 AI 编辑**，将当前草稿和你的指令发送给模型。生成的改写会先以 diff 显示，确认后再应用回 textarea。

![时间线 AI 改写](images/timeline_ai.png)

未知的小组件类型（例如来自较新插件版本的）在**保存时会被保留**并渲染为占位符，因此编辑不熟悉的仪表板绝不会丢失数据。

---

## 响应式布局

网格有两个断点，根据容器宽度切换：

| 断点 | 条件 | 布局 |
|------------|------|--------|
| **`lg`**（宽） | ≥ 768px | 你在编辑模式中排列的布局（默认 12 列） |
| **`sm`**（窄） | < 768px | 小组件重新排列为**全宽单列**，从上到下堆叠 |

默认情况下，`sm` 布局会从宽布局**自动派生**（按垂直位置排序）。如果你在窄屏上移动小组件，这些显式的 `sm` 位置会被保留，其余小组件会填充其周围的空隙。

---

## 用 AI 创建小组件

**Base** 和 **Workflow** 小组件的设置面板中都有一个 **用 AI 创建** 按钮：

- 对于 **Base** 小组件，它会打开 `.base` 文件的 AI 创作对话框。AI 可以使用只读工具（读取、搜索、列出）检查你的笔记，在创建前发现合适的 frontmatter 属性；例如，请求带封面图的卡片视图时，无需你指定属性名。如果已选择某个 base，按钮会变为 **用 AI 编辑**：它会显示拟议 `.base` 与当前文件之间的 **diff**，并提供**额外指令**输入框，以便在**应用**前继续调整。
- 对于 **Workflow** 小组件，它会生成（或编辑）一个为该小组件量身定制的工作流——AI 被告知在输出变量中生成单个 Markdown/HTML 字符串并避免交互式节点，从而使结果以无头方式渲染。生成后，小组件会**自动运行并刷新**。

你也可以在聊天中使用内置的 **`dashboard`** 智能体技能创建整个仪表板，该技能了解 `.dashboard` 架构和 Bases 创作参考。

---

## `.dashboard` 文件格式

`.dashboard` 文件是 YAML。通常你不会手动编辑它（由可视化编辑器和 AI 管理），但此处记录了架构以供参考并保证往返安全。

```yaml
version: 1
grid:
  cols: 12        # column count (default 12)
  rowHeight: 80   # pixels per grid row
  gap: 8          # pixels between cells
widgets:
  - id: <uuid>                            # unique id (UUID-like string)
    type: base | markdown | web | workflow | kanban | timeline
    layout:
      lg: { x: 0, y: 0, w: 6, h: 4 }      # required: position on the wide grid
      sm: { x: 0, y: 0, w: 12, h: 4 }     # optional: auto-derived (stacked) if omitted
    config: { ... }                       # per-widget-type config (see below)
```

- **`layout.lg`** 是宽（≥768px）网格上的位置。`x`/`y` 是从 0 开始的左上角单元格；`w`/`h` 是以网格单元格为单位的宽度/高度。
- **`layout.sm`** 是窄屏上的位置。省略它则按网格全宽自动堆叠。
- 放置小组件时使其不重叠；通过增大 `y` 来垂直堆叠。

### 每个小组件的 `config`

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
  showHeader: true                    # optional; false hides the URL/open header

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
  cardOrder: [Tasks/A.md, Tasks/B.md]   # optional manual order persisted by drag/drop
  columns:                             # ordered list of status values
    - value: todo
      label: To Do
    - value: in-progress
      label: In Progress
    - value: done
      label: Done
  showUnspecified: true                # show cards with no/unknown status
# timeline
config:
  name: Journal                        # stores posts under Dashboards/Timeline/Journal/
  latestCount: 20
```

### 完整示例

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
  - id: journal
    type: timeline
    layout: { lg: { x: 0, y: 10, w: 6, h: 6 } }
    config:
      name: Journal
      latestCount: 20
```

---

## 提示与说明

- **先创建数据。** 对于 Base 小组件，在将小组件指向 `.base` 文件之前先创建它（及其视图）。AI 仪表板技能会一次性完成此操作。
- **按视图分组。** 在多个 Base 小组件（Active / Done / Backlog）中重用一个 `.base`，而不是复制数据。
- **保持工作流小组件轻量。** 它们会缓存结果；设置合理的**自动刷新间隔**，而不是每次打开都运行，并将输出存储在 `result` 中。
- **仅限桌面。** 仪表板（与插件的其余部分一样）在 Obsidian 桌面版上运行。
- **文件位于你的仓库中。** 仪表板以 `.dashboard` 文件存储在 `Dashboards/` 下，工作流结果存储在 `Dashboards/Data/`，时间线帖子存储在 `Dashboards/Timeline/`，生成的 Bases 存储在 `Dashboards/Bases/`。它们都是普通仓库文件，会与你的笔记一起同步/版本管理。

> 另请参阅：[工作流节点](WORKFLOW_NODES_zh.md) · [智能体技能](SKILLS_zh.md)
