export interface SecretManagerConfig {
  /** Empty means every .encrypted file in the vault. */
  folder?: string;
}

export interface SecretPathItem {
  id: string;
  path: string;
}

export type SecretPathRow =
  | { kind: "file"; item: SecretPathItem }
  | { kind: "group"; folderPath: string; items: SecretPathItem[]; children: SecretPathRow[] };

function sortDirectoriesFirst(rows: SecretPathRow[]): void {
  rows.sort((a, b) => {
    if (a.kind === b.kind) return 0;
    return a.kind === "group" ? -1 : 1;
  });

  for (const row of rows) {
    if (row.kind === "group") sortDirectoriesFirst(row.children);
  }
}

function dirnameOf(path: string): string | null {
  const index = path.lastIndexOf("/");
  return index < 0 ? null : path.slice(0, index);
}

function ancestorsOf(path: string): string[] {
  const result: string[] = [];
  for (let folder = dirnameOf(path); folder !== null; folder = dirnameOf(folder)) result.unshift(folder);
  return result;
}

/** Preserve the directory tree for every secret, including singleton folders. */
export function groupSecretPaths(items: SecretPathItem[]): SecretPathRow[] {
  const rows: SecretPathRow[] = [];
  const groups = new Map<string, Extract<SecretPathRow, { kind: "group" }>>();
  for (const item of items) {
    const folders = ancestorsOf(item.path);
    if (folders.length === 0) {
      rows.push({ kind: "file", item });
      continue;
    }
    let container = rows;
    for (const folder of folders) {
      let group = groups.get(folder);
      if (!group) {
        group = { kind: "group", folderPath: folder, items: [], children: [] };
        groups.set(folder, group);
        container.push(group);
      }
      group.items.push(item);
      container = group.children;
    }
    container.push({ kind: "file", item });
  }
  sortDirectoriesFirst(rows);
  return rows;
}

export function normalizeSecretFolder(folder: string): string {
  return folder.replace(/\\/g, "/").split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

export function secretFilePath(folder: string, inputName: string): string {
  const rawName = inputName.trim().replace(/\.encrypted$/i, "");
  const name = rawName.replace(/[\\/:*?"<>|#[\]\n\r\t]+/g, "-")
    .replace(/\s+/g, " ").replace(/-+/g, "-").replace(/^[ .-]+|[ .-]+$/g, "").slice(0, 120);
  if (!name) throw new Error("Invalid secret name");
  const normalizedFolder = normalizeSecretFolder(folder);
  return `${normalizedFolder ? `${normalizedFolder}/` : ""}${name}.encrypted`;
}

export function matchesSecretSearch(
  name: string,
  description: string,
  query: string,
  publicMetadata: Record<string, string> = {},
): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  const metadataText = Object.entries(publicMetadata).flat().join("\n");
  return `${name}\n${description}\n${metadataText}`.toLocaleLowerCase().includes(normalized);
}
