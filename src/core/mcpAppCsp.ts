import type { McpAppUiResource } from "src/types";
import { requestUrl } from "obsidian";

function safeOrigins(values: string[] | undefined): string[] {
  return (values ?? []).filter(value => /^https:\/\/(?:\*\.)?[a-z0-9.-]+(?::\d+)?$/i.test(value) || /^wss:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value));
}

/** Build the deny-by-default policy required by MCP Apps from resource metadata. */
export function buildMcpAppCsp(resource: McpAppUiResource, inferredResourceDomains: string[] = []): string {
  const declared = resource._meta?.ui?.csp;
  const assets = [...new Set([...safeOrigins(declared?.resourceDomains ?? declared?.resource_domains), ...safeOrigins(inferredResourceDomains)])];
  const connections = safeOrigins(declared?.connectDomains ?? declared?.connect_domains);
  const frames = safeOrigins(declared?.frameDomains ?? declared?.frame_domains);
  const bases = safeOrigins(declared?.baseUriDomains ?? declared?.base_uri_domains);
  const assetSources = ["'self'", "data:", "blob:", ...assets].join(" ");
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' ${assetSources}`,
    `style-src 'unsafe-inline' ${assetSources}`,
    `img-src ${assetSources}`,
    `font-src ${assetSources}`,
    `media-src ${assetSources}`,
    "worker-src 'self' blob:",
    `connect-src ${connections.length ? connections.join(" ") : "'none'"}`,
    `frame-src ${frames.length ? frames.join(" ") : "'none'"}`,
    `base-uri ${bases.length ? ["'self'", ...bases].join(" ") : "'self'"}`,
    "form-action 'none'",
  ].join("; ");
}

/** Replace an app-provided policy with the host-enforced resource declaration. */
export function applyMcpAppCsp(html: string, resource: McpAppUiResource): string {
  const inferredOrigins: string[] = [];
  const externalAsset = /<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["'](https:\/\/[^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(externalAsset)) {
    try { inferredOrigins.push(new URL(match[1]).origin); } catch { /* invalid URL remains blocked */ }
  }
  // Remove every CSP meta regardless of attribute order or quoting. A CSP in
  // server HTML cannot be combined with the host policy because browsers
  // enforce both, producing a stricter and often broken intersection.
  let withoutCsp = html.replace(/<meta\b[\s\S]*?>/gi, tag => /content-security-policy/i.test(tag) ? "" : tag);
  // Also handle CSP markup whose angle brackets were HTML-escaped by an MCP
  // server before it was returned as a text resource.
  withoutCsp = withoutCsp.replace(/&lt;meta\b[\s\S]*?&gt;/gi, tag => /content-security-policy/i.test(tag) ? "" : tag);
  const rawPolicy = buildMcpAppCsp(resource, inferredOrigins);
  const policy = rawPolicy.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  if (/<head\b[^>]*>/i.test(withoutCsp)) return withoutCsp.replace(/<head\b[^>]*>/i, match => `${match}${meta}`);
  return `<!doctype html><html><head>${meta}</head><body>${withoutCsp}</body></html>`;
}

async function downloadAsset(url: string): Promise<string> {
  const response = await requestUrl({ url, method: "GET" });
  if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
  return response.text;
}

/** Inline explicitly referenced HTTPS scripts and styles. Obsidian's Electron
 * CSP is inherited by srcdoc and blob documents and cannot be relaxed by the
 * child, so declared remote assets must be materialized by the host. */
export async function inlineMcpAppAssets(
  html: string,
  loader: (url: string) => Promise<string> = downloadAsset,
): Promise<string> {
  const styles = [...html.matchAll(/<link\b([^>]*\brel\s*=\s*["']stylesheet["'][^>]*)>/gi)];
  for (const match of styles) {
    const href = match[1].match(/\bhref\s*=\s*["'](https:\/\/[^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      const css = await loader(href);
      html = html.replace(match[0], `<style data-mcp-app-source="${href.replace(/"/g, "&quot;")}">\n${css}\n</style>`);
    } catch (error) { console.warn(`[LLM Hub MCP Apps] Failed to inline stylesheet ${href}:`, error); }
  }
  const scripts = [...html.matchAll(/<script\b([^>]*\bsrc\s*=\s*["'](https:\/\/[^"']+)["'][^>]*)>\s*<\/script>/gi)];
  for (const match of scripts) {
    const url = match[2];
    try {
      const javascript = (await loader(url)).replace(/<\/script/gi, "<\\/script");
      html = html.replace(match[0], `<script data-mcp-app-source="${url.replace(/"/g, "&quot;")}">\n${javascript}\n</script>`);
    } catch (error) { console.warn(`[LLM Hub MCP Apps] Failed to inline script ${url}:`, error); }
  }
  return html;
}

export async function prepareMcpAppHtml(html: string, resource: McpAppUiResource): Promise<string> {
  return applyMcpAppCsp(await inlineMcpAppAssets(html), resource);
}
