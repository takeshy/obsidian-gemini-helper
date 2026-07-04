import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronUp, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { loadPdfJs, TFile } from "obsidian";
import { t } from "src/i18n";
import type { WidgetContext } from "../types";

type PdfDocumentProxy = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
  destroy?: () => Promise<void>;
};

type PdfPageProxy = {
  getViewport: (options: { scale: number }) => PdfViewport;
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport; transform?: number[] }) => { promise: Promise<void>; cancel?: () => void };
  getTextContent: () => Promise<unknown>;
  streamTextContent?: () => unknown;
};

type PdfViewport = {
  width: number;
  height: number;
  scale: number;
  transform: number[];
};

type PdfTextLayer = new (options: {
  textContentSource: unknown;
  container: HTMLDivElement;
  viewport: PdfViewport;
}) => { render: () => Promise<void> };

type PdfJsModule = {
  getDocument: (options: { data: Uint8Array }) => { promise: Promise<PdfDocumentProxy> };
  TextLayer?: PdfTextLayer;
};

function isRenderingCancelled(error: unknown): boolean {
  return error instanceof Error
    ? error.name === "RenderingCancelledException"
    : (error as { name?: string } | null)?.name === "RenderingCancelledException";
}

function PdfPage({
  pdfjs,
  doc,
  pageNumber,
  scale,
  active,
  onRendered,
}: {
  pdfjs: PdfJsModule;
  doc: PdfDocumentProxy;
  pageNumber: number;
  scale: number;
  active: boolean;
  onRendered: (pageNumber: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!active) return;

    void (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      setSize({ width: viewport.width, height: viewport.height });

      const canvas = canvasRef.current;
      const textLayer = textLayerRef.current;
      if (!canvas || !textLayer) return;

      const pixelRatio = Math.min(3, window.devicePixelRatio || 1);
      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      const renderTask = page.render({
        canvasContext: context,
        viewport,
        transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
      });
      const renderPromise = renderTask.promise.catch((error: unknown) => {
        if (isRenderingCancelled(error)) return;
        throw error;
      });

      await renderPromise;
      if (cancelled) return;

      textLayer.innerHTML = "";
      textLayer.style.width = `${viewport.width}px`;
      textLayer.style.height = `${viewport.height}px`;
      textLayer.style.setProperty("--scale-factor", String(viewport.scale));
      textLayer.style.setProperty("--total-scale-factor", String(viewport.scale));

      const TextLayer = pdfjs.TextLayer;
      if (!TextLayer) {
        throw new Error("PDF text layer API is unavailable.");
      }
      const textLayerRenderer = new TextLayer({
        textContentSource: page.streamTextContent ? page.streamTextContent() : await page.getTextContent(),
        container: textLayer,
        viewport,
      });
      await textLayerRenderer.render();
      if (!cancelled) {
        setRendered(true);
        onRendered(pageNumber);
      }
    })().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [active, doc, onRendered, pageNumber, pdfjs, scale]);

  return (
    <div
      className="llm-hub-db-pdf-page"
      data-pdf-page={pageNumber}
      style={size ? {
        width: size.width,
        minHeight: size.height,
        "--scale-factor": String(scale),
        "--total-scale-factor": String(scale),
      } as CSSProperties : undefined}
    >
      {!rendered && <div className="llm-hub-db-pdf-page-loading"><Loader2 size={16} /></div>}
      <canvas ref={canvasRef} />
      <div ref={textLayerRef} className="llm-hub-db-pdf-text-layer" />
    </div>
  );
}

export interface PdfFileViewerHandle {
  renderAllPages: () => void;
  getScrollContainer: () => HTMLElement | null;
}

export interface PdfQuoteAnchor {
  anchor: string;
  quotePrefix?: string;
  quoteSuffix?: string;
}

const PdfFileViewer = forwardRef<PdfFileViewerHandle, {
  ctx: WidgetContext;
  file: TFile;
  onSelectionContextMenu: (text: string, x: number, y: number, anchor?: PdfQuoteAnchor) => void;
  onRenderTick?: () => void;
}>(function PdfFileViewer({
  ctx,
  file,
  onSelectionContextMenu,
  onRenderTick,
}, ref) {
  const [pdfjs, setPdfjs] = useState<PdfJsModule | null>(null);
  const [doc, setDoc] = useState<PdfDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const [scale, setScale] = useState(1.2);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(() => new Set([1]));
  const rootRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const app = ctx.app;

  useImperativeHandle(ref, () => ({
    renderAllPages: () => {
      if (!doc) return;
      setVisiblePages(new Set(Array.from({ length: doc.numPages }, (_, index) => index + 1)));
    },
    getScrollContainer: () => pagesRef.current,
  }), [doc]);

  useEffect(() => {
    let cancelled = false;
    let loadedDoc: PdfDocumentProxy | null = null;
    setError("");
    setDoc(null);
    setVisiblePages(new Set([1]));

    void (async () => {
      const nextPdfjs = await loadPdfJs() as PdfJsModule;
      const bytes = new Uint8Array(await app.vault.readBinary(file));
      loadedDoc = await nextPdfjs.getDocument({ data: bytes }).promise;
      if (cancelled) return;
      setPdfjs(nextPdfjs);
      setDoc(loadedDoc);
    })().catch((loadError) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
    });

    return () => {
      cancelled = true;
      void loadedDoc?.destroy?.();
    };
  }, [app, file]);

  const pages = useMemo(() => Array.from({ length: doc?.numPages ?? 0 }, (_, index) => index + 1), [doc]);

  useEffect(() => {
    const root = pagesRef.current;
    if (!root || !doc) return;
    const observer = new IntersectionObserver((entries) => {
      setVisiblePages((current) => {
        let changed = false;
        const next = new Set(current);
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const page = Number((entry.target as HTMLElement).dataset.pdfPage);
          if (page && !next.has(page)) {
            next.add(page);
            if (page > 1) next.add(page - 1);
            if (page < doc.numPages) next.add(page + 1);
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }, { root, rootMargin: "600px 0px" });

    root.querySelectorAll<HTMLElement>("[data-pdf-page]").forEach((page) => observer.observe(page));
    return () => observer.disconnect();
  }, [doc, pages]);

  const readSelection = useCallback((): { text: string; anchor?: PdfQuoteAnchor } => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    if (!text || !selection || selection.rangeCount === 0 || !rootRef.current) return { text: "" };
    const range = selection.getRangeAt(0);
    if (!rootRef.current.contains(range.commonAncestorContainer)) return { text: "" };
    const pageEl = range.startContainer.parentElement?.closest<HTMLElement>("[data-pdf-page]");
    if (!pageEl) return { text };
    const beforeRange = pageEl.ownerDocument.createRange();
    beforeRange.setStart(pageEl, 0);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    const afterRange = pageEl.ownerDocument.createRange();
    afterRange.setStart(range.endContainer, range.endOffset);
    afterRange.setEnd(pageEl, pageEl.childNodes.length);
    const prefix = beforeRange.toString().replace(/\s+/g, " ").trim().slice(-30);
    const suffix = afterRange.toString().replace(/\s+/g, " ").trim().slice(0, 30);
    const page = Number(pageEl.dataset.pdfPage) || 0;
    return {
      text,
      anchor: {
        anchor: page ? `page=${page}` : "text",
        ...(prefix ? { quotePrefix: prefix } : {}),
        ...(suffix ? { quoteSuffix: suffix } : {}),
      },
    };
  }, []);

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const { text, anchor } = readSelection();
    if (!text) return;
    event.preventDefault();
    onSelectionContextMenu(text, event.clientX, event.clientY, anchor);
  }, [onSelectionContextMenu, readSelection]);

  const handlePageRendered = useCallback(() => {
    onRenderTick?.();
  }, [onRenderTick]);

  if (error) return <div className="llm-hub-db-widget-empty">{error}</div>;
  if (!pdfjs || !doc) return <div className="llm-hub-db-widget-empty"><Loader2 size={16} />{t("dashboard.loading")}</div>;

  return (
    <div className="llm-hub-db-pdf-viewer" ref={rootRef} onContextMenu={handleContextMenu}>
      <div className="llm-hub-db-pdf-toolbar">
        <button type="button" className="llm-hub-db-iconbtn" onClick={() => setScale((value) => Math.max(0.6, value - 0.1))} title="Zoom out">
          <ZoomOut size={13} />
        </button>
        <span>{Math.round(scale * 100)}%</span>
        <button type="button" className="llm-hub-db-iconbtn" onClick={() => setScale((value) => Math.min(2.4, value + 0.1))} title="Zoom in">
          <ZoomIn size={13} />
        </button>
        <button type="button" className="llm-hub-db-iconbtn" onClick={() => pagesRef.current?.scrollBy({ top: -pagesRef.current.clientHeight * 0.9, behavior: "smooth" })} title="Previous page">
          <ChevronUp size={13} />
        </button>
        <button type="button" className="llm-hub-db-iconbtn" onClick={() => pagesRef.current?.scrollBy({ top: pagesRef.current.clientHeight * 0.9, behavior: "smooth" })} title="Next page">
          <ChevronDown size={13} />
        </button>
      </div>
      <div ref={pagesRef} className="llm-hub-db-pdf-pages">
        {pages.map((pageNumber) => (
          <PdfPage
            key={`${pageNumber}-${scale}`}
            pdfjs={pdfjs}
            doc={doc}
            pageNumber={pageNumber}
            scale={scale}
            active={visiblePages.has(pageNumber)}
            onRendered={handlePageRendered}
          />
        ))}
      </div>
    </div>
  );
});

PdfFileViewer.displayName = "PdfFileViewer";

export default PdfFileViewer;
