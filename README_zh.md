# Gemini Helper for Obsidian

[![DeepWiki](https://img.shields.io/badge/DeepWiki-takeshy%2Fobsidian--gemini--helper-blue.svg?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTQgMTloMTZhMiAyIDAgMCAwIDItMlY3YTIgMiAwIDAgMC0yLTJINWEyIDIgMCAwIDAtMiAydjEyYTIgMiAwIDAgMSAyLTJ6Ii8+PHBhdGggZD0iTTkgMTV2LTQiLz48cGF0aCBkPSJNMTIgMTV2LTIiLz48cGF0aCBkPSJNMTUgMTV2LTQiLz48L3N2Zz4=)](https://deepwiki.com/takeshy/obsidian-gemini-helper)

**免费开源的** Obsidian AI 助手，提供由 Google Gemini 驱动的 **聊天**、**工作流自动化** 和 **RAG** 功能。

> **从 v1.11.0 起，本插件专注于 Gemini 相关功能。**
> CLI 支持已被移除。已创建新插件 [obsidian-llm-hub](https://github.com/takeshy/obsidian-llm-hub)，支持 CLI 和多种 LLM 提供商（OpenAI、Claude、OpenRouter、Local LLM）。

### 相关插件

| 插件 | 说明 |
|------|------|
| obsidian-gemini-helper | 专注于 Gemini（RAG 通过 File Search API） |
| obsidian-llm-hub | 多 LLM 支持，仅限桌面端（RAG 通过 Embedding，支持 gemini-embedding-2-preview） |
| obsidian-local-llm-hub | 仅限本地 LLM（RAG 仅通过本地 Embedding） |

---

> **本插件完全免费。** 您只需要从 [ai.google.dev](https://ai.google.dev) 获取 Google Gemini API 密钥（免费或付费）。

## 主要特性

- **AI 聊天** - 流式响应、文件附件、仓库操作、斜杠命令
- **工作流构建器** - 使用可视化节点编辑器和 24 种节点类型自动化多步骤任务
- **编辑历史** - 使用差异视图追踪和恢复 AI 所做的更改
- **RAG** - 检索增强生成，在您的仓库中进行智能搜索
- **网页搜索** - 通过 Google 搜索获取最新信息
- **图像生成** - 使用 Gemini 图像模型创建图像
- **加密** - 使用密码保护聊天历史和工作流执行日志

![聊天中的图像生成](docs/images/chat_image.png)

## API 密钥

本插件需要 Google Gemini API 密钥。您可以选择：

| 功能 | 免费 API 密钥 | 付费 API 密钥 |
|---------|--------------|--------------|
| 基础聊天 | ✅ | ✅ |
| 仓库操作 | ✅ | ✅ |
| 网页搜索 | ✅ | ✅ |
| RAG | ✅ (有限制) | ✅ |
| 工作流 | ✅ | ✅ |
| 图像生成 | ❌ | ✅ |
| 模型 | Flash, Gemma | Flash, Pro, Image |
| 费用 | **免费** | 按使用付费 |

### 免费 API 密钥使用技巧

- **速率限制** 按模型计算，每日重置。切换模型可继续使用。
- **RAG 同步** 有限制。每天运行"同步仓库" - 已上传的文件会被跳过。

---

# AI 聊天

AI 聊天功能提供与 Google Gemini 的交互式对话界面，与您的 Obsidian 仓库深度集成。

![聊天界面](docs/images/chat.png)

## 打开聊天
- 点击功能区中的 Gemini 图标
- 命令："Gemini Helper: Open chat"
- 切换："Gemini Helper: Toggle chat / editor"

## 聊天控制
- **Enter** - 发送消息
- **Shift+Enter** - 换行
- **停止按钮** - 停止生成
- **+ 按钮** - 新建聊天
- **历史按钮** - 加载之前的聊天

## 斜杠命令

创建可通过 `/` 触发的可复用提示词模板：

- 使用 `{selection}`（选中文本）和 `{content}`（当前笔记）定义模板
- 可为每个命令单独设置模型和搜索覆盖
- 输入 `/` 查看可用命令

**默认命令：** `/infographic` - 将内容转换为 HTML 信息图

![信息图示例](docs/images/chat_infographic.png)

## @ 提及

输入 `@` 来引用文件和变量：

- `{selection}` - 选中的文本
- `{content}` - 当前笔记内容
- 任意仓库文件 - 浏览并插入（仅路径；AI 通过工具读取内容）

> [!NOTE]
> **`{selection}` 和 `{content}` 的工作原理：** 当您从 Markdown 视图切换到聊天视图时，由于焦点变化，选择通常会被清除。为了保留您的选择，插件会在切换视图时捕获它，并在 Markdown 视图中用背景色高亮显示选中区域。`{selection}` 选项仅在有文本被选中时才会出现在 @ 建议中。
>
> `{selection}` 和 `{content}` 都**故意不在输入区域展开**——由于聊天输入框较小，展开长文本会使输入变得困难。内容会在您发送消息时展开，您可以通过查看聊天中已发送的消息来验证这一点。

> [!NOTE]
> 仓库文件的 @ 提及仅插入文件路径 — AI 通过工具读取内容。

## 文件附件

直接附加文件：图像（PNG、JPEG、GIF、WebP）、PDF、文本文件、音频（MP3、WAV、FLAC、AAC、Opus、OGG）、视频（MP4、WebM、MOV、AVI、MKV）

## 函数调用（仓库操作）

AI 可以使用以下工具与您的仓库交互：

| 工具 | 描述 |
|------|-------------|
| `read_note` | 读取笔记内容 |
| `create_note` | 创建新笔记 |
| `propose_edit` | 带确认对话框的编辑 |
| `propose_delete` | 带确认对话框的删除 |
| `bulk_propose_edit` | 带选择对话框的批量编辑多个文件 |
| `bulk_propose_delete` | 带选择对话框的批量删除多个文件 |
| `search_notes` | 按名称或内容搜索仓库 |
| `list_notes` | 列出文件夹中的笔记 |
| `rename_note` | 重命名/移动笔记 |
| `create_folder` | 创建新文件夹 |
| `list_folders` | 列出仓库中的文件夹 |
| `get_active_note_info` | 获取当前笔记的信息 |
| `get_rag_sync_status` | 检查 RAG 同步状态 |
| `bulk_propose_rename` | 通过选择对话框批量重命名多个文件 |

### Vault 工具模式

当 AI 在聊天中处理笔记时，它会使用 Vault 工具。通过附件按钮下方的数据库图标（📦）控制 AI 可以使用哪些 Vault 工具：

| 模式 | 描述 | 可用工具 |
|------|------|----------|
| **Vault: 全部** | 完全访问 Vault | 所有工具 |
| **Vault: 无搜索** | 排除搜索工具 | 除 `search_notes`、`list_notes` 外的所有工具 |
| **Vault: 关闭** | 无 Vault 访问 | 无 |

**何时使用各模式：**

- **Vault: 全部** - 通用默认模式。AI 可以读取、写入和搜索您的 vault。
- **Vault: 无搜索** - 当您只想使用 RAG 搜索，或者已经知道目标文件时使用。这可以避免多余的 vault 搜索，节省 token 并提高响应速度。
- **Vault: 关闭** - 当您完全不需要访问 vault 时使用。

> **注意：** RAG、Web Search、Vault 工具和 MCP 都可以通过 Interactions API 同时使用。

## 安全编辑

当 AI 使用 `propose_edit` 时：
1. 确认对话框会显示建议的更改
2. 点击**应用**将更改写入文件
3. 点击**放弃**取消而不修改文件

> 在您确认之前，更改不会被写入。

## 编辑历史

追踪和恢复对笔记所做的更改：

- **自动追踪** - 所有 AI 编辑（聊天、工作流）和手动更改都会被记录
- **文件菜单访问** - 右键点击 markdown 文件可访问：
  - **快照** - 将当前状态保存为快照
  - **历史** - 打开编辑历史模态框

- **命令面板** - 也可通过"Show edit history"命令访问
- **差异视图** - 使用颜色编码的添加/删除准确显示更改内容
- **恢复** - 一键恢复到任何之前的版本
- **复制** - 将历史版本保存为新文件（默认名称：`{filename}_{datetime}.md`）
- **可调整大小的模态框** - 拖动移动，从角落调整大小

**差异显示：**
- `+` 行存在于旧版本中
- `-` 行是在新版本中添加的

**工作原理：**

编辑历史使用基于快照的方法：

1. **快照创建** - 当文件首次打开或被 AI 修改时，其内容的快照会被保存
2. **差异记录** - 当文件被修改时，新内容与快照之间的差异会作为历史条目记录
3. **快照更新** - 每次修改后，快照会更新为新内容
4. **恢复** - 要恢复到之前的版本，从快照反向应用差异

**何时记录历史：**
- AI 聊天编辑（`propose_edit` 工具）
- 工作流笔记修改（`note` 节点）
- 通过命令手动保存
- 打开文件时如果与快照不同则自动检测

**存储：** 编辑历史存储在内存中，Obsidian 重启时会被清除。持久的版本跟踪由 Obsidian 内置的文件恢复功能覆盖。

![编辑历史模态框](docs/images/edit_history.png)

## RAG

检索增强生成，用于智能仓库搜索：

- **支持的文件** - Markdown、PDF、Office 文档（Doc、Docx、XLS、XLSX、PPTX）
- **内部模式** - 将仓库文件同步到 Google File Search
- **外部模式** - 使用现有的存储 ID
- **增量同步** - 仅上传更改的文件
- **目标文件夹** - 指定要包含的文件夹
- **排除模式** - 使用正则表达式模式排除文件

![RAG 设置](docs/images/setting_rag.png)

## MCP 服务器

MCP（Model Context Protocol）服务器提供额外的工具，扩展 AI 在 Vault 操作之外的能力。

**设置：**

1. 打开插件设置 → **MCP 服务器**部分
2. 点击**添加服务器**
3. 输入服务器名称和 URL
4. 配置可选的认证头信息（JSON 格式）
5. 点击**测试连接**以验证并获取可用工具
6. 保存服务器配置

> **注意：** 保存前必须测试连接。这确保服务器可访问并显示可用工具。

![MCP 服务器设置](docs/images/setting_mcp.png)

**使用 MCP 工具：**

- **在聊天中：** 点击数据库图标（📦）打开工具设置。按对话启用/禁用 MCP 服务器。
- **在工作流中：** 使用 `mcp` 节点调用 MCP 服务器工具。

**工具提示：** 连接测试成功后，可用工具名称会被保存，并在设置和聊天界面中显示以供参考。

### MCP Apps（交互式 UI）

一些 MCP 工具返回交互式 UI，允许您以可视化方式与工具结果进行交互。此功能基于 [MCP Apps 规范](https://github.com/anthropics/anthropic-cookbook/tree/main/misc/mcp_apps)。

**工作原理：**

- 当 MCP 工具在响应元数据中返回 `ui://` 资源 URI 时，插件会获取并渲染 HTML 内容
- UI 在沙盒 iframe 中显示以确保安全（`sandbox="allow-scripts allow-forms"`）
- 交互式应用可以通过 JSON-RPC 桥接调用其他 MCP 工具并更新上下文

**在聊天中：**
- MCP Apps 在助手消息中内联显示，带有展开/折叠按钮
- 点击 ⊕ 展开为全屏，⊖ 折叠

**在工作流中：**
- MCP Apps 在工作流执行期间以模态对话框形式显示
- 工作流会暂停以允许用户交互，然后在关闭模态框后继续

> **安全性：** 所有 MCP App 内容都在具有受限权限的沙盒 iframe 中运行。iframe 无法访问父页面的 DOM、Cookie 或本地存储。仅启用 `allow-scripts` 和 `allow-forms`。

## 代理技能

通过自定义指令、参考资料和可执行工作流扩展 AI 的能力。技能遵循业界标准的代理技能模式（如 [OpenAI Codex](https://github.com/openai/codex) 的 `.codex/skills/`）。

- **内置技能** - 开箱即用的 Obsidian 专属知识（Markdown、Canvas、Bases）。基于 [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills)
- **自定义指令** - 通过 `SKILL.md` 文件定义特定领域的行为
- **参考资料** - 在 `references/` 中包含风格指南、模板和检查清单
- **工作流集成** - 技能可以将工作流作为 Function Calling 工具公开
- **斜杠命令** - 输入 `/folder-name` 即可立即调用技能并发送
- **选择性激活** - 按对话选择哪些技能处于活动状态
- **可点击的技能标签** - 输入区和助手消息中显示的已激活技能标签可以点击打开对应的 `SKILL.md`（内置技能显示为静态标签）
- **工作流错误恢复** - 如果技能工作流在聊天中失败，失败的工具调用会显示 **打开工作流** 按钮，点击后会打开文件*并*将 Gemini 视图切换到 Workflow / skill 选项卡，您可以立即编辑并重新运行

创建技能的方式与工作流相同 — 选择 **+ New (AI)**，勾选 **"作为代理技能创建"**，然后描述您想要的功能。AI 会同时生成 `SKILL.md` 指令和工作流。若要编辑现有技能，请打开其 `SKILL.md` 并在 Workflow / skill 选项卡中点击 **使用 AI 修改技能** — AI 会同时更新指令正文和引用的工作流。

> **有关设置说明和示例，请参阅 [SKILLS.md](docs/SKILLS_zh.md)**

---

# 工作流构建器

直接在 Markdown 文件中构建自动化多步骤工作流。**无需编程知识** - 只需用自然语言描述您想要的内容，AI 就会为您创建工作流。

![可视化工作流编辑器](docs/images/visual_workflow.png)

## 运行工作流

**从侧边栏：**
1. 在侧边栏中打开 **Workflow / skill** 标签
2. 打开包含 `workflow` 代码块的文件
3. 从下拉菜单中选择工作流（或选择 **Browse all workflows** 搜索仓库中的所有工作流）
4. 点击**运行**执行
5. 点击**历史**查看过去的运行记录

**从命令面板（Run Workflow）：**

使用"Gemini Helper: Run Workflow"命令从任何位置浏览和执行工作流：

1. 打开命令面板并搜索"Run Workflow"
2. 浏览所有包含工作流代码块的 Vault 文件（`workflows/` 文件夹中的文件优先显示）
3. 预览工作流内容和 AI 生成历史
4. 选择工作流并点击 **Run** 执行

![运行工作流模态框](docs/images/workflow_list.png)

这对于快速运行工作流而无需首先导航到工作流文件非常有用。

![工作流历史](docs/images/workflow_history.png)

**导出执行历史：** 将执行历史可视化为 Obsidian Canvas 进行可视分析。在历史模态框中点击 **Open Canvas view** 创建 Canvas 文件。

> **注意：** Canvas 文件会动态创建在 workspace 文件夹中。查看后如不再需要，请手动删除。

![历史 Canvas 视图](docs/images/history_canvas.png)

## AI 驱动的工作流和技能创建

**您不需要学习 YAML 语法或节点类型。** 只需用自然语言描述您的工作流：

1. 在 Gemini 侧边栏中打开 **Workflow / skill** 标签
2. 从下拉菜单中选择 **+ New (AI)**
3. 描述您想要的内容：*"创建一个工作流，总结选中的笔记并保存到 summaries 文件夹"*
4. 如果要创建代理技能而非独立工作流，请勾选 **"作为代理技能创建"**
5. 选择模型并点击**生成**
6. AI 首先会用自然语言生成**计划** — 检查后点击 **OK** 继续，点击**重新规划**以反馈并重新生成计划，或点击**取消**中止
7. 生成后，AI 会对结果进行**审查**。如果发现问题，您可以选择 **OK**（带确认对话框）、**再修正**（使用审查反馈重新生成）或**取消**。没有问题的审查会自动继续
8. 确认最终预览后工作流会被保存

> **提示：** 在已有工作流的文件上使用下拉菜单中的 **+ New (AI)** 时，输出路径会默认设置为当前文件。生成的工作流将追加到该文件中。

**从任意文件创建工作流：**

当在没有工作流代码块的文件上打开 Workflow / skill 标签时，会显示 **"Create workflow with AI"** 按钮。点击它可以生成新的工作流（默认输出：`workflows/{{name}}.md`）。

**@ 文件引用：**

在描述字段中输入 `@` 以引用文件：
- `@{selection}` - 当前编辑器选择内容
- `@{content}` - 活动笔记内容
- `@path/to/file.md` - Vault 中的任意文件

点击生成时，文件内容会直接嵌入到 AI 请求中。YAML 前置信息会自动移除。

> **提示：** 这对于基于 Vault 中现有的工作流示例或模板创建工作流非常有用。

**文件附件：**

点击附件按钮可以附加文件（图像、PDF、文本文件）到您的工作流生成请求中。这对于向 AI 提供视觉上下文或示例非常有用。

**使用外部 LLM（复制提示词 / 粘贴响应）：**

您可以使用任何外部 LLM（Claude、GPT 等）来生成工作流：

1. 像往常一样填写工作流名称和描述
2. 点击 **Copy Prompt** - 完整提示词将复制到剪贴板
3. 将提示词粘贴到您喜欢的 LLM 中
4. 复制 LLM 的响应
5. 粘贴到出现的**粘贴响应**文本框中
6. 点击**应用**创建工作流

粘贴的响应可以是原始 YAML 或包含 `` ```workflow `` 代码块的完整 Markdown 文档。Markdown 响应将按原样保存，保留 LLM 包含的所有文档。

![使用 AI 创建工作流](docs/images/create_workflow_with_ai.png)

**模态框控制：**

AI 工作流模态框支持拖放定位和从角落调整大小，以提供更好的编辑体验。

**请求历史：**

每个 AI 生成的工作流都会在工作流代码块上方保存历史记录，包括：
- 时间戳和操作（已创建/已修改）
- 您的请求描述
- 引用的文件内容（在可折叠部分中）
**以同样的方式修改现有工作流：**
1. 加载任意工作流
2. 点击 **AI Modify** 按钮（星形图标）
3. 描述更改：*"添加一个步骤将摘要翻译成日语"*
4. 执行相同的计划 → 生成 → 审查流程。您可以对审查结果点击任意次**再修正**；每次再修正都会触发一次新的生成过程和一次新的审查，因此显示的审查始终与最终的 YAML 一致
5. 查看前后 diff
6. 点击**应用更改**进行更新

**使用 AI 修改技能：**

当活动文件为 `SKILL.md` 时，Workflow / skill 标签会显示 **"使用 AI 修改技能"** 按钮，替代（或同时显示）常规的工作流修改按钮。它会一次性编辑整个技能 — 同时编辑 SKILL.md 指令正文*和*引用的工作流文件 — 并保留技能的 frontmatter（name、description、workflows 条目）。

**执行历史引用：**

使用 AI 修改工作流时，您可以引用之前的执行结果来帮助 AI 理解问题：

1. 点击**引用执行历史**按钮
2. 从列表中选择一次执行运行（错误运行会高亮显示）
3. 选择要包含的步骤（错误步骤默认预选）
4. AI 会收到步骤的输入/输出数据，以了解哪里出了问题

这对于调试工作流特别有用 - 您可以告诉 AI"修复步骤 2 中的错误"，它会准确地看到是什么输入导致了失败。

**请求历史：**

重新生成工作流时（在预览中点击"否"），会话中所有之前的请求都会传递给 AI。这有助于 AI 理解您在多次迭代中修改的完整上下文。

**手动工作流编辑：**

使用拖放界面在可视化节点编辑器中直接编辑工作流。

![手动工作流编辑](docs/images/modify_workflow_manual.png)

**从文件重新加载：**
- 从下拉菜单中选择 **Reload from file** 以从 markdown 文件重新导入工作流

## 快速入门（手动）

您也可以手动编写工作流。在任意 Markdown 文件中添加工作流代码块：

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

在 Gemini 侧边栏中打开 **Workflow / skill** 标签来运行它。

## 可用节点类型

24 种节点类型可用于构建工作流：

| 类别 | 节点 |
|----------|-------|
| 变量 | `variable`, `set` |
| 控制 | `if`, `while` |
| LLM | `command` |
| 数据 | `http`, `json`, `script` |
| 笔记 | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` |
| 文件 | `file-explorer`, `file-save` |
| 提示 | `prompt-file`, `prompt-selection`, `dialog` |
| 组合 | `workflow` |
| RAG | `rag-sync` |
| 外部 | `mcp`, `obsidian-command` |
| 实用工具 | `sleep` |

> **详细的节点规范和示例，请参阅 [WORKFLOW_NODES.md](docs/WORKFLOW_NODES_zh.md)**

## 快捷键模式

分配键盘快捷键以即时运行工作流：

1. 在工作流中添加 `name:` 字段
2. 打开工作流文件并从下拉菜单中选择工作流
3. 点击工作流面板页脚中的键盘图标（⌨️）
4. 前往设置 → 快捷键 → 搜索"Workflow: [您的工作流名称]"
5. 分配快捷键（例如 `Ctrl+Shift+T`）

通过快捷键触发时：
- `prompt-file` 自动使用当前文件（无对话框）
- `prompt-selection` 使用当前选择，如果没有选择则使用完整文件内容

## 事件触发器

工作流可以由 Obsidian 事件自动触发：

![事件触发器设置](docs/images/event_setting.png)

| 事件 | 描述 |
|-------|-------------|
| File Created | 创建新文件时触发 |
| File Modified | 保存文件时触发（5秒防抖） |
| File Deleted | 删除文件时触发 |
| File Renamed | 重命名文件时触发 |
| File Opened | 打开文件时触发 |

**事件触发器设置：**
1. 在工作流中添加 `name:` 字段
2. 打开工作流文件并从下拉菜单中选择工作流
3. 点击工作流面板页脚中的闪电图标（⚡）
4. 选择哪些事件应触发工作流
5. 可选择添加文件模式过滤器

**文件模式示例：**
- `**/*.md` - 任意文件夹中的所有 Markdown 文件
- `journal/*.md` - 仅 journal 文件夹中的 Markdown 文件
- `*.md` - 仅根文件夹中的 Markdown 文件
- `**/{daily,weekly}/*.md` - daily 或 weekly 文件夹中的文件
- `projects/[a-z]*.md` - 以小写字母开头的文件

**事件变量：** 当由事件触发时，以下变量会自动设置：

| 变量 | 描述 |
|----------|-------------|
| `_eventType` | 事件类型：`create`、`modify`、`delete`、`rename`、`file-open` |
| `_eventFilePath` | 受影响文件的路径 |
| `_eventFile` | 包含文件信息的 JSON（path、basename、name、extension） |
| `_eventFileContent` | 文件内容（用于 create/modify/file-open 事件） |
| `_eventOldPath` | 之前的路径（仅用于 rename 事件） |

> **注意：** `prompt-file` 和 `prompt-selection` 节点在由事件触发时会自动使用事件文件。`prompt-selection` 使用整个文件内容作为选择。

---

# 通用设置

## 支持的模型

### 付费计划
| 模型 | 描述 |
|-------|-------------|
| Gemini 3.1 Pro Preview | 最新旗舰模型，1M 上下文（推荐） |
| Gemini 3.1 Pro Preview (Custom Tools) | 针对自定义工具和 bash 的代理工作流优化 |
| Gemini 3 Flash Preview | 快速模型，1M 上下文，最佳性价比 |
| Gemini 3.1 Flash Lite Preview | 最具成本效益的高性能模型 |
| Gemini 2.5 Flash | 快速模型，1M 上下文 |
| Gemini 2.5 Pro | Pro 模型，1M 上下文 |
| Gemini 3 Pro (Image) | Pro 图像生成，4K |
| Gemini 3.1 Flash (Image) | 快速、低成本图像生成 |

> **Thinking 模式：** 在聊天中，当消息包含"思考"、"分析一下"或"考虑"等关键词时会触发 Thinking 模式。但是，**Gemini 3.1 Pro** 无论是否包含关键词都始终使用 Thinking 模式——这些模型不支持禁用 Thinking。

**Always Think 开关：**

您可以不使用关键词，直接强制为 Flash 模型开启 Thinking 模式。点击数据库图标（📦）打开工具菜单，在 **Always Think** 下勾选对应的开关：

- **Flash** — 默认关闭。勾选后，Flash 模型将始终启用 Thinking。
- **Flash Lite** — 默认开启。启用 Thinking 后，Flash Lite 的成本和速度几乎没有差异，建议保持开启。

开关处于开启状态时，无论消息内容如何，该模型系列都将始终启用 Thinking。关闭时，将使用现有的基于关键词的检测机制。

![Always Think Settings](docs/images/setting_thinking.png)

### 免费计划
| 模型 | 仓库操作 |
|-------|------------------|
| Gemini 2.5 Flash | ✅ |
| Gemini 2.5 Flash Lite | ✅ |
| Gemini 3 Flash Preview | ✅ |
| Gemini 3.1 Flash Lite Preview | ✅ |
| Gemma 4 (31B, 26B A4B MoE) | ✅ |

## 安装

### BRAT（推荐）
1. 安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件
2. 打开 BRAT 设置 → "Add Beta plugin"
3. 输入：`https://github.com/takeshy/obsidian-gemini-helper`
4. 在社区插件设置中启用该插件

### 手动安装
1. 从 releases 下载 `main.js`、`manifest.json`、`styles.css`
2. 在 `.obsidian/plugins/` 中创建 `gemini-helper` 文件夹
3. 复制文件并在 Obsidian 设置中启用

### 从源码构建
```bash
git clone https://github.com/takeshy/obsidian-gemini-helper
cd obsidian-gemini-helper
npm install
npm run build
```

## 配置

### API 设置
1. 从 [ai.google.dev](https://ai.google.dev) 获取 API 密钥
2. 在插件设置中输入
3. 选择 API 计划（免费/付费）

![基础设置](docs/images/setting_basic.png)

### 工作区设置
- **系统提示词** - 额外的 AI 指令
- **工具限制** - 控制函数调用限制

![工具限制](docs/images/setting_tool_history.png)

### 加密

分别使用密码保护您的聊天历史和工作流执行日志。

**设置步骤：**

1. 在插件设置中设置密码（使用公钥加密安全存储）

![加密初始设置](docs/images/setting_initial_encryption.png)

2. 设置后，为每种日志类型切换加密：
   - **加密 AI 聊天历史** - 加密聊天对话文件
   - **加密工作流执行日志** - 加密工作流历史文件

![加密设置](docs/images/setting_encryption.png)

每个设置可以独立启用/禁用。

**功能：**
- **独立控制** - 选择要加密的日志（聊天、工作流或两者）
- **自动加密** - 根据设置，新文件在保存时加密
- **密码缓存** - 每个会话只需输入一次密码
- **专用查看器** - 加密文件在带预览的安全编辑器中打开
- **解密选项** - 需要时可从单个文件移除加密

**工作原理：**

```
【设置 - 设置密码时仅一次】
密码 → 生成密钥对（RSA） → 加密私钥 → 存储在设置中

【加密 - 每个文件】
文件内容 → 用新 AES 密钥加密 → 用公钥加密 AES 密钥
→ 保存到文件：加密数据 + 加密私钥（从设置复制） + salt

【解密】
密码 + salt → 恢复私钥 → 解密 AES 密钥 → 解密文件内容
```

- 密钥对只生成一次（RSA 生成较慢），AES 密钥为每个文件生成
- 每个文件存储：加密内容 + 加密私钥（从设置复制） + salt
- 文件是自包含的 — 仅需密码即可解密，无需插件依赖

<details>
<summary>Python 解密脚本（点击展开）</summary>

```python
#!/usr/bin/env python3
"""无需插件解密 Gemini Helper 加密文件"""
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
        raise ValueError("无效的加密文件格式")

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
        print(f"用法: {sys.argv[0]} <加密文件>")
        sys.exit(1)
    password = getpass.getpass("密码: ")
    print(decrypt_file(sys.argv[1], password))
```

需要: `pip install cryptography`

</details>

> **警告：** 如果您忘记密码，加密文件将无法恢复。请妥善保管您的密码。

> **提示：** 要一次性加密目录中的所有文件，请使用工作流。参见 [WORKFLOW_NODES_zh.md](docs/WORKFLOW_NODES_zh.md#obsidian-command) 中的"加密目录中的所有文件"示例。

![文件加密工作流](docs/images/enc.png)

**安全优势：**
- **受 AI 聊天保护** - 加密文件无法被 AI 仓库操作（`read_note` 工具）读取。这可以保护 API 密钥等敏感数据在聊天过程中不会意外泄露。
- **工作流通过密码访问** - 工作流可以使用 `note-read` 节点读取加密文件。访问时会弹出密码对话框，密码会在会话期间缓存。
- **安全存储机密** - 无需在工作流中直接写入 API 密钥，而是将其存储在加密文件中。工作流在密码验证后运行时读取密钥。

### 斜杠命令
- 定义通过 `/` 触发的自定义提示词模板
- 可为每个命令单独设置模型和搜索

![斜杠命令](docs/images/setting_slash_command.png)

## 系统要求

- Obsidian v0.15.0+
- Google AI API 密钥
- 支持桌面端和移动端

## 隐私

**本地存储的数据：**
- API 密钥（存储在 Obsidian 设置中）
- 聊天历史（Markdown 文件，可选加密）
- 工作流执行历史（可选加密）
- 加密密钥（私钥使用您的密码加密）

**发送到 Google 的数据：**
- 所有聊天消息和文件附件都会发送到 Google Gemini API 进行处理
- 启用 RAG 时，仓库文件会上传到 Google File Search
- 启用网页搜索时，查询会发送到 Google 搜索

**发送到第三方服务的数据：**
- 工作流 `http` 节点可以向工作流中指定的任何 URL 发送数据

**MCP 服务器（可选）：**
- MCP（模型上下文协议）服务器可以在插件设置中为工作流 `mcp` 节点配置
- MCP 服务器是提供额外工具和功能的外部服务

**安全注意事项：**
- 运行前请审查工作流 - `http` 节点可以将仓库数据传输到外部端点
- 工作流 `note` 节点在写入文件前会显示确认对话框（默认行为）
- 设置 `confirmEdits: false` 的斜杠命令将自动应用文件编辑，不显示应用/放弃按钮
- 敏感凭据：不要将 API 密钥或令牌直接存储在工作流 YAML 中（`http` 头、`mcp` 设置等）。请将它们存储在加密文件中，并使用 `note-read` 节点在运行时获取。工作流可以通过密码提示读取加密文件。

有关数据保留政策，请参阅 [Google AI 服务条款](https://ai.google.dev/terms)。

## 许可证

MIT

## 链接

- [Gemini API 文档](https://ai.google.dev/docs)
- [Obsidian 插件文档](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## 支持

如果您觉得这个插件有用，请考虑请我喝杯咖啡！

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee)](https://buymeacoffee.com/takeshy)
