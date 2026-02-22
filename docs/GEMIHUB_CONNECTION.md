# GemiHub Connection (Google Drive Sync)

Sync your Obsidian vault with Google Drive, fully compatible with [GemiHub](https://gemihub.com). Edit notes in Obsidian and access them from GemiHub's web interface, or vice versa.

## Overview

- **Bidirectional sync** - Push local changes to Drive, pull remote changes to Obsidian
- **GemiHub compatible** - Uses the same `_sync-meta.json` format and encrypted auth from GemiHub
- **Conflict resolution** - Detects and resolves conflicts when both sides edit the same file
- **Selective sync** - Exclude files/folders with pattern matching
- **Binary support** - Syncs images, PDFs, and other binary files

## Prerequisites

You need a [GemiHub](https://gemihub.com) account with Google Drive sync configured. The plugin uses GemiHub's encrypted authentication token to connect to your Google Drive.

1. Sign in to GemiHub
2. Go to **Settings** → **Obsidian Sync** section
3. Copy the **Backup token**

## Setup

1. Open Obsidian **Settings** → **Gemini Helper** → scroll to **Google Drive sync**
2. Toggle **Enable drive sync** on
3. Paste the **Backup token** from GemiHub
4. Click **Setup** to fetch the encrypted auth from Google Drive
5. Enter your **password** to unlock sync for the current session

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

### Pull

Downloads remote changes to the vault.

1. Fetches remote `_sync-meta.json`
2. Computes local checksums to detect local changes
3. If conflicts exist, shows the conflict resolution modal
4. Deletes locally-only files (moved to Obsidian trash)
5. Downloads new/modified remote files to vault
6. Updates local sync metadata

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

## Data Management

### Trash

Files deleted during sync are moved to the `trash/` folder on Drive instead of being permanently deleted. From the settings, you can:

- **Restore** - Move files back from trash to the root folder
- **Delete permanently** - Permanently remove files from Drive

### Conflict Backups

When conflicts are resolved, the losing version is saved in `sync_conflicts/` on Drive. You can:

- **Restore** - Restore a backup to the root folder (overwrites the current version)
- **Delete** - Permanently remove backups

### Temporary Files

Files temporarily saved by GemiHub are stored in `__TEMP__/` on Drive. You can:

- **Apply** - Apply temporary file content to the corresponding Drive file
- **Delete** - Remove temporary files

All three management modals support file preview and batch operations.

## Settings

| Setting | Description | Default |
|---|---|---|
| **Enable drive sync** | Toggle the sync feature | Off |
| **Backup token** | Paste from GemiHub settings (Obsidian Sync section) | - |
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
- If you have changed your password in GemiHub, use **Reset auth** in settings and re-setup with a new backup token

### Conflict modal keeps appearing

Both sides have changes. Resolve all conflicts by choosing local or remote for each file. After resolving all conflicts, pull continues automatically.
