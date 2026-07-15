import { parseYaml, type App } from "obsidian";
import { BUILTIN_OKF_BUNDLE_ID, BUILTIN_OKF_BUNDLE_NAME, BUILTIN_OKF_DOCUMENTS } from "./builtinOkf";
import { getNodeFs, isAbsolutePath, normalizePathSeparators } from "./pathAccess";

export interface OkfDocument {
  path: string;
  title: string;
  type: string;
  description: string;
  tags: readonly string[];
  body: string;
}

/** One selectable OKF bundle discovered under the configured root directory. */
export interface OkfBundle {
  /** Stable id: the bundle directory path relative to the root ("" for a root-level index.md). */
  id: string;
  /** Display name: index.md `title`, falling back to the bundle folder name. */
  name: string;
  /** True for the generated Gemini Helper help bundle shipped with the plugin. */
  builtin?: boolean;
}

const MAX_BODY_CHARS = 20_000;
const OKF_SYSTEM_PROMPT_INTRO = "The following Open Knowledge Format (OKF) knowledge bundles are active. Each bundle section below is only that bundle's index document (its table of contents) — not the full knowledge base. When the index alone doesn't give enough detail to answer, call the read_okf_document tool with the bundleId shown in the section heading and a document path referenced in that index (leading slashes are fine) to fetch that document's full content. Prefer these curated bundles' definitions, relationships, and documented procedures when answering domain questions. If relevant knowledge may exist outside these indexes, use vault tools or semantic search when available before guessing.";

export function getBuiltinOkfBundle(): OkfBundle {
  return {
    id: BUILTIN_OKF_BUNDLE_ID,
    name: BUILTIN_OKF_BUNDLE_NAME,
    builtin: true,
  };
}

export function isBuiltinOkfBundleId(id: string): boolean {
  return id === BUILTIN_OKF_BUNDLE_ID;
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  try {
    return {
      frontmatter: (parseYaml(match[1]) as Record<string, unknown>) || {},
      body: match[2],
    };
  } catch {
    return { frontmatter: {}, body: match[2] };
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map(item => item.trim()).filter(Boolean);
  }
  return [];
}

interface MarkdownRef {
  /** Path relative to the configured root, using "/" separators. */
  path: string;
  read: () => Promise<string>;
}

function rootBasename(root: string): string {
  return normalizePathSeparators(root).replace(/^\/+|\/+$/g, "").split("/").pop() || "OKF";
}

function listVaultMarkdown(app: App, root: string): MarkdownRef[] {
  const normalizedRoot = normalizePathSeparators(root).replace(/^\/+|\/+$/g, "");
  const prefix = normalizedRoot ? `${normalizedRoot}/` : "";
  return app.vault.getMarkdownFiles()
    .filter(file => normalizedRoot === "" || file.path === normalizedRoot || file.path.startsWith(prefix))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(file => ({ path: file.path.slice(prefix.length), read: () => app.vault.cachedRead(file) }));
}

async function listExternalMarkdown(root: string): Promise<MarkdownRef[]> {
  const fs = getNodeFs();
  if (!fs) throw new Error("External OKF directories are only available on desktop Obsidian.");
  const fsApi = fs;
  const refs: MarkdownRef[] = [];
  const rootPath = root.replace(/[\\/]+$/, "");

  async function walk(dir: string): Promise<void> {
    const entries = await fsApi.promises.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        const rel = normalizePathSeparators(fullPath.slice(rootPath.length).replace(/^[/\\]+/, ""));
        refs.push({ path: rel, read: () => fsApi.promises.readFile(fullPath, "utf8") });
      }
    }
  }

  await walk(rootPath);
  refs.sort((a, b) => a.path.localeCompare(b.path));
  return refs;
}

async function listMarkdown(app: App, root: string): Promise<MarkdownRef[]> {
  return isAbsolutePath(root) ? listExternalMarkdown(root) : listVaultMarkdown(app, root);
}

function isLogFile(path: string): boolean {
  return path === "log.md" || path.endsWith("/log.md");
}

function isIndexFile(path: string): boolean {
  return path.toLowerCase() === "index.md" || path.toLowerCase().endsWith("/index.md");
}

/** Directory of a ref relative to the root ("" for a file directly in the root). */
function dirOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

/**
 * Discover OKF bundles under `root`. A bundle is any directory that directly
 * contains an `index.md`; its display name comes from that file's `title`.
 */
export async function discoverOkfBundles(app: App, root: string): Promise<OkfBundle[]> {
  const refs = await listMarkdown(app, root);
  const indexRefs = refs.filter(ref => isIndexFile(ref.path));
  const bundleDirs = indexRefs.map(ref => dirOf(ref.path));
  // Nested index files are progressive-disclosure documents inside a bundle,
  // not independently selectable bundles.
  const topLevelIndexRefs = indexRefs.filter(ref => {
    const dir = dirOf(ref.path);
    return !bundleDirs.some(other => other !== dir && (other === "" || dir.startsWith(`${other}/`)));
  });
  const bundles: OkfBundle[] = [];
  for (const ref of topLevelIndexRefs) {
    const id = dirOf(ref.path);
    let name = id.split("/").pop() || rootBasename(root);
    try {
      const { frontmatter } = parseFrontmatter(await ref.read());
      const title = asString(frontmatter.title);
      if (title) name = title;
    } catch {
      // Keep the folder-name fallback if index.md cannot be read/parsed.
    }
    bundles.push({ id, name });
  }
  return bundles.sort((a, b) => a.name.localeCompare(b.name));
}

function toDocument(refPath: string, content: string): OkfDocument {
  const { frontmatter, body } = parseFrontmatter(content);
  return {
    path: refPath,
    title: asString(frontmatter.title) || refPath.replace(/\.md$/i, ""),
    type: asString(frontmatter.type) || (isIndexFile(refPath) ? "Index" : "Concept"),
    description: asString(frontmatter.description),
    tags: asTags(frontmatter.tags),
    body: body.trim().slice(0, MAX_BODY_CHARS),
  };
}

function formatIndexSection(bundleId: string, bundleName: string, index: OkfDocument): string {
  const description = index.description ? ` - ${index.description}` : "";
  return `\n## OKF bundle: ${bundleName} (bundleId=${bundleId})${description}\n${index.body}`;
}

/** Build the bundled product knowledge prompt shipped with Gemini Helper. */
export function buildBuiltinOkfSystemPrompt(): string {
  const index = BUILTIN_OKF_DOCUMENTS.find(doc => doc.path.toLowerCase() === "index.md");
  if (!index) return "";
  return `\n\n${OKF_SYSTEM_PROMPT_INTRO}\n${formatIndexSection(BUILTIN_OKF_BUNDLE_ID, BUILTIN_OKF_BUNDLE_NAME, index)}`;
}

/**
 * Build a system prompt fragment for the selected OKF bundles under `root`.
 * Only each selected bundle's index.md is included. Other documents are read
 * on demand with readOkfDocument().
 */
export async function buildOkfSystemPrompt(app: App, root: string, selectedBundleIds: string[]): Promise<string> {
  if (selectedBundleIds.length === 0) return "";

  const sections: string[] = [];

  let refs: MarkdownRef[];
  try {
    refs = await listMarkdown(app, root);
  } catch (e) {
    return `\n\n${OKF_SYSTEM_PROMPT_INTRO}\n\nFailed to load OKF bundles from ${root}: ${e instanceof Error ? e.message : String(e)}`;
  }

  for (const bundleId of selectedBundleIds) {
    const indexPath = bundleId ? `${bundleId}/index.md` : "index.md";
    const indexRef = refs.find(ref => ref.path.toLowerCase() === indexPath.toLowerCase());
    if (!indexRef) continue;
    const index = toDocument(indexRef.path, await indexRef.read());
    const name = index.title || bundleId.split("/").pop() || rootBasename(root);
    sections.push(formatIndexSection(bundleId, name, index));
  }

  return sections.length > 0 ? `\n\n${OKF_SYSTEM_PROMPT_INTRO}\n${sections.join("\n")}` : "";
}

function normalizeDocumentPath(path: string): string | null {
  const parts = normalizePathSeparators(path).replace(/^\/+|\/+$/g, "").split("/");
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") return null;
    normalized.push(part);
  }
  return normalized.join("/");
}

function documentPathCandidates(path: string): string[] {
  if (!path) return [];
  if (path.toLowerCase().endsWith(".md")) return [path];
  return [`${path}/index.md`, `${path}.md`];
}

/** Read one document from an active external or built-in OKF bundle. */
export async function readOkfDocument(
  app: App,
  root: string | null,
  bundleId: string,
  path: string,
): Promise<OkfDocument | null> {
  const cleanPath = normalizeDocumentPath(path);
  if (!cleanPath || isLogFile(cleanPath)) return null;

  if (isBuiltinOkfBundleId(bundleId)) {
    const doc = BUILTIN_OKF_DOCUMENTS.find(candidate =>
      documentPathCandidates(cleanPath).some(value => candidate.path.toLowerCase() === value.toLowerCase())
    );
    return doc ? { ...doc, body: doc.body.slice(0, MAX_BODY_CHARS) } : null;
  }

  if (root === null) return null;
  const cleanBundleId = normalizeDocumentPath(bundleId);
  if (bundleId && cleanBundleId === null) return null;
  const relativePath = cleanBundleId ? `${cleanBundleId}/${cleanPath}` : cleanPath;
  const refs = await listMarkdown(app, root);
  const ref = refs.find(candidate =>
    documentPathCandidates(relativePath).some(value => candidate.path.toLowerCase() === value.toLowerCase())
  );
  if (!ref || isLogFile(ref.path)) return null;
  return toDocument(ref.path, await ref.read());
}
