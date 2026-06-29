# Importing Skills

Gemini Helper can fetch skills from a GitHub repository. This is useful for sharing reusable skills outside a single vault and for maintaining a community or team skill repository through pull requests.

Imported skills are copied into the vault `skills/` folder. After import, they appear in the existing chat skill selector.

## Repository Layout

Use a repository with a top-level `skills/` directory:

```text
gemini-helper-skills/
  skills/
    code-review/
      manifest.json
      SKILL.md
      references/
        style-guide.md
      workflows/
        review.md
    okf-author/
      manifest.json
      SKILL.md
```

Each skill must have a `SKILL.md` file in its own folder. Workflows and references should stay inside that same skill folder.

## Skill Manifest

Each skill can include a `manifest.json` file. When present, the manifest is used for version and plugin compatibility checks.

```json
{
  "id": "code-review",
  "name": "Code Review",
  "version": "1.2.0",
  "description": "Review code changes and suggest concrete fixes.",
  "compatibility": {
    "plugins": [
      {
        "id": "gemini-helper",
        "minVersion": "1.16.0"
      },
      {
        "id": "local-llm-hub",
        "minVersion": "0.4.0"
      },
      {
        "id": "llm-hub",
        "minVersion": "0.4.0"
      }
    ]
  }
}
```

Fields:

- `id`: Skill ID. Must match the folder name under `skills/`.
- `name`: Human-readable skill name.
- `version`: Skill version. Used to decide whether an installed skill should be updated.
- `description`: Short summary for humans.
- `compatibility.plugins`: List of plugin IDs and optional version ranges.

Compatibility entries support:

```json
{ "id": "gemini-helper", "minVersion": "1.16.0", "maxVersion": "2.0.0" }
```

## Import From Settings

1. Open Gemini Helper settings.
2. Go to **Knowledge sources**.
3. Set **Skills repository** to a GitHub repository, such as `takeshy/llm-hub-skills`.
4. Set **Skill IDs to install** to one or more IDs, such as `code-review`.
5. Click **Import skills**.
6. Open chat and enable the imported skill from the skill selector.

Examples:

```text
takeshy/llm-hub-skills
https://github.com/takeshy/llm-hub-skills
```

The repository must be public. Private repository token support is not currently included.
Gemini Helper fetches from the repository's default branch.

## Install and Update Rules

When **Skill IDs to install** is set:

- The installer looks for `skills/<id>/manifest.json`.
- If `manifest.json` is missing, the skill is installed or overwritten without compatibility or version checks.
- If `manifest.json` exists, its `id` must match the folder name.
- If `manifest.json` exists, it must be compatible with the current plugin ID, such as `gemini-helper`.
- If the skill is not installed yet, it is installed.
- If the skill is already installed and both manifests have `version`, the source skill is installed only when its version is higher.
- If the installed version is current or newer, the skill is skipped.

When **Skill IDs to install** is empty, the importer imports all skills from the repository. Manifests are used when present, and legacy skills without manifests are accepted.

## Pull Request Workflow

1. Add or update a skill in the shared skills repository.
2. Open a pull request.
3. Review the skill instructions, references, and workflow files.
4. Merge the pull request.
5. Run **Import skills** in Gemini Helper settings.

The plugin fetches files from GitHub at import time using the repository's default branch.

## Overwrite Behavior

Import copies files into the vault `skills/` folder.

- New skill folders are created.
- Existing files with the same path are overwritten.
- Files that no longer exist in the source are not deleted from the vault.
- Built-in skills are not modified.

If you need a clean re-import, delete the target skill folder from the vault first, then import again.

## Notes

- External skills import is not specific to OKF. Use it for any Gemini Helper skill.
- Imported skills use the same `SKILL.md` and `skill-capabilities` format as vault-authored skills.
- The repository must be public.
