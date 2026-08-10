import { normalizePath, parseYaml, type App } from "obsidian";
import type { AgentPluginInstall, McpServerConfig } from "src/types";

export const AGENT_PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
export const AGENT_PLUGIN_MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
export const AGENT_PLUGIN_ROOT = ".gemini-helper/agent-plugins";
export const AGENT_PLUGIN_DATA_ROOT = ".gemini-helper/agent-plugin-data";
const NAME = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const SKILL_NAME = /^(?!.*--)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

export interface AgentPluginManifest { $schema: string; name: string; version?: string; description?: string }
export interface AgentPluginSkill { name: string; description: string; path: string; content: string; pluginName: string }
export interface AgentPluginPreview { manifest: AgentPluginManifest; repo: string; version: string; sourceType: "release" | "branch"; sourceRef: string; commitSha: string; skills: AgentPluginSkill[]; mcpServers: McpServerConfig[]; warnings: string[]; files: Record<string, ArrayBuffer>; executables: string[] }

function safePath(path: string): boolean {
  return !!path && !path.startsWith("/") && !path.includes("\\") && path.split("/").every(part => !!part && part !== "." && part !== "..");
}
function text(bytes: ArrayBuffer): string { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }

export function parseAgentPluginManifest(value: string): AgentPluginManifest {
  let raw: unknown;
  try { raw = JSON.parse(value); } catch { throw new Error("plugin.json must be valid JSON"); }
  if (!record(raw) || raw.$schema !== AGENT_PLUGIN_SCHEMA || typeof raw.name !== "string" || raw.name.length > 64 || !NAME.test(raw.name)) throw new Error("plugin.json does not conform to Agent Plugins v1.0.0");
  for (const key of ["version", "description"]) if (raw[key] !== undefined && typeof raw[key] !== "string") throw new Error(`plugin.json: ${key} must be a string`);
  return raw as unknown as AgentPluginManifest;
}

export function parseAgentPluginSkill(path: string, content: string, pluginName: string): AgentPluginSkill {
  const folder = path.split("/")[1];
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error("missing YAML frontmatter");
  const frontmatter: unknown = parseYaml(match[1]);
  if (!record(frontmatter) || frontmatter.name !== folder || typeof frontmatter.name !== "string" || !SKILL_NAME.test(frontmatter.name) || typeof frontmatter.description !== "string" || !frontmatter.description || frontmatter.description.length > 1024) throw new Error("invalid Agent Skill name or description");
  return { name: frontmatter.name, description: frontmatter.description, path, content, pluginName };
}

export function parseAgentPluginMcp(value: string, pluginName: string): { servers: McpServerConfig[]; warnings: string[] } {
  let raw: unknown;
  try { raw = JSON.parse(value); } catch { throw new Error("mcp.json must be valid JSON"); }
  if (!record(raw) || raw.$schema !== AGENT_PLUGIN_MCP_SCHEMA || !record(raw.mcpServers)) throw new Error("mcp.json has an invalid v1.0.0 schema");
  const servers: McpServerConfig[] = [], warnings: string[] = [];
  for (const [serverName, item] of Object.entries(raw.mcpServers)) {
    const skip = (reason: string) => warnings.push(`MCP server ${serverName} was skipped: ${reason}`);
    if (!record(item) || item.type !== "streamable-http") { skip("only streamable-http is supported by Gemini Helper"); continue; }
    try {
      if (typeof item.url !== "string") throw new Error();
      const url = new URL(item.url);
      const loopback = url.hostname === "localhost" || url.hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
      if (url.username || url.password || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) throw new Error();
      if (item.headers !== undefined && (!record(item.headers) || Object.values(item.headers).some(v => typeof v !== "string"))) throw new Error();
      servers.push({ name: `${pluginName}.${serverName}`, url: item.url, headers: (item.headers ?? {}) as Record<string, string>, enabled: false, toolHints: [], agentPlugin: { pluginName, serverName } });
    } catch { skip("invalid streamable-http configuration"); }
  }
  return { servers, warnings };
}

async function github<T>(url: string, optional = false): Promise<T | null> {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(30_000) });
  if (optional && response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub request failed (${response.status})`);
  return await response.json() as T;
}
export function normalizeAgentPluginRepo(input: string): string | null {
  const match = input.trim().replace(/\.git$/, "").match(/^(?:https?:\/\/github\.com\/)?([A-Za-z0-9_-]+\/[A-Za-z0-9._-]+)\/?$/);
  return match?.[1] ?? null;
}

export async function previewAgentPlugin(input: string): Promise<AgentPluginPreview> {
  const repo = normalizeAgentPluginRepo(input);
  if (!repo) throw new Error("Use owner/repository or a GitHub URL.");
  const [release, repository] = await Promise.all([github<{ tag_name?: string }>(`https://api.github.com/repos/${repo}/releases/latest`, true), github<{ default_branch?: string }>(`https://api.github.com/repos/${repo}`)]);
  const sourceType = release?.tag_name ? "release" as const : "branch" as const;
  const sourceRef = release?.tag_name || repository?.default_branch || "main";
  const commit = await github<{ sha?: string }>(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(sourceRef)}`);
  if (!commit?.sha || !/^[0-9a-f]{40}$/i.test(commit.sha)) throw new Error("GitHub did not return a valid commit SHA.");
  const tree = await github<{ tree?: Array<{ path?: string; type?: string; mode?: string; size?: number }>; truncated?: boolean }>(`https://api.github.com/repos/${repo}/git/trees/${commit.sha}?recursive=1`);
  const entries = tree?.tree?.filter(v => v.type === "blob" && typeof v.path === "string") as Array<{ path: string; mode?: string; size?: number }> | undefined;
  if (!entries || tree?.truncated || entries.length > 1000 || new Set(entries.map(v => v.path)).size !== entries.length || entries.some(v => v.mode === "120000" || !safePath(v.path) || (v.size ?? 0) > 10 * 1024 * 1024) || entries.reduce((n, v) => n + (v.size ?? 0), 0) > 50 * 1024 * 1024) throw new Error("Package violates Agent Plugin path or size limits.");
  if (!entries.some(v => v.path === "plugin.json")) throw new Error("plugin.json is required at the repository root.");
  const pairs = await Promise.all(entries.map(async entry => {
    const path = entry.path.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(`https://raw.githubusercontent.com/${repo}/${commit.sha}/${path}`, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Failed to download ${entry.path}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 10 * 1024 * 1024) throw new Error(`Package file is too large: ${entry.path}`);
    return [entry.path, bytes] as const;
  }));
  if (pairs.reduce((total, [, bytes]) => total + bytes.byteLength, 0) > 50 * 1024 * 1024) throw new Error("Agent Plugin package exceeds 50 MiB.");
  const files = Object.fromEntries(pairs), manifest = parseAgentPluginManifest(text(files["plugin.json"]));
  const warnings: string[] = [], skills: AgentPluginSkill[] = [];
  for (const [path, bytes] of Object.entries(files)) if (/^skills\/[^/]+\/SKILL\.md$/.test(path)) try { skills.push(parseAgentPluginSkill(path, text(bytes), manifest.name)); } catch (error) { warnings.push(`${path} was skipped: ${String(error)}`); }
  const parsedMcp = files["mcp.json"] ? parseAgentPluginMcp(text(files["mcp.json"]), manifest.name) : { servers: [], warnings: [] };
  warnings.push(...parsedMcp.warnings);
  return { manifest, repo, version: manifest.version || sourceRef, sourceType, sourceRef, commitSha: commit.sha, skills, mcpServers: parsedMcp.servers, warnings, files, executables: entries.filter(v => v.mode === "100755").map(v => v.path) };
}

async function mkdirs(app: App, path: string): Promise<void> {
  const parts = normalizePath(path).split("/");
  for (let i = 1; i <= parts.length; i++) { const current = parts.slice(0, i).join("/"); if (!await app.vault.adapter.exists(current)) await app.vault.adapter.mkdir(current); }
}
export async function installAgentPlugin(app: App, preview: AgentPluginPreview): Promise<AgentPluginInstall> {
  const target = `${AGENT_PLUGIN_ROOT}/${preview.manifest.name}`, stage = `${AGENT_PLUGIN_ROOT}/.${preview.manifest.name}-stage-${Date.now()}`;
  await mkdirs(app, stage);
  try {
    for (const [path, bytes] of Object.entries(preview.files)) { if (!safePath(path)) throw new Error(`Unsafe plugin path: ${path}`); const full = `${stage}/${path}`; await mkdirs(app, full.slice(0, full.lastIndexOf("/"))); await app.vault.adapter.writeBinary(full, bytes); }
    const metadata: AgentPluginInstall = { name: preview.manifest.name, repo: preview.repo, version: preview.version, sourceType: preview.sourceType, sourceRef: preview.sourceRef, commitSha: preview.commitSha, enabled: true, skillNames: preview.skills.map(v => v.name), executables: preview.executables };
    await app.vault.adapter.write(`${stage}/install.json`, JSON.stringify(metadata, null, 2));
    if (await app.vault.adapter.exists(target)) await app.vault.adapter.rmdir(target, true);
    await app.vault.adapter.rename(stage, target); await mkdirs(app, `${AGENT_PLUGIN_DATA_ROOT}/${preview.manifest.name}`); return metadata;
  } catch (error) { if (await app.vault.adapter.exists(stage)) await app.vault.adapter.rmdir(stage, true); throw error; }
}
export async function uninstallAgentPlugin(app: App, name: string): Promise<void> { if (!NAME.test(name)) throw new Error("Invalid Agent Plugin name"); const path = `${AGENT_PLUGIN_ROOT}/${name}`; if (await app.vault.adapter.exists(path)) await app.vault.adapter.rmdir(path, true); }

export function resolveAgentPluginMcpServers(servers: McpServerConfig[], activeSkillPaths: string[], installs: AgentPluginInstall[]): McpServerConfig[] {
  const activePlugins = new Set<string>();
  for (const path of activeSkillPaths) { const match = path.split("\\").join("/").match(/^\.gemini-helper\/agent-plugins\/([^/]+)\/skills\/[^/]+$/); if (match) activePlugins.add(match[1]); }
  const enabled = new Set(installs.filter(item => item.enabled && activePlugins.has(item.name)).map(item => item.name));
  return servers.map(server => server.enabled || !server.agentPlugin || !enabled.has(server.agentPlugin.pluginName) || !Array.isArray(server.toolHints) ? server : { ...server, enabled: true });
}
