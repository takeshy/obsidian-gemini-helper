import { App, TFile } from "obsidian";
import * as Diff from "diff";
import type { EditHistorySettings } from "src/types";
import {
  getHistoryFromStore,
  saveHistoryToStore,
  deleteHistoryFromStore,
  getAllHistoryPaths,
  clearAllHistories,
  getSnapshotFromStore,
  saveSnapshotToStore,
  deleteSnapshotFromStore,
} from "./editHistoryStore";
import { applyDiff } from "./diffUtils";

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
}

/**
 * Manages edit history for AI-modified notes.
 * Stores unified diffs in memory to enable lightweight version tracking.
 * Data is cleared on Obsidian restart (Obsidian's own history is sufficient for persistence).
 */
export class EditHistoryManager {
  private app: App;
  private settings: EditHistorySettings;

  constructor(app: App, settings: EditHistorySettings) {
    this.app = app;
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
   * Generate a unique ID for an entry (6 characters)
   */
  private generateId(): string {
    return Math.random().toString(36).substring(2, 8);
  }

  /**
   * Load history for a note from in-memory store
   */
  private loadHistoryFile(notePath: string): EditHistoryFile {
    return getHistoryFromStore(notePath) ?? {
      version: 1,
      path: notePath,
      entries: [],
    };
  }

  /**
   * Save history for a note to in-memory store
   */
  private saveHistoryFile(notePath: string, history: EditHistoryFile): void {
    saveHistoryToStore(notePath, history);
  }

  /**
   * Load snapshot content for a note from in-memory store
   */
  private loadSnapshot(notePath: string): string | null {
    return getSnapshotFromStore(notePath);
  }

  /**
   * Save snapshot content for a note to in-memory store
   */
  private saveSnapshot(notePath: string, content: string): void {
    saveSnapshotToStore(notePath, content);
  }

  /**
   * Get snapshot content (public accessor for restore from merged timeline)
   */
  getSnapshot(path: string): string | null {
    return this.loadSnapshot(path);
  }

  /**
   * Set snapshot content (public accessor for restore from merged timeline)
   */
  setSnapshot(path: string, content: string): void {
    this.saveSnapshot(path, content);
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
  saveEdit(params: {
    path: string;
    modifiedContent: string;
    source: "workflow" | "propose_edit" | "manual" | "auto";
    workflowName?: string;
    model?: string;
  }): EditHistoryEntry | null {
    if (!this.settings.enabled) {
      return null;
    }

    // Load previous snapshot (or empty string if none)
    const snapshot = this.loadSnapshot(params.path) ?? "";

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
    const history = this.loadHistoryFile(params.path);

    // Add new entry
    history.entries.push(entry);

    // Save history and update snapshot
    this.saveHistoryFile(params.path, history);
    this.saveSnapshot(params.path, params.modifiedContent);

    return entry;
  }

  /**
   * Get history for a file
   * If history exists but snapshot doesn't (inconsistent state), delete the orphaned history
   */
  getHistory(path: string): EditHistoryEntry[] {
    // Check for inconsistent state: history exists but snapshot doesn't
    const snapshotExists = this.loadSnapshot(path) !== null;
    const historyData = getHistoryFromStore(path);

    if (historyData && !snapshotExists) {
      // Inconsistent state - delete orphaned history
      deleteHistoryFromStore(path);
      return [];
    }

    const history = this.loadHistoryFile(path);
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

    const snapshot = this.loadSnapshot(path);
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
   * Get content at a specific history entry
   * Returns the content BEFORE the change recorded in that entry
   * Uses snapshot and applies patches to go back in time
   */
  getContentAt(path: string, entryId: string): string | null {
    const snapshot = this.loadSnapshot(path);
    if (snapshot === null) {
      return null;
    }

    const history = this.loadHistoryFile(path);
    const targetIndex = history.entries.findIndex(e => e.id === entryId);
    if (targetIndex === -1) {
      return null;
    }

    // Apply patches from newest entry back to target (inclusive)
    // Each patch transforms content from newer state to older state
    // Including the target entry's patch gives us the content BEFORE that change
    let content = snapshot;
    for (let i = history.entries.length - 1; i >= targetIndex; i--) {
      content = applyDiff(content, history.entries[i].diff);
    }

    return content;
  }

  /**
   * Restore file to a specific history entry
   * After restore, the restored content becomes the new base (snapshot)
   * and history is cleared
   */
  async restoreTo(path: string, entryId: string): Promise<boolean> {
    const content = this.getContentAt(path, entryId);
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
    this.saveSnapshot(path, content);

    // Clear history - restored point is now the base
    this.clearHistory(path);

    return true;
  }

  /**
   * Revert file to the base snapshot (discard unsaved changes)
   */
  async revertToBase(path: string): Promise<boolean> {
    const snapshot = this.loadSnapshot(path);
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

    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return;
    }

    const currentContent = await this.app.vault.read(file);
    const existingSnapshot = this.loadSnapshot(path);

    if (existingSnapshot === null) {
      // No snapshot exists, create initial one
      this.saveSnapshot(path, currentContent);
      return;
    }

    // Snapshot exists, check if content differs
    if (existingSnapshot === currentContent) {
      return; // No changes
    }

    // Content differs, save diff as history entry and update snapshot
    this.saveEdit({
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

    // Get current file content
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return null; // File doesn't exist yet
    }

    const currentContent = await this.app.vault.read(file);
    const existingSnapshot = this.loadSnapshot(path);

    if (existingSnapshot === null) {
      // No snapshot exists, create initial one
      this.saveSnapshot(path, currentContent);
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

      const history = this.loadHistoryFile(path);
      history.entries.push(entry);

      this.saveHistoryFile(path, history);
    }

    // Update snapshot to current content
    this.saveSnapshot(path, currentContent);
    return currentContent;
  }

  /**
   * Delete a specific history entry
   */
  deleteEntry(path: string, entryId: string): void {
    const history = this.loadHistoryFile(path);

    const index = history.entries.findIndex(e => e.id === entryId);
    if (index !== -1) {
      history.entries.splice(index, 1);
      this.saveHistoryFile(path, history);
    }
  }

  /**
   * Clear all history for a file (keeps snapshot for future tracking)
   */
  clearHistory(path: string): void {
    deleteHistoryFromStore(path);
  }

  /**
   * Clear snapshot for a file
   */
  clearSnapshot(path: string): void {
    deleteSnapshotFromStore(path);
  }

  /**
   * Clear all edit history
   */
  clearAllHistory(): number {
    const paths = getAllHistoryPaths();
    const count = paths.length;
    clearAllHistories();
    return count;
  }

  /**
   * Get statistics about edit history
   */
  getStats(): EditHistoryStats {
    let totalFiles = 0;
    let totalEntries = 0;

    const paths = getAllHistoryPaths();

    for (const path of paths) {
      const history = getHistoryFromStore(path);
      if (!history) continue;

      totalFiles++;
      totalEntries += history.entries.length;
    }

    return { totalFiles, totalEntries };
  }

  /**
   * Handle file rename - update history and snapshot paths in store
   */
  handleFileRename(oldPath: string, newPath: string): void {
    // Rename history
    const history = getHistoryFromStore(oldPath);
    if (history) {
      history.path = newPath;
      saveHistoryToStore(newPath, history);
      deleteHistoryFromStore(oldPath);
    }

    // Rename snapshot
    const snapshot = getSnapshotFromStore(oldPath);
    if (snapshot !== null) {
      saveSnapshotToStore(newPath, snapshot);
      deleteSnapshotFromStore(oldPath);
    }
  }

  /**
   * Handle file delete - delete history and snapshot
   */
  handleFileDelete(path: string, keepHistory = false): void {
    if (keepHistory) {
      return;
    }

    // Delete history
    this.clearHistory(path);

    // Delete snapshot
    deleteSnapshotFromStore(path);
  }

  /**
   * Copy content at a specific history entry to a new file
   */
  async copyTo(sourcePath: string, entryId: string, destPath: string): Promise<{ success: boolean; error?: string }> {
    const content = this.getContentAt(sourcePath, entryId);
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
  hasHistory(path: string): boolean {
    const historyData = getHistoryFromStore(path);

    if (!historyData) {
      return false;
    }

    // Check for inconsistent state: history exists but snapshot doesn't
    const snapshotExists = this.loadSnapshot(path) !== null;

    if (!snapshotExists) {
      // Inconsistent state - delete orphaned history
      deleteHistoryFromStore(path);
      return false;
    }

    return true;
  }
}

// Singleton instance
let editHistoryManager: EditHistoryManager | null = null;

export function initEditHistoryManager(
  app: App,
  settings: EditHistorySettings
): EditHistoryManager {
  editHistoryManager = new EditHistoryManager(app, settings);
  return editHistoryManager;
}

export function getEditHistoryManager(): EditHistoryManager | null {
  return editHistoryManager;
}

export function resetEditHistoryManager(): void {
  editHistoryManager = null;
}
