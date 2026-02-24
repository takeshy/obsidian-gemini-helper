import type { ToolDefinition } from "src/types";

// Tool definitions for Gemini Function Calling
export const obsidianTools: ToolDefinition[] = [
  {
    name: "read_note",
    description:
      "Read the content of a note in Obsidian by name or by detecting the currently active note.",
    parameters: {
      type: "object",
      properties: {
        fileName: {
          type: "string",
          description: "The name or path of the note to read",
        },
        activeNote: {
          type: "boolean",
          description:
            "If no filename provided, set to true to read the currently active note",
        },
      },
    },
  },
  {
    name: "create_note",
    description:
      "Create a new note in Obsidian with the specified content and optional location.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The name of the note (with or without .md extension)",
        },
        content: {
          type: "string",
          description: "The markdown content for the note",
        },
        folder: {
          type: "string",
          description: "The folder path where the note should be created",
        },
        tags: {
          type: "string",
          description: "Comma-separated list of tags to add to the note",
        },
      },
      required: ["name", "content"],
    },
  },
  {
    name: "update_note",
    description:
      "Update or replace the content of an existing note in Obsidian.",
    parameters: {
      type: "object",
      properties: {
        fileName: {
          type: "string",
          description: "The name or path of the note to update",
        },
        activeNote: {
          type: "boolean",
          description: "If true, update the currently active note",
        },
        newContent: {
          type: "string",
          description: "The new content to replace or append",
        },
        mode: {
          type: "string",
          description: "Update mode: 'replace' to replace all content, 'append' to add at end, 'prepend' to add at beginning",
          enum: ["replace", "append", "prepend"],
        },
      },
      required: ["newContent"],
    },
  },
  {
    name: "search_notes",
    description:
      "Search for notes in the vault by name or content. Returns matching note names.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query (file name pattern or content to search)",
        },
        searchContent: {
          type: "boolean",
          description: "If true, search within note contents; if false, search file names only",
        },
        limit: {
          type: "string",
          description: "Maximum number of results to return (default: 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "list_notes",
    description:
      "List all notes in a specific folder or the entire vault. Returns up to 'limit' notes with total count.",
    parameters: {
      type: "object",
      properties: {
        folder: {
          type: "string",
          description: "The folder path to list notes from. Leave empty for root.",
        },
        recursive: {
          type: "boolean",
          description: "If true, include notes in subfolders",
        },
        limit: {
          type: "string",
          description: "Maximum number of notes to return (default: 50, configurable)",
        },
      },
    },
  },
  {
    name: "create_folder",
    description: "Create a new folder in the vault.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path of the folder to create",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "list_folders",
    description: "List all folders in the vault.",
    parameters: {
      type: "object",
      properties: {
        parentFolder: {
          type: "string",
          description: "The parent folder to list subfolders from. Leave empty for all folders.",
        },
      },
    },
  },
  {
    name: "get_active_note_info",
    description:
      "Get information about the currently active note without reading its full content.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "delete_note",
    description: "Delete a note from the vault.",
    parameters: {
      type: "object",
      properties: {
        fileName: {
          type: "string",
          description: "The name or path of the note to delete",
        },
      },
      required: ["fileName"],
    },
  },
  {
    name: "rename_note",
    description: "Propose renaming or moving a note. Changes are NOT applied immediately - a confirmation dialog is shown first. The user must click Apply to rename, or Discard to cancel.",
    parameters: {
      type: "object",
      properties: {
        oldPath: {
          type: "string",
          description: "The current path of the note",
        },
        newPath: {
          type: "string",
          description: "The new path for the note",
        },
      },
      required: ["oldPath", "newPath"],
    },
  },
  {
    name: "get_rag_sync_status",
    description:
      "Get RAG synchronization status for files. Can check if specific files are synced, when they were imported, if there are differences from current content, and list unsynced files in a directory.",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description:
            "Path to a specific file to check sync status for. Returns import time, sync status, and diff status.",
        },
        directory: {
          type: "string",
          description:
            "Directory path to list unsynced files. Returns list of files that have not been imported to RAG or have changes.",
        },
        listAll: {
          type: "boolean",
          description:
            "If true, return sync status summary for all files in the vault.",
        },
      },
    },
  },
  {
    name: "propose_edit",
    description:
      "Propose an edit to an existing note. Changes are NOT applied immediately - a confirmation dialog is shown first. The user must click Apply to write changes, or Discard to cancel. Use this instead of update_note for safer editing workflow.",
    parameters: {
      type: "object",
      properties: {
        fileName: {
          type: "string",
          description: "The name or path of the note to edit",
        },
        activeNote: {
          type: "boolean",
          description: "If true, edit the currently active note",
        },
        newContent: {
          type: "string",
          description: "The new content to propose (required for replace/append/prepend modes)",
        },
        mode: {
          type: "string",
          description: "Edit mode: 'replace' replaces all content (requires newContent), 'append' adds at end (requires newContent), 'prepend' adds at beginning (requires newContent), 'patch' applies search-and-replace patches (requires patches)",
          enum: ["replace", "append", "prepend", "patch"],
        },
        patches: {
          type: "array",
          description: "Array of search-and-replace patches (required for patch mode). Each patch replaces the first occurrence of 'search' with 'replace'.",
          items: {
            type: "object",
            properties: {
              search: {
                type: "string",
                description: "The text to search for (exact match)",
              },
              replace: {
                type: "string",
                description: "The replacement text",
              },
            },
            required: ["search", "replace"],
          },
        },
      },
      required: ["mode"],
    },
  },
  {
    name: "propose_delete",
    description:
      "Propose deletion of a note. The file is NOT deleted immediately - a confirmation dialog is shown first. The user must click Delete to confirm, or Cancel to keep the file. Use this for safe deletion workflow.",
    parameters: {
      type: "object",
      properties: {
        fileName: {
          type: "string",
          description: "The name or path of the note to delete",
        },
      },
      required: ["fileName"],
    },
  },
  {
    name: "bulk_propose_edit",
    description:
      "Propose edits to multiple notes at once. A confirmation dialog shows all files with checkboxes for selective application. Use this when editing many files to avoid multiple individual confirmations.",
    parameters: {
      type: "object",
      properties: {
        edits: {
          type: "array",
          description: "Array of edit operations",
          items: {
            type: "object",
            properties: {
              fileName: {
                type: "string",
                description: "The name or path of the note to edit",
              },
              newContent: {
                type: "string",
                description: "The new content for the note",
              },
              mode: {
                type: "string",
                description: "Edit mode: 'replace', 'append', or 'prepend'",
                enum: ["replace", "append", "prepend"],
              },
            },
            required: ["fileName", "newContent"],
          },
        },
      },
      required: ["edits"],
    },
  },
  {
    name: "bulk_propose_rename",
    description:
      "Propose renaming/moving multiple notes at once. A confirmation dialog shows all renames with checkboxes for selective application. Use this when renaming many files to avoid multiple individual confirmations.",
    parameters: {
      type: "object",
      properties: {
        renames: {
          type: "array",
          description: "Array of rename operations",
          items: {
            type: "object",
            properties: {
              oldPath: {
                type: "string",
                description: "The current path of the note",
              },
              newPath: {
                type: "string",
                description: "The new path for the note",
              },
            },
            required: ["oldPath", "newPath"],
          },
        },
      },
      required: ["renames"],
    },
  },
  {
    name: "bulk_propose_delete",
    description:
      "Propose deletion of multiple notes at once. A confirmation dialog shows all files with checkboxes for selective deletion. Use this when deleting many files to avoid multiple individual confirmations.",
    parameters: {
      type: "object",
      properties: {
        fileNames: {
          type: "array",
          description: "Array of file names or paths to delete",
          items: {
            type: "string",
          },
        },
      },
      required: ["fileNames"],
    },
  },
];

// Get subset of tools based on enabled features
export function getEnabledTools(options: {
  allowWrite?: boolean;
  allowDelete?: boolean;
  ragEnabled?: boolean;
}): ToolDefinition[] {
  const { allowWrite = true, allowDelete = false, ragEnabled = false } = options;

  return obsidianTools.filter((tool) => {
    // Read operations always allowed
    if (
      ["read_note", "search_notes", "list_notes", "list_folders", "get_active_note_info"].includes(
        tool.name
      )
    ) {
      return true;
    }

    // RAG sync status tool - only available when RAG is enabled
    if (tool.name === "get_rag_sync_status") {
      return ragEnabled;
    }

    // Write operations (update_note is disabled in favor of propose_edit for safer editing)
    if (
      ["create_note", "create_folder", "rename_note", "propose_edit", "bulk_propose_edit", "bulk_propose_rename"].includes(tool.name)
    ) {
      return allowWrite;
    }

    // Delete operation (propose_delete for safe deletion with confirmation)
    if (["propose_delete", "bulk_propose_delete"].includes(tool.name)) {
      return allowDelete;
    }

    // Direct delete (disabled - use propose_delete instead)
    if (tool.name === "delete_note") {
      return false;
    }

    return false;
  });
}
