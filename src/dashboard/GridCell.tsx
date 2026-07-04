import { useRef, useState, useEffect, useCallback } from "react";
import { GripVertical, Maximize2, Minimize2, Settings } from "lucide-react";
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
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
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
  isMaximized,
  onToggleMaximize,
}: GridCellProps) {
  const [interactionMode, setInteractionMode] = useState<InteractionMode>(null);
  const [transform, setTransform] = useState<{ dx: number; dy: number } | null>(null);
  const [resizePreview, setResizePreview] = useState<{ width: number; height: number } | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const pointerRef = useRef<{ id: number; target: HTMLElement } | null>(null);
  const [snapPreview, setSnapPreview] = useState<LayoutPos | null>(null);

  const isActive = interactionMode !== null;
  const layoutHandlesEnabled = !isMaximized && !(widget.type === "file" && (widget.config as { memoPanelOpen?: unknown }).memoPanelOpen === true);

  // A single effect keyed on `interactionMode` so listeners are added once per
  // interaction, not re-bound on every pointermove frame.
  useEffect(() => {
    if (interactionMode === null) return;

    const compute = interactionMode === "drag" ? computeDragPos : computeResizePos;
    const clearInteraction = () => {
      const pointer = pointerRef.current;
      if (pointer?.target.hasPointerCapture?.(pointer.id)) {
        pointer.target.releasePointerCapture(pointer.id);
      }
      pointerRef.current = null;
      setInteractionMode(null);
      setTransform(null);
      setResizePreview(null);
      setSnapPreview(null);
      startRef.current = null;
    };

    const onMove = (e: PointerEvent) => {
      if (!startRef.current) return;
      if (pointerRef.current && e.pointerId !== pointerRef.current.id) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (interactionMode === "drag") {
        setTransform({ dx, dy });
      } else if (cellW > 0 && cellH > 0) {
        const nextPos = compute(widget.id, dx, dy);
        setResizePreview({
          width: nextPos.w * cellW + (nextPos.w - 1) * grid.gap,
          height: nextPos.h * cellH + (nextPos.h - 1) * grid.gap,
        });
      }
      if (cellW > 0 && cellH > 0) {
        setSnapPreview(compute(widget.id, dx, dy));
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!startRef.current) return;
      if (pointerRef.current && e.pointerId !== pointerRef.current.id) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      const finalPos = compute(widget.id, dx, dy);
      if (interactionMode === "drag") {
        onDragEnd(finalPos);
      } else {
        onResizeEnd(finalPos);
      }
      clearInteraction();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", clearInteraction);
    window.addEventListener("blur", clearInteraction);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", clearInteraction);
      window.removeEventListener("blur", clearInteraction);
    };
  }, [interactionMode, cellW, cellH, computeDragPos, computeResizePos, onDragEnd, onResizeEnd, widget.id, pos, grid]);

  const handleDragPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      pointerRef.current = { id: e.pointerId, target };
      startRef.current = { x: e.clientX, y: e.clientY };
      setInteractionMode("drag");
      setTransform({ dx: 0, dy: 0 });
      onDragStart?.();
    },
    [onDragStart],
  );

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      pointerRef.current = { id: e.pointerId, target };
      startRef.current = { x: e.clientX, y: e.clientY };
      setInteractionMode("resize");
      setTransform(null);
      if (cellW > 0 && cellH > 0) {
        setResizePreview({
          width: pos.w * cellW + (pos.w - 1) * grid.gap,
          height: pos.h * cellH + (pos.h - 1) * grid.gap,
        });
      }
    },
    [cellW, cellH, pos, grid.gap],
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
        className={`llm-hub-db-cell${editMode ? " is-edit" : ""}${isActive ? " is-active" : ""}${isMaximized ? " is-maximized" : ""}`}
        data-widget-type={widget.type}
        style={{
          gridColumn: `${pos.x + 1} / span ${pos.w}`,
          gridRow: `${pos.y + 1} / span ${pos.h}`,
          transform: transformStyle,
          width: resizePreview ? `${resizePreview.width}px` : undefined,
          height: resizePreview ? `${resizePreview.height}px` : undefined,
          touchAction: interactionMode ? "none" : undefined,
        }}
      >
        <div className="llm-hub-db-cell-content">
          <WidgetRenderer widget={widget} ctx={ctx} />
        </div>

        {layoutHandlesEnabled && (
          <div
            onPointerDown={handleDragPointerDown}
            className="llm-hub-db-drag"
            style={{ touchAction: "none" }}
            title={t("dashboard.dragToMove")}
          >
            <GripVertical size={14} />
          </div>
        )}

        <div className="llm-hub-db-actions">
            {onToggleMaximize && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMaximize();
                }}
                className="llm-hub-db-iconbtn"
                title={isMaximized ? t("dashboard.restoreWidget") : t("dashboard.maximizeWidget")}
              >
                {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              </button>
            )}
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
        </div>

        {layoutHandlesEnabled && (
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
