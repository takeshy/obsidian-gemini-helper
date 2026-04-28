import { TFile, type App } from "obsidian";

const TEXT_VAULT_EXTENSIONS = new Set([
  "base",
  "canvas",
  "css",
  "csv",
  "html",
  "js",
  "json",
  "md",
  "svg",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
]);

export function isVaultTextFile(file: TFile): boolean {
  return TEXT_VAULT_EXTENSIONS.has(file.extension.toLowerCase());
}

export function getVaultTextFiles(app: App): TFile[] {
  return app.vault.getFiles().filter(isVaultTextFile);
}

export function compareFileLookupPriority(a: TFile, b: TFile, preferMarkdown: boolean): number {
  if (preferMarkdown) {
    const aMarkdown = a.extension.toLowerCase() === "md";
    const bMarkdown = b.extension.toLowerCase() === "md";
    if (aMarkdown !== bMarkdown) return aMarkdown ? -1 : 1;
  }

  return a.path.length - b.path.length;
}

export function hasExplicitExtension(filePath: string): boolean {
  const normalized = filePath.trim().replace(/\/+$/, "");
  const lastSlash = normalized.lastIndexOf("/");
  const name = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  const lastDot = name.lastIndexOf(".");
  return lastDot > 0 && lastDot < name.length - 1;
}

export function ensureMarkdownExtensionIfMissing(filePath: string): string {
  return hasExplicitExtension(filePath) ? filePath : `${filePath}.md`;
}

export function getPathExtension(filePath: string): string {
  const normalized = filePath.trim().replace(/\/+$/, "");
  const lastSlash = normalized.lastIndexOf("/");
  const name = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === name.length - 1) return "";
  return name.slice(lastDot + 1).toLowerCase();
}

export function isMarkdownPath(filePath: string): boolean {
  return getPathExtension(filePath) === "md";
}

export function splitFileName(fileName: string): { stem: string; extension: string } {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) {
    return { stem: fileName, extension: "" };
  }

  return {
    stem: fileName.slice(0, lastDot),
    extension: fileName.slice(lastDot),
  };
}

export function normalizeLookupTerm(term: string): string {
  const trimmed = term.toLowerCase().trim();
  if (!trimmed) return trimmed;

  const lastSlash = trimmed.lastIndexOf("/");
  const dir = lastSlash >= 0 ? trimmed.slice(0, lastSlash + 1) : "";
  const name = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
  const { stem, extension } = splitFileName(name);

  if (TEXT_VAULT_EXTENSIONS.has(extension.replace(/^\./, ""))) {
    return `${dir}${stem}`;
  }

  return trimmed;
}
