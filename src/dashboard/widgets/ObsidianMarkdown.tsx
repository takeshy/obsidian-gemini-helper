import { useEffect, useRef } from "react";
import { Component, MarkdownRenderer, type App } from "obsidian";

/**
 * Render arbitrary Obsidian markdown (including `![[embeds]]` such as `.base`
 * views and note embeds) into a managed container. A fresh `Component` owns the
 * render's child lifecycles and is unloaded on unmount / re-render.
 */
export default function ObsidianMarkdown({
  app,
  markdown,
  sourcePath,
  className,
  onInternalLinkClick,
}: {
  app: App;
  markdown: string;
  sourcePath: string;
  className?: string;
  onInternalLinkClick?: (href: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = "";
    const component = new Component();
    component.load();
    void MarkdownRenderer.render(app, markdown, el, sourcePath, component).then(() => {
      if (!onInternalLinkClick) return;
      el.querySelectorAll("a.internal-link").forEach((link) => {
        link.addEventListener("click", (e) => {
          e.preventDefault();
          const href = link.getAttribute("href");
          if (href) onInternalLinkClick(href);
        });
      });
    });
    return () => {
      component.unload();
      el.innerHTML = "";
    };
  }, [app, markdown, sourcePath, onInternalLinkClick]);

  return <div ref={ref} className={className} />;
}
