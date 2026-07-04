import { normalizePath, TFile, type App } from "obsidian";

export const MEMO_FOLDER = "Dashboards/Memos";

export interface DocumentMemo {
  id: string;
  createdAt: string;
  text: string;
  quote?: string;
  quoteAnchor?: string;
  quotePrefix?: string;
  quoteSuffix?: string;
  pinned?: boolean;
}

export interface MemoFile {
  source: string;
  memos: DocumentMemo[];
}

interface MemoEntry {
  id: string;
  createdAt: string;
  pinned: boolean;
  anchor: string | null;
  quotePrefix: string;
  quoteSuffix: string;
  quote: string;
  body: string;
}

const ISO_DATE_LINE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const META_LINE_RE = /^([A-Za-z][A-Za-z0-9-]*):[ \t]*(.*)$/;
const ENTRY_SEPARATOR_RE = /\n[ \t]*\n---[ \t]*\n[ \t]*\n/;

const ILLEGAL_FILENAME_CHARS_RE = /[\\/:*?"<>|\u0000-\u001f]/g;
const MAX_MEMO_BASENAME_LENGTH = 100;

function sanitizeMemoBaseName(sourcePath: string): string {
  const cleaned = sourcePath.replace(ILLEGAL_FILENAME_CHARS_RE, "_").replace(/\.+$/, "").trim() || "memo";
  return cleaned.length > MAX_MEMO_BASENAME_LENGTH ? cleaned.slice(0, MAX_MEMO_BASENAME_LENGTH).trim() : cleaned;
}

export function memoPathFor(sourcePath: string): string {
  return normalizePath(`${MEMO_FOLDER}/${sanitizeMemoBaseName(sourcePath)}.md`);
}

async function resolveMemoFilePath(app: App, sourcePath: string): Promise<string> {
  const baseName = sanitizeMemoBaseName(sourcePath);
  for (let counter = 0; ; counter++) {
    const candidateName = counter === 0 ? baseName : `${baseName} (${counter})`;
    const candidatePath = normalizePath(`${MEMO_FOLDER}/${candidateName}.md`);
    const existing = app.vault.getAbstractFileByPath(candidatePath);
    if (!(existing instanceof TFile)) return candidatePath;
    const content = await app.vault.cachedRead(existing);
    if (parseMemoFile(content).source === sourcePath) return candidatePath;
  }
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function splitFrontmatter(content: string): { source: string; rest: string } {
  const normalized = normalizeNewlines(content);
  if (!normalized.startsWith("---\n")) return { source: "", rest: normalized };
  const end = normalized.indexOf("\n---", 3);
  if (end === -1) return { source: "", rest: normalized };
  const closeLineEnd = normalized.indexOf("\n", end + 1);
  const frontmatter = normalized.slice(4, end);
  const rest = closeLineEnd === -1 ? "" : normalized.slice(closeLineEnd + 1);
  const sourceMatch = frontmatter.match(/^source:[ \t]*(.*)$/m);
  return { source: sourceMatch?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "", rest };
}

function splitQuoteAndBody(content: string, hasAnchor: boolean): { quote: string; body: string } {
  if (!hasAnchor) return { quote: "", body: content.trim() };
  const lines = content.split("\n");
  let start = 0;
  while (start < lines.length && !lines[start].trim()) start++;
  const quoteLines: string[] = [];
  let cursor = start;
  while (cursor < lines.length && /^>[ \t]?/.test(lines[cursor])) {
    quoteLines.push(lines[cursor].replace(/^>[ \t]?/, ""));
    cursor++;
  }
  if (!quoteLines.length) return { quote: "", body: content.trim() };
  return {
    quote: quoteLines.join("\n").trim(),
    body: lines.slice(cursor).join("\n").trim(),
  };
}

function parseEntryBlock(raw: string): MemoEntry | null {
  const trimmed = raw.trim();
  const lines = trimmed.split("\n");
  if (!ISO_DATE_LINE_RE.test(lines[0]?.trim() ?? "")) return null;

  const meta = new Map<string, string>();
  let cursor = 1;
  while (cursor < lines.length && lines[cursor].trim()) {
    const match = lines[cursor].match(META_LINE_RE);
    if (!match) break;
    meta.set(match[1].toLowerCase(), match[2].trim());
    cursor++;
  }
  const id = meta.get("id");
  if (!id) return null;

  const anchor = meta.get("anchor") ?? null;
  const { quote, body } = splitQuoteAndBody(lines.slice(cursor).join("\n"), anchor !== null);
  return {
    id,
    createdAt: lines[0].trim(),
    pinned: meta.get("pinned")?.toLowerCase() === "true",
    anchor,
    quotePrefix: meta.get("quote-prefix") ?? "",
    quoteSuffix: meta.get("quote-suffix") ?? "",
    quote,
    body,
  };
}

export function parseMemoFile(content: string, fallbackSource = ""): MemoFile {
  const { source, rest } = splitFrontmatter(content);
  const memos = rest
    .split(ENTRY_SEPARATOR_RE)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(parseEntryBlock)
    .filter((entry): entry is MemoEntry => entry !== null)
    .map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      text: entry.body,
      ...(entry.quote ? { quote: entry.quote } : {}),
      ...(entry.anchor ? { quoteAnchor: entry.anchor } : {}),
      ...(entry.quotePrefix ? { quotePrefix: entry.quotePrefix } : {}),
      ...(entry.quoteSuffix ? { quoteSuffix: entry.quoteSuffix } : {}),
      ...(entry.pinned ? { pinned: true } : {}),
    }));
  return { source: source || fallbackSource, memos };
}

function normalizeMetaValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildEntryBlock(memo: DocumentMemo): string {
  const lines = [memo.createdAt, `id: ${memo.id}`];
  if (memo.pinned) lines.push("pinned: true");
  if (memo.quoteAnchor) lines.push(`anchor: ${memo.quoteAnchor}`);
  if (memo.quotePrefix) lines.push(`quote-prefix: ${normalizeMetaValue(memo.quotePrefix)}`);
  if (memo.quoteSuffix) lines.push(`quote-suffix: ${normalizeMetaValue(memo.quoteSuffix)}`);

  const sections = [lines.join("\n")];
  if (memo.quote?.trim()) {
    sections.push(memo.quote.trim().split(/\r?\n/).map((line) => `> ${line}`).join("\n"));
  }
  if (memo.text.trim()) sections.push(memo.text.trim());
  return sections.join("\n\n");
}

export function serializeMemoFile(source: string, memos: DocumentMemo[]): string {
  const body = memos.map(buildEntryBlock).join("\n\n---\n\n");
  return `---\nsource: ${source}\n---\n\n${body}${body ? "\n" : ""}`;
}

async function ensureFolder(app: App, folder: string): Promise<void> {
  const parts = normalizePath(folder).split("/");
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}

export async function readMemos(app: App, sourcePath: string): Promise<DocumentMemo[]> {
  const path = await resolveMemoFilePath(app, sourcePath);
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return [];
  const parsed = parseMemoFile(await app.vault.cachedRead(file), sourcePath);
  return parsed.memos;
}

export async function writeMemos(app: App, sourcePath: string, memos: DocumentMemo[]): Promise<void> {
  await ensureFolder(app, MEMO_FOLDER);
  const path = await resolveMemoFilePath(app, sourcePath);
  const content = serializeMemoFile(sourcePath, memos);
  const file = app.vault.getAbstractFileByPath(path);
  if (file instanceof TFile) {
    await app.vault.modify(file, content);
  } else {
    await app.vault.create(path, content);
  }
}

export async function listMemoFiles(app: App): Promise<Array<{ file: TFile; source: string; memos: DocumentMemo[] }>> {
  const prefix = `${MEMO_FOLDER}/`;
  const files = app.vault
    .getMarkdownFiles()
    .filter((file) => file.path.startsWith(prefix))
    .sort((a, b) => b.stat.mtime - a.stat.mtime);

  const rows = [];
  for (const file of files) {
    const content = await app.vault.cachedRead(file);
    const name = file.basename;
    const parsed = parseMemoFile(content, name);
    rows.push({ file, source: parsed.source, memos: parsed.memos });
  }
  return rows;
}
