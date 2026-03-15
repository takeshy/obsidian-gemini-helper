# Agent Skills

Agent Skills extend the AI's capabilities by providing custom instructions, reference materials, and executable workflows. Skills follow the industry-standard pattern used by tools like [OpenAI Codex](https://github.com/openai/codex).

## Folder Structure

Skills are stored in a configurable folder within your vault (default: `skills/`). Each skill is a subfolder containing a `SKILL.md` file:

```
skills/
├── code-review/
│   ├── SKILL.md            # Skill definition (required)
│   ├── references/          # Reference documents (optional)
│   │   ├── style-guide.md
│   │   └── checklist.md
│   └── workflows/           # Executable workflows (optional)
│       └── run-lint.md
├── meeting-notes/
│   ├── SKILL.md
│   └── references/
│       └── template.md
```

## SKILL.md Format

Each `SKILL.md` file has YAML frontmatter for metadata and a markdown body for instructions:

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

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | No | Display name for the skill. Defaults to folder name |
| `description` | No | Short description shown in the skill selector |
| `workflows` | No | List of workflow references (see below) |

### Workflow References

Workflows declared in frontmatter are registered as function calling tools that the AI can invoke:

```yaml
workflows:
  - path: workflows/run-lint.md
    name: lint              # Optional custom ID (defaults to path-based ID)
    description: Run linting on the current note
```

Workflows in the `workflows/` subdirectory are also auto-discovered even without frontmatter declarations. Auto-discovered workflows use the file basename as the description.

## References

Place reference documents in a `references/` subfolder. These are automatically loaded and included in the AI's context when the skill is active. Use references for:

- Style guides and coding standards
- Templates and examples
- Checklists and procedures
- Domain-specific knowledge

## Workflows

Skill workflows use the same format as the [Workflow Builder](../README.md#workflow-builder). Place workflow markdown files in the `workflows/` subfolder:

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

When a skill with workflows is active, the AI receives a `run_skill_workflow` tool that it can call to execute these workflows. The workflow ID format is `skillName/workflowName` (e.g., `Code Review/workflows_run-lint`).

### Interactive Execution

Skill workflows run with interactive modals (same as the Workflow panel):

- An execution progress modal is displayed showing real-time status
- Interactive prompts (`dialog`, `prompt-file`, `prompt-selection`) are shown to the user
- Confirmation dialogs require user approval
- The AI receives the workflow execution logs as the tool result

## Using Skills in Chat

### Setup

1. Open plugin settings
2. Find the **Agent Skills** section
3. Set the skills folder path (default: `skills`)

### Activating Skills

Skills appear in the chat input area when available:

1. Click the **+** button next to the skill chips area
2. Select skills from the dropdown to activate them
3. Active skills show as chips that can be removed by clicking **x**

When skills are active:

- Skill instructions and references are injected into the system prompt
- If skills have workflows, the `run_skill_workflow` tool becomes available
- The assistant message shows which skills were used

### Slash Command

You can invoke a skill directly by typing `/folder-name` in the chat input:

- **`/folder-name`** — Activates the skill and sends immediately. The AI proactively uses the skill's instructions and workflows.
- **`/folder-name your message`** — Activates the skill and sends "your message" along with it.
- Autocomplete shows available skills as you type `/`. Selecting from autocomplete sends immediately.

The folder name (not the skill display name) is used as the command — e.g., a skill at `skills/weekly-report/` is invoked with `/weekly-report`.

### CLI Mode Support

Skills also work with CLI backends (Gemini CLI, Claude CLI, Codex CLI). Since CLI providers do not support function calling, skill workflows use a text-based convention: the AI outputs a `[RUN_WORKFLOW: workflowId]` marker, and the plugin automatically executes the workflow and displays the result.

### Example: Creating a Skill

1. Create a folder: `skills/summarizer/`
2. Create `skills/summarizer/SKILL.md`:

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

3. Open the chat, click **+** to activate the "Summarizer" skill
4. Ask the AI to summarize a note — it will follow the skill's instructions

## Example Skills

### Writing Style Guide (Instructions + References)

A skill that enforces consistent writing style using a reference document.

#### Folder structure

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
description: Enforces consistent tone and formatting for blog posts
---

You are a writing assistant. Always follow the style guide in the references.

When reviewing or writing text:

1. Use the voice and tone specified in the style guide
2. Follow the formatting rules (headings, lists, emphasis)
3. Apply the vocabulary preferences (preferred/avoided words)
4. Point out any style violations when reviewing existing text
```

#### `references/style-guide.md`

```markdown
# Blog Style Guide

## Voice & Tone
- Conversational but professional
- Active voice preferred
- Second person ("you") for tutorials, first person plural ("we") for announcements

## Formatting
- H2 for main sections, H3 for subsections
- Use bullet lists for 3+ items
- Bold for UI elements and key terms
- Code blocks with language tags

## Vocabulary
- Prefer: "use" over "utilize", "start" over "initiate", "help" over "facilitate"
- Avoid: jargon without explanation, passive constructions, filler words ("very", "really", "just")
```

---

### Daily Journal (Instructions + Workflow)

A skill that helps maintain a daily journal with a workflow to create today's entry.

#### Folder structure

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
description: Daily journaling assistant with entry creation
workflows:
  - path: workflows/create-entry.md
    description: Create today's journal entry from template
---

You are a journaling assistant. Help the user reflect on their day.

When the user asks to write a journal entry:

1. Use the workflow to create today's note file first
2. Ask about highlights, challenges, and learnings
3. Format entries with the ## Highlights / ## Challenges / ## Learnings structure
4. Keep a warm, encouraging tone
5. Suggest reflection prompts if the user seems stuck
```

#### `workflows/create-entry.md`

````markdown
```workflow
name: Create Journal Entry
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

      ## Highlights


      ## Challenges


      ## Learnings


      ## Tomorrow
    mode: create
    saveTo: result
  - id: open
    type: open
    path: "Journal/{{today}}.md"
```
````

Usage: Activate the skill, then ask "Create today's journal entry" — the AI calls the workflow to create the file, then helps you fill it in.

---

### Meeting Notes (Instructions + References + Workflow)

A full-featured skill combining custom instructions, a template reference, and a workflow for creating meeting notes.

#### Folder structure

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
description: Structured meeting note-taking with template and auto-creation
workflows:
  - path: workflows/create-meeting.md
    description: Create a new meeting note with attendees and agenda
---

You are a meeting notes assistant. Follow the template in the references.

When helping with meeting notes:

1. Use the workflow to create the meeting note file
2. Follow the template structure exactly
3. Capture action items with owners and due dates in the format: `- [ ] [Owner] Action item (due: YYYY-MM-DD)`
4. Summarize decisions clearly and separately from discussion
5. After the meeting, offer to extract action items as tasks
```

#### `references/template.md`

```markdown
# Meeting Note Template

## Required Sections

### Header
- **Title**: Meeting topic
- **Date**: YYYY-MM-DD
- **Attendees**: List of participants

### Agenda
Numbered list of discussion topics.

### Notes
Discussion details organized by agenda item. Use sub-headings.

### Decisions
Bulleted list of decisions made. Each must be clear and actionable.

### Action Items
Checkbox list with owner and due date:
- [ ] [Owner] Description (due: YYYY-MM-DD)

### Next Steps
Brief summary of follow-ups and next meeting date if applicable.
```

#### `workflows/create-meeting.md`

````markdown
```workflow
name: Create Meeting Note
nodes:
  - id: date
    type: set
    name: today
    value: "{{_date}}"
  - id: gen
    type: command
    prompt: |
      Generate a meeting note file path and initial content.
      Today's date is {{today}}.
      The meeting topic is: {{topic}}
      Attendees: {{attendees}}

      Return ONLY a JSON object:
      {"path": "Meetings/YYYY-MM-DD Topic.md", "content": "...markdown content following the template..."}

      Use the template structure: Header with date/attendees, Agenda (from topic), empty Notes/Decisions/Action Items/Next Steps sections.
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

Usage: Activate the skill, then say "Create meeting notes for the design review with Alice, Bob, and Carol" — the AI calls the workflow with topic/attendees, creates a structured note, and opens it.

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Skills folder | `skills` | Path to the skills folder in your vault |
