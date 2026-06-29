# Importing Skills

Gemini Helper imports skills from the official skills repository `takeshy/llm-hub-skills`. The source repository is fixed: skills can run workflows (commands, HTTP, MCP), so restricting imports to a single trusted repository is the main safeguard against running untrusted code. New and updated skills are distributed through pull requests to that repository.

Imported skills are copied into the vault `skills/` folder. After import, they appear in the existing chat skill selector.

## Repository Layout

The official repository uses a top-level `skills/` directory:

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
    dashboard-author/
      manifest.json
      SKILL.md
```

Each skill must have a `SKILL.md` file and a `manifest.json` file in its own folder. Workflows and references should stay inside that same skill folder.

## Skill Manifest

Each skill **must** include a `manifest.json` file. The manifest is required for version tracking and plugin compatibility checks; skills without a valid manifest are skipped during import.

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
- `version`: Skill version (required). Must be valid semver. Used to decide whether an installed skill should be updated.
- `description`: Short summary for humans.
- `compatibility.plugins`: List of plugin IDs and optional version ranges.

Compatibility entries support:

```json
{ "id": "gemini-helper", "minVersion": "1.16.0", "maxVersion": "2.0.0" }
```

## Import From Settings

1. Open Gemini Helper settings.
2. Go to **External skills**.
3. Optionally set **Skill IDs to install** to one or more IDs, such as `code-review`. Leave empty to install every skill in the repository.
4. Click **Import skills**.
5. Open chat and enable the imported skill from the skill selector.

Skills are always fetched from the official repository `takeshy/llm-hub-skills`. The repository is public and Gemini Helper fetches from its default branch.

## Install and Update Rules

- The installer looks for `skills/<id>/SKILL.md` and `skills/<id>/manifest.json`.
- If `SKILL.md` is missing, the skill is skipped.
- If `manifest.json` is missing or invalid, the skill is skipped.
- The manifest `id`, when present, must match the folder name.
- The manifest must be compatible with the current plugin ID, such as `gemini-helper`.
- The manifest must declare a valid semver `version`.
- If the skill is not installed yet, it is installed.
- If the skill is already installed, the source skill is installed only when its version is higher than the installed version.
- If the installed version is current or newer, the skill is skipped.

When **Skill IDs to install** is empty, the importer imports all skills in the repository (each must still meet the rules above).

## Pull Request Workflow

1. Add or update a skill in the official skills repository (`takeshy/llm-hub-skills`).
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

- Skills are imported only from the official repository `takeshy/llm-hub-skills`.
- Imported skills use the same `SKILL.md` and `skill-capabilities` format as vault-authored skills.
- The repository is public; no authentication token is required.
