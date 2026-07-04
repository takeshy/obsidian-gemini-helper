---
type: Feature Reference
title: Skill Authoring
description: How to structure vault skills with SKILL.md, references, workflows, and skill-capabilities.
tags: [skills, authoring, skill-md, references]
timestamp: 2026-07-04T00:00:00Z
---

# Skill Authoring

Vault-authored skills live under the vault `skills/` folder. Each skill is a folder whose stable command name is the folder name.

```text
skills/
  code-review/
    SKILL.md
    references/
      style-guide.md
      checklist.md
    workflows/
      review.md
```

# SKILL.md

`SKILL.md` has YAML frontmatter for user-facing metadata and a Markdown body for instructions.

````markdown
---
name: Code Review
description: Reviews code blocks in notes for quality and best practices
---

```skill-capabilities
workflows:
  - path: workflows/review.md
    description: Review the selected file
    inputVariables: [filePath]
```

When this skill is active, review code for correctness, maintainability, and concrete fixes.
````

Frontmatter fields:

- `name` - display name; defaults to folder name.
- `description` - short description shown in selectors and prompt context.

The Markdown body should explain when to use the skill, what behavior to follow, what files or references matter, when to call workflows, and how to present results.

# skill-capabilities

Workflow capability definitions live in a fenced YAML block tagged `skill-capabilities`. This is the current source of truth for skill workflows.

```yaml
workflows:
  - path: workflows/run-lint.md
    description: Run linting on the current note
    inputVariables: [targetPath]
```

Fields:

- `path` - workflow file path relative to the skill folder.
- `description` - description used for workflow tool selection.
- `inputVariables` - variables the chat model should pass when invoking the workflow.

Legacy `workflows:` frontmatter is still accepted for backward compatibility, but Gemini Helper warns and prefers migration to `skill-capabilities`.

# References

Reference files belong in `references/`. Use them for style guides, templates, checklists, examples, and domain-specific material. Built-in skills inline their references. Vault skills are lazy-loaded, so the assistant should read `SKILL.md` first and then read referenced files when the skill instructions require them.

# Workflows

Skill workflows use normal Gemini Helper workflow Markdown files. Place them in `workflows/` by convention. Workflows are executed through chat with `run_skill_workflow`.

Any variable read as `{{var}}` before being initialized by `variable` or `set`, and before being written by `saveTo`, becomes a workflow input. AI-generated skills derive these input variables and write them into the `skill-capabilities` block.

# AI Creation And Modification

Skills can be created from the Workflow / skill tab by choosing `+ New (AI)` and enabling "Create as agent skill", or by using the "Create skill with AI" action. Gemini Helper writes `SKILL.md`, the `skill-capabilities` block, and the workflow file.

When the active file is `SKILL.md`, "Modify skill with AI" edits both the skill instructions and the related workflow together while preserving frontmatter and capabilities.

# Example Instruction-Only Skill

```markdown
---
name: Summarizer
description: Summarizes notes in concise bullet-point format
---

When asked to summarize:

- Use concise bullet points.
- Group related items under headings.
- Include key dates and action items.
- Keep the summary under 500 words unless the user asks for detail.
```

# Example Skill With References

Use `references/style-guide.md` for voice, formatting, and vocabulary rules. In `SKILL.md`, tell the assistant to read and follow the reference before reviewing or drafting text.

# Example Skill With Workflow

A daily-journal skill can expose `workflows/create-entry.md` to create today's journal file, then use the `SKILL.md` body to guide the chat model to ask reflection questions and present the result.
