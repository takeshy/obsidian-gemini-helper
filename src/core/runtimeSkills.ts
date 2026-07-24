import type { LoadedSkill, SkillMetadata } from "./skillsLoader";

export const RUNTIME_SKILL_PREFIX = "runtime-skill:";
export const REGISTER_RUNTIME_SKILL_EVENT = "ai-skill-registry:register";
export const UNREGISTER_RUNTIME_SKILL_EVENT = "ai-skill-registry:unregister";
export const REQUEST_RUNTIME_SKILLS_EVENT = "ai-skill-registry:request";

export interface AgentSkillContribution {
  protocolVersion: 1;
  ownerId: string;
  id: string;
  name: string;
  description: string;
  instructions: string;
  references?: string[];
  dependencies?: string[];
  revision: string;
}

const contributions = new Map<string, AgentSkillContribution>();
const key = (ownerId: string, id: string): string => `${ownerId}/${id}`;
export const isRuntimeSkillPath = (path: string): boolean => path.startsWith(RUNTIME_SKILL_PREFIX);
export const runtimeSkillPath = (ownerId: string, id: string): string => `${RUNTIME_SKILL_PREFIX}${key(ownerId, id)}`;

export function registerRuntimeSkill(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const skill = value as Partial<AgentSkillContribution>;
  if (skill.protocolVersion !== 1 || !skill.ownerId || !skill.id || !skill.name
    || typeof skill.description !== "string" || !skill.instructions || !skill.revision) return false;
  const skillKey = key(skill.ownerId, skill.id);
  const previous = contributions.get(skillKey);
  contributions.set(skillKey, skill as AgentSkillContribution);
  return previous?.revision !== skill.revision;
}

export function unregisterRuntimeSkill(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const target = value as { ownerId?: string; id?: string };
  return Boolean(target.ownerId && target.id && contributions.delete(key(target.ownerId, target.id)));
}

export function getRuntimeSkillMetadata(): SkillMetadata[] {
  return [...contributions.values()].map((skill) => {
    const folderPath = runtimeSkillPath(skill.ownerId, skill.id);
    return { name: skill.name, description: skill.description, folderPath, skillFilePath: `${folderPath}/SKILL.md`, workflows: [] };
  });
}

export function loadRuntimeSkill(path: string): (LoadedSkill & { dependencies: string[] }) | null {
  const skill = isRuntimeSkillPath(path) ? contributions.get(path.slice(RUNTIME_SKILL_PREFIX.length)) : undefined;
  if (!skill) return null;
  return {
    name: skill.name, description: skill.description, folderPath: path,
    skillFilePath: `${path}/SKILL.md`, workflows: [], instructions: skill.instructions,
    references: skill.references ?? [], dependencies: skill.dependencies ?? [],
  };
}
