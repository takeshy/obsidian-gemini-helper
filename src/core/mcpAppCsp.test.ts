import { describe, expect, it } from "vitest";
import { applyMcpAppCsp, buildMcpAppCsp, inlineMcpAppAssets } from "./mcpAppCsp";

describe("MCP App CSP", () => {
  const resource = { uri: "ui://map/app", mimeType: "text/html;profile=mcp-app", _meta: { ui: { csp: { resourceDomains: ["https://unpkg.com"], connectDomains: ["https://api.example.com"], frameDomains: ["javascript:alert(1)"] } } } };

  it("maps declared resource origins to static asset directives", () => {
    const csp = buildMcpAppCsp(resource);
    expect(csp).toContain("style-src 'unsafe-inline' 'self' data: blob: https://unpkg.com");
    expect(csp).toContain("connect-src https://api.example.com");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("frame-src 'none'");
  });

  it("replaces app-provided CSP with the host policy", () => {
    const html = applyMcpAppCsp('<html><head><meta content="style-src \'none\'" http-equiv="Content-Security-Policy"><link rel="stylesheet" href="https://cdn.example.net/app.css"><script src="https://cdn.example.net/app.js"></script></head><body>map</body></html>', resource);
    expect(html.match(/Content-Security-Policy/g)).toHaveLength(1);
    expect(html).toContain("https://unpkg.com");
    expect(html).not.toContain("style-src 'none'");
    expect(html).toContain("https://cdn.example.net");
  });

  it("removes CSP meta tags with nonstandard attributes and whitespace", () => {
    const html = applyMcpAppCsp(`<HTML><HEAD>
      <META data-owner="app" CONTENT='style-src https://fonts.googleapis.com' HTTP-EQUIV = 'content-security-policy' />
      <meta charset="utf-8">
      <link href="https://unpkg.com/maplibre-gl.css" rel="stylesheet">
    </HEAD><BODY></BODY></HTML>`, { uri: "ui://map", mimeType: "text/html" });
    expect(html.match(/content-security-policy/gi)).toHaveLength(1);
    expect(html).toContain("https://unpkg.com");
    expect(html).not.toContain("https://fonts.googleapis.com");
    expect(html).toContain('<meta charset="utf-8">');
  });

  it("removes HTML-escaped CSP meta markup", () => {
    const html = applyMcpAppCsp("<html><head>&lt;meta http-equiv='Content-Security-Policy' content=\"style-src https://fonts.googleapis.com\"&gt;<link href='https://unpkg.com/app.css'></head></html>", { uri: "ui://escaped", mimeType: "text/html" });
    expect(html.match(/content-security-policy/gi)).toHaveLength(1);
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).toContain("https://unpkg.com");
  });

  it("supports legacy snake-case CSP metadata", () => {
    expect(buildMcpAppCsp({ uri: "ui://legacy", mimeType: "text/html", _meta: { ui: { csp: { resource_domains: ["https://unpkg.com"] } } } })).toContain("https://unpkg.com");
  });

  it("inlines remote stylesheets and scripts for Electron CSP compatibility", async () => {
    const loaded: string[] = [];
    const html = await inlineMcpAppAssets('<link rel="stylesheet" href="https://unpkg.com/map.css"><script src="https://unpkg.com/map.js"></script>', async url => { loaded.push(url); return url.endsWith(".css") ? ".map{}" : "window.mapLoaded=true;"; });
    expect(loaded).toEqual(["https://unpkg.com/map.css", "https://unpkg.com/map.js"]);
    expect(html).toContain("<style data-mcp-app-source=");
    expect(html).toContain("window.mapLoaded=true;");
    expect(html).not.toContain('src="https://unpkg.com/map.js"');
  });
});
