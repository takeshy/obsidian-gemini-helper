import type { LayoutPos, Widget } from "./types";

export type EqualizeDirection = "horizontal" | "vertical";

const MIN_TILE_ROWS = 2;

export function buildEqualizedLayout(
  widgets: Widget[],
  direction: EqualizeDirection,
  cols: number,
  targetRows: number,
): Widget[] {
  const count = widgets.length;
  if (count === 0) return widgets;

  const primarySlots = Math.min(3, count);
  const groups = Array.from({ length: primarySlots }, () => [] as Widget[]);
  widgets.forEach((widget, index) => {
    groups[index % primarySlots].push(widget);
  });
  const maxGroupSize = Math.max(...groups.map((group) => group.length));

  const layouts = new Map<string, LayoutPos>();
  groups.forEach((group, primaryIndex) => {
    if (direction === "vertical") {
      const rowH = Math.max(MIN_TILE_ROWS, Math.floor(targetRows / primarySlots));
      const slotWidth = Math.max(1, Math.floor(cols / group.length));
      group.forEach((widget, groupIndex) => {
        const x = groupIndex * slotWidth;
        const w = groupIndex === group.length - 1 ? cols - x : slotWidth;
        layouts.set(widget.id, { x, y: primaryIndex * rowH, w, h: rowH });
      });
      return;
    }

    const tileH = Math.max(MIN_TILE_ROWS, Math.floor(targetRows / maxGroupSize));
    const slotWidth = Math.max(1, Math.floor(cols / primarySlots));
    const x = primaryIndex * slotWidth;
    const w = primaryIndex === primarySlots - 1 ? cols - x : slotWidth;
    group.forEach((widget, groupIndex) => {
      layouts.set(widget.id, {
        x,
        y: groupIndex * tileH,
        w,
        h: group.length === 1 ? maxGroupSize * tileH : tileH,
      });
    });
  });

  return widgets.map((widget) => {
    const pos = layouts.get(widget.id);
    return pos ? { ...widget, layout: { lg: pos } } : widget;
  });
}
