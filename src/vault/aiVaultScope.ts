import type { TFile } from "obsidian";

export const AI_VAULT_SCOPE_DENIED_MSG =
  "Access denied: AI vault tools are limited to the configured allowed folders.";

export function normalizeAllowedVaultFolders(folders: string[] | undefined): string[] {
  return (folders ?? [])
    .map((folder) => normalizeVaultScopePath(folder))
    .filter((folder): folder is string => !!folder)
    .map((folder) => folder.toLowerCase());
}

export function normalizeVaultScopePath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed || trimmed.startsWith("/") || /^[A-Z]:/i.test(trimmed) || trimmed.includes("\\")) {
    return null;
  }

  const segments = trimmed
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }

  return segments.join("/");
}

export function isPathInAllowedVaultFolders(path: string, folders: string[] | undefined): boolean {
  const normalizedFolders = normalizeAllowedVaultFolders(folders);
  if ((folders?.length ?? 0) > 0 && normalizedFolders.length === 0) return false;
  if (normalizedFolders.length === 0) return true;

  const normalizedPath = normalizeVaultScopePath(path)?.toLowerCase();
  if (!normalizedPath) return false;

  return normalizedFolders.some((folder) => normalizedPath === folder || normalizedPath.startsWith(`${folder}/`));
}

export function isFileAllowedForAiVaultTools(file: TFile, folders: string[] | undefined): boolean {
  return isPathInAllowedVaultFolders(file.path, folders);
}
