import { parseYaml, type App } from "obsidian";
import type { KnowledgeSource } from "src/types";
import { getNodeFs, isAbsolutePath, normalizePathSeparators } from "./pathAccess";

interface OkfDocument {
  path: string;
  title: string;
  type: string;
  description: string;
  tags: string[];
  body: string;
}

const MAX_DOCS_PER_SOURCE = 24;
const MAX_BODY_CHARS = 1400;

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
  path: string;
  read: () => Promise<string>;
}

function listVaultMarkdown(app: App, root: string): MarkdownRef[] {
  const normalizedRoot = normalizePathSeparators(root).replace(/^\/+|\/+$/g, "");
  return app.vault.getMarkdownFiles()
    .filter(file => file.path === normalizedRoot || file.path.startsWith(`${normalizedRoot}/`))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(file => ({ path: file.path, read: () => app.vault.cachedRead(file) }));
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

function isLogFile(path: string): boolean {
  return path === "log.md" || path.endsWith("/log.md");
}

async function loadOkfDocuments(app: App, source: KnowledgeSource): Promise<OkfDocument[]> {
  const refs = isAbsolutePath(source.path)
    ? await listExternalMarkdown(source.path)
    : listVaultMarkdown(app, source.path);

  // Cap the number of files before reading content so large bundles stay bounded.
  const selected = refs.filter(ref => !isLogFile(ref.path)).slice(0, MAX_DOCS_PER_SOURCE);

  const docs: OkfDocument[] = [];
  for (const ref of selected) {
    const { frontmatter, body } = parseFrontmatter(await ref.read());
    docs.push({
      path: ref.path,
      title: asString(frontmatter.title) || ref.path.replace(/\.md$/i, ""),
      type: asString(frontmatter.type) || (ref.path.endsWith("index.md") ? "Index" : "Concept"),
      description: asString(frontmatter.description),
      tags: asTags(frontmatter.tags),
      body: body.trim().replace(/\s+/g, " ").slice(0, MAX_BODY_CHARS),
    });
  }
  return docs;
}

export async function buildOkfSystemPrompt(app: App, sources: KnowledgeSource[]): Promise<string> {
  const activeSources = sources.filter(source => source.enabled);
  if (activeSources.length === 0) return "";

  const sections: string[] = [
    "The following Open Knowledge Format (OKF) knowledge bundles are active. Treat them as curated domain context. Prefer their definitions, relationships, and documented procedures when answering domain questions. If a relevant concept may exist but is not included below, use vault tools or semantic search when available before guessing.",
  ];

  for (const source of activeSources) {
    try {
      const docs = await loadOkfDocuments(app, source);
      const lines = docs.map(doc => {
        const tags = doc.tags.length > 0 ? ` tags=${doc.tags.join(",")}` : "";
        const description = doc.description ? ` - ${doc.description}` : "";
        const body = doc.body ? `\n  Excerpt: ${doc.body}` : "";
        return `- [${doc.type}] ${doc.title} (${doc.path})${tags}${description}${body}`;
      });
      sections.push(`\n## OKF: ${source.name}\nSource path: ${source.path}\n${lines.join("\n")}`);
    } catch (e) {
      sections.push(`\n## OKF: ${source.name}\nSource path: ${source.path}\nFailed to load this OKF bundle: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return `\n\n${sections.join("\n")}`;
}
