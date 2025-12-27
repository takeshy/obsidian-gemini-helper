import { TFolder, type App } from "obsidian";
import { formatError } from "src/utils/error";

export interface SearchResult {
  path: string;
  name: string;
  score: number;
  matchedContent?: string;
}

// Search notes by file name
export function searchByName(
  app: App,
  query: string,
  limit = 10
): SearchResult[] {
  const files = app.vault.getMarkdownFiles();
  const searchTerm = query.toLowerCase().trim();

  const results: SearchResult[] = [];

  for (const file of files) {
    const fileName = file.basename.toLowerCase();
    const filePath = file.path.toLowerCase();

    // Calculate relevance score
    let score = 0;

    // Exact match gets highest score
    if (fileName === searchTerm) {
      score = 100;
    } else if (fileName.startsWith(searchTerm)) {
      score = 80;
    } else if (fileName.includes(searchTerm)) {
      score = 60;
    } else if (filePath.includes(searchTerm)) {
      score = 40;
    }

    if (score > 0) {
      results.push({
        path: file.path,
        name: file.basename,
        score,
      });
    }
  }

  // Sort by score (descending) and limit results
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Search notes by content
export async function searchByContent(
  app: App,
  query: string,
  limit = 10
): Promise<SearchResult[]> {
  const files = app.vault.getMarkdownFiles();
  const searchTerm = query.toLowerCase().trim();

  const results: SearchResult[] = [];

  for (const file of files) {
    const content = await app.vault.cachedRead(file);
    const contentLower = content.toLowerCase();

    const index = contentLower.indexOf(searchTerm);
    if (index !== -1) {
      // Extract context around the match
      const start = Math.max(0, index - 50);
      const end = Math.min(content.length, index + searchTerm.length + 50);
      const matchedContent = content.slice(start, end);

      // Count occurrences for score
      const occurrences = (
        contentLower.match(new RegExp(escapeRegex(searchTerm), "gi")) || []
      ).length;

      results.push({
        path: file.path,
        name: file.basename,
        score: Math.min(occurrences * 10, 100),
        matchedContent: `...${matchedContent}...`,
      });
    }
  }

  // Sort by score (descending) and limit results
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// List notes in a folder (limited to prevent token explosion)
export function listNotes(
  app: App,
  folder?: string,
  recursive = false,
  limit = 50  // Default limit to prevent large responses
): SearchResult[] {
  let files = app.vault.getMarkdownFiles();

  if (folder) {
    const normalizedFolder = folder.toLowerCase().replace(/\/$/, "");
    files = files.filter((file) => {
      const filePath = file.path.toLowerCase();
      if (recursive) {
        return filePath.startsWith(normalizedFolder + "/");
      } else {
        const fileFolder = file.parent?.path?.toLowerCase() || "";
        return fileFolder === normalizedFolder;
      }
    });
  }

  // Sort by modification time (newest first) and limit
  const sortedFiles = files
    .sort((a, b) => b.stat.mtime - a.stat.mtime)
    .slice(0, limit);

  return sortedFiles.map((file) => ({
    path: file.path,
    name: file.basename,
    score: 0,
  }));
}

// List all folders
export function listFolders(app: App, parentFolder?: string): string[] {
  const allFiles = app.vault.getAllLoadedFiles();
  const folders = allFiles.filter((f): f is TFolder => f instanceof TFolder);

  let filteredFolders = folders;

  if (parentFolder) {
    const normalizedParent = parentFolder.toLowerCase().replace(/\/$/, "");
    filteredFolders = folders.filter((f) => {
      const folderPath = f.path.toLowerCase();
      return (
        folderPath.startsWith(normalizedParent + "/") &&
        folderPath !== normalizedParent
      );
    });
  }

  return filteredFolders.map((f) => f.path).filter((p) => p !== "/");
}

// Create a folder
export async function createFolder(
  app: App,
  path: string
): Promise<{ success: boolean; path?: string; error?: string }> {
  // Check if folder already exists
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFolder) {
    return { success: true, path };
  }

  try {
    await app.vault.createFolder(path);
    return { success: true, path };
  } catch (error) {
    return {
      success: false,
      error: `Failed to create folder: ${formatError(error)}`,
    };
  }
}

// Helper to escape regex special characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
