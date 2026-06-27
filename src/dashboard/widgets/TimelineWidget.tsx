import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Image, Loader2, PenLine, Pin, Plus, Search, Send, Trash2, X } from "lucide-react";
import { Notice, TFile } from "obsidian";
import { t } from "src/i18n";
import type { WidgetContext } from "../types";
import { ensureVaultFolder } from "../dashboardFile";
import ObsidianMarkdown from "./ObsidianMarkdown";

interface TimelineConfig {
  name?: string;
  latestCount?: number;
}

interface TimelinePost {
  id: string;
  createdAt: string;
  pinned: boolean;
  content: string;
  index: number;
  sourcePath: string;
  sourceFile: TFile;
}

interface ParsedPostBlock {
  raw: string;
  post: TimelinePost | null;
}

interface PendingImage {
  file: File;
  previewUrl: string;
}

interface TimelineFilters {
  word: string;
  tags: string;
  from: string;
  to: string;
  pinnedOnly: boolean;
}

const POST_MARKER_RE = /<!--\s*timeline-post:\s*([^>]+?)\s*-->/;
const POST_SEPARATOR_RE = /^\s*---\s*\r?\n(?=(?:<!--\s*timeline-post:|\d{4}-\d{2}-\d{2}T))/m;
const ISO_DATE_LINE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const POST_ID_RE = /^id:\s*([A-Za-z0-9_-]+)\s*$/i;
const PINNED_RE = /^pinned:\s*(true|false)\s*$/i;
const COLLAPSE_LINE_LIMIT = 8;
const COLLAPSE_CHAR_LIMIT = 520;
const DEFAULT_LATEST_COUNT = 20;
const TIMELINE_ROOT = "Dashboards/Timeline";
const IMAGE_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

function sanitizeName(value: string): string {
  return value
    .trim()
    .replace(/\.md$/i, "")
    .replace(/[\\/:*?"<>|#[\]\n\r\t]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "Timeline";
}

function timelineDir(name: string): string {
  return `${TIMELINE_ROOT}/${sanitizeName(name)}`;
}

function dateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function postIdFromDate(date: Date): string {
  const pad = (n: number, size = 2) => String(n).padStart(size, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    "-",
    pad(date.getMilliseconds(), 3),
  ].join("");
}

function dayFilePath(name: string, date: Date): string {
  return `${timelineDir(name)}/${dateKey(date)}.md`;
}

function extractPostTags(content: string): string[] {
  const tags = new Set<string>();
  const re = /(^|[\s([{])#([^\s#.,;:!?()[\]{}'"`<>]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const tag = match[2].replace(/\/+$/g, "").trim();
    if (tag) tags.add(tag);
  }
  return Array.from(tags);
}

function stripPostTags(content: string): string {
  return content
    .replace(/(^|[\s([{])#([^\s#.,;:!?()[\]{}'"`<>]+)/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseTagFilter(value: string): string[] {
  return value
    .split(/\s+/)
    .map((tag) => tag.trim().replace(/^#+/, "").toLowerCase())
    .filter(Boolean);
}

function parsePostBlock(raw: string, index: number, sourcePath: string, sourceFile: TFile): TimelinePost | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const marker = trimmed.match(POST_MARKER_RE);
  const withoutMarker = trimmed.replace(POST_MARKER_RE, "").trim();
  const lines = withoutMarker.split(/\r?\n/);
  const firstLine = lines[0]?.trim() ?? "";
  const dateFromLine = ISO_DATE_LINE_RE.test(firstLine) ? firstLine : "";
  const createdAt = marker?.[1]?.trim() || dateFromLine || new Date(0).toISOString();
  const bodyStart = dateFromLine ? 1 : 0;
  const maybeId = lines[bodyStart]?.trim() ?? "";
  const idMatch = maybeId.match(POST_ID_RE);
  const maybePinned = lines[idMatch ? bodyStart + 1 : bodyStart]?.trim() ?? "";
  const pinnedMatch = maybePinned.match(PINNED_RE);
  const contentStart = (idMatch ? bodyStart + 1 : bodyStart) + (pinnedMatch ? 1 : 0);
  const body = lines.slice(contentStart).join("\n").trim();
  if (!body) return null;
  return {
    id: idMatch?.[1] || `${createdAt}-${index}`,
    createdAt,
    pinned: pinnedMatch?.[1]?.toLowerCase() === "true",
    content: body,
    index,
    sourcePath,
    sourceFile,
  };
}

function parsePostBlocks(content: string, sourcePath: string, sourceFile: TFile): ParsedPostBlock[] {
  return content
    .split(POST_SEPARATOR_RE)
    .map((raw, index) => ({ raw: raw.trim(), post: parsePostBlock(raw, index, sourcePath, sourceFile) }))
    .filter((block) => block.raw);
}

function splitPosts(content: string, sourcePath: string, sourceFile: TFile): TimelinePost[] {
  return parsePostBlocks(content, sourcePath, sourceFile)
    .map((block) => block.post)
    .filter((post): post is TimelinePost => post !== null);
}

function appendPost(content: string, postBlock: string): string {
  const current = content.trim();
  if (!current) return `${postBlock}\n`;
  return `${current}\n\n---\n\n${postBlock}\n`;
}

function serializeBlocks(blocks: ParsedPostBlock[]): string {
  return blocks.map((block) => block.raw.trim()).filter(Boolean).join("\n\n---\n\n") + "\n";
}

function replacePostContent(content: string, file: TFile, postId: string, nextBody: string): string | null {
  let changed = false;
  const blocks = parsePostBlocks(content, file.path, file).map((block) => {
    if (block.post?.id !== postId) return block;
    changed = true;
    return {
      raw: `${block.post.createdAt}\nid: ${block.post.id}${block.post.pinned ? "\npinned: true" : ""}\n\n${nextBody.trim()}`,
      post: block.post,
    };
  });
  return changed ? serializeBlocks(blocks) : null;
}

function setPostPinnedContent(content: string, file: TFile, postId: string, pinned: boolean): string | null {
  let changed = false;
  const blocks = parsePostBlocks(content, file.path, file).map((block) => {
    if (block.post?.id !== postId) return block;
    changed = true;
    return {
      raw: `${block.post.createdAt}\nid: ${block.post.id}${pinned ? "\npinned: true" : ""}\n\n${block.post.content}`,
      post: { ...block.post, pinned },
    };
  });
  return changed ? serializeBlocks(blocks) : null;
}

function deletePostContent(content: string, file: TFile, postId: string): string | null {
  const blocks = parsePostBlocks(content, file.path, file);
  const next = blocks.filter((block) => block.post?.id !== postId);
  return next.length === blocks.length ? null : serializeBlocks(next);
}

function uniquePostId(date: Date, currentContent: string, file: TFile): string {
  const base = postIdFromDate(date);
  const ids = new Set(splitPosts(currentContent, file.path, file).map((post) => post.id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function textForCollapse(content: string): string {
  return content.replace(/!\[\[[^\]]+\]\]/g, "").replace(/!\[[^\]]*\]\([^)]+\)/g, "").trim();
}

function shouldCollapsePost(content: string): boolean {
  const embedCount = (content.match(/!\[\[[^\]]+\]\]/g) ?? []).length + (content.match(/!\[[^\]]*\]\([^)]+\)/g) ?? []).length;
  if (embedCount > 1) return true;
  if (embedCount > 0 && content.split(/\r?\n/).filter((line) => line.trim()).length > 3) return true;
  const text = textForCollapse(content);
  if (!text) return embedCount > 0 && content.split(/\r?\n/).length > 3;
  return text.length > COLLAPSE_CHAR_LIMIT || text.split(/\r?\n/).length > COLLAPSE_LINE_LIMIT;
}

function collapsedContent(content: string): string {
  const lines = content.split(/\r?\n/);
  const byLines = lines.length > COLLAPSE_LINE_LIMIT ? lines.slice(0, COLLAPSE_LINE_LIMIT).join("\n").trim() : content.trim();
  const clipped = byLines.length <= COLLAPSE_CHAR_LIMIT ? byLines : byLines.slice(0, COLLAPSE_CHAR_LIMIT).trimEnd();
  return `${clipped}\n\n...`;
}

function imageExt(file: File): string {
  return IMAGE_EXT_BY_MIME[file.type] || file.name.split(".").pop()?.toLowerCase() || "png";
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(file.name);
}

async function loadTimelineFiles(ctx: WidgetContext, name: string, limit: number, filters: TimelineFilters): Promise<{ posts: TimelinePost[]; hasMore: boolean }> {
  const prefix = `${timelineDir(name)}/`;
  const word = filters.word.trim().toLowerCase();
  const tagFilter = parseTagFilter(filters.tags);
  const from = filters.from;
  const to = filters.to || filters.from;
  const dayFiles = ctx.app.vault.getMarkdownFiles()
    .filter((file) => file.path.startsWith(prefix) && !file.path.includes("/attachments/") && /^\d{4}-\d{2}-\d{2}\.md$/.test(file.path.slice(prefix.length)))
    .filter((file) => {
      const day = file.path.slice(prefix.length, prefix.length + 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    })
    .sort((a, b) => b.path.localeCompare(a.path));

  const posts: TimelinePost[] = [];
  for (const file of dayFiles) {
    try {
      const dayPosts = splitPosts(await ctx.app.vault.cachedRead(file), file.path, file).filter((post) => {
        const postDay = dateKey(new Date(post.createdAt));
        if (from && postDay < from) return false;
        if (to && postDay > to) return false;
        if (word && !post.content.toLowerCase().includes(word)) return false;
        if (tagFilter.length > 0) {
          const postTags = new Set(extractPostTags(post.content).map((tag) => tag.toLowerCase()));
          if (tagFilter.some((tag) => !postTags.has(tag))) return false;
        }
        if (filters.pinnedOnly && !post.pinned) return false;
        return true;
      });
      posts.push(...dayPosts);
      posts.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.index - a.index);
      if (posts.length >= limit + 1) break;
    } catch {
      // Ignore one unreadable day file; the rest of the timeline can still render.
    }
  }
  const selected = posts.slice(0, limit);
  selected.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.index - b.index);
  return { posts: selected, hasMore: posts.length > limit };
}

export default function TimelineWidget({
  config,
  ctx,
}: {
  config: unknown;
  ctx?: WidgetContext;
}) {
  const cfg = (config ?? {}) as TimelineConfig;
  const name = sanitizeName(typeof cfg.name === "string" && cfg.name.trim() ? cfg.name : "Timeline");
  const latestCount = typeof cfg.latestCount === "number" && Number.isFinite(cfg.latestCount) && cfg.latestCount > 0
    ? Math.floor(cfg.latestCount)
    : DEFAULT_LATEST_COUNT;

  const [posts, setPosts] = useState<TimelinePost[]>([]);
  const [loadedCount, setLoadedCount] = useState(latestCount);
  const [hasOlderPosts, setHasOlderPosts] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingPostId, setSavingPostId] = useState<string | null>(null);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [editImages, setEditImages] = useState<PendingImage[]>([]);
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(() => new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [wordInput, setWordInput] = useState("");
  const [filters, setFilters] = useState<TimelineFilters>({ word: "", tags: "", from: "", to: "", pinnedOnly: false });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const imagesRef = useRef<PendingImage[]>([]);
  const editImagesRef = useRef<PendingImage[]>([]);

  const scrollToLatest = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const refresh = useCallback(async () => {
    if (!ctx || !name) return;
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadTimelineFiles(ctx, name, loadedCount, filters);
      setPosts(loaded.posts);
      setHasOlderPosts(loaded.hasMore);
    } catch {
      setError(t("dashboard.fileNotFound"));
    } finally {
      setLoading(false);
    }
  }, [ctx, name, loadedCount, filters]);

  useEffect(() => {
    setLoadedCount(latestCount);
  }, [name, latestCount, filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((prev) => {
        const word = wordInput.trim();
        return prev.word === word ? prev : { ...prev, word };
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [wordInput]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!ctx) return;
    const refs = [
      ctx.app.vault.on("create", (file) => {
        if (file.path.startsWith(`${timelineDir(name)}/`)) void refresh();
      }),
      ctx.app.vault.on("modify", (file) => {
        if (file.path.startsWith(`${timelineDir(name)}/`)) void refresh();
      }),
      ctx.app.vault.on("delete", (file) => {
        if (file.path.startsWith(`${timelineDir(name)}/`)) void refresh();
      }),
      ctx.app.vault.on("rename", (file, oldPath) => {
        const prefix = `${timelineDir(name)}/`;
        if (file.path.startsWith(prefix) || oldPath.startsWith(prefix)) void refresh();
      }),
    ];
    return () => refs.forEach((ref) => ctx.app.vault.offref(ref));
  }, [ctx, name, refresh]);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    editImagesRef.current = editImages;
  }, [editImages]);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      editImagesRef.current.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
  }, []);

  useEffect(() => {
    if (editingPostId) return;
    requestAnimationFrame(scrollToLatest);
    const timers = [80, 240, 600].map((delay) => window.setTimeout(scrollToLatest, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [name, posts.length, loading, editingPostId, scrollToLatest]);

  const loadOlder = useCallback(async () => {
    if (!ctx || !name || loadingOlder) return;
    const el = listRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    setLoadingOlder(true);
    setError(null);
    try {
      const nextCount = loadedCount + latestCount;
      const loaded = await loadTimelineFiles(ctx, name, nextCount, filters);
      setLoadedCount(nextCount);
      setPosts(loaded.posts);
      setHasOlderPosts(loaded.hasMore);
      requestAnimationFrame(() => {
        const nextEl = listRef.current;
        if (!nextEl) return;
        nextEl.scrollTop = nextEl.scrollHeight - prevHeight + nextEl.scrollTop;
      });
    } catch {
      setError(t("dashboard.fileNotFound"));
    } finally {
      setLoadingOlder(false);
    }
  }, [ctx, name, loadingOlder, loadedCount, latestCount, filters]);

  const addImages = (files: FileList | null, editing = false) => {
    if (!files) return;
    const selected = Array.from(files).filter(isImageFile);
    const setter = editing ? setEditImages : setImages;
    setter((prev) => {
      const slots = Math.max(0, 8 - prev.length);
      const next = selected.slice(0, slots).map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
      return [...prev, ...next];
    });
    const input = editing ? editInputRef.current : inputRef.current;
    if (input) input.value = "";
  };

  const removeImage = (index: number, editing = false) => {
    const setter = editing ? setEditImages : setImages;
    setter((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  };

  const clearImages = (editing = false) => {
    const setter = editing ? setEditImages : setImages;
    setter((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      return [];
    });
  };

  const searchTag = (tag: string) => {
    const normalized = tag.trim().replace(/^#+/, "");
    if (!normalized) return;
    setShowFilters(true);
    setFilters((prev) => ({ ...prev, tags: `#${normalized}` }));
  };

  const closeComposer = () => {
    setComposerOpen(false);
    setDraft("");
    clearImages(false);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const savePostImage = useCallback(
    async (date: Date, postId: string, file: File, index: number): Promise<string> => {
      if (!ctx) throw new Error("Missing widget context");
      const folder = `${timelineDir(name)}/attachments/${dateKey(date)}`;
      await ensureVaultFolder(ctx.app.vault, folder);
      const base = `${folder}/${postId}_${String(index + 1).padStart(2, "0")}`;
      let candidate = `${base}.${imageExt(file)}`;
      let suffix = 2;
      while (ctx.app.vault.getAbstractFileByPath(candidate)) {
        candidate = `${base}-${suffix++}.${imageExt(file)}`;
      }
      await ctx.app.vault.createBinary(candidate, await file.arrayBuffer());
      return candidate;
    },
    [ctx, name],
  );

  const submitPost = async () => {
    if (!ctx || posting) return;
    const body = draft.trim();
    if (!body && images.length === 0) return;
    setPosting(true);
    setError(null);
    try {
      const now = new Date();
      const path = dayFilePath(name, now);
      await ensureVaultFolder(ctx.app.vault, timelineDir(name));
      const existing = ctx.app.vault.getAbstractFileByPath(path);
      const file = existing instanceof TFile ? existing : await ctx.app.vault.create(path, "");
      const current = await ctx.app.vault.read(file);
      const id = uniquePostId(now, current, file);
      const imageLines = await Promise.all(images.map(async (img, index) => `![[${await savePostImage(now, id, img.file, index)}]]`));
      const nextBody = [body, ...imageLines].filter(Boolean).join("\n\n");
      const block = `${now.toISOString()}\nid: ${id}\n\n${nextBody}`;
      await ctx.app.vault.modify(file, appendPost(current, block));
      setDraft("");
      closeComposer();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dashboard.timelinePostError"));
      new Notice(t("dashboard.timelinePostError"));
    } finally {
      setPosting(false);
    }
  };

  const startEditing = (post: TimelinePost) => {
    clearImages(true);
    setEditingPostId(post.id);
    setEditDraft(post.content);
    setExpandedPosts((prev) => new Set(prev).add(post.id));
  };

  const cancelEditing = () => {
    setEditingPostId(null);
    setEditDraft("");
    clearImages(true);
    if (editInputRef.current) editInputRef.current.value = "";
  };

  const saveEdit = async (post: TimelinePost) => {
    if (!ctx || savingPostId) return;
    const body = editDraft.trim();
    if (!body && editImages.length === 0) return;
    setSavingPostId(post.id);
    setError(null);
    try {
      const created = new Date(post.createdAt);
      const imageLines = await Promise.all(editImages.map(async (img, index) => `![[${await savePostImage(created, post.id, img.file, index)}]]`));
      const nextBody = [body, ...imageLines].filter(Boolean).join("\n\n");
      const current = await ctx.app.vault.read(post.sourceFile);
      const next = replacePostContent(current, post.sourceFile, post.id, nextBody);
      if (next == null) throw new Error(t("dashboard.fileNotFound"));
      await ctx.app.vault.modify(post.sourceFile, next);
      cancelEditing();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dashboard.timelinePostError"));
    } finally {
      setSavingPostId(null);
    }
  };

  const togglePin = async (post: TimelinePost) => {
    if (!ctx) return;
    const current = await ctx.app.vault.read(post.sourceFile);
    const next = setPostPinnedContent(current, post.sourceFile, post.id, !post.pinned);
    if (next == null) return;
    await ctx.app.vault.modify(post.sourceFile, next);
    await refresh();
  };

  const deletePost = async (post: TimelinePost) => {
    if (!ctx || !confirm(t("dashboard.timelineDeleteConfirm"))) return;
    const current = await ctx.app.vault.read(post.sourceFile);
    const next = deletePostContent(current, post.sourceFile, post.id);
    if (next == null) return;
    await ctx.app.vault.modify(post.sourceFile, next);
    await refresh();
  };

  if (!ctx) return null;

  const renderImages = (items: PendingImage[], editing = false) => items.length > 0 && (
    <div className="llm-hub-db-timeline-images">
      {items.map((img, index) => (
        <div className="llm-hub-db-timeline-image" key={img.previewUrl}>
          <img src={img.previewUrl} alt="" />
          <button type="button" onClick={() => removeImage(index, editing)} title={t("dashboard.remove")}>
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="llm-hub-db-timeline">
      <div className="llm-hub-db-timeline-header">
        <div className="llm-hub-db-timeline-title">{name}</div>
        {error && <div className="llm-hub-db-timeline-error">{error}</div>}
        <button type="button" className="llm-hub-db-timeline-iconbtn" onClick={() => setShowFilters((v) => !v)} title={t("dashboard.timelineFilterWord")}>
          <Search size={14} />
        </button>
      </div>

      {showFilters && (
        <div className="llm-hub-db-timeline-filters">
          <input value={wordInput} onChange={(e) => setWordInput(e.target.value)} placeholder={t("dashboard.timelineFilterWord")} />
          <input value={filters.tags} onChange={(e) => setFilters((prev) => ({ ...prev, tags: e.target.value }))} placeholder={t("dashboard.timelineFilterTags")} />
          <input type="date" value={filters.from} onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))} title={t("dashboard.timelineFilterFrom")} />
          <input type="date" value={filters.to} onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))} title={t("dashboard.timelineFilterTo")} />
          <label>
            <input type="checkbox" checked={filters.pinnedOnly} onChange={(e) => setFilters((prev) => ({ ...prev, pinnedOnly: e.target.checked }))} />
            {t("dashboard.timelinePinnedOnly")}
          </label>
          <button
            type="button"
            className="llm-hub-db-timeline-iconbtn"
            onClick={() => {
              setWordInput("");
              setFilters({ word: "", tags: "", from: "", to: "", pinnedOnly: false });
            }}
            title={t("dashboard.timelineFilterClear")}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div ref={listRef} className="llm-hub-db-timeline-list">
        {loading && posts.length === 0 ? (
          <div className="llm-hub-db-widget-empty">{t("dashboard.loading")}</div>
        ) : posts.length === 0 ? (
          <div className="llm-hub-db-widget-empty">{t("dashboard.timelineEmpty")}</div>
        ) : (
          posts.map((post) => {
            const editing = editingPostId === post.id;
            const collapsed = shouldCollapsePost(post.content) && !expandedPosts.has(post.id);
            const tags = extractPostTags(post.content);
            const body = stripPostTags(collapsed ? collapsedContent(post.content) : post.content);
            return (
              <article key={`${post.sourcePath}:${post.id}`} className={`llm-hub-db-timeline-post-card${post.pinned ? " is-pinned" : ""}`}>
                <div className="llm-hub-db-timeline-post-meta">
                  <span>{new Date(post.createdAt).toLocaleString()}</span>
                  {post.pinned && <Pin size={12} />}
                  <button type="button" className="llm-hub-db-timeline-iconbtn" onClick={() => void togglePin(post)} title={post.pinned ? t("dashboard.timelineUnpin") : t("dashboard.timelinePin")}>
                    <Pin size={13} />
                  </button>
                  <button type="button" className="llm-hub-db-timeline-iconbtn" onClick={() => startEditing(post)} title={t("dashboard.editWidget")}>
                    <PenLine size={13} />
                  </button>
                  <button type="button" className="llm-hub-db-timeline-iconbtn is-danger" onClick={() => void deletePost(post)} title={t("dashboard.deleteWidget")}>
                    <Trash2 size={13} />
                  </button>
                </div>
                {editing ? (
                  <div className="llm-hub-db-timeline-edit">
                    <textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} />
                    {renderImages(editImages, true)}
                    <div className="llm-hub-db-timeline-composer-actions">
                      <input ref={editInputRef} type="file" accept="image/*" multiple onChange={(e) => addImages(e.target.files, true)} />
                      <button type="button" className="llm-hub-db-timeline-iconbtn" onClick={() => editInputRef.current?.click()} title={t("dashboard.timelineAttachImage")}>
                        <Image size={14} />
                      </button>
                      <button type="button" className="llm-hub-db-timeline-iconbtn" onClick={cancelEditing} title={t("dashboard.cancel")}>
                        <X size={14} />
                      </button>
                      <button type="button" className="llm-hub-db-timeline-post" disabled={savingPostId === post.id || (!editDraft.trim() && editImages.length === 0)} onClick={() => void saveEdit(post)}>
                        {savingPostId === post.id ? <Loader2 size={13} className="is-spinning" /> : <Send size={13} />}
                        {t("dashboard.save")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <ObsidianMarkdown app={ctx.app} markdown={body} sourcePath={post.sourcePath} className="llm-hub-db-timeline-body" />
                    {tags.length > 0 && (
                      <div className="llm-hub-db-timeline-tags">
                        {tags.map((tag) => (
                          <button type="button" key={tag} onClick={() => searchTag(tag)}>
                            #{tag}
                          </button>
                        ))}
                      </div>
                    )}
                    {shouldCollapsePost(post.content) && (
                      <button
                        type="button"
                        className="llm-hub-db-timeline-more"
                        onClick={() => setExpandedPosts((prev) => {
                          const next = new Set(prev);
                          if (next.has(post.id)) next.delete(post.id);
                          else next.add(post.id);
                          return next;
                        })}
                      >
                        {expandedPosts.has(post.id) ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                        {expandedPosts.has(post.id) ? t("dashboard.timelineShowLess") : t("dashboard.timelineShowMore")}
                      </button>
                    )}
                  </>
                )}
              </article>
            );
          })
        )}
        {hasOlderPosts && (
          <button type="button" className="llm-hub-db-timeline-load" disabled={loadingOlder} onClick={() => void loadOlder()}>
            {loadingOlder ? <Loader2 size={13} className="is-spinning" /> : <ChevronUp size={13} />}
            {t("dashboard.timelineLoadOlder")}
          </button>
        )}
      </div>

      {composerOpen && (
        <div className="llm-hub-db-timeline-composer">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("dashboard.timelinePlaceholder")}
          />
          {renderImages(images)}
          <div className="llm-hub-db-timeline-composer-actions">
            <input ref={inputRef} type="file" accept="image/*" multiple onChange={(e) => addImages(e.target.files)} />
            <button type="button" className="llm-hub-db-timeline-iconbtn" onClick={() => inputRef.current?.click()} title={t("dashboard.timelineAttachImage")}>
              <Image size={14} />
            </button>
            <button type="button" className="llm-hub-db-timeline-iconbtn" onClick={closeComposer} title={t("dashboard.cancel")}>
              <X size={14} />
            </button>
            <button type="button" className="llm-hub-db-timeline-post" disabled={posting || (!draft.trim() && images.length === 0)} onClick={() => void submitPost()}>
              {posting ? <Loader2 size={13} className="is-spinning" /> : <Send size={13} />}
              {t("dashboard.timelinePost")}
            </button>
          </div>
        </div>
      )}

      <div className="llm-hub-db-timeline-footer">
        <button type="button" className="llm-hub-db-timeline-new" onClick={() => setComposerOpen((v) => !v)}>
          <Plus size={13} />
          {t("dashboard.timelineNew")}
        </button>
      </div>
    </div>
  );
}
