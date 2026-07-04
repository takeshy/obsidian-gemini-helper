import { describe, expect, it } from "vitest";
import { buildEqualizedLayout } from "./equalizeLayout";
import type { Widget } from "./types";

function makeWidgets(count: number): Widget[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `w${i + 1}`,
    type: "file",
    layout: { lg: { x: 0, y: i, w: 6, h: 3 }, sm: { x: 0, y: i, w: 12, h: 3 } },
    config: {},
  }));
}

function lg(widgets: Widget[], id: string) {
  const pos = widgets.find((w) => w.id === id)?.layout.lg;
  if (!pos) throw new Error(`no lg layout for ${id}`);
  return pos;
}

describe("buildEqualizedLayout", () => {
  it("returns empty input as-is", () => {
    expect(buildEqualizedLayout([], "horizontal", 12, 12)).toEqual([]);
  });

  it("splits 3 widgets into 3 full-height columns", () => {
    const result = buildEqualizedLayout(makeWidgets(3), "horizontal", 12, 12);
    expect(lg(result, "w1")).toEqual({ x: 0, y: 0, w: 4, h: 12 });
    expect(lg(result, "w2")).toEqual({ x: 4, y: 0, w: 4, h: 12 });
    expect(lg(result, "w3")).toEqual({ x: 8, y: 0, w: 4, h: 12 });
  });

  it("stacks the 4th widget under the 1st in horizontal mode", () => {
    const result = buildEqualizedLayout(makeWidgets(4), "horizontal", 12, 12);
    expect(lg(result, "w1")).toEqual({ x: 0, y: 0, w: 4, h: 6 });
    expect(lg(result, "w4")).toEqual({ x: 0, y: 6, w: 4, h: 6 });
    expect(lg(result, "w2")).toEqual({ x: 4, y: 0, w: 4, h: 12 });
    expect(lg(result, "w3")).toEqual({ x: 8, y: 0, w: 4, h: 12 });
  });

  it("splits 3 widgets into 3 full-width rows in vertical mode", () => {
    const result = buildEqualizedLayout(makeWidgets(3), "vertical", 12, 12);
    expect(lg(result, "w1")).toEqual({ x: 0, y: 0, w: 12, h: 4 });
    expect(lg(result, "w2")).toEqual({ x: 0, y: 4, w: 12, h: 4 });
    expect(lg(result, "w3")).toEqual({ x: 0, y: 8, w: 12, h: 4 });
  });

  it("divides widths within rows in vertical mode", () => {
    const result = buildEqualizedLayout(makeWidgets(5), "vertical", 12, 12);
    expect(lg(result, "w1")).toEqual({ x: 0, y: 0, w: 6, h: 4 });
    expect(lg(result, "w4")).toEqual({ x: 6, y: 0, w: 6, h: 4 });
    expect(lg(result, "w2")).toEqual({ x: 0, y: 4, w: 6, h: 4 });
    expect(lg(result, "w5")).toEqual({ x: 6, y: 4, w: 6, h: 4 });
    expect(lg(result, "w3")).toEqual({ x: 0, y: 8, w: 12, h: 4 });
  });

  it("never drops tile height below 2 rows", () => {
    const result = buildEqualizedLayout(makeWidgets(9), "horizontal", 12, 3);
    expect(lg(result, "w1").h).toBe(2);
    expect(lg(result, "w4")).toEqual({ x: 0, y: 2, w: 4, h: 2 });
  });

  it("drops sm layout so it can be re-derived", () => {
    const result = buildEqualizedLayout(makeWidgets(2), "horizontal", 12, 12);
    for (const widget of result) {
      expect(widget.layout.sm).toBeUndefined();
      expect(widget.layout.lg).toBeDefined();
    }
  });
});
