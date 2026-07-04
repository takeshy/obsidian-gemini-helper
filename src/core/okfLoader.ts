import { parseYaml, type App } from "obsidian";
import { BUILTIN_OKF_BUNDLE_ID, BUILTIN_OKF_BUNDLE_NAME, BUILTIN_OKF_DOCUMENTS } from "./builtinOkf";
import { getNodeFs, isAbsolutePath, normalizePathSeparators } from "./pathAccess";

interface OkfDocument {
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

const MAX_DOCS_PER_BUNDLE = 24;
const MAX_BODY_CHARS = 1400;
const OKF_SYSTEM_PROMPT_INTRO = "The following Open Knowledge Format (OKF) knowledge bundles are active. Treat them as curated domain context. Prefer their definitions, relationships, and documented procedures when answering domain questions. If a relevant concept may exist but is not included below, use vault tools or semantic search when available before guessing.";

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

/** A ref belongs to a bundle when it lives in that bundle's directory subtree. */
function refInBundle(refPath: string, bundleId: string): boolean {
  return bundleId === "" ? true : refPath === bundleId || refPath.startsWith(`${bundleId}/`);
}

/**
 * Discover OKF bundles under `root`. A bundle is any directory that directly
 * contains an `index.md`; its display name comes from that file's `title`.
 */
export async function discoverOkfBundles(app: App, root: string): Promise<OkfBundle[]> {
  const refs = await listMarkdown(app, root);
  const bundles: OkfBundle[] = [];
  for (const ref of refs) {
    if (!isIndexFile(ref.path)) continue;
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
    body: body.trim().replace(/\s+/g, " ").slice(0, MAX_BODY_CHARS),
  };
}

function formatOkfBundleSection(bundleName: string, docs: readonly OkfDocument[]): string {
  const lines = docs.map(doc => {
    const tags = doc.tags.length > 0 ? ` tags=${doc.tags.join(",")}` : "";
    const description = doc.description ? ` - ${doc.description}` : "";
    const body = doc.body ? `\n  Excerpt: ${doc.body}` : "";
    return `- [${doc.type}] ${doc.title} (${doc.path})${tags}${description}${body}`;
  });
  return `\n## OKF bundle: ${bundleName}\n${lines.join("\n")}`;
}

/** Build the bundled product knowledge prompt shipped with Gemini Helper. */
export function buildBuiltinOkfSystemPrompt(): string {
  const docs = BUILTIN_OKF_DOCUMENTS.map(doc => ({
    ...doc,
    path: `gemini-helper-help/${doc.path}`,
    body: doc.body.trim().replace(/\s+/g, " ").slice(0, MAX_BODY_CHARS),
  }));
  return `\n\n${OKF_SYSTEM_PROMPT_INTRO}\n${formatOkfBundleSection(`${BUILTIN_OKF_BUNDLE_NAME} (${BUILTIN_OKF_BUNDLE_ID})`, docs)}`;
}

/**
 * Build a system prompt fragment for the selected OKF bundles under `root`.
 * Only documents belonging to a selected bundle are included.
 */
export async function buildOkfSystemPrompt(app: App, root: string, selectedBundleIds: string[]): Promise<string> {
  if (selectedBundleIds.length === 0) return "";

  const sections: string[] = [
    OKF_SYSTEM_PROMPT_INTRO,
  ];

  let refs: MarkdownRef[];
  try {
    refs = await listMarkdown(app, root);
  } catch (e) {
    return `\n\n${sections[0]}\n\nFailed to load OKF bundles from ${root}: ${e instanceof Error ? e.message : String(e)}`;
  }

  const usableRefs = refs.filter(ref => !isLogFile(ref.path));

  for (const bundleId of selectedBundleIds) {
    const bundleRefs = usableRefs.filter(ref => refInBundle(ref.path, bundleId)).slice(0, MAX_DOCS_PER_BUNDLE);
    if (bundleRefs.length === 0) continue;

    const docs: OkfDocument[] = [];
    for (const ref of bundleRefs) {
      docs.push(toDocument(ref.path, await ref.read()));
    }
    sections.push(formatOkfBundleSection(bundleId || rootBasename(root), docs));
  }

  return `\n\n${sections.join("\n")}`;
}
