import { useState, useEffect } from "react";
import { BREAKPOINT_THRESHOLD, type Breakpoint } from "./types";

/**
 * Returns the current breakpoint based on container width.
 * Uses ResizeObserver to track the container element's width. Returns null until
 * the container width is measured (avoids the "container width 0" first-render
 * problem).
 */
export function useBreakpoint(
  containerRef: React.RefObject<HTMLElement | null>,
): { breakpoint: Breakpoint | null; width: number } {
  const [breakpoint, setBreakpoint] = useState<Breakpoint | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = (w: number) => {
      setWidth(w);
      setBreakpoint(w < BREAKPOINT_THRESHOLD ? "sm" : "lg");
    };

    measure(el.clientWidth);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) measure(w);
      }
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [containerRef]);

  return { breakpoint, width };
}
