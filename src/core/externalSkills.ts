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

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

interface GitHubRepoRef {
  owner: string;
  repo: string;
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function isUnsafePath(path: string): boolean {
  const normalized = normalizePathSeparators(path);
  return isAbsolutePath(normalized) || normalized.split("/").some(part => part === "." || part === "..");
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

function parseSemver(version: string): ParsedSemver | null {
  const match = version.trim().match(SEMVER_RE);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;

  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const a = left[i];
    const b = right[i];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;

    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) return Number.parseInt(a, 10) - Number.parseInt(b, 10);
    if (aNumeric) return -1;
    if (bNumeric) return 1;
    return a.localeCompare(b);
  }

  return 0;
}

export function compareVersions(a: string, b: string): number | null {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) return null;

  const majorDiff = left.major - right.major;
  if (majorDiff !== 0) return majorDiff;
  const minorDiff = left.minor - right.minor;
  if (minorDiff !== 0) return minorDiff;
  const patchDiff = left.patch - right.patch;
  if (patchDiff !== 0) return patchDiff;
  return comparePrerelease(left.prerelease, right.prerelease);
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
    const minVersionComparison = entry.minVersion ? compareVersions(pluginVersion, entry.minVersion) : 0;
    if (minVersionComparison === null || minVersionComparison < 0) return false;
    const maxVersionComparison = entry.maxVersion ? compareVersions(pluginVersion, entry.maxVersion) : 0;
    if (maxVersionComparison === null || maxVersionComparison > 0) return false;
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
    const relativePath = normalizePathSeparators(file.relativePath);
    const parts = relativePath.split("/").filter(Boolean);
    if (parts.length < 2) continue;
    const skillId = parts[0];
    if (!grouped.has(skillId)) grouped.set(skillId, []);
    grouped.get(skillId)!.push({ ...file, relativePath });
  }
  return grouped;
}

function isSafeSkillId(skillId: string): boolean {
  return skillId.length > 0 && !skillId.includes("/") && !skillId.includes("\\") && !isUnsafePath(skillId);
}

function hasRequiredSkillFile(skillId: string, files: SourceFile[]): boolean {
  return files.some(file => file.relativePath === `${skillId}/SKILL.md`);
}

export function getSafeSkillTargetPath(skillId: string, relativePath: string): string | null {
  if (!isSafeSkillId(skillId) || isUnsafePath(relativePath)) return null;

  const normalizedRelativePath = normalizePathSeparators(relativePath).replace(/^\/+/, "");
  const expectedPrefix = `${skillId}/`;
  if (!normalizedRelativePath.startsWith(expectedPrefix)) return null;

  const targetPath = normalizePathSeparators(`${SKILLS_FOLDER}/${normalizedRelativePath}`);
  const expectedTargetPrefix = `${SKILLS_FOLDER}/${skillId}/`;
  if (!targetPath.startsWith(expectedTargetPrefix)) return null;
  return targetPath;
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
    if (!isSafeSkillId(skillId)) {
      skipped.push({ id: skillId, reason: "invalid skill id" });
      continue;
    }

    const skillFiles = grouped.get(skillId);
    if (!skillFiles || skillFiles.length === 0) {
      skipped.push({ id: skillId, reason: "not found" });
      continue;
    }
    if (!hasRequiredSkillFile(skillId, skillFiles)) {
      skipped.push({ id: skillId, reason: "SKILL.md not found" });
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
    if (sourceManifest?.version && !parseSemver(sourceManifest.version)) {
      skipped.push({ id: skillId, reason: `invalid source version: ${sourceManifest.version}` });
      continue;
    }

    const installedManifest = await getInstalledManifest(app, skillId);
    if (sourceManifest?.version && installedManifest?.version) {
      const versionComparison = compareVersions(sourceManifest.version, installedManifest.version);
      if (versionComparison === null) {
        skipped.push({
          id: skillId,
          reason: "invalid manifest version",
        });
        continue;
      }
      if (versionComparison <= 0) {
        skipped.push({
          id: skillId,
          reason: `installed version ${installedManifest.version} is current`,
        });
        continue;
      }
    }

    const filesToWrite: Array<{ file: SourceFile; targetPath: string }> = [];
    for (const file of skillFiles) {
      const targetPath = getSafeSkillTargetPath(skillId, file.relativePath);
      if (!targetPath) {
        skipped.push({ id: skillId, reason: `unsafe path: ${file.relativePath}` });
        filesToWrite.length = 0;
        break;
      }
      filesToWrite.push({ file, targetPath });
    }
    if (filesToWrite.length === 0) continue;

    for (const { file, targetPath } of filesToWrite) {
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
