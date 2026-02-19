// In-memory store for edit history data.
// Uses Map instead of sessionStorage to avoid the 5MB size limit.
// Data is cleared on Obsidian restart (same lifecycle as sessionStorage).

import type { EditHistoryFile } from "./editHistory";

const historyMap = new Map<string, EditHistoryFile>();
const snapshotMap = new Map<string, string>();

// ── History ──────────────────────────────────────────

export function getHistoryFromStore(path: string): EditHistoryFile | null {
  return historyMap.get(path) ?? null;
}

export function saveHistoryToStore(path: string, history: EditHistoryFile): void {
  historyMap.set(path, history);
}

export function deleteHistoryFromStore(path: string): void {
  historyMap.delete(path);
}

export function getAllHistoryPaths(): string[] {
  return [...historyMap.keys()];
}

export function clearAllHistories(): void {
  historyMap.clear();
  snapshotMap.clear();
}

// ── Snapshot ─────────────────────────────────────────

export function getSnapshotFromStore(path: string): string | null {
  return snapshotMap.get(path) ?? null;
}

export function saveSnapshotToStore(path: string, content: string): void {
  snapshotMap.set(path, content);
}

export function deleteSnapshotFromStore(path: string): void {
  snapshotMap.delete(path);
}
