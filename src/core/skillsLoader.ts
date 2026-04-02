import { type App, TFile, TFolder, parseYaml } from "obsidian";
import { parseWorkflowFromMarkdown } from "src/workflow/parser";
import { SKILLS_FOLDER } from "src/types";
import { getBuiltinSkillMetadata, isBuiltinSkillPath, loadBuiltinSkill } from "./builtinSkills";

export interface SkillWorkflowRef {
  path: string;            // relative path from skill folder (e.g. "workflows/lint.md")
  name?: string;           // workflow name within the file (if multiple)
  description: string;     // description for function calling tool
  inputVariables?: string[]; // variables used but not initialized by any node
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
 * Discover all skills: built-in skills + vault skills.
 * Each subfolder containing a SKILL.md is treated as a skill.
 */
export async function discoverSkills(app: App): Promise<SkillMetadata[]> {
  // Start with built-in skills
  const skills: SkillMetadata[] = [...getBuiltinSkillMetadata()];

  const folder = app.vault.getAbstractFileByPath(SKILLS_FOLDER);
  if (!(folder instanceof TFolder)) return skills;

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
 * Handles both built-in skills and vault-installed skills.
 */
export async function loadSkill(app: App, metadata: SkillMetadata): Promise<LoadedSkill> {
  // Handle built-in skills (no vault read needed)
  if (isBuiltinSkillPath(metadata.folderPath)) {
    const builtin = loadBuiltinSkill(metadata.folderPath);
    if (builtin) return builtin;
    return { ...metadata, instructions: "", references: [] };
  }

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

  // Extract input variables from workflow files
  for (const wf of metadata.workflows) {
    const wfPath = `${metadata.folderPath}/${wf.path}`;
    const wfFile = app.vault.getAbstractFileByPath(wfPath);
    if (wfFile instanceof TFile) {
      try {
        const wfContent = await app.vault.cachedRead(wfFile);
        wf.inputVariables = extractInputVariables(wfContent, wf.name);
      } catch {
        // Skip unreadable workflow files
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
        if (wf.inputVariables && wf.inputVariables.length > 0) {
          section += `\n  Input variables: ${wf.inputVariables.join(", ")}`;
        }
      }
    }
    return section;
  });

  const hasWorkflows = skills.some(s => s.workflows.length > 0);

  let preamble = `\n\nThe following agent skills are active. Proactively use the skill's instructions and workflows to fulfill the user's request.\nWhen a workflow lists "Input variables", pass them via the variables parameter as a JSON object. Infer values from the user's message when possible. If a required variable cannot be inferred, ask the user before calling the workflow.`;

  if (hasWorkflows) {
    preamble += `

## Skill Workflow Execution Protocol

When you need to run **multiple workflows in sequence** (e.g. creating several files), follow this loop:

1. **Plan** — List the workflows you intend to run and their order.
2. **Create** — Execute one workflow at a time. Check each result (especially \`savedFiles\`) before proceeding to the next.
3. **Verify** — After all workflows complete, read back modified files to confirm correctness. Fix and re-run if needed.

For a **single, explicit workflow request** (slash command, direct user instruction), execute it immediately — do not ask for confirmation first.`;
  }

  return `${preamble}\n\n${parts.join("\n\n---\n\n")}`;
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
 * Extract input variables from a workflow file.
 * Input variables are {{variables}} used in node properties but not initialized
 * by any node (via saveTo, variable/set name, etc.) and not system variables.
 */
function extractInputVariables(workflowContent: string, workflowName?: string): string[] {
  let workflow;
  try {
    workflow = parseWorkflowFromMarkdown(workflowContent, workflowName);
  } catch {
    return [];
  }

  const varPattern = /\{\{(\w[\w.[\]]*?)(?::json)?\}\}/g;
  const usedVars = new Set<string>();
  const initializedVars = new Set<string>();

  const saveProperties = [
    "saveTo", "saveFileTo", "savePathTo", "saveStatus",
    "saveImageTo", "saveSelectionTo", "saveUiTo",
  ];

  for (const [, node] of workflow.nodes) {
    // variable/set nodes initialize the variable named in 'name'
    if ((node.type === "variable" || node.type === "set") && node.properties.name) {
      initializedVars.add(node.properties.name);
    }

    // Save properties initialize variables
    for (const prop of saveProperties) {
      if (node.properties[prop]) {
        initializedVars.add(node.properties[prop]);
      }
    }

    // Scan all property values for {{variable}} references
    for (const value of Object.values(node.properties)) {
      let match;
      varPattern.lastIndex = 0;
      while ((match = varPattern.exec(String(value))) !== null) {
        const rootVar = match[1].split(/[.[\]]/)[0];
        if (rootVar) usedVars.add(rootVar);
      }
    }
  }

  // System variables injected by the runtime
  // Include legacy __var__ forms for backward compatibility
  const systemVars = new Set([
    "_hotkeyContent", "_hotkeySelection", "_hotkeyActiveFile", "_hotkeySelectionInfo",
    "_eventType", "_eventFilePath", "_eventFile", "_eventOldPath", "_eventFileContent",
    "_workflowName", "_lastModel", "_date", "_time", "_datetime",
    "_clipboard",
    // Legacy __var__ forms (kept for backward compatibility with existing workflows)
    "__hotkeyContent__", "__hotkeySelection__", "__hotkeyActiveFile__", "__hotkeySelectionInfo__",
    "__eventType__", "__eventFilePath__", "__eventFile__", "__eventOldPath__", "__eventFileContent__",
    "__workflowName__", "__lastModel__", "__date__", "__time__", "__datetime__",
  ]);

  const inputVars: string[] = [];
  for (const v of usedVars) {
    if (!initializedVars.has(v) && !systemVars.has(v)) {
      inputVars.push(v);
    }
  }

  return inputVars.sort();
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
