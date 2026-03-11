/**
 * Serialized Mermaid rendering queue.
 *
 * mermaid.render() uses global internal state, so concurrent calls can corrupt
 * each other. This utility ensures only one render runs at a time and retries
 * once on failure.
 */

import { loadMermaid } from "obsidian";

let queue: Promise<void> = Promise.resolve();

export interface MermaidRenderOptions {
  chart: string;
  isDark: boolean;
  useMaxWidth?: boolean;
}

export function enqueueMermaidRender(
  options: MermaidRenderOptions,
  isCancelled: () => boolean,
): Promise<string | null> {
  let resolve: (v: string | null) => void;
  let reject: (e: unknown) => void;
  const promise = new Promise<string | null>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  queue = queue.then(async () => {
    try {
      const result = await doRender(options, isCancelled, 0);
      resolve!(result);
    } catch (e) {
      reject!(e);
    }
  });

  return promise;
}

async function doRender(
  options: MermaidRenderOptions,
  isCancelled: () => boolean,
  attempt: number,
): Promise<string | null> {
  if (isCancelled() || !options.chart) return null;

  const id = `mermaid-${Date.now()}-${attempt}`;
  try {
    const mermaid = await loadMermaid();
    if (isCancelled()) return null;

    mermaid.initialize({
      startOnLoad: false,
      theme: options.isDark ? "dark" : "default",
      flowchart: {
        useMaxWidth: options.useMaxWidth ?? false,
        htmlLabels: true,
        curve: "basis",
        wrappingWidth: 400,
        padding: 20,
        nodeSpacing: 60,
        rankSpacing: 60,
      },
      securityLevel: "strict",
      suppressErrorRendering: true,
    });

    const { svg } = await mermaid.render(id, options.chart);
    if (isCancelled()) return null;
    return svg;
  } catch (e) {
    document.getElementById(id)?.remove();
    if (isCancelled()) return null;

    if (attempt < 1) {
      await new Promise((r) => setTimeout(r, 100));
      if (isCancelled()) return null;
      return doRender(options, isCancelled, attempt + 1);
    }
    throw e;
  }
}
