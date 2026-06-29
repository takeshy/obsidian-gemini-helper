import type { App } from "obsidian";

export function isAbsolutePath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("\\\\");
}

export function normalizePathSeparators(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

export function getNodeFs(): typeof import("fs") | null {
  const requireFn = (window as unknown as { require?: NodeRequire }).require;
  if (!requireFn) return null;
  try {
    return requireFn("fs") as typeof import("fs");
  } catch {
    return null;
  }
}

export function getNodePath(): typeof import("path") | null {
  const requireFn = (window as unknown as { require?: NodeRequire }).require;
  if (!requireFn) return null;
  try {
    return requireFn("path") as typeof import("path");
  } catch {
    return null;
  }
}

export function getVaultBasePath(app: App): string | null {
  const adapter = app.vault.adapter as unknown as { basePath?: string };
  return typeof adapter.basePath === "string" ? adapter.basePath : null;
}
