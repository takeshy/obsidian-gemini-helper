import { useRef, useState, useEffect, useCallback } from "react";
import { GripVertical, Maximize2, Settings, Trash2 } from "lucide-react";
import { t } from "src/i18n";
import type { Widget, LayoutPos, GridLayout, WidgetContext } from "./types";
import WidgetRenderer from "./WidgetRenderer";

type InteractionMode = "drag" | "resize" | null;

interface GridCellProps {
  widget: Widget;
  pos: LayoutPos;
  grid: GridLayout;
  cellW: number;
  cellH: number;
  editMode: boolean;
  ctx: WidgetContext;
  onDragStart?: () => void;
  onDragEnd: (pos: LayoutPos) => void;
  onResizeEnd: (pos: LayoutPos) => void;
  computeDragPos: (widgetId: string, dxPx: number, dyPx: number) => LayoutPos;
  computeResizePos: (widgetId: string, dxPx: number, dyPx: number) => LayoutPos;
  onSettings?: () => void;
  onDelete?: () => void;
}

export default function GridCell({
  widget,
  pos,
  grid,
  cellW,
  cellH,
  editMode,
  ctx,
  onDragStart,
  onDragEnd,
  onResizeEnd,
  computeDragPos,
  computeResizePos,
  onSettings,
  onDelete,
}: GridCellProps) {
  const [interactionMode, setInteractionMode] = useState<InteractionMode>(null);
  const [transform, setTransform] = useState<{ dx: number; dy: number } | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [snapPreview, setSnapPreview] = useState<LayoutPos | null>(null);

  const isActive = interactionMode !== null;

  // A single effect keyed on `interactionMode` so listeners are added once per
  // interaction, not re-bound on every pointermove frame.
  useEffect(() => {
    if (interactionMode === null) return;

    const compute = interactionMode === "drag" ? computeDragPos : computeResizePos;

    const onMove = (e: PointerEvent) => {
      if (!startRef.current) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      setTransform({ dx, dy });
      if (cellW > 0 && cellH > 0) {
        setSnapPreview(compute(widget.id, dx, dy));
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!startRef.current) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      const finalPos = compute(widget.id, dx, dy);
      if (interactionMode === "drag") {
        onDragEnd(finalPos);
      } else {
        onResizeEnd(finalPos);
      }
      setInteractionMode(null);
      setTransform(null);
      setSnapPreview(null);
      startRef.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [interactionMode, cellW, cellH, computeDragPos, computeResizePos, onDragEnd, onResizeEnd, widget.id]);

  const handleDragPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!editMode) return;
      e.preventDefault();
      e.stopPropagation();
      startRef.current = { x: e.clientX, y: e.clientY };
      setInteractionMode("drag");
      setTransform({ dx: 0, dy: 0 });
      onDragStart?.();
    },
    [editMode, onDragStart],
  );

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!editMode) return;
      e.preventDefault();
      e.stopPropagation();
      startRef.current = { x: e.clientX, y: e.clientY };
      setInteractionMode("resize");
      setTransform({ dx: 0, dy: 0 });
    },
    [editMode],
  );

  const transformStyle = transform
    ? `translate(${transform.dx}px, ${transform.dy}px)`
    : undefined;

  return (
    <>
      {/* Snap preview outline (shown during drag/resize) */}
      {snapPreview && cellW > 0 && cellH > 0 && (
        <div
          className="llm-hub-db-snap"
          style={{
            left: snapPreview.x * (cellW + grid.gap),
            top: snapPreview.y * (cellH + grid.gap),
            width: snapPreview.w * cellW + (snapPreview.w - 1) * grid.gap,
            height: snapPreview.h * cellH + (snapPreview.h - 1) * grid.gap,
          }}
        />
      )}

      <div
        className={`llm-hub-db-cell${editMode ? " is-edit" : ""}${isActive ? " is-active" : ""}`}
        style={{
          gridColumn: `${pos.x + 1} / span ${pos.w}`,
          gridRow: `${pos.y + 1} / span ${pos.h}`,
          transform: transformStyle,
          touchAction: interactionMode ? "none" : undefined,
        }}
      >
        <div className="llm-hub-db-cell-content">
          <WidgetRenderer widget={widget} ctx={ctx} />
        </div>

        {editMode && (
          <div
            onPointerDown={handleDragPointerDown}
            className="llm-hub-db-drag"
            style={{ touchAction: "none" }}
            title={t("dashboard.dragToMove")}
          >
            <GripVertical size={14} />
          </div>
        )}

        {editMode && (
          <div className="llm-hub-db-actions">
            {onSettings && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onSettings();
                }}
                className="llm-hub-db-iconbtn"
                title={t("dashboard.settings")}
              >
                <Settings size={12} />
              </button>
            )}
            {onDelete && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="llm-hub-db-iconbtn is-danger"
                title={t("dashboard.deleteWidget")}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        )}

        {editMode && (
          <div
            onPointerDown={handleResizePointerDown}
            className="llm-hub-db-resize"
            style={{ touchAction: "none" }}
            title={t("dashboard.dragToResize")}
          >
            <Maximize2 size={12} />
          </div>
        )}
      </div>
    </>
  );
}
