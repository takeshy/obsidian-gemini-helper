# 代理技能

代理技能通过提供自定义指令、参考资料和可执行工作流来扩展 AI 的能力。技能遵循 [OpenAI Codex](https://github.com/openai/codex) 等工具使用的业界标准模式。

## 内置技能

插件包含三个基于 [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) 的内置技能，教 AI 了解 Obsidian 特定的文件格式。无需 vault 设置 — 它们立即可用。

| 技能 | 描述 | 默认 |
|------|------|------|
| **obsidian-markdown** | Obsidian 风格 Markdown：维基链接 `[[]]`、标注 `> [!note]`、嵌入 `![[]]`、属性（frontmatter）、标签、高亮、注释 | 开启 |
| **json-canvas** | JSON Canvas 文件（`.canvas`）：节点、边、组、颜色、布局 | 关闭 |
| **obsidian-bases** | Obsidian Bases 文件（`.base`）：过滤器、公式、视图（表格/卡片/列表/地图）、摘要 | 关闭 |

内置技能在技能选择器下拉菜单中显示，带有 **built-in** 徽章。像其他技能一样开启或关闭它们。将鼠标悬停在活动技能标签上可查看其描述。

启用 **obsidian-markdown**（默认）后，AI 将使用维基链接而非标准 Markdown 链接，正确格式化标注，并在创建或编辑笔记时遵循 Obsidian 的 frontmatter 约定。

## 自定义技能

### 文件夹结构

技能存储在 vault 中的可配置文件夹中（默认：`skills/`）。每个技能是一个包含 `SKILL.md` 文件的子文件夹：

```
skills/
├── code-review/
│   ├── SKILL.md            # 技能定义（必需）
│   ├── references/          # 参考文档（可选）
│   │   ├── style-guide.md
│   │   └── checklist.md
│   └── workflows/           # 可执行工作流（可选）
│       └── run-lint.md
├── meeting-notes/
│   ├── SKILL.md
│   └── references/
│       └── template.md
```

## SKILL.md 格式

每个 `SKILL.md` 文件包含用于元数据的 YAML frontmatter 和用于指令的 markdown 正文：

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

### Frontmatter 字段

| 字段 | 必需 | 描述 |
|------|------|------|
| `name` | 否 | 技能的显示名称。默认为文件夹名称 |
| `description` | 否 | 在技能选择器中显示的简短描述 |
| `workflows` | 否 | 工作流引用列表（见下文） |

### 工作流引用

在 frontmatter 中声明的工作流会被注册为 AI 可以调用的 Function Calling 工具：

```yaml
workflows:
  - path: workflows/run-lint.md
    description: Run linting on the current note
```

`workflows/` 子目录中的工作流即使没有 frontmatter 声明也会被自动发现。自动发现的工作流使用文件基本名称作为描述。

## 参考资料

将参考文档放在 `references/` 子文件夹中。当技能处于活动状态时，这些文档会被自动加载并包含在 AI 的上下文中。参考资料可用于：

- 风格指南和编码规范
- 模板和示例
- 检查清单和流程
- 特定领域的知识

## 工作流

技能工作流使用与[工作流构建器](../README_zh.md#工作流构建器)相同的格式。将工作流 markdown 文件放在 `workflows/` 子文件夹中：

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

当包含工作流的技能处于活动状态时，AI 会获得一个 `run_skill_workflow` 工具，可以用来执行这些工作流。工作流 ID 格式为 `skillName/workflowName`（例如 `Code Review/workflows_run-lint`）。

### 交互式执行

技能工作流以交互式模态窗口运行（与工作流面板相同）：

- 显示实时状态的执行进度模态窗口
- 交互式提示（`dialog`、`prompt-file`、`prompt-selection`）会向用户显示
- 确认对话框需要用户批准
- AI 接收工作流执行日志作为工具结果

### 向聊天返回值

当 AI 通过 `run_skill_workflow` 调用技能工作流时，**名称不以 `_` 开头的每个变量都会自动作为工具结果返回给聊天 AI**。您不需要添加一个末尾的 `command` 节点来"输出"结果 — 只需使用 `saveTo:` 保存您希望聊天 AI 看到的值即可。

`command` 节点在工作流*内部*运行一次独立的 LLM 调用，并将其输出保存到变量中；它不会直接写入聊天。如果用户需要某个特定变量按原样呈现在聊天回复中，请将该指令写入 SKILL.md 的指令正文，例如：

> 工作流完成后，请将 `ogpMarkdown` 的值按原样输出给用户，不要添加任何附加评论。

聊天端 AI 在这些指令的引导下，会将变量包含在其响应中。

### 错误恢复

如果技能工作流在聊天期间失败，失败的工具调用会显示 **打开工作流** 按钮。点击它会打开工作流文件*并*将 Gemini 视图切换到 Workflow / skill 标签，以便您可以编辑流程并重新运行。下方的提示行还会指向"使用 AI 修改工作流" → "参考执行历史"以修复失败的步骤。

## 在聊天中使用技能

### 设置

内置技能开箱即用 — 无需设置。要添加自定义技能，请在 vault 根目录创建 `skills` 文件夹。

### 激活技能

当技能可用时，它们会显示在聊天输入区域中：

1. 点击技能标签区域旁边的 **+** 按钮
2. 从下拉菜单中选择技能以激活
3. 活动技能显示为标签，点击 **x** 可以移除

当技能处于活动状态时：

- 技能指令和参考资料会注入到系统提示词中
- 如果技能包含工作流，`run_skill_workflow` 工具将变为可用
- 助手消息会显示使用了哪些技能

### 斜杠命令

您可以在聊天输入中输入 `/folder-name` 直接调用技能：

- **`/folder-name`** — 激活技能并立即发送。AI 会主动使用该技能的指令和工作流。
- **`/folder-name 您的消息`** — 激活技能并同时发送「您的消息」。
- 输入 `/` 时自动补全会显示可用技能。从自动补全中选择后立即发送。

命令使用文件夹名称（而非技能的显示名称）— 例如，位于 `skills/weekly-report/` 的技能通过 `/weekly-report` 调用。

### 示例：创建技能

1. 创建文件夹：`skills/summarizer/`
2. 创建 `skills/summarizer/SKILL.md`：

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

3. 打开聊天，点击 **+** 激活"Summarizer"技能
4. 要求 AI 总结一篇笔记 - 它会遵循该技能的指令

## 技能示例

### 写作风格指南（指令 + 参考资料）

使用参考文档来保持一致写作风格的技能。

#### 文件夹结构

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
description: 为博客文章保持一致的语气和格式
---

你是一个写作助手。请始终遵循参考资料中的风格指南。

在审阅或撰写文本时：

1. 使用风格指南中指定的语气和语调
2. 遵循格式规则（标题、列表、强调）
3. 应用词汇偏好（推荐用词/避免用词）
4. 审阅现有文本时指出任何风格违规之处
```

#### `references/style-guide.md`

```markdown
# 博客风格指南

## 语气与语调
- 对话式但保持专业
- 优先使用主动语态
- 教程中使用第二人称（"你"），公告中使用第一人称复数（"我们"）

## 格式
- 主要章节使用 H2，子章节使用 H3
- 3 个或更多项目使用项目符号列表
- UI 元素和关键术语使用粗体
- 代码块标注语言标签

## 词汇
- 推荐：使用简洁的表达而非冗长的表达
- 避免：未经解释的术语、被动语态、填充词（"非常"、"真的"、"就是"）
```

---

### 每日日志（指令 + 工作流）

通过工作流创建当天条目的每日日志技能。

#### 文件夹结构

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
description: 带有条目创建功能的每日日志助手
workflows:
  - path: workflows/create-entry.md
    description: 从模板创建今天的日志条目
---

你是一个日志助手。帮助用户回顾和反思他们的一天。

当用户要求撰写日志条目时：

1. 首先使用工作流创建今天的笔记文件
2. 询问亮点、挑战和收获
3. 使用 ## 亮点 / ## 挑战 / ## 收获 结构来格式化条目
4. 保持温暖、鼓励的语气
5. 如果用户似乎卡住了，建议反思提示
```

#### `workflows/create-entry.md`

````markdown
```workflow
name: 创建日志条目
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

      ## 亮点


      ## 挑战


      ## 收获


      ## 明天
    mode: create
    saveTo: result
  - id: open
    type: open
    path: "Journal/{{today}}.md"
```
````

用法：激活技能，然后要求"创建今天的日志条目"——AI 会调用工作流创建文件，然后帮助你填写内容。

---

### 会议记录（指令 + 参考资料 + 工作流）

结合自定义指令、模板参考资料和创建工作流的完整功能技能。

#### 文件夹结构

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
description: 带模板和自动创建功能的结构化会议记录
workflows:
  - path: workflows/create-meeting.md
    description: 创建包含参会者和议程的新会议记录
---

你是一个会议记录助手。请遵循参考资料中的模板。

在协助记录会议时：

1. 使用工作流创建会议记录文件
2. 严格遵循模板结构
3. 记录待办事项，包含负责人和截止日期，格式为：`- [ ] [负责人] 待办事项 (截止: YYYY-MM-DD)`
4. 将决议与讨论分开，清晰地总结
5. 会议结束后，提议将待办事项提取为任务
```

#### `references/template.md`

```markdown
# 会议记录模板

## 必需章节

### 头部信息
- **标题**：会议主题
- **日期**：YYYY-MM-DD
- **参会者**：参与者列表

### 议程
讨论主题的编号列表。

### 笔记
按议程项目组织的讨论详情。使用子标题。

### 决议
已做出决定的项目符号列表。每项决议必须清晰且可执行。

### 待办事项
带有负责人和截止日期的复选框列表：
- [ ] [负责人] 描述 (截止: YYYY-MM-DD)

### 后续步骤
后续跟进事项的简要总结，以及下次会议日期（如适用）。
```

#### `workflows/create-meeting.md`

````markdown
```workflow
name: 创建会议记录
nodes:
  - id: date
    type: set
    name: today
    value: "{{_date}}"
  - id: gen
    type: command
    prompt: |
      生成会议记录文件路径和初始内容。
      今天的日期是 {{today}}。
      会议主题是：{{topic}}
      参会者：{{attendees}}

      仅返回一个 JSON 对象：
      {"path": "Meetings/YYYY-MM-DD Topic.md", "content": "...遵循模板的 markdown 内容..."}

      使用模板结构：包含日期/参会者的头部信息、议程（来自主题）、空的笔记/决议/待办事项/后续步骤章节。
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

用法：激活技能，然后说"创建与 Alice、Bob 和 Carol 的设计评审会议记录"——AI 会使用主题/参会者调用工作流，创建结构化笔记并打开它。

---
