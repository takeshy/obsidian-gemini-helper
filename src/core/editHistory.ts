import { App, TFile } from "obsidian";
import * as Diff from "diff";
import type { EditHistorySettings } from "src/types";

// Edit history entry stored in history file
export interface EditHistoryEntry {
  id: string;
  timestamp: string;
  source: "workflow" | "propose_edit" | "manual" | "auto";
  workflowName?: string;
  model?: string;
  diff: string;
  stats: {
    additions: number;
    deletions: number;
  };
}

// History file format
export interface EditHistoryFile {
  version: number;
  path: string;
  entries: EditHistoryEntry[];
}

// History stats
export interface EditHistoryStats {
  totalFiles: number;
  totalEntries: number;
  totalSizeBytes: number;
}

/**
 * Manages edit history for AI-modified notes.
 * Stores unified diffs to enable lightweight version tracking.
 */
export class EditHistoryManager {
  private app: App;
  private workspaceFolder: string;
  private settings: EditHistorySettings;

  constructor(app: App, workspaceFolder: string, settings: EditHistorySettings) {
    this.app = app;
    this.workspaceFolder = workspaceFolder;
    this.settings = settings;
  }

  /**
   * Update settings
   */
  updateSettings(settings: EditHistorySettings): void {
    this.settings = settings;
  }

  /**
   * Check if history tracking is enabled in settings
   */
  isEnabled(): boolean {
    return this.settings.enabled;
  }

  /**
   * Update workspace folder
   */
  updateWorkspaceFolder(folder: string): void {
    this.workspaceFolder = folder;
  }

  /**
   * Get the history folder path
   */
  private getHistoryFolderPath(): string {
    if (this.workspaceFolder) {
      return `${this.workspaceFolder}/history`;
    }
    return "history";
  }

  /**
   * Check if a path is inside the history folder (should not be tracked)
   */
  private isInHistoryFolder(path: string): boolean {
    const historyFolder = this.getHistoryFolderPath();
    return path.startsWith(historyFolder + "/") || path === historyFolder;
  }

  /**
   * Convert a file path to its history file name
   * e.g., "notes/daily/2025-01-10.md" -> "notes-daily-2025-01-10.md.history.md"
   */
  private pathToHistoryFileName(filePath: string): string {
    return filePath.replace(/\//g, "-") + ".history.md";
  }

  /**
   * Convert a file path to its snapshot file name
   * e.g., "notes/daily/2025-01-10.md" -> "notes-daily-2025-01-10.md.snapshot.md"
   */
  private pathToSnapshotFileName(filePath: string): string {
    return filePath.replace(/\//g, "-") + ".snapshot.md";
  }

  /**
   * Get the full path to a history file
   */
  private getHistoryFilePath(notePath: string): string {
    const historyFolder = this.getHistoryFolderPath();
    const historyFileName = this.pathToHistoryFileName(notePath);
    return `${historyFolder}/${historyFileName}`;
  }

  /**
   * Get the full path to a snapshot file
   */
  private getSnapshotFilePath(notePath: string): string {
    const historyFolder = this.getHistoryFolderPath();
    const snapshotFileName = this.pathToSnapshotFileName(notePath);
    return `${historyFolder}/${snapshotFileName}`;
  }

  /**
   * Generate a unique ID for an entry (6 characters)
   */
  private generateId(): string {
    return Math.random().toString(36).substring(2, 8);
  }

  /**
   * Ensure the history folder exists
   */
  private async ensureHistoryFolder(): Promise<void> {
    const historyFolder = this.getHistoryFolderPath();

    // Use adapter directly to avoid vault cache issues
    if (!(await this.app.vault.adapter.exists(historyFolder))) {
      // Create parent folder if needed
      if (this.workspaceFolder && !(await this.app.vault.adapter.exists(this.workspaceFolder))) {
        await this.app.vault.adapter.mkdir(this.workspaceFolder);
      }
      await this.app.vault.adapter.mkdir(historyFolder);
    }
  }

  /**
   * Parse JSON from markdown code block
   */
  private parseHistoryFromMarkdown(content: string): EditHistoryFile | null {
    const match = content.match(/```json\n([\s\S]*?)\n```/);
    if (match) {
      try {
        return JSON.parse(match[1]) as EditHistoryFile;
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Format history as markdown with JSON code block
   */
  private formatHistoryAsMarkdown(history: EditHistoryFile): string {
    const json = JSON.stringify(history, null, 2);
    return `# Edit History\n\n\`\`\`json\n${json}\n\`\`\`\n`;
  }

  /**
   * Load history file for a note
   */
  private async loadHistoryFile(notePath: string): Promise<EditHistoryFile> {
    const historyPath = this.getHistoryFilePath(notePath);

    try {
      if (await this.app.vault.adapter.exists(historyPath)) {
        const content = await this.app.vault.adapter.read(historyPath);
        const history = this.parseHistoryFromMarkdown(content);
        if (history) {
          return history;
        }
      }
    } catch {
      // File doesn't exist or is invalid
    }

    // Return empty history
    return {
      version: 1,
      path: notePath,
      entries: [],
    };
  }

  /**
   * Save history file for a note
   */
  private async saveHistoryFile(notePath: string, history: EditHistoryFile): Promise<void> {
    await this.ensureHistoryFolder();

    const historyPath = this.getHistoryFilePath(notePath);
    const content = this.formatHistoryAsMarkdown(history);

    // Use adapter directly to avoid vault cache issues
    await this.app.vault.adapter.write(historyPath, content);
  }

  /**
   * Load snapshot content for a note
   */
  private async loadSnapshot(notePath: string): Promise<string | null> {
    const snapshotPath = this.getSnapshotFilePath(notePath);

    try {
      if (await this.app.vault.adapter.exists(snapshotPath)) {
        return await this.app.vault.adapter.read(snapshotPath);
      }
    } catch {
      // Snapshot doesn't exist
    }
    return null;
  }

  /**
   * Save snapshot content for a note
   */
  private async saveSnapshot(notePath: string, content: string): Promise<void> {
    await this.ensureHistoryFolder();
    const snapshotPath = this.getSnapshotFilePath(notePath);
    await this.app.vault.adapter.write(snapshotPath, content);
  }

  /**
   * Delete snapshot for a note
   */
  private async deleteSnapshot(notePath: string): Promise<void> {
    const snapshotPath = this.getSnapshotFilePath(notePath);
    if (await this.app.vault.adapter.exists(snapshotPath)) {
      await this.app.vault.adapter.remove(snapshotPath);
    }
  }

  /**
   * Create a unified diff between two strings
   * Returns the diff without file headers (hunks only)
   */
  private createDiff(originalContent: string, modifiedContent: string): { diff: string; stats: { additions: number; deletions: number } } {
    const contextLines = this.settings.diff.contextLines;

    // Use structuredPatch to get proper unified diff
    const patch = Diff.structuredPatch(
      "original",
      "modified",
      originalContent,
      modifiedContent,
      undefined,
      undefined,
      { context: contextLines }
    );

    // Build the diff string from hunks (without file headers)
    const lines: string[] = [];
    let additions = 0;
    let deletions = 0;

    for (const hunk of patch.hunks) {
      // Add hunk header
      lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);

      // Add hunk lines
      for (const line of hunk.lines) {
        lines.push(line);
        if (line.startsWith("+") && !line.startsWith("+++")) {
          additions++;
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          deletions++;
        }
      }
    }

    return {
      diff: lines.join("\n"),
      stats: { additions, deletions },
    };
  }

  /**
   * Save an edit to history using snapshot comparison
   * Diff is stored in reverse direction (new → old) so that when viewing history:
   * - "+" means lines that existed in the old version
   * - "-" means lines that were added in the new version
   */
  async saveEdit(params: {
    path: string;
    modifiedContent: string;
    source: "workflow" | "propose_edit" | "manual" | "auto";
    workflowName?: string;
    model?: string;
  }): Promise<EditHistoryEntry | null> {
    if (!this.settings.enabled) {
      return null;
    }

    // Skip files in the history folder
    if (this.isInHistoryFolder(params.path)) {
      return null;
    }

    // Load previous snapshot (or empty string if none)
    const snapshot = await this.loadSnapshot(params.path) ?? "";

    // Generate diff in reverse direction (new → old) for intuitive history viewing
    const { diff, stats } = this.createDiff(params.modifiedContent, snapshot);

    // Skip if no changes
    if (stats.additions === 0 && stats.deletions === 0) {
      return null;
    }

    // Create entry
    const entry: EditHistoryEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      source: params.source,
      workflowName: params.workflowName,
      model: params.model,
      diff,
      stats,
    };

    // Load existing history
    const history = await this.loadHistoryFile(params.path);

    // Add new entry
    history.entries.push(entry);

    // Apply retention limits
    if (this.settings.retention.maxEntriesPerFile > 0) {
      while (history.entries.length > this.settings.retention.maxEntriesPerFile) {
        history.entries.shift();
      }
    }

    // Save history and update snapshot
    await this.saveHistoryFile(params.path, history);
    await this.saveSnapshot(params.path, params.modifiedContent);

    return entry;
  }

  /**
   * Get history for a file
   * If history exists but snapshot doesn't (inconsistent state), delete the orphaned history
   */
  async getHistory(path: string): Promise<EditHistoryEntry[]> {
    // Check for inconsistent state: history exists but snapshot doesn't
    const snapshotExists = await this.loadSnapshot(path) !== null;
    const historyPath = this.getHistoryFilePath(path);
    const historyExists = await this.app.vault.adapter.exists(historyPath);

    if (historyExists && !snapshotExists) {
      // Inconsistent state - delete orphaned history file
      await this.app.vault.adapter.remove(historyPath);
      return [];
    }

    const history = await this.loadHistoryFile(path);
    return history.entries;
  }

  /**
   * Get diff between current content and last saved snapshot
   */
  async getDiffFromLastSaved(path: string): Promise<{ diff: string; stats: { additions: number; deletions: number } } | null> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return null;
    }

    const snapshot = await this.loadSnapshot(path);
    if (snapshot === null) {
      return null; // No snapshot exists
    }

    const currentContent = await this.app.vault.read(file);

    if (currentContent === snapshot) {
      return { diff: "", stats: { additions: 0, deletions: 0 } };
    }

    return this.createDiff(snapshot, currentContent);
  }

  /**
   * Apply a patch to get previous content
   * Since diffs are stored in reverse direction (new → old):
   * - Lines marked with "-" are in the current (new) content
   * - Lines marked with "+" are in the target (old) content
   */
  private applyPatch(content: string, diff: string): string {
    const lines = content.split("\n");
    const diffLines = diff.split("\n");

    // Process each hunk
    let i = 0;
    const hunks: Array<{ startIdx: number; searchLines: string[]; replaceLines: string[] }> = [];

    while (i < diffLines.length) {
      const line = diffLines[i];
      const hunkMatch = line.match(/^@@ -(\d+),?\d* \+(\d+),?\d* @@/);

      if (hunkMatch) {
        // For reverse diff (new → old), the "-" side is the new content (what we're searching for)
        const startIdx = parseInt(hunkMatch[1], 10) - 1;
        const searchLines: string[] = [];  // Lines marked with - (current content)
        const replaceLines: string[] = []; // Lines marked with + (target content)

        i++;
        while (i < diffLines.length && !diffLines[i].startsWith("@@")) {
          const hunkLine = diffLines[i];
          if (hunkLine.startsWith("-")) {
            searchLines.push(hunkLine.substring(1));
          } else if (hunkLine.startsWith("+")) {
            replaceLines.push(hunkLine.substring(1));
          } else if (hunkLine.startsWith(" ")) {
            searchLines.push(hunkLine.substring(1));
            replaceLines.push(hunkLine.substring(1));
          }
          i++;
        }

        hunks.push({ startIdx, searchLines, replaceLines });
      } else {
        i++;
      }
    }

    // Apply hunks in reverse order (from end of file to beginning)
    hunks.reverse();

    for (const hunk of hunks) {
      let startIdx = hunk.startIdx;

      // Find exact match location (with some tolerance for line drift)
      for (let j = Math.max(0, startIdx - 5); j <= Math.min(lines.length - hunk.searchLines.length, startIdx + 5); j++) {
        let match = true;
        for (let k = 0; k < hunk.searchLines.length && j + k < lines.length; k++) {
          if (lines[j + k] !== hunk.searchLines[k]) {
            match = false;
            break;
          }
        }
        if (match) {
          startIdx = j;
          break;
        }
      }

      lines.splice(startIdx, hunk.searchLines.length, ...hunk.replaceLines);
    }

    return lines.join("\n");
  }

  /**
   * Get content at a specific history entry
   * Returns the content BEFORE the change recorded in that entry
   * Uses snapshot and applies patches to go back in time
   */
  async getContentAt(path: string, entryId: string): Promise<string | null> {
    const snapshot = await this.loadSnapshot(path);
    if (snapshot === null) {
      return null;
    }

    const history = await this.loadHistoryFile(path);
    const targetIndex = history.entries.findIndex(e => e.id === entryId);
    if (targetIndex === -1) {
      return null;
    }

    // Apply patches from newest entry back to target (inclusive)
    // Each patch transforms content from newer state to older state
    // Including the target entry's patch gives us the content BEFORE that change
    let content = snapshot;
    for (let i = history.entries.length - 1; i >= targetIndex; i--) {
      content = this.applyPatch(content, history.entries[i].diff);
    }

    return content;
  }

  /**
   * Restore file to a specific history entry
   * After restore, the restored content becomes the new base (snapshot)
   * and history is cleared
   */
  async restoreTo(path: string, entryId: string): Promise<boolean> {
    const content = await this.getContentAt(path, entryId);
    if (content === null) {
      return false;
    }

    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return false;
    }

    // Restore file content
    await this.app.vault.modify(file, content);

    // Update snapshot to restored content (new base)
    await this.saveSnapshot(path, content);

    // Clear history - restored point is now the base
    await this.clearHistory(path);

    return true;
  }

  /**
   * Revert file to the base snapshot (discard unsaved changes)
   */
  async revertToBase(path: string): Promise<boolean> {
    const snapshot = await this.loadSnapshot(path);
    if (snapshot === null) {
      return false;
    }

    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return false;
    }

    // Revert file content to snapshot
    await this.app.vault.modify(file, snapshot);
    return true;
  }

  /**
   * Initialize or update snapshot for a file when opened
   * - If no snapshot exists: create one
   * - If snapshot exists and differs from current file: save diff as history, update snapshot
   */
  async initSnapshot(path: string): Promise<void> {
    if (!this.settings.enabled) {
      return;
    }

    // Only process .md files
    if (!path.endsWith(".md")) {
      return;
    }

    // Skip files in the history folder
    if (this.isInHistoryFolder(path)) {
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return;
    }

    const currentContent = await this.app.vault.read(file);
    const existingSnapshot = await this.loadSnapshot(path);

    if (existingSnapshot === null) {
      // No snapshot exists, create initial one
      await this.saveSnapshot(path, currentContent);
      return;
    }

    // Snapshot exists, check if content differs
    if (existingSnapshot === currentContent) {
      return; // No changes
    }

    // Content differs, save diff as history entry and update snapshot
    await this.saveEdit({
      path,
      modifiedContent: currentContent,
      source: "auto",
    });
  }

  /**
   * Save current file content as a manual snapshot
   */
  async saveManualSnapshot(path: string): Promise<EditHistoryEntry | null> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return null;
    }

    const currentContent = await this.app.vault.read(file);

    return this.saveEdit({
      path,
      modifiedContent: currentContent,
      source: "manual",
    });
  }

  /**
   * Ensure a snapshot exists and is in sync with current file content before modification
   * Call this BEFORE modifying a file to ensure proper diff tracking
   * - If no snapshot exists: create one from current file content
   * - If snapshot exists but differs from current content: record the diff as "auto" and update snapshot
   * Returns the current content if snapshot was created/updated, null if no action needed or file doesn't exist
   */
  async ensureSnapshot(path: string): Promise<string | null> {
    if (!this.settings.enabled) {
      return null;
    }

    // Skip non-md files
    if (!path.endsWith(".md")) {
      return null;
    }

    // Skip files in history folder
    if (this.isInHistoryFolder(path)) {
      return null;
    }

    // Get current file content
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return null; // File doesn't exist yet
    }

    const currentContent = await this.app.vault.read(file);
    const existingSnapshot = await this.loadSnapshot(path);

    if (existingSnapshot === null) {
      // No snapshot exists, create initial one
      await this.saveSnapshot(path, currentContent);
      return currentContent;
    }

    if (existingSnapshot === currentContent) {
      return null; // Snapshot is already in sync
    }

    // Snapshot exists but differs from current content
    // Record the difference as an "auto" change before updating snapshot
    // This ensures any external modifications are tracked
    const { diff, stats } = this.createDiff(currentContent, existingSnapshot);

    if (stats.additions > 0 || stats.deletions > 0) {
      const entry: EditHistoryEntry = {
        id: this.generateId(),
        timestamp: new Date().toISOString(),
        source: "auto",
        diff,
        stats,
      };

      const history = await this.loadHistoryFile(path);
      history.entries.push(entry);

      // Apply retention limits
      if (this.settings.retention.maxEntriesPerFile > 0) {
        while (history.entries.length > this.settings.retention.maxEntriesPerFile) {
          history.entries.shift();
        }
      }

      await this.saveHistoryFile(path, history);
    }

    // Update snapshot to current content
    await this.saveSnapshot(path, currentContent);
    return currentContent;
  }

  /**
   * Delete a specific history entry
   */
  async deleteEntry(path: string, entryId: string): Promise<void> {
    const history = await this.loadHistoryFile(path);

    const index = history.entries.findIndex(e => e.id === entryId);
    if (index !== -1) {
      history.entries.splice(index, 1);
      await this.saveHistoryFile(path, history);
    }
  }

  /**
   * Clear all history for a file (keeps snapshot for future tracking)
   */
  async clearHistory(path: string): Promise<void> {
    const historyPath = this.getHistoryFilePath(path);

    if (await this.app.vault.adapter.exists(historyPath)) {
      await this.app.vault.adapter.remove(historyPath);
    }
  }

  /**
   * Clear all edit history (delete entire history folder)
   */
  async clearAllHistory(): Promise<number> {
    const historyFolder = this.getHistoryFolderPath();

    if (!(await this.app.vault.adapter.exists(historyFolder))) {
      return 0;
    }

    const files = await this.app.vault.adapter.list(historyFolder);
    let deletedCount = 0;

    // Delete all files in the history folder
    for (const filePath of files.files) {
      try {
        await this.app.vault.adapter.remove(filePath);
        deletedCount++;
      } catch {
        // Ignore errors for individual files
      }
    }

    // Try to remove the empty folder
    try {
      await this.app.vault.adapter.rmdir(historyFolder, false);
    } catch {
      // Folder might not be empty or other error
    }

    return deletedCount;
  }

  /**
   * Prune old history entries based on retention settings
   */
  async prune(options?: {
    maxAgeMs?: number;
    maxEntriesPerFile?: number;
  }): Promise<{ deletedCount: number }> {
    const maxAgeMs = options?.maxAgeMs ??
      (this.settings.retention.maxAgeInDays > 0
        ? this.settings.retention.maxAgeInDays * 24 * 60 * 60 * 1000
        : 0);
    const maxEntriesPerFile = options?.maxEntriesPerFile ??
      this.settings.retention.maxEntriesPerFile;

    const now = Date.now();
    let deletedCount = 0;

    const historyFolder = this.getHistoryFolderPath();

    if (!(await this.app.vault.adapter.exists(historyFolder))) {
      return { deletedCount: 0 };
    }

    const files = await this.app.vault.adapter.list(historyFolder);

    for (const filePath of files.files) {
      if (!filePath.endsWith(".history.md")) {
        continue;
      }

      try {
        const content = await this.app.vault.adapter.read(filePath);
        const history = this.parseHistoryFromMarkdown(content);
        if (!history) continue;

        const originalCount = history.entries.length;

        // Filter by age
        if (maxAgeMs > 0) {
          history.entries = history.entries.filter(e => {
            const entryTime = new Date(e.timestamp).getTime();
            return now - entryTime < maxAgeMs;
          });
        }

        // Limit entries per file
        if (maxEntriesPerFile > 0 && history.entries.length > maxEntriesPerFile) {
          history.entries = history.entries.slice(-maxEntriesPerFile);
        }

        deletedCount += originalCount - history.entries.length;

        // Save or delete the history file
        if (history.entries.length === 0) {
          await this.app.vault.adapter.remove(filePath);
        } else if (history.entries.length !== originalCount) {
          await this.app.vault.adapter.write(filePath, this.formatHistoryAsMarkdown(history));
        }
      } catch {
        // Skip invalid files
      }
    }

    return { deletedCount };
  }

  /**
   * Get statistics about edit history
   */
  async getStats(): Promise<EditHistoryStats> {
    let totalFiles = 0;
    let totalEntries = 0;
    let totalSizeBytes = 0;

    const historyFolder = this.getHistoryFolderPath();

    if (!(await this.app.vault.adapter.exists(historyFolder))) {
      return { totalFiles: 0, totalEntries: 0, totalSizeBytes: 0 };
    }

    const files = await this.app.vault.adapter.list(historyFolder);

    for (const filePath of files.files) {
      if (!filePath.endsWith(".history.md")) {
        continue;
      }

      try {
        totalFiles++;
        const stat = await this.app.vault.adapter.stat(filePath);
        if (stat) {
          totalSizeBytes += stat.size;
        }

        const content = await this.app.vault.adapter.read(filePath);
        const history = this.parseHistoryFromMarkdown(content);
        if (history) {
          totalEntries += history.entries.length;
        }
      } catch {
        // Skip invalid files
      }
    }

    return { totalFiles, totalEntries, totalSizeBytes };
  }

  /**
   * Handle file rename - update history and snapshot file paths
   */
  async handleFileRename(oldPath: string, newPath: string): Promise<void> {
    // Rename history file
    const oldHistoryPath = this.getHistoryFilePath(oldPath);
    const newHistoryPath = this.getHistoryFilePath(newPath);

    if (await this.app.vault.adapter.exists(oldHistoryPath)) {
      try {
        const content = await this.app.vault.adapter.read(oldHistoryPath);
        const history = this.parseHistoryFromMarkdown(content);
        if (history) {
          history.path = newPath;
          await this.ensureHistoryFolder();
          await this.app.vault.adapter.write(newHistoryPath, this.formatHistoryAsMarkdown(history));
          await this.app.vault.adapter.remove(oldHistoryPath);
        }
      } catch {
        // If parsing fails, just remove the old file
        await this.app.vault.adapter.remove(oldHistoryPath);
      }
    }

    // Rename snapshot file
    const oldSnapshotPath = this.getSnapshotFilePath(oldPath);
    const newSnapshotPath = this.getSnapshotFilePath(newPath);

    if (await this.app.vault.adapter.exists(oldSnapshotPath)) {
      try {
        const snapshotContent = await this.app.vault.adapter.read(oldSnapshotPath);
        await this.ensureHistoryFolder();
        await this.app.vault.adapter.write(newSnapshotPath, snapshotContent);
        await this.app.vault.adapter.remove(oldSnapshotPath);
      } catch {
        // If rename fails, remove old snapshot
        await this.app.vault.adapter.remove(oldSnapshotPath);
      }
    }
  }

  /**
   * Handle file delete - delete history and snapshot files
   */
  async handleFileDelete(path: string, keepHistory = false): Promise<void> {
    if (keepHistory) {
      return;
    }

    // Delete history file
    await this.clearHistory(path);

    // Delete snapshot file
    const snapshotPath = this.getSnapshotFilePath(path);
    if (await this.app.vault.adapter.exists(snapshotPath)) {
      await this.app.vault.adapter.remove(snapshotPath);
    }
  }

  /**
   * Copy content at a specific history entry to a new file
   */
  async copyTo(sourcePath: string, entryId: string, destPath: string): Promise<{ success: boolean; error?: string }> {
    const content = await this.getContentAt(sourcePath, entryId);
    if (content === null) {
      return { success: false, error: "Failed to get content at entry" };
    }

    // Check if destination file already exists
    if (await this.app.vault.adapter.exists(destPath)) {
      return { success: false, error: "File already exists" };
    }

    // Ensure parent folder exists
    const parentPath = destPath.substring(0, destPath.lastIndexOf("/"));
    if (parentPath && !(await this.app.vault.adapter.exists(parentPath))) {
      await this.app.vault.createFolder(parentPath);
    }

    // Create the new file
    await this.app.vault.create(destPath, content);
    return { success: true };
  }

  /**
   * Check if a file has edit history
   * If history exists but snapshot doesn't (inconsistent state), delete the orphaned history and return false
   */
  async hasHistory(path: string): Promise<boolean> {
    const historyPath = this.getHistoryFilePath(path);
    const historyExists = await this.app.vault.adapter.exists(historyPath);

    if (!historyExists) {
      return false;
    }

    // Check for inconsistent state: history exists but snapshot doesn't
    const snapshotExists = await this.loadSnapshot(path) !== null;

    if (!snapshotExists) {
      // Inconsistent state - delete orphaned history file
      await this.app.vault.adapter.remove(historyPath);
      return false;
    }

    return true;
  }
}

// Singleton instance
let editHistoryManager: EditHistoryManager | null = null;

export function initEditHistoryManager(
  app: App,
  workspaceFolder: string,
  settings: EditHistorySettings
): EditHistoryManager {
  editHistoryManager = new EditHistoryManager(app, workspaceFolder, settings);
  return editHistoryManager;
}

export function getEditHistoryManager(): EditHistoryManager | null {
  return editHistoryManager;
}

export function resetEditHistoryManager(): void {
  editHistoryManager = null;
}
