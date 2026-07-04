// Kanban widget — renders notes as cards grouped into columns by a frontmatter
// status property. Drag cards between columns to update the status (writes via
// processFrontMatter). Click a card to open the note. Works in view mode.

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Plus } from "lucide-react";
import { Notice, TFile, type App } from "obsidian";
import { t } from "src/i18n";
import type { WidgetContext } from "../types";
import { ensureVaultFolder } from "../dashboardFile";
import { KanbanNewCardModal, type NewCardInput } from "./KanbanNewCardModal";
import { KanbanCardModal } from "./KanbanCardModal";

interface KanbanColumn {
  value: string;
  label: string;
}

interface KanbanConfig {
  title?: string;
  tag?: string;
  folder?: string;
  statusProperty?: string;
  titleProperty?: string;
  columns?: KanbanColumn[];
  showUnspecified?: boolean;
  /** Frontmatter property names shown on each card below the title. */
  displayFields?: string[];
  /** Stable card path order used for vertical ordering inside columns. */
  cardOrder?: string[];
}

interface Card {
  file: TFile;
  title: string;
  status: string;
  path: string;
  fields: { name: string; value: string }[];
}

type FrontmatterRecord = Record<string, unknown>;
type DropPosition = "before" | "after";
type DropTarget = { column: string; path: string; position: DropPosition } | null;

function asFrontmatterRecord(value: unknown): FrontmatterRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as FrontmatterRecord : {};
}

/** Format a single scalar frontmatter value; objects and nullish return "". */
function formatScalar(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
  return "";
}

/** Format a frontmatter value for display on a card. Returns "" to skip. */
function formatFieldValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((v) => formatScalar(v)).filter((s) => s.length > 0).join(", ");
  }
  return formatScalar(value);
}

const DRAG_THRESHOLD = 4;
const UNSPECIFIED = "__unspecified__";

function normTag(tag: string): string {
  return tag.replace(/^#/, "").trim().toLowerCase();
}

// Strip characters that are illegal in vault file names so a typed card title
// can be used as the note's file name.
function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|#^[\]]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim();
}

function getFileTags(app: App, file: TFile): string[] {
  const cache = app.metadataCache.getFileCache(file);
  if (!cache) return [];
  const tags: string[] = [];
  const frontmatter = asFrontmatterRecord(cache.frontmatter);
  const fmTags = frontmatter.tags;
  if (fmTags) {
    if (Array.isArray(fmTags)) {
      tags.push(...fmTags.map((t) => (typeof t === "string" && t.startsWith("#") ? t : `#${t}`)));
    } else if (typeof fmTags === "string") {
      tags.push(fmTags.startsWith("#") ? fmTags : `#${fmTags}`);
    }
  }
  if (cache.tags) {
    tags.push(...cache.tags.map((tc) => tc.tag));
  }
  return [...new Set(tags)];
}

export default function KanbanWidget({
  config,
  ctx,
}: {
  config: unknown;
  ctx?: WidgetContext;
}) {
  const cfg = (config ?? {}) as KanbanConfig;
  const boardTitle = (cfg.title ?? "").trim();
  const tagFilter = normTag(cfg.tag ?? "");
  const folderFilter = (cfg.folder ?? "").trim();
  const statusProp = (cfg.statusProperty ?? "status").trim() || "status";
  const titleProp = (cfg.titleProperty ?? "").trim();
  const displayFields = Array.isArray(cfg.displayFields)
    ? cfg.displayFields.map((f) => (typeof f === "string" ? f.trim() : "")).filter((f) => f.length > 0)
    : [];
  const columns = Array.isArray(cfg.columns) ? cfg.columns.filter((c) => c && typeof c.value === "string") : [];
  const showUnspecified = cfg.showUnspecified !== false;

  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((v) => v + 1), []);

  // Filter descriptor so vault listeners use the latest filter values.
  const filterKey = `${folderFilter}|${tagFilter}`;
  useEffect(() => {
    if (!ctx) return;
    const app = ctx.app;
    let last = 0;
    let timer: number | null = null;
    // Throttle with a trailing edge so the final event in a burst still fires a
    // re-render. Creating a card emits "create" (no frontmatter yet) immediately
    // followed by "changed" (status written); dropping the trailing "changed"
    // would leave the new card stuck in the Unspecified column.
    const schedule = () => {
      const now = Date.now();
      const elapsed = now - last;
      if (elapsed >= 200) {
        last = now;
        rerender();
      } else if (timer == null) {
        timer = window.setTimeout(() => {
          timer = null;
          last = Date.now();
          rerender();
        }, 200 - elapsed);
      }
    };
    const refs = [
      app.metadataCache.on("changed", () => {
        // A metadata change can remove the tag/status that made a card visible.
        // Re-render even when the updated cache no longer matches the filter so
        // stale cards disappear immediately.
        schedule();
      }),
      app.metadataCache.on("deleted", schedule),
      app.vault.on("create", schedule),
      app.vault.on("delete", schedule),
      app.vault.on("rename", schedule),
    ];
    return () => {
      if (timer != null) window.clearTimeout(timer);
      refs.forEach((r) => {
        app.metadataCache.offref(r);
        app.vault.offref(r);
      });
    };
    }, [ctx, rerender, filterKey]);

  const cards: Card[] = ctx
    ? (() => {
        const app = ctx.app;
        let files = app.vault.getMarkdownFiles();
        if (folderFilter) {
          const prefix = folderFilter.toLowerCase();
          files = files.filter((f) => f.path.toLowerCase().startsWith(prefix));
        }
        if (tagFilter) {
          files = files.filter((f) => getFileTags(app, f).some((tg) => normTag(tg) === tagFilter));
        }
        return files.map((file) => {
          const cache = app.metadataCache.getFileCache(file);
          const fm = asFrontmatterRecord(cache?.frontmatter);
          const rawStatus = fm?.[statusProp];
          const status = formatScalar(rawStatus);
          let title = file.basename;
          if (titleProp) {
            title = formatScalar(fm[titleProp]) || title;
          }
          const fields = displayFields
            .map((name) => ({ name, value: formatFieldValue(fm?.[name]) }))
            .filter((f) => f.value.length > 0);
          return { file, title, status, path: file.path, fields };
        });
      })()
    : [];

  // De-duplicate columns by value so a misconfigured board with two columns
  // sharing the same status value never renders the cards twice nor lets the
  // ref callback clobber the wrong column element.
  const uniqueColumns = useMemo(() => {
    const seen = new Set<string>();
    const out: KanbanColumn[] = [];
    for (const col of columns) {
      if (seen.has(col.value)) continue;
      seen.add(col.value);
      out.push(col);
    }
    return out;
  }, [columns]);
  const columnValues = useMemo(() => new Set(uniqueColumns.map((c) => c.value)), [uniqueColumns]);
  const [cardOrder, setCardOrder] = useState<string[]>(
    Array.isArray(cfg.cardOrder) ? cfg.cardOrder.filter((id): id is string => typeof id === "string") : [],
  );
  useEffect(() => {
    setCardOrder(Array.isArray(cfg.cardOrder) ? cfg.cardOrder.filter((id): id is string => typeof id === "string") : []);
  }, [cfg.cardOrder]);
  const orderedCards = useMemo(() => {
    const orderMap = new Map(cardOrder.map((path, index) => [path, index]));
    return [...cards].sort((a, b) => {
      const ai = orderMap.get(a.path);
      const bi = orderMap.get(b.path);
      if (ai == null && bi == null) return a.path.localeCompare(b.path);
      if (ai == null) return 1;
      if (bi == null) return -1;
      return ai - bi;
    });
  }, [cards, cardOrder]);
  const grouped = new Map<string, Card[]>();
  for (const col of uniqueColumns) {
    grouped.set(col.value, []);
  }
  const unspecified: Card[] = [];
  for (const card of orderedCards) {
    if (columnValues.has(card.status)) {
      grouped.get(card.status)!.push(card);
    } else {
      unspecified.push(card);
    }
  }

  const [drag, setDrag] = useState<{ card: Card; x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const [dropCol, setDropCol] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  // Path of the card that just landed in a new column — used to flash it so the
  // user can see where the card moved to after dropping.
  const [landed, setLanded] = useState<string | null>(null);
  const landedTimer = useRef<number | null>(null);
  const columnElsRef = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    return () => {
      if (landedTimer.current != null) window.clearTimeout(landedTimer.current);
    };
  }, []);

  const flashLanded = useCallback((path: string) => {
    if (landedTimer.current != null) window.clearTimeout(landedTimer.current);
    setLanded(path);
    landedTimer.current = window.setTimeout(() => {
      setLanded(null);
      landedTimer.current = null;
    }, 700);
  }, []);

  const hitTestColumn = (clientX: number, clientY: number): string | null => {
    for (const [value, el] of columnElsRef.current) {
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return value;
      }
    }
    return null;
  };

  const hitTestDrop = (clientX: number, clientY: number): { column: string | null; target: DropTarget } => {
    const column = hitTestColumn(clientX, clientY);
    const cardEl = activeDocument
      .elementsFromPoint(clientX, clientY)
      .find((el) => el.instanceOf(HTMLElement) && el.dataset.kanbanCardPath) as HTMLElement | undefined;
    const path = cardEl?.dataset.kanbanCardPath;
    const cardColumn = cardEl?.dataset.kanbanColumn;
    if (!column || !path || !cardColumn || cardColumn !== column) return { column, target: null };
    const rect = cardEl.getBoundingClientRect();
    const position: DropPosition = clientY < rect.top + rect.height / 2 ? "before" : "after";
    return { column, target: { column, path, position } };
  };

  const persistCardOrder = useCallback(
    (nextOrder: string[]) => {
      setCardOrder(nextOrder);
      ctx?.onConfigChange?.({ ...cfg, cardOrder: nextOrder });
    },
    [ctx, cfg],
  );

  const columnForCard = useCallback(
    (card: Card): string => columnValues.has(card.status) ? card.status : UNSPECIFIED,
    [columnValues],
  );

  const reorderCard = useCallback(
    (path: string, target: DropTarget, fallbackColumn: string): string[] => {
      const visiblePaths = new Set(orderedCards.map((card) => card.path));
      const base = [
        ...cardOrder.filter((id) => visiblePaths.has(id)),
        ...orderedCards.map((card) => card.path).filter((id) => !cardOrder.includes(id)),
      ].filter((id) => id !== path);

      if (target?.path && target.path !== path) {
        const index = base.indexOf(target.path);
        if (index >= 0) {
          base.splice(target.position === "before" ? index : index + 1, 0, path);
          return base;
        }
      }

      const columnCards = fallbackColumn === UNSPECIFIED ? unspecified : grouped.get(fallbackColumn) ?? [];
      const lastInColumn = [...columnCards].reverse().find((card) => card.path !== path);
      if (!lastInColumn) return [path, ...base];
      const index = base.indexOf(lastInColumn.path);
      base.splice(index >= 0 ? index + 1 : base.length, 0, path);
      return base;
    },
    [cardOrder, orderedCards, grouped, unspecified],
  );

  const onCardPointerDown = useCallback(
    (e: React.PointerEvent, card: Card) => {
      if (!ctx) return;
      // In edit mode the GridCell handles drag/resize interactions on the
      // cell; let those through and don't start a competing card drag.
      if (ctx.editMode) return;
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      let isDragging = false;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!isDragging) {
          if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
          isDragging = true;
        }
        setDrag({
          card,
          x: ev.clientX,
          y: ev.clientY,
          offsetX: ev.clientX - rect.left,
          offsetY: ev.clientY - rect.top,
        });
        const hit = hitTestDrop(ev.clientX, ev.clientY);
        setDropCol(hit.column);
        setDropTarget(hit.target?.path === card.path ? null : hit.target);
      };

      const onUp = (ev: PointerEvent) => {
        activeWindow.removeEventListener("pointermove", onMove);
        activeWindow.removeEventListener("pointerup", onUp);
        if (isDragging) {
          const hit = hitTestDrop(ev.clientX, ev.clientY);
          const found = hit.column;
          const target = hit.target?.path === card.path ? null : hit.target;
          const currentCol = columnForCard(card);
          if (found != null) {
            persistCardOrder(reorderCard(card.path, target, found));
          }
          if (found != null && found !== currentCol) {
            void ctx.app.fileManager
              .processFrontMatter(card.file, (fm) => {
                const frontmatter = fm as FrontmatterRecord;
                if (found === UNSPECIFIED) {
                  delete frontmatter[statusProp];
                } else {
                  frontmatter[statusProp] = found;
                }
              })
              .then(() => flashLanded(card.path));
          }
          setDrag(null);
          setDropCol(null);
          setDropTarget(null);
        } else {
          // Treat as a click — preview the note in a modal. The modal's open
          // icon navigates to the note in a new leaf (keeps the dashboard).
          new KanbanCardModal(
            ctx.app,
            card.file,
            card.title,
            ctx.sourcePath ?? card.file.path,
            () => void ctx.app.workspace.getLeaf(true).openFile(card.file),
          ).open();
        }
      };

      activeWindow.addEventListener("pointermove", onMove);
      activeWindow.addEventListener("pointerup", onUp);
    },
    [ctx, statusProp, columnForCard, flashLanded, hitTestDrop, persistCardOrder, reorderCard],
  );

  // Create a note that already matches this board's filters: dropped in the
  // configured folder, tagged with the configured tag, and set to the chosen
  // column's status so it shows up immediately. Then open it for editing.
  const createCard = useCallback(
    async ({ title, status }: NewCardInput) => {
      if (!ctx) return;
      const app = ctx.app;
      const folder = folderFilter.replace(/[/\\]+$/, "");
      try {
        await ensureVaultFolder(app.vault, folder);
        const dir = folder ? `${folder}/` : "";
        const base = sanitizeFileName(title) || t("dashboard.kanbanNewCardName");
        let name = base;
        let n = 1;
        while (app.vault.getAbstractFileByPath(`${dir}${name}.md`)) {
          name = `${base} ${++n}`;
        }
        const file = await app.vault.create(`${dir}${name}.md`, "");
        await app.fileManager.processFrontMatter(file, (fm) => {
          const frontmatter = fm as FrontmatterRecord;
          if (tagFilter) {
            const tags = frontmatter.tags;
            const cur: unknown[] = Array.isArray(tags) ? tags.slice() : tags != null ? [tags] : [];
            if (!cur.some((tg) => normTag(String(tg)) === tagFilter)) cur.push(tagFilter);
            frontmatter.tags = cur;
          }
          if (status) frontmatter[statusProp] = status;
          if (titleProp && title) frontmatter[titleProp] = title;
        });
        // Stay on the dashboard — the new card appears in its column via the
        // metadata listener; the user can click it to open when ready.
      } catch (e) {
        new Notice(t("dashboard.kanbanNewCardError"));
        console.error("Kanban: failed to create card", e);
      }
    },
    [ctx, folderFilter, tagFilter, statusProp, titleProp],
  );

  const openNewCard = useCallback(() => {
    if (!ctx) return;
    new KanbanNewCardModal(ctx.app, uniqueColumns, (data) => void createCard(data)).open();
  }, [ctx, uniqueColumns, createCard]);

  if (!ctx) return null;

  if (!statusProp) {
    return <div className="llm-hub-db-widget-empty">{t("dashboard.kanbanNoStatusProperty")}</div>;
  }

  const renderColumn = (value: string, label: string, cardsInCol: Card[]) => (
    <div
      key={value}
      ref={(el) => {
        if (el) columnElsRef.current.set(value, el);
        else columnElsRef.current.delete(value);
      }}
      className={`llm-hub-db-kanban-column${dropCol === value ? " is-drop-target" : ""}`}
    >
      <div className="llm-hub-db-kanban-column-header">
        <span>{label}</span>
        <span className="llm-hub-db-kanban-column-count">{cardsInCol.length}</span>
      </div>
      <div className="llm-hub-db-kanban-cards">
        {cardsInCol.map((card) => (
          <div
            key={card.path}
            className={`llm-hub-db-kanban-card${drag?.card.path === card.path ? " is-dragging" : ""}${landed === card.path ? " is-landed" : ""}${dropTarget?.path === card.path && dropTarget.position === "before" ? " is-drop-before" : ""}${dropTarget?.path === card.path && dropTarget.position === "after" ? " is-drop-after" : ""}`}
            data-kanban-card-path={card.path}
            data-kanban-column={value}
            onPointerDown={(e) => onCardPointerDown(e, card)}
            title={t("dashboard.kanbanDragToMove")}
          >
            <div className="llm-hub-db-kanban-card-title">{card.title}</div>
            {card.fields.map((f) => (
              <div className="llm-hub-db-kanban-card-field" key={f.name}>
                <span className="llm-hub-db-kanban-card-field-name">{f.name}</span>
                <span className="llm-hub-db-kanban-card-field-value">{f.value}</span>
              </div>
            ))}
            {card.path !== card.title && (
              <div className="llm-hub-db-kanban-card-meta">{card.path}</div>
            )}
          </div>
        ))}
        {cardsInCol.length === 0 && (
          <div className="llm-hub-db-kanban-column-empty" />
        )}
      </div>
    </div>
  );

  const allColumns = showUnspecified && (unspecified.length > 0 || uniqueColumns.length === 0)
    ? [...uniqueColumns.map((c) => ({ value: c.value, label: c.label, cards: grouped.get(c.value) ?? [] })), { value: UNSPECIFIED, label: t("dashboard.kanbanUnspecified"), cards: unspecified }]
    : uniqueColumns.map((c) => ({ value: c.value, label: c.label, cards: grouped.get(c.value) ?? [] }));

  return (
    <div className="llm-hub-db-kanban-wrap">
      <div className="llm-hub-db-kanban-header">
        {boardTitle && <span className="llm-hub-db-kanban-board-title">{boardTitle}</span>}
        <button
          type="button"
          className="llm-hub-db-kanban-new"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            openNewCard();
          }}
          title={t("dashboard.kanbanNewCard")}
        >
          <Plus size={13} />
          <span>{t("dashboard.kanbanNewCard")}</span>
        </button>
      </div>
      {allColumns.length === 0 ? (
        <div className="llm-hub-db-kanban-empty">{t("dashboard.kanbanEmpty")}</div>
      ) : (
        <div className="llm-hub-db-kanban">
          {allColumns.map((col) => renderColumn(col.value, col.label, col.cards))}
        </div>
      )}
      {drag && (
        <div
          className="llm-hub-db-kanban-ghost"
          style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY }}
        >
          <div className="llm-hub-db-kanban-card-title">{drag.card.title}</div>
        </div>
      )}
    </div>
  );
}
