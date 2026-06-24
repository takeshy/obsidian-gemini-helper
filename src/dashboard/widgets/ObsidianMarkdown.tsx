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
}: {
  app: App;
  markdown: string;
  sourcePath: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = "";
    const component = new Component();
    component.load();
    void MarkdownRenderer.render(app, markdown, el, sourcePath, component);
    return () => {
      component.unload();
      el.innerHTML = "";
    };
  }, [app, markdown, sourcePath]);

  return <div ref={ref} className={className} />;
}
