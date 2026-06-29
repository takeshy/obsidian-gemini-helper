import type { App } from "obsidian";
import { SKILLS_FOLDER } from "src/types";
import { getNodeFs, getNodePath, isAbsolutePath, normalizePathSeparators } from "./pathAccess";

interface SourceFile {
  relativePath: string;
  content: string;
}

export interface ImportExternalSkillsResult {
  skillCount: number;
  fileCount: number;
  installed: string[];
  skipped: Array<{ id: string; reason: string }>;
}

interface PluginCompatibility {
  id?: string;
  minVersion?: string;
  maxVersion?: string;
}

interface SkillManifest {
  id?: string;
  name?: string;
  version?: string;
  compatibility?: {
    plugins?: PluginCompatibility[];
  };
  compatiblePlugins?: string[];
}

interface GitHubRepoRef {
  owner: string;
  repo: string;
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
  const normalized = normalizePathSeparators(folderPath).replace(/^\/+|\/+$/g, "");
  if (!normalized) return;
  if (await app.vault.adapter.exists(normalized)) return;
  const parent = normalized.split("/").slice(0, -1).join("/");
  if (parent) await ensureFolder(app, parent);
  await app.vault.createFolder(normalized);
}

async function readVaultTree(app: App, sourcePath: string): Promise<SourceFile[]> {
  const candidates = [
    normalizePathSeparators(`${sourcePath}/skills`).replace(/^\/+|\/+$/g, ""),
    normalizePathSeparators(sourcePath).replace(/^\/+|\/+$/g, ""),
  ];
  const root = (await app.vault.adapter.exists(candidates[0])) ? candidates[0] : candidates[1];
  if (!(await app.vault.adapter.exists(root))) {
    throw new Error(`Source path not found: ${sourcePath}`);
  }

  const files: SourceFile[] = [];
  async function walk(dir: string): Promise<void> {
    const listed = await app.vault.adapter.list(dir);
    for (const childDir of listed.folders.sort()) {
      await walk(childDir);
    }
    for (const filePath of listed.files.sort()) {
      const relativePath = normalizePathSeparators(filePath.slice(root.length).replace(/^[/\\]+/, ""));
      files.push({
        relativePath,
        content: await app.vault.adapter.read(filePath),
      });
    }
  }

  await walk(root);
  return files;
}

async function readExternalTree(sourcePath: string): Promise<SourceFile[]> {
  const fs = getNodeFs();
  const path = getNodePath();
  if (!fs || !path) throw new Error("External skills directories are only available on desktop Obsidian.");
  const fsApi = fs;
  const pathApi = path;

  const normalized = sourcePath.replace(/[\\/]+$/, "");
  const skillsPath = pathApi.join(normalized, "skills");
  const root = fsApi.existsSync(skillsPath) ? skillsPath : normalized;
  if (!fsApi.existsSync(root)) throw new Error(`Source path not found: ${sourcePath}`);

  const files: SourceFile[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fsApi.promises.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = pathApi.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        await walk(fullPath);
      } else if (entry.isFile()) {
        const relativePath = normalizePathSeparators(pathApi.relative(root, fullPath));
        files.push({
          relativePath,
          content: await fsApi.promises.readFile(fullPath, "utf8"),
        });
      }
    }
  }

  await walk(root);
  return files;
}

function parseGitHubRepo(input: string): GitHubRepoRef | null {
  const trimmed = input.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const shorthand = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shorthand) {
    return { owner: shorthand[1], repo: shorthand[2] };
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname !== "github.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

interface GitHubTreeItem {
  path?: string;
  type?: string;
}

async function readGitHubTree(repositoryUrl: string): Promise<SourceFile[]> {
  const repo = parseGitHubRepo(repositoryUrl);
  if (!repo) throw new Error(`Invalid GitHub repository: ${repositoryUrl}`);

  const repoResponse = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!repoResponse.ok) {
    throw new Error(`Failed to fetch GitHub repository: ${repoResponse.status} ${repoResponse.statusText}`);
  }
  const repoJson = await repoResponse.json() as { default_branch?: string };
  const defaultBranch = repoJson.default_branch || "main";

  const treeUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`;
  const treeResponse = await fetch(treeUrl, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!treeResponse.ok) {
    throw new Error(`Failed to fetch GitHub tree: ${treeResponse.status} ${treeResponse.statusText}`);
  }
  const treeJson = await treeResponse.json() as { tree?: GitHubTreeItem[]; truncated?: boolean };
  if (!Array.isArray(treeJson.tree)) {
    throw new Error("GitHub tree response did not include files.");
  }
  if (treeJson.truncated) {
    throw new Error("GitHub tree response was truncated. Use a smaller skills repository.");
  }

  const filePaths = treeJson.tree
    .filter(item => item.type === "blob" && typeof item.path === "string")
    .map(item => item.path!)
    .filter(path => path.startsWith("skills/") && path.split("/").length >= 3)
    .sort();

  const files: SourceFile[] = [];
  for (const filePath of filePaths) {
    const rawPath = filePath.split("/").map(encodeURIComponent).join("/");
    const rawUrl = `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${encodeURIComponent(defaultBranch)}/${rawPath}`;
    const rawResponse = await fetch(rawUrl);
    if (!rawResponse.ok) {
      throw new Error(`Failed to fetch ${filePath}: ${rawResponse.status} ${rawResponse.statusText}`);
    }
    files.push({
      relativePath: normalizePathSeparators(filePath.slice("skills/".length)),
      content: await rawResponse.text(),
    });
  }

  return files;
}

function parseVersion(version: string): number[] {
  return version
    .split(/[.-]/)
    .map(part => {
      const parsed = Number.parseInt(part, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    });
}

function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.length, right.length, 3);
  for (let i = 0; i < length; i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function parseManifest(content: string | undefined): SkillManifest | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as SkillManifest;
    }
  } catch {
    return null;
  }
  return null;
}

function isPluginCompatible(
  manifest: SkillManifest | null,
  pluginId: string,
  pluginVersion: string,
): boolean {
  if (!manifest) return true;

  const plugins = manifest.compatibility?.plugins;
  if (Array.isArray(plugins) && plugins.length > 0) {
    const entry = plugins.find(plugin => plugin.id === pluginId);
    if (!entry) return false;
    if (entry.minVersion && compareVersions(pluginVersion, entry.minVersion) < 0) return false;
    if (entry.maxVersion && compareVersions(pluginVersion, entry.maxVersion) > 0) return false;
    return true;
  }

  if (Array.isArray(manifest.compatiblePlugins) && manifest.compatiblePlugins.length > 0) {
    return manifest.compatiblePlugins.includes(pluginId);
  }

  return true;
}

function groupFilesBySkill(files: SourceFile[]): Map<string, SourceFile[]> {
  const grouped = new Map<string, SourceFile[]>();
  for (const file of files) {
    const parts = file.relativePath.split("/").filter(Boolean);
    if (parts.length < 2) continue;
    const skillId = parts[0];
    if (!grouped.has(skillId)) grouped.set(skillId, []);
    grouped.get(skillId)!.push(file);
  }
  return grouped;
}

async function getInstalledManifest(app: App, skillId: string): Promise<SkillManifest | null> {
  const path = `${SKILLS_FOLDER}/${skillId}/manifest.json`;
  if (!(await app.vault.adapter.exists(path))) return null;
  try {
    return parseManifest(await app.vault.adapter.read(path));
  } catch {
    return null;
  }
}

export async function importExternalSkills(
  app: App,
  sourcePath: string,
  skillIds: string[] = [],
  pluginId = "gemini-helper",
  pluginVersion = "0.0.0",
  repositoryUrl = "",
): Promise<ImportExternalSkillsResult> {
  const trimmedRepo = repositoryUrl.trim();
  const trimmed = sourcePath.trim();
  if (!trimmedRepo && !trimmed) throw new Error("Source path or GitHub repository is empty.");

  const files = trimmedRepo
    ? await readGitHubTree(trimmedRepo)
    : isAbsolutePath(trimmed)
      ? await readExternalTree(trimmed)
      : await readVaultTree(app, trimmed);

  const grouped = groupFilesBySkill(files);
  const requestedIds = skillIds.map(id => id.trim()).filter(Boolean);
  const targetIds = requestedIds.length > 0 ? requestedIds : [...grouped.keys()].sort();
  const installed: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  let written = 0;
  await ensureFolder(app, SKILLS_FOLDER);

  for (const skillId of targetIds) {
    const skillFiles = grouped.get(skillId);
    if (!skillFiles || skillFiles.length === 0) {
      skipped.push({ id: skillId, reason: "not found" });
      continue;
    }

    const sourceManifest = parseManifest(skillFiles.find(file => file.relativePath === `${skillId}/manifest.json`)?.content);
    if (sourceManifest?.id && sourceManifest.id !== skillId) {
      skipped.push({ id: skillId, reason: `manifest id mismatch: ${sourceManifest.id}` });
      continue;
    }
    if (!isPluginCompatible(sourceManifest, pluginId, pluginVersion)) {
      skipped.push({ id: skillId, reason: `not compatible with ${pluginId} ${pluginVersion}` });
      continue;
    }

    const installedManifest = await getInstalledManifest(app, skillId);
    if (sourceManifest?.version && installedManifest?.version) {
      if (compareVersions(sourceManifest.version, installedManifest.version) <= 0) {
        skipped.push({
          id: skillId,
          reason: `installed version ${installedManifest.version} is current`,
        });
        continue;
      }
    }

    for (const file of skillFiles) {
      const targetPath = normalizePathSeparators(`${SKILLS_FOLDER}/${file.relativePath}`);
      const parent = targetPath.split("/").slice(0, -1).join("/");
      if (parent) await ensureFolder(app, parent);

      if (await app.vault.adapter.exists(targetPath)) {
        await app.vault.adapter.write(targetPath, file.content);
      } else {
        await app.vault.create(targetPath, file.content);
      }
      written++;
    }
    installed.push(skillId);
  }

  return { skillCount: installed.length, fileCount: written, installed, skipped };
}
