# GemiHub Connection (Google Drive Sync)

Sync your Obsidian vault with Google Drive, fully compatible with [GemiHub](https://gemihub.online). Edit notes in Obsidian and access them from GemiHub's web interface, or vice versa.

## What is GemiHub?

[GemiHub](https://gemihub.online) is a web application that turns Google Gemini into a personal AI assistant integrated with your Google Drive.

![GemiHub Interface](images/gemihub_connection/push_pull.png)

### GemiHub-exclusive features

These features are only available through GemiHub's web interface and cannot be replicated by the Obsidian plugin alone:

- **Automatic RAG** - Files synced to GemiHub are automatically indexed for semantic search. Unlike the Obsidian plugin's manual RAG sync, GemiHub indexes files on every sync without additional setup.
- **OAuth2-enabled MCP** - Use MCP servers that require OAuth2 authentication (e.g., Google Calendar, Gmail, Google Docs). The Obsidian plugin only supports header-based MCP authentication.
- **Markdown to PDF/HTML conversion** - Convert your Markdown notes to formatted PDF or HTML documents directly in GemiHub.
- **Public publishing** - Publish converted HTML/PDF documents with a shareable public URL, making it easy to share notes externally.

### Features added to Obsidian through connection

By enabling Google Drive sync, these features become available on the Obsidian side:

- **Bidirectional sync with diff preview** - Push and pull files with a detailed file list and unified diff view before committing changes
- **Conflict resolution with diff** - When the same file is edited on both sides, a conflict modal shows a color-coded unified diff to help you decide which version to keep
- **Drive edit history** - Track changes made from both Obsidian and GemiHub, with per-file history entries showing origin (local/remote)
- **Conflict backup management** - Browse, preview, and restore conflict backups stored on Drive

## Sync Overview

- **Bidirectional sync** - Push local changes to Drive, pull remote changes to Obsidian
- **GemiHub compatible** - Uses the same `_sync-meta.json` format and encrypted auth from GemiHub
- **Conflict resolution** - Detects and resolves conflicts when both sides edit the same file
- **Selective sync** - Exclude files/folders with pattern matching
- **Binary support** - Syncs images, PDFs, and other binary files

## Prerequisites

You need a [GemiHub](https://gemihub.online) account with Google Drive sync configured. The plugin uses GemiHub's encrypted authentication token to connect to your Google Drive.

1. Sign in to GemiHub
2. Go to **Settings** → **Obsidian Sync** section
3. Copy the **Migration Tool token**

![Migration Tool Token](images/gemihub_connection/migration_tool.png)

## Setup

1. Open Obsidian **Settings** → **Gemini Helper** → scroll to **Google Drive sync**
2. Toggle **Enable drive sync** on

![Enable Drive Sync](images/gemihub_connection/setting_drive_sync.png)

3. Paste the **Migration Tool token** from GemiHub
4. Click **Setup** to fetch the encrypted auth from Google Drive

![Migration Tool Token Setup](images/gemihub_connection/setting_migration_tool_token.png)

5. Enter your **password** to unlock sync for the current session

![Drive Sync Unlock](images/gemihub_connection/start_with_sync.png)

> On each Obsidian restart, you will be prompted to enter your password to unlock the sync session.

## How Sync Works

### File Storage on Drive

All vault files are stored **flat** in the root folder on Drive. The file name on Drive includes the full vault path:

| Vault path | Drive file name |
|---|---|
| `notes.md` | `notes.md` |
| `daily/2024-01-15.md` | `daily/2024-01-15.md` |
| `attachments/image.png` | `attachments/image.png` |

This means there are no subfolders on Drive (except for system folders like `trash/`, `sync_conflicts/`, `__TEMP__/`). GemiHub uses the same flat structure.

### Sync Metadata

Two metadata files track sync state:

- **`_sync-meta.json`** (on Drive) - Shared with GemiHub. Contains file IDs, checksums, and timestamps for all synced files.
- **`{workspaceFolder}/drive-sync-meta.json`** (local) - Maps vault paths to Drive file IDs and stores last-synced checksums.

### Push

Uploads local changes to Google Drive.

1. Computes MD5 checksums for all vault files
2. Compares with local sync metadata to find changed files
3. If remote has pending changes, push is rejected (pull first)
4. Uploads new/modified files to Drive
5. Moves locally deleted files to `trash/` on Drive (soft delete)
6. Updates `_sync-meta.json` on Drive

![Push to Drive](images/gemihub_connection/push.png)

### Pull

Downloads remote changes to the vault.

1. Fetches remote `_sync-meta.json`
2. Computes local checksums to detect local changes
3. If conflicts exist, shows the conflict resolution modal
4. Deletes locally-only files (moved to Obsidian trash)
5. Downloads new/modified remote files to vault
6. Updates local sync metadata

![Pull to Local](images/gemihub_connection/pull_to_local.png)

### Full Pull

Replaces all local files with remote versions. Use this to reset your vault to match Drive.

> **Warning:** This deletes local files not present on Drive (moved to Obsidian trash).

### Conflict Resolution

When the same file is modified both locally and remotely:

- A modal shows all conflicting files
- For each file, choose **Keep local** or **Keep remote**
- The losing version is backed up to `sync_conflicts/` on Drive
- **Edit-delete conflicts** (locally edited, remotely deleted) offer **Restore (push to drive)** or **Accept delete**
- Bulk actions: **Keep all local** / **Keep all remote**

![Conflict Resolution](images/gemihub_connection/conflict.png)

Click **Diff** to see a color-coded unified diff between local and remote versions:

![Conflict Diff View](images/gemihub_connection/conflict_diff.png)

## Data Management

### Trash

Files deleted during sync are moved to the `trash/` folder on Drive instead of being permanently deleted. From the settings, you can:

- **Restore** - Move files back from trash to the root folder
- **Delete permanently** - Permanently remove files from Drive

### Conflict Backups

When conflicts are resolved, the losing version is saved in `sync_conflicts/` on Drive. You can:

- **Restore** - Restore a backup to the root folder (overwrites the current version)
- **Delete** - Permanently remove backups

![Conflict Backups](images/gemihub_connection/conflict_backup.png)

### Temporary Files

Files temporarily saved by GemiHub are stored in `__TEMP__/` on Drive. You can:

- **Apply** - Apply temporary file content to the corresponding Drive file
- **Delete** - Remove temporary files

All three management modals support file preview and batch operations.

## Settings

| Setting | Description | Default |
|---|---|---|
| **Enable drive sync** | Toggle the sync feature | Off |
| **Migration Tool token** | Paste from GemiHub settings (Obsidian Sync section) | - |
| **Auto sync check** | Periodically check for remote changes and update counts | Off |
| **Sync check interval** | How often to check (minutes) | 5 |
| **Exclude patterns** | Paths to exclude (one per line, supports `*` wildcards) | `node_modules/` |

## Commands

Four commands are available from the command palette:

| Command | Description |
|---|---|
| **Drive sync: push to drive** | Push local changes to Drive |
| **Drive sync: pull to local** | Pull remote changes to vault |
| **Drive sync: full push to drive** | Push all local files to Drive |
| **Drive sync: full pull to local** | Replace all local files with remote versions |

## Excluded Files

The following are always excluded from sync:

- `_sync-meta.json`, `settings.json`
- `history/`, `trash/`, `sync_conflicts/`, `__TEMP__/`, `plugins/`, `.trash/`, `node_modules/`
- Obsidian config directory (`.obsidian/` or custom)
- User-defined exclude patterns from settings

### Exclude Pattern Syntax

- `folder/` - Exclude a folder and its contents
- `*.tmp` - Glob pattern (matches any `.tmp` file)
- `*.log` - Glob pattern (matches any `.log` file)
- `drafts/` - Exclude the `drafts` folder

## Troubleshooting

### "Remote has pending changes. Please pull first."

The remote Drive has changes that haven't been pulled yet. Run **Pull to local** before pushing.

### "Drive sync: no remote data found. Push first."

No `_sync-meta.json` exists on Drive. Run **Push to drive** to initialize sync.

### Password unlock fails

- Verify you are using the same password as in GemiHub
- If you have changed your password in GemiHub, use **Reset auth** in settings and re-setup with a new Migration Tool token

### Conflict modal keeps appearing

Both sides have changes. Resolve all conflicts by choosing local or remote for each file. After resolving all conflicts, pull continues automatically.
