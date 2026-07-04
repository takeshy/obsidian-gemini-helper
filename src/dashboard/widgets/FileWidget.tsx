import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, ChevronsLeft, ChevronsRight, Copy, ExternalLink, FileText, Loader2, NotebookPen, Save, SquarePen, Trash2, X } from "lucide-react";
import { Component, MarkdownRenderer, TFile } from "obsidian";
import { t } from "src/i18n";
import type { WidgetContext } from "../types";
import { memoPathFor, readMemos, writeMemos, type DocumentMemo } from "../memo";
import PdfFileViewer, { type PdfFileViewerHandle } from "./PdfFileViewer";

export interface FileConfig {
  path?: string;
  showHeader?: boolean;
  memoPanelOpen?: boolean;
  memoPanelCollapsed?: boolean;
}

interface TextIndex {
  text: string;
  nodes: Text[];
  nodeIndexes: number[];
  offsets: number[];
}

interface QuoteMatch {
  range: Range;
  start: number;
  end: number;
}

interface QuoteAnchorData {
  anchor?: string;
  quotePrefix?: string;
  quoteSuffix?: string;
}

function anchorDataFromMemo(memo: DocumentMemo): QuoteAnchorData | undefined {
  if (!memo.quoteAnchor && !memo.quotePrefix && !memo.quoteSuffix) return undefined;
  return {
    ...(memo.quoteAnchor ? { anchor: memo.quoteAnchor } : {}),
    ...(memo.quotePrefix ? { quotePrefix: memo.quotePrefix } : {}),
    ...(memo.quoteSuffix ? { quoteSuffix: memo.quoteSuffix } : {}),
  };
}

function normalizeAnchorText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildTextIndex(root: Node, mode: "collapse-space" | "ignore-space" = "collapse-space"): TextIndex {
  const doc = root.ownerDocument ?? document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  const nodeIndexes: number[] = [];
  const offsets: number[] = [];
  let text = "";
  let pendingSpace = false;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (parent && ["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"].includes(parent.tagName)) continue;
    const textNode = node as Text;
    const nodeIndex = nodes.push(textNode) - 1;
    for (let i = 0; i < textNode.data.length; i++) {
      if (/\s/.test(textNode.data[i])) {
        if (mode === "ignore-space") continue;
        pendingSpace = text.length > 0;
        continue;
      }
      if (pendingSpace) {
        text += " ";
        nodeIndexes.push(nodeIndex);
        offsets.push(i);
        pendingSpace = false;
      }
      text += textNode.data[i];
      nodeIndexes.push(nodeIndex);
      offsets.push(i);
    }
  }

  return { text, nodes, nodeIndexes, offsets };
}

function rangeFromIndex(index: TextIndex, start: number, end: number): Range | null {
  if (start < 0 || end <= start || end > index.text.length) return null;
  const startNode = index.nodes[index.nodeIndexes[start]];
  const endNode = index.nodes[index.nodeIndexes[end - 1]];
  if (!startNode || !endNode) return null;
  const range = startNode.ownerDocument.createRange();
  range.setStart(startNode, index.offsets[start]);
  range.setEnd(endNode, index.offsets[end - 1] + 1);
  return range;
}

function startsFor(text: string, needle: string): number[] {
  const starts: number[] = [];
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
    starts.push(at);
  }
  return starts;
}

function narrowStarts(indexText: string, starts: number[], needleLength: number, quotePrefix = "", quoteSuffix = ""): number[] {
  let candidates = starts;
  if (candidates.length > 1 && quotePrefix) {
    const prefix = normalizeAnchorText(quotePrefix);
    const narrowed = candidates.filter((at) => indexText.slice(Math.max(0, at - prefix.length - 1), at).includes(prefix));
    if (narrowed.length) candidates = narrowed;
  }
  if (candidates.length > 1 && quoteSuffix) {
    const suffix = normalizeAnchorText(quoteSuffix);
    const narrowed = candidates.filter((at) => indexText.slice(at + needleLength, at + needleLength + suffix.length + 1).includes(suffix));
    if (narrowed.length) candidates = narrowed;
  }
  return candidates;
}

function selectionContextFor(index: TextIndex, selectedText: string, range: Range): { prefix: string; suffix: string } {
  const needle = normalizeAnchorText(selectedText);
  if (!needle) return { prefix: "", suffix: "" };
  let best: number | null = null;
  for (const at of startsFor(index.text, needle)) {
    const candidate = rangeFromIndex(index, at, at + needle.length);
    if (!candidate) continue;
    if (
      candidate.compareBoundaryPoints(Range.START_TO_START, range) <= 0 &&
      candidate.compareBoundaryPoints(Range.END_TO_END, range) >= 0
    ) {
      best = at;
      break;
    }
    if (best === null) best = at;
  }
  if (best === null) return { prefix: "", suffix: "" };
  return {
    prefix: index.text.slice(Math.max(0, best - 30), best).trim(),
    suffix: index.text.slice(best + needle.length, best + needle.length + 30).trim(),
  };
}

function findQuoteMatch(root: Node, quote: string, quotePrefix = "", quoteSuffix = ""): QuoteMatch | null {
  const index = buildTextIndex(root);
  const needle = normalizeAnchorText(quote);
  if (!needle) return null;
  const candidates = narrowStarts(index.text, startsFor(index.text, needle), needle.length, quotePrefix, quoteSuffix);
  if (candidates.length) {
    const start = candidates[0];
    const range = rangeFromIndex(index, start, start + needle.length);
    if (range) return { range, start, end: start + needle.length };
  }

  const compactIndex = buildTextIndex(root, "ignore-space");
  const compactNeedle = quote.replace(/\s+/g, "");
  if (!compactNeedle) return null;
  const compactCandidates = narrowStarts(
    compactIndex.text,
    startsFor(compactIndex.text, compactNeedle),
    compactNeedle.length,
    quotePrefix.replace(/\s+/g, ""),
    quoteSuffix.replace(/\s+/g, ""),
  );
  const compactStart = compactCandidates[0];
  if (compactStart === undefined) return null;
  const range = rangeFromIndex(compactIndex, compactStart, compactStart + compactNeedle.length);
  return range ? { range, start: compactStart, end: compactStart + compactNeedle.length } : null;
}

function setCustomHighlights(win: Window, name: string, ranges: Range[]) {
  const highlightWindow = win as Window & {
    Highlight?: new (...ranges: Range[]) => unknown;
    CSS?: { highlights?: Map<string, unknown> };
  };
  const registry = highlightWindow.CSS?.highlights;
  if (!highlightWindow.Highlight || !registry) return;
  if (ranges.length === 0) {
    registry.delete(name);
    return;
  }
  registry.set(name, new highlightWindow.Highlight(...ranges));
}

function ensureHighlightStyle(doc: Document, name: string) {
  const id = `llm-hub-db-memo-highlight-${name}`;
  if (doc.getElementById(id)) return;
  const style = doc.createElement("style");
  style.id = id;
  style.textContent = `
::highlight(${name}) {
  background-color: rgb(217 119 6 / 0.30);
}
::highlight(${name}-flash) {
  background-color: rgb(217 119 6 / 0.58);
}
`;
  (doc.head ?? doc.documentElement).appendChild(style);
}

function fileKind(path: string): "markdown" | "text" | "html" | "image" | "pdf" | "epub" | "other" {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (["txt", "json", "csv", "tsv", "js", "ts", "tsx", "jsx", "css", "html", "xml", "yaml", "yml"].includes(ext)) {
    return ext === "html" ? "html" : "text";
  }
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (ext === "epub") return "epub";
  return "other";
}

function EditableText({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (next: string) => Promise<void>;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const [saving, setSaving] = useState(false);
  const dirty = text !== value;

  useEffect(() => setText(value), [value]);

  return (
    <div className="llm-hub-db-file-editor">
      <div className="llm-hub-db-file-editorbar">
        <button
          type="button"
          className="llm-hub-db-iconbtn"
          disabled={!dirty || saving}
          title={t("common.save")}
          onClick={() => {
            setSaving(true);
            void onSave(text).finally(() => setSaving(false));
          }}
        >
          <Save size={14} />
        </button>
      </div>
      <textarea
        className={className ?? "llm-hub-db-file-textarea"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}

function HtmlFrame({
  html,
  title,
  onSelectionContextMenu,
  frameRef,
  onLoad,
  anchorKind = "html",
}: {
  html: string;
  title: string;
  onSelectionContextMenu?: (text: string, x: number, y: number, anchor?: QuoteAnchorData) => void;
  frameRef: React.RefObject<HTMLIFrameElement>;
  onLoad?: () => void;
  anchorKind?: "html" | "epub";
}) {
  const [loadTick, setLoadTick] = useState(0);

  const selectedText = useCallback(() => {
    const selection = frameRef.current?.contentWindow?.getSelection();
    return selection?.toString().trim() ?? "";
  }, []);

  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    const onContextMenu = (event: MouseEvent) => {
      const selection = frameRef.current?.contentWindow?.getSelection();
      const text = selectedText();
      if (!text) return;
      let anchor: QuoteAnchorData | undefined;
      if (selection && selection.rangeCount) {
        const range = selection.getRangeAt(0);
        const element = range.startContainer.nodeType === Node.ELEMENT_NODE
          ? range.startContainer as Element
          : range.startContainer.parentElement;
        const section = anchorKind === "epub" ? element?.closest("section.epub-chapter") : null;
        const root = section ?? doc.body;
        if (root?.contains(range.startContainer) && root.contains(range.endContainer)) {
          const context = selectionContextFor(buildTextIndex(root), text, range);
          const match = section?.id.match(/^epub-chapter-(\d+)$/);
          anchor = {
            anchor: match ? `spine=${Number(match[1]) - 1}` : "text",
            ...(context.prefix ? { quotePrefix: context.prefix } : {}),
            ...(context.suffix ? { quoteSuffix: context.suffix } : {}),
          };
        }
      }
      event.preventDefault();
      const rect = frameRef.current?.getBoundingClientRect();
      onSelectionContextMenu?.(text, event.clientX + (rect?.left ?? 0), event.clientY + (rect?.top ?? 0), anchor);
    };
    doc.addEventListener("contextmenu", onContextMenu);
    return () => {
      doc.removeEventListener("contextmenu", onContextMenu);
    };
  }, [anchorKind, html, loadTick, onSelectionContextMenu, selectedText]);

  return (
    <iframe
      ref={frameRef}
      className="llm-hub-db-file-frame"
      title={title}
      srcDoc={html}
      sandbox="allow-same-origin allow-popups"
      onLoad={() => {
        setLoadTick((value) => value + 1);
        onLoad?.();
      }}
    />
  );
}

function SelectionMenu({
  quote,
  x,
  y,
  onClose,
  onCopy,
  onAskAi,
  onAddToMemo,
}: {
  quote: string;
  x: number;
  y: number;
  onClose: () => void;
  onCopy: () => void;
  onAskAi: () => void;
  onAddToMemo: () => void;
}) {
  const menu = (
    <div className="llm-hub-db-selection-menu-backdrop" onMouseDown={onClose}>
      <div
        className="llm-hub-db-selection-menu"
        style={{ left: x, top: y }}
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="llm-hub-db-selection-menu-quote">{quote}</div>
        <button type="button" onClick={onCopy}>
          <Copy size={13} />
          {t("message.copy")}
        </button>
        <button type="button" onClick={onAskAi}>
          <Bot size={13} />
          {t("memo.askAi")}
        </button>
        <button type="button" onClick={onAddToMemo}>
          <SquarePen size={13} />
          {t("memo.addToMemo")}
        </button>
      </div>
    </div>
  );
  return createPortal(menu, activeDocument.body);
}

function MemoPanel({
  sourcePath,
  ctx,
  memos,
  onMemosChange,
  onClose,
  onCollapse,
  selectedQuote,
  selectedAnchor,
  onClearSelectedQuote,
  onQuoteClick,
}: {
  sourcePath: string;
  ctx: WidgetContext;
  memos: DocumentMemo[] | null;
  onMemosChange: (memos: DocumentMemo[]) => void;
  onClose: () => void;
  onCollapse: () => void;
  selectedQuote: string;
  selectedAnchor?: QuoteAnchorData;
  onClearSelectedQuote: () => void;
  onQuoteClick: (quote: string, anchor?: QuoteAnchorData) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editQuote, setEditQuote] = useState("");

  const addMemo = async () => {
    const text = draft.trim();
    const quote = selectedQuote.trim();
    if (!text && !quote) return;
    const next = [
      ...(memos ?? []),
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        text,
        ...(quote ? { quote } : {}),
        ...(quote && selectedAnchor?.anchor ? { quoteAnchor: selectedAnchor.anchor } : {}),
        ...(quote && selectedAnchor?.quotePrefix ? { quotePrefix: selectedAnchor.quotePrefix } : {}),
        ...(quote && selectedAnchor?.quoteSuffix ? { quoteSuffix: selectedAnchor.quoteSuffix } : {}),
      },
    ];
    await writeMemos(ctx.app, sourcePath, next);
    setDraft("");
    onClearSelectedQuote();
    onMemosChange(next);
  };

  const startEdit = (memo: DocumentMemo) => {
    setEditingId(memo.id);
    setEditText(memo.text);
    setEditQuote(memo.quote ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
    setEditQuote("");
  };

  const saveEdit = async () => {
    if (!editingId || !memos) return;
    const text = editText.trim();
    if (!text) return;
    const quote = editQuote.trim();
    const next = memos.map((memo) =>
      memo.id === editingId
        ? {
            ...memo,
            text,
            ...(quote ? { quote } : { quote: undefined }),
          }
        : memo,
    );
    await writeMemos(ctx.app, sourcePath, next);
    onMemosChange(next);
    cancelEdit();
  };

  const deleteMemo = async (memoId: string) => {
    if (!memos) return;
    if (!confirm(t("memo.deleteConfirm"))) return;
    const next = memos.filter((memo) => memo.id !== memoId);
    await writeMemos(ctx.app, sourcePath, next);
    onMemosChange(next);
    if (editingId === memoId) cancelEdit();
  };

  const askAiAboutMemoFile = () => {
    const memoPath = memoPathFor(sourcePath);
    void ctx.plugin.openChatWithDraft(
      `Memo file:\n${memoPath}\n\nSource file:\n${sourcePath}`,
    );
  };

  return (
    <aside className="llm-hub-db-memo-panel">
      <div className="llm-hub-db-memo-header">
        <span>{t("memo.panelTitle")}</span>
        <span className="llm-hub-db-memo-header-actions">
          <button type="button" className="llm-hub-db-iconbtn" onClick={askAiAboutMemoFile} title={t("memo.askMemoAi")}>
            <Bot size={13} />
          </button>
          <button type="button" className="llm-hub-db-iconbtn" onClick={onCollapse} title={t("memo.collapse")}>
            <ChevronsLeft size={13} />
          </button>
          <button type="button" className="llm-hub-db-iconbtn" onClick={onClose} title={t("common.close")}>
            <X size={13} />
          </button>
        </span>
      </div>
      <div className="llm-hub-db-memo-list">
        {memos === null ? (
          <div className="llm-hub-db-widget-empty"><Loader2 size={16} /></div>
        ) : memos.length === 0 ? (
          <div className="llm-hub-db-memo-empty">{t("memo.empty")}</div>
        ) : (
          memos.map((memo) => (
            <div className="llm-hub-db-memo-item" key={memo.id}>
              <div className="llm-hub-db-memo-item-head">
                <time>{new Date(memo.createdAt).toLocaleString()}</time>
                {editingId !== memo.id && (
                  <span className="llm-hub-db-memo-item-actions">
                    <button
                      type="button"
                      className="llm-hub-db-iconbtn"
                      onClick={() => startEdit(memo)}
                      title={t("dashboard.edit")}
                    >
                      <SquarePen size={12} />
                    </button>
                    <button
                      type="button"
                      className="llm-hub-db-iconbtn is-danger"
                      onClick={() => void deleteMemo(memo.id)}
                      title={t("common.delete")}
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                )}
              </div>
              {editingId === memo.id ? (
                <div className="llm-hub-db-memo-edit">
                  <textarea
                    className="llm-hub-db-memo-edit-quote"
                    value={editQuote}
                    onChange={(e) => setEditQuote(e.target.value)}
                    placeholder={t("memo.quotePlaceholder")}
                  />
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    placeholder={t("memo.addPlaceholder")}
                  />
                  <div className="llm-hub-db-memo-edit-actions">
                    <button type="button" className="llm-hub-db-toolbtn" onClick={cancelEdit}>
                      {t("common.cancel")}
                    </button>
                    <button type="button" className="llm-hub-db-primary-btn" onClick={() => void saveEdit()}>
                      {t("common.save")}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {memo.quote && (
                    <button
                      type="button"
                      className="llm-hub-db-memo-quote-link"
                      onClick={() => onQuoteClick(memo.quote!, anchorDataFromMemo(memo))}
                      title={memo.quote}
                    >
                      {memo.quote}
                    </button>
                  )}
                  {memo.text && <p>{memo.text}</p>}
                </>
              )}
            </div>
          ))
        )}
      </div>
      <div className="llm-hub-db-memo-compose">
        {selectedQuote && (
          <div className="llm-hub-db-memo-relation">
            <blockquote>{selectedQuote}</blockquote>
            <button type="button" className="llm-hub-db-iconbtn" onClick={onClearSelectedQuote} title={t("common.delete")}>
              <X size={12} />
            </button>
          </div>
        )}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("memo.addPlaceholder")}
        />
        <button type="button" className="llm-hub-db-primary-btn" onClick={() => void addMemo()}>
          {t("memo.add")}
        </button>
      </div>
    </aside>
  );
}

export default function FileWidget({
  config,
  ctx,
}: {
  config: unknown;
  ctx?: WidgetContext;
}) {
  const cfg = (config ?? {}) as FileConfig;
  const path = (cfg.path ?? "").trim();
  const showHeader = cfg.showHeader !== false;
  const memoPanelOpen = cfg.memoPanelOpen === true;
  const memoPanelCollapsed = cfg.memoPanelCollapsed === true;
  const [content, setContent] = useState<string | null>(null);
  const [epubHtml, setEpubHtml] = useState<string | null>(null);
  const [epubError, setEpubError] = useState("");
  const [memos, setMemos] = useState<DocumentMemo[] | null>(null);
  const [frameLoadTick, setFrameLoadTick] = useState(0);
  const [pdfRenderTick, setPdfRenderTick] = useState(0);
  const [selectedQuote, setSelectedQuote] = useState("");
  const [selectedAnchor, setSelectedAnchor] = useState<QuoteAnchorData | undefined>(undefined);
  const [temporaryQuote, setTemporaryQuote] = useState("");
  const [selectionMenu, setSelectionMenu] = useState<{ quote: string; x: number; y: number; anchor?: QuoteAnchorData } | null>(null);
  const [loading, setLoading] = useState(false);
  const markdownRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const pdfViewerRef = useRef<PdfFileViewerHandle>(null);
  const highlightNameRef = useRef(`llm-hub-db-memo-${Math.random().toString(36).slice(2)}`);
  const app = ctx?.app;

  const file = useMemo(() => {
    if (!app || !path) return null;
    const found = app.vault.getAbstractFileByPath(path);
    return found instanceof TFile ? found : null;
  }, [app, path]);

  const kind = fileKind(path);
  const isReadableText = kind === "markdown" || kind === "text" || kind === "html";

  useEffect(() => {
    if (!app || !file || !isReadableText) {
      setContent(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void app.vault.read(file).then((text) => {
      if (!cancelled) setContent(text);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [app, file, isReadableText]);

  useEffect(() => {
    if (!app || !file || kind !== "epub") {
      setEpubHtml(null);
      setEpubError("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setEpubError("");
    void ctx.app.vault.readBinary(file)
      .then(async (buffer) => {
        const { epubToHtml } = await import("src/utils/epub");
        const html = epubToHtml(new Uint8Array(buffer), file.path);
        if (!cancelled) setEpubHtml(html);
      })
      .catch((error) => {
        if (!cancelled) setEpubError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [app, file, kind]);

  const filePath = file?.path ?? "";

  useEffect(() => {
    if (!app || !filePath || kind !== "markdown" || content === null || !markdownRef.current) return;
    const el = markdownRef.current;
    let cancelled = false;
    el.innerHTML = "";
    const component = new Component();
    component.load();
    void MarkdownRenderer.render(app, content, el, filePath, component).then(() => {
      if (cancelled || !el.isConnected) return;
    });
    return () => {
      cancelled = true;
      component.unload();
      el.innerHTML = "";
    };
  }, [app, filePath, kind, content]);

  const reloadMemos = useCallback(() => {
    if (!ctx || !path) {
      setMemos(null);
      return;
    }
    void readMemos(ctx.app, path).then(setMemos);
  }, [ctx, path]);

  useEffect(() => {
    if (!ctx || !path || !memoPanelOpen) {
      setMemos(null);
      return;
    }
    reloadMemos();
    const onModify = () => reloadMemos();
    ctx.app.vault.on("modify", onModify);
    ctx.app.vault.on("create", onModify);
    return () => {
      ctx.app.vault.off("modify", onModify);
      ctx.app.vault.off("create", onModify);
    };
  }, [ctx, path, memoPanelOpen, reloadMemos]);

  if (!ctx) return null;

  const updateConfig = (patch: Partial<FileConfig>) => {
    ctx.onConfigChange?.({ ...cfg, ...patch });
  };

  const adoptSelection = useCallback((text: string, anchor?: QuoteAnchorData) => {
    const quote = text.trim();
    if (!quote) return;
    setSelectedQuote(quote);
    setSelectedAnchor(anchor);
    updateConfig({ memoPanelOpen: true, memoPanelCollapsed: false });
  }, [cfg, ctx]);

  const openSelectionMenu = useCallback((quote: string, x: number, y: number, anchor?: QuoteAnchorData) => {
    const text = quote.trim();
    if (!text) return;
    setSelectionMenu({
      quote: text,
      x: Math.max(8, Math.min(x, window.innerWidth - 180)),
      y: Math.max(8, Math.min(y, window.innerHeight - 130)),
      ...(anchor ? { anchor } : {}),
    });
  }, []);

  const handlePdfRenderTick = useCallback(() => {
    setPdfRenderTick((value) => value + 1);
  }, []);

  const readHostSelection = useCallback((): { text: string; anchor?: QuoteAnchorData } => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    if (!text || !contentRef.current || !selection || selection.rangeCount === 0) return { text: "" };
    const range = selection.getRangeAt(0);
    if (!contentRef.current.contains(range.commonAncestorContainer)) return { text: "" };
    const root = kind === "markdown" ? markdownRef.current ?? contentRef.current : contentRef.current;
    const context = selectionContextFor(buildTextIndex(root), text, range);
    return {
      text,
      anchor: {
        anchor: "text",
        ...(context.prefix ? { quotePrefix: context.prefix } : {}),
        ...(context.suffix ? { quoteSuffix: context.suffix } : {}),
      },
    };
  }, []);

  const handleHostContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const { text, anchor } = readHostSelection();
    if (!text) return;
    event.preventDefault();
    openSelectionMenu(text, event.clientX, event.clientY, anchor);
  }, [openSelectionMenu, readHostSelection]);

  const openHostSelectionMenu = useCallback((event: MouseEvent): boolean => {
    const { text, anchor } = readHostSelection();
    if (!text) return false;
    event.preventDefault();
    event.stopPropagation();
    openSelectionMenu(text, event.clientX, event.clientY, anchor);
    return true;
  }, [openSelectionMenu, readHostSelection]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const onContextMenu = (event: MouseEvent) => {
      openHostSelectionMenu(event);
    };
    root.addEventListener("contextmenu", onContextMenu, { capture: true });
    return () => {
      root.removeEventListener("contextmenu", onContextMenu, { capture: true });
    };
  }, [openHostSelectionMenu]);

  const copySelection = useCallback(async () => {
    if (!selectionMenu) return;
    await navigator.clipboard.writeText(selectionMenu.quote);
    setSelectionMenu(null);
  }, [selectionMenu]);

  const askAiAboutSelection = useCallback(() => {
    if (!selectionMenu) return;
    setTemporaryQuote(selectionMenu.quote);
    void ctx.plugin.askChatAboutSelection({
      text: selectionMenu.quote,
      sourcePath: path || undefined,
    });
    setSelectionMenu(null);
  }, [ctx.plugin, path, selectionMenu]);

  const addSelectionToMemo = useCallback(() => {
    if (!selectionMenu) return;
    adoptSelection(selectionMenu.quote, selectionMenu.anchor);
    setSelectionMenu(null);
  }, [adoptSelection, selectionMenu]);

  const rootsForQuotes = useCallback((): Array<{ root: Node; win: Window }> => {
    if ((kind === "html" || kind === "epub") && frameRef.current?.contentDocument?.body && frameRef.current.contentWindow) {
      return [{ root: frameRef.current.contentDocument.body, win: frameRef.current.contentWindow }];
    }
    if (contentRef.current) return [{ root: contentRef.current, win: window }];
    return [];
  }, [kind]);

  const findQuoteRange = useCallback((quote: string, anchor?: QuoteAnchorData): { range: Range; win: Window } | null => {
    for (const candidate of rootsForQuotes()) {
      const root = (() => {
        if (!anchor?.anchor || !(candidate.root instanceof Element)) return candidate.root;
        const page = anchor.anchor.match(/^page=(\d+)$/);
        if (page) return candidate.root.querySelector(`[data-pdf-page="${page[1]}"]`) ?? candidate.root;
        const spine = anchor.anchor.match(/^spine=(\d+)$/);
        if (spine) return candidate.root.querySelector(`#epub-chapter-${Number(spine[1]) + 1}`) ?? candidate.root;
        return candidate.root;
      })();
      const match = findQuoteMatch(root, quote, anchor?.quotePrefix, anchor?.quoteSuffix);
      if (match) return { range: match.range, win: candidate.win };
    }
    return null;
  }, [rootsForQuotes]);

  useEffect(() => {
    const name = highlightNameRef.current;
    const clear = () => {
      setCustomHighlights(window, name, []);
      const frameWin = frameRef.current?.contentWindow;
      if (frameWin) setCustomHighlights(frameWin, name, []);
    };

    if ((!memoPanelOpen || !memos?.length) && !temporaryQuote) {
      clear();
      return clear;
    }

    const timer = window.setTimeout(() => {
      const hostRanges: Range[] = [];
      const frameRanges: Range[] = [];
      ensureHighlightStyle(document, name);
      const frameDoc = frameRef.current?.contentDocument;
      if (frameDoc) ensureHighlightStyle(frameDoc, name);

      const quotes = [
        ...((memoPanelOpen ? memos ?? [] : [])
          .filter((memo): memo is DocumentMemo & { quote: string } => Boolean(memo.quote))
          .map((memo) => ({ quote: memo.quote, anchor: anchorDataFromMemo(memo) }))),
        ...(temporaryQuote ? [{ quote: temporaryQuote, anchor: undefined }] : []),
      ];

      for (const { quote, anchor } of quotes) {
        const found = findQuoteRange(quote, anchor);
        if (!found) continue;
        if (found.win === window) hostRanges.push(found.range);
        else frameRanges.push(found.range);
      }

      setCustomHighlights(window, name, hostRanges);
      const frameWin = frameRef.current?.contentWindow;
      if (frameWin) setCustomHighlights(frameWin, name, frameRanges);
    }, 120);

    return () => {
      window.clearTimeout(timer);
    };
  }, [memoPanelOpen, memos, temporaryQuote, content, epubHtml, kind, frameLoadTick, pdfRenderTick, findQuoteRange]);

  useEffect(() => {
    setTemporaryQuote("");
  }, [path]);

  useEffect(() => () => {
    const name = highlightNameRef.current;
    setCustomHighlights(window, name, []);
    const frameWin = frameRef.current?.contentWindow;
    if (frameWin) setCustomHighlights(frameWin, name, []);
  }, []);

  const jumpToQuote = useCallback((quote: string, anchor?: QuoteAnchorData, retryPdf = true) => {
    const needle = quote.trim();
    if (!needle) return;
    const found = findQuoteRange(needle, anchor);
    if (!found) {
      if (kind === "pdf" && retryPdf) {
        pdfViewerRef.current?.renderAllPages();
        window.setTimeout(() => jumpToQuote(needle, anchor, false), 250);
      }
      return;
    }
    found.win.focus();
    const selection = found.win.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(found.range);
    const rect = found.range.getBoundingClientRect();
    const container = kind === "pdf"
      ? pdfViewerRef.current?.getScrollContainer()
      : found.win === window
        ? contentRef.current
        : frameRef.current?.contentDocument?.scrollingElement;
    if (container && rect) {
      const containerRect = container instanceof HTMLElement ? container.getBoundingClientRect() : null;
      if (container instanceof HTMLElement && containerRect) {
        container.scrollTo({
          top: container.scrollTop + rect.top - containerRect.top - container.clientHeight / 3,
          behavior: "smooth",
        });
      }
    }
    if (found.range.startContainer.parentElement) {
      found.range.startContainer.parentElement.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [findQuoteRange, kind]);

  if (!path) {
    return <div className="llm-hub-db-widget-empty">{t("dashboard.fileSelectFile")}</div>;
  }

  if (!file) {
    return <div className="llm-hub-db-widget-empty">{t("dashboard.fileNotFound")}: {path}</div>;
  }

  const openFile = () => void ctx.app.workspace.getLeaf(true).openFile(file);
  const saveText = async (next: string) => {
    await ctx.app.vault.modify(file, next);
    setContent(next);
  };

  const header = showHeader && (
    <div className="llm-hub-db-file-header">
      <span className="llm-hub-db-markdown-path" title={path}>{path}</span>
      <button type="button" className="llm-hub-db-markdown-open" onClick={openFile} title={t("dashboard.kanbanOpenNote")}>
        <ExternalLink size={14} />
      </button>
      <button
        type="button"
        className={`llm-hub-db-markdown-open${memoPanelOpen ? " is-active" : ""}`}
        onClick={() => updateConfig(memoPanelOpen ? { memoPanelOpen: false } : { memoPanelOpen: true, memoPanelCollapsed: false })}
        title={t("memo.panelToggle")}
      >
        <NotebookPen size={14} />
      </button>
    </div>
  );

  const body = () => {
    if (loading && (kind !== "markdown" || content === null)) {
      return <div className="llm-hub-db-widget-empty"><Loader2 size={16} />{t("dashboard.loading")}</div>;
    }
    if (kind === "markdown") {
      if (content === null) return <div className="llm-hub-db-widget-empty">{t("dashboard.fileNotFound")}</div>;
      return <div className="llm-hub-db-markdown"><div ref={markdownRef} className="markdown-rendered llm-hub-db-markdown-render-target" /></div>;
    }
    if (kind === "text") {
      if (content === null) return <div className="llm-hub-db-widget-empty">{t("dashboard.fileNotFound")}</div>;
      return <EditableText value={content} onSave={saveText} />;
    }
    if (kind === "html") {
      if (content === null) return <div className="llm-hub-db-widget-empty">{t("dashboard.fileNotFound")}</div>;
      return <HtmlFrame html={content} title={path} onSelectionContextMenu={openSelectionMenu} frameRef={frameRef} onLoad={() => setFrameLoadTick((value) => value + 1)} />;
    }
    if (kind === "epub") {
      if (epubError) return <div className="llm-hub-db-widget-empty">{epubError}</div>;
      if (!epubHtml) return <div className="llm-hub-db-widget-empty"><Loader2 size={16} />{t("dashboard.loading")}</div>;
      return <HtmlFrame html={epubHtml} title={path} anchorKind="epub" onSelectionContextMenu={openSelectionMenu} frameRef={frameRef} onLoad={() => setFrameLoadTick((value) => value + 1)} />;
    }
    if (kind === "image") {
      return (
        <div className="llm-hub-db-file-imagewrap">
          <img src={ctx.app.vault.getResourcePath(file)} alt={path} />
        </div>
      );
    }
    if (kind === "pdf") {
      return (
        <PdfFileViewer
          ref={pdfViewerRef}
          ctx={ctx}
          file={file}
          onSelectionContextMenu={openSelectionMenu}
          onRenderTick={handlePdfRenderTick}
        />
      );
    }
    return (
      <div className="llm-hub-db-widget-empty">
        <FileText size={18} />
        <span>{path}</span>
        <button type="button" className="llm-hub-db-primary-btn" onClick={openFile}>
          {t("dashboard.openFile")}
        </button>
      </div>
    );
  };

  return (
    <div className="llm-hub-db-file-wrap">
      {header}
      <div className="llm-hub-db-file-main">
        {memoPanelOpen && memoPanelCollapsed && (
          <button
            type="button"
            className="llm-hub-db-memo-rail"
            onClick={() => updateConfig({ memoPanelCollapsed: false })}
            title={t("memo.expand")}
          >
            <ChevronsRight size={16} />
          </button>
        )}
        {memoPanelOpen && !memoPanelCollapsed && (
          <MemoPanel
            sourcePath={path}
            ctx={ctx}
            memos={memos}
            onMemosChange={setMemos}
            onClose={() => updateConfig({ memoPanelOpen: false, memoPanelCollapsed: false })}
            onCollapse={() => updateConfig({ memoPanelCollapsed: true })}
            selectedQuote={selectedQuote}
            selectedAnchor={selectedAnchor}
            onClearSelectedQuote={() => {
              setSelectedQuote("");
              setSelectedAnchor(undefined);
            }}
            onQuoteClick={jumpToQuote}
          />
        )}
        <div
          ref={contentRef}
          className="llm-hub-db-file-content"
          onContextMenu={handleHostContextMenu}
        >
          {body()}
        </div>
      </div>
      {selectionMenu && (
        <SelectionMenu
          quote={selectionMenu.quote}
          x={selectionMenu.x}
          y={selectionMenu.y}
          onClose={() => setSelectionMenu(null)}
          onCopy={() => void copySelection()}
          onAskAi={askAiAboutSelection}
          onAddToMemo={addSelectionToMemo}
        />
      )}
    </div>
  );
}
