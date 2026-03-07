import { type App, TFile, TFolder, parseYaml } from "obsidian";

export interface SkillWorkflowRef {
  path: string;            // relative path from skill folder (e.g. "workflows/lint.md")
  name?: string;           // workflow name within the file (if multiple)
  description: string;     // description for function calling tool
}

export interface SkillMetadata {
  name: string;
  description: string;
  folderPath: string;      // e.g. "GeminiHelper/skills/code-review"
  skillFilePath: string;   // e.g. "GeminiHelper/skills/code-review/SKILL.md"
  workflows: SkillWorkflowRef[];  // workflow references from frontmatter
}

export interface LoadedSkill extends SkillMetadata {
  instructions: string;    // markdown body (after frontmatter)
  references: string[];    // contents of files in references/
}

/**
 * Discover all skills in the skills folder.
 * Each subfolder containing a SKILL.md is treated as a skill.
 */
export async function discoverSkills(app: App, skillsFolderPath: string): Promise<SkillMetadata[]> {
  const folder = app.vault.getAbstractFileByPath(skillsFolderPath);
  if (!(folder instanceof TFolder)) return [];

  const skills: SkillMetadata[] = [];

  for (const child of folder.children) {
    if (!(child instanceof TFolder)) continue;

    const skillFilePath = `${child.path}/SKILL.md`;
    const skillFile = app.vault.getAbstractFileByPath(skillFilePath);
    if (!(skillFile instanceof TFile)) continue;

    try {
      const content = await app.vault.cachedRead(skillFile);
      const { frontmatter } = parseFrontmatter(content);

      // Parse workflow references from frontmatter
      const rawWorkflows = frontmatter.workflows as Array<Record<string, unknown>> | undefined;
      const workflows: SkillWorkflowRef[] = [];
      if (Array.isArray(rawWorkflows)) {
        for (const wf of rawWorkflows) {
          if (wf && typeof wf.path === "string") {
            workflows.push({
              path: wf.path,
              name: typeof wf.name === "string" ? wf.name : undefined,
              description: typeof wf.description === "string" ? wf.description : wf.path,
            });
          }
        }
      }

      // Auto-discover workflows/ directory
      const workflowsDirPath = `${child.path}/workflows`;
      const workflowsDir = app.vault.getAbstractFileByPath(workflowsDirPath);
      if (workflowsDir instanceof TFolder) {
        for (const wfChild of workflowsDir.children) {
          if (wfChild instanceof TFile && wfChild.extension === "md") {
            const relativePath = `workflows/${wfChild.name}`;
            // Skip if already declared in frontmatter
            if (!workflows.some(w => w.path === relativePath)) {
              workflows.push({
                path: relativePath,
                description: wfChild.basename,
              });
            }
          }
        }
      }

      skills.push({
        name: (frontmatter.name as string) || child.name,
        description: (frontmatter.description as string) || "",
        folderPath: child.path,
        skillFilePath,
        workflows,
      });
    } catch {
      // Skip unreadable skill files
    }
  }

  return skills;
}

/**
 * Load a skill's full content including references.
 */
export async function loadSkill(app: App, metadata: SkillMetadata): Promise<LoadedSkill> {
  const skillFile = app.vault.getAbstractFileByPath(metadata.skillFilePath);
  if (!(skillFile instanceof TFile)) {
    return { ...metadata, instructions: "", references: [] };
  }

  const content = await app.vault.cachedRead(skillFile);
  const { body } = parseFrontmatter(content);

  // Collect reference files
  const references: string[] = [];
  const refsPath = `${metadata.folderPath}/references`;
  const refsFolder = app.vault.getAbstractFileByPath(refsPath);

  if (refsFolder instanceof TFolder) {
    for (const child of refsFolder.children) {
      if (child instanceof TFile) {
        try {
          const refContent = await app.vault.cachedRead(child);
          references.push(`[${child.name}]\n${refContent}`);
        } catch {
          // Skip unreadable reference files
        }
      }
    }
  }

  return {
    ...metadata,
    instructions: body.trim(),
    references,
  };
}

/**
 * Build a system prompt section from loaded skills.
 */
export function buildSkillSystemPrompt(skills: LoadedSkill[]): string {
  if (skills.length === 0) return "";

  const parts = skills.map(skill => {
    let section = `## Skill: ${skill.name}\n\n${skill.instructions}`;
    if (skill.references.length > 0) {
      section += `\n\n### References\n\n${skill.references.join("\n\n")}`;
    }
    if (skill.workflows.length > 0) {
      section += `\n\n### Available Workflows\nUse the run_skill_workflow tool to execute these workflows:`;
      for (const wf of skill.workflows) {
        const id = buildWorkflowToolId(skill.name, wf);
        section += `\n- \`${id}\`: ${wf.description}`;
      }
    }
    return section;
  });

  return `\n\nThe following agent skills are active:\n\n${parts.join("\n\n---\n\n")}`;
}

/**
 * Build a stable workflow tool ID from skill name and workflow ref.
 */
function buildWorkflowToolId(skillName: string, wf: SkillWorkflowRef): string {
  const base = wf.name || wf.path.replace(/\.md$/, "").replace(/\//g, "_");
  return `${skillName}/${base}`;
}

/**
 * Collect all workflow references from loaded skills for tool registration.
 * Returns a map of workflowId -> { skill, workflow ref, absolute vault path }.
 */
export function collectSkillWorkflows(skills: LoadedSkill[]): Map<string, {
  skill: LoadedSkill;
  workflowRef: SkillWorkflowRef;
  vaultPath: string;
}> {
  const map = new Map<string, {
    skill: LoadedSkill;
    workflowRef: SkillWorkflowRef;
    vaultPath: string;
  }>();

  for (const skill of skills) {
    for (const wf of skill.workflows) {
      const id = buildWorkflowToolId(skill.name, wf);
      const vaultPath = `${skill.folderPath}/${wf.path}`;
      map.set(id, { skill, workflowRef: wf, vaultPath });
    }
  }

  return map;
}

/**
 * Parse YAML frontmatter from markdown content.
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  try {
    const frontmatter = (parseYaml(match[1]) as Record<string, unknown>) || {};
    return { frontmatter, body: match[2] };
  } catch {
    return { frontmatter: {}, body: match[2] };
  }
}
