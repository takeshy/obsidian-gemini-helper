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

async function listVaultMarkdown(app: App, root: string): Promise<Array<{ path: string; content: string }>> {
  const normalizedRoot = normalizePathSeparators(root).replace(/^\/+|\/+$/g, "");
  const files = app.vault.getMarkdownFiles()
    .filter(file => file.path === normalizedRoot || file.path.startsWith(`${normalizedRoot}/`))
    .sort((a, b) => a.path.localeCompare(b.path));

  const docs: Array<{ path: string; content: string }> = [];
  for (const file of files) {
    docs.push({ path: file.path, content: await app.vault.cachedRead(file) });
  }
  return docs;
}

async function listExternalMarkdown(root: string): Promise<Array<{ path: string; content: string }>> {
  const fs = getNodeFs();
  if (!fs) throw new Error("External OKF directories are only available on desktop Obsidian.");
  const fsApi = fs;
  const docs: Array<{ path: string; content: string }> = [];
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
        docs.push({ path: rel, content: await fsApi.promises.readFile(fullPath, "utf8") });
      }
    }
  }

  await walk(rootPath);
  return docs;
}

async function loadOkfDocuments(app: App, source: KnowledgeSource): Promise<OkfDocument[]> {
  const rawDocs = isAbsolutePath(source.path)
    ? await listExternalMarkdown(source.path)
    : await listVaultMarkdown(app, source.path);

  return rawDocs
    .filter(doc => !doc.path.endsWith("/log.md"))
    .map(doc => {
      const { frontmatter, body } = parseFrontmatter(doc.content);
      return {
        path: doc.path,
        title: asString(frontmatter.title) || doc.path.replace(/\.md$/i, ""),
        type: asString(frontmatter.type) || (doc.path.endsWith("index.md") ? "Index" : "Concept"),
        description: asString(frontmatter.description),
        tags: asTags(frontmatter.tags),
        body: body.trim().replace(/\s+/g, " ").slice(0, MAX_BODY_CHARS),
      };
    });
}

export async function buildOkfSystemPrompt(app: App, sources: KnowledgeSource[]): Promise<string> {
  const activeSources = sources.filter(source => source.enabled);
  if (activeSources.length === 0) return "";

  const sections: string[] = [
    "The following Open Knowledge Format (OKF) knowledge bundles are active. Treat them as curated domain context. Prefer their definitions, relationships, and documented procedures when answering domain questions. If a relevant concept may exist but is not included below, use vault tools or semantic search when available before guessing.",
  ];

  for (const source of activeSources) {
    try {
      const docs = (await loadOkfDocuments(app, source)).slice(0, MAX_DOCS_PER_SOURCE);
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
