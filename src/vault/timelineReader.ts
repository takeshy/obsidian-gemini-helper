import type { Vault } from "obsidian";

const ROOT = "Dashboards/Timeline";
const SEPARATOR_RE = /^\s*---\s*\r?\n(?=(?:<!--\s*timeline-post:|\d{4}-\d{2}-\d{2}T))/m;

export function sanitizeTimelineName(value: string): string {
  return value.trim().replace(/\.md$/i, "").replace(/[\\/:*?"<>|#[\]\n\r\t]+/g, "-")
    .replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "Timeline";
}

function dayKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function blocks(content: string): string[] {
  return content.split(SEPARATOR_RE).map((block) => block.trim()).filter(Boolean);
}

function entryCreatedAt(block: string): Date | null {
  const marker = block.match(/<!--\s*timeline-post:\s*([^>]+?)\s*-->/)?.[1]?.trim();
  const firstLine = block.split(/\r?\n/, 1)[0]?.trim();
  const value = marker || firstLine;
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Read Dashboard Hub Timeline activity without taking ownership of its UI. */
export async function readTimelineEntriesForDay(vault: Vault, timelineName: string, day: string): Promise<string[]> {
  const prefix = `${ROOT}/${sanitizeTimelineName(timelineName)}/`;
  const files = vault.getMarkdownFiles().filter((file) =>
    file.path.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}\.md$/.test(file.path.slice(prefix.length)),
  );
  const entries: Array<{ createdAt: number; block: string }> = [];
  for (const file of files) {
    for (const block of blocks(await vault.read(file))) {
      const createdAt = entryCreatedAt(block);
      if (createdAt && dayKey(createdAt) === day) entries.push({ createdAt: createdAt.getTime(), block });
    }
  }
  return entries.sort((a, b) => a.createdAt - b.createdAt).map((entry) => entry.block);
}
