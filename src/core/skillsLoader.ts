import { type App, TFile, TFolder, parseYaml, stringifyYaml } from "obsidian";
import { SKILLS_FOLDER } from "src/types";
import { getBuiltinSkillMetadata, isBuiltinSkillPath, loadBuiltinSkill } from "./builtinSkills";

export interface SkillWorkflowRef {
  path: string;              // relative path from skill folder (e.g. "workflows/lint.md")
  description: string;       // description for function calling tool
  inputVariables?: string[]; // declared by skill author in SKILL.md capabilities block
}

export interface SkillMetadata {
  name: string;
  description: string;
  folderPath: string;      // e.g. "GeminiHelper/skills/code-review"
  skillFilePath: string;   // e.g. "GeminiHelper/skills/code-review/SKILL.md"
  workflows: SkillWorkflowRef[];  // workflow references from SKILL.md
}

export interface LoadedSkill extends SkillMetadata {
  instructions: string;    // markdown body (after frontmatter)
  references: string[];    // contents of files in references/
}

// Per-session dedup so legacy-format warnings don't spam on every chat mount.
const WARNED_SKILL_PATHS = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (WARNED_SKILL_PATHS.has(key)) return;
  WARNED_SKILL_PATHS.add(key);
  console.warn(message);
}

const SKILL_CAPABILITIES_FENCE_TAG = "skill-capabilities";
// Accept both `\n` and `\r\n` line endings so SKILL.md files authored on
// Windows still resolve their capabilities block (parseFrontmatter already
// tolerates CRLF; this needs to match).
const CAPABILITIES_FENCE_RE = new RegExp(
  `^\`\`\`${SKILL_CAPABILITIES_FENCE_TAG}[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n\`\`\`[ \\t]*$`,
  "m",
);

/**
 * Extract the embedded `skill-capabilities` YAML fence from SKILL.md's body.
 * The fence is the single source of truth for a skill's workflow definitions;
 * frontmatter holds only user-facing metadata (name, description). Returns
 * null when the block is absent or not valid YAML. When `warnContext` is
 * provided (a stable key like the skill file path), YAML parse errors are
 * logged once per context so a typo in the fenced block is visible to the
 * author instead of being silently ignored.
 */
export function extractCapabilitiesBlock(
  body: string,
  warnContext?: string,
): Record<string, unknown> | null {
  const match = body.match(CAPABILITIES_FENCE_RE);
  if (!match) return null;
  try {
    const parsed = parseYaml(match[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch (e) {
    if (warnContext) {
      warnOnce(
        `capabilities-parse:${warnContext}`,
        `[skills] ${warnContext}: failed to parse \`skill-capabilities\` YAML block — ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return null;
}

/**
 * Replace (or insert) the ```skill-capabilities fenced YAML block inside a
 * SKILL.md body, preserving any prose around it. When no existing block is
 * found the new one is prepended so the LLM sees capabilities before the
 * instructions prose.
 */
export function upsertCapabilitiesBlock(body: string, capabilities: Record<string, unknown>): string {
  const yamlContent = stringifyYaml(capabilities).trimEnd();
  const newBlock = `\`\`\`${SKILL_CAPABILITIES_FENCE_TAG}\n${yamlContent}\n\`\`\``;
  if (CAPABILITIES_FENCE_RE.test(body)) {
    return body.replace(CAPABILITIES_FENCE_RE, newBlock);
  }
  const trimmed = body.replace(/^\s+/, "");
  return trimmed ? `${newBlock}\n\n${trimmed}` : `${newBlock}\n`;
}

/** Serialize a SKILL.md file from frontmatter + body. */
export function writeSkillMd(frontmatter: Record<string, unknown>, body: string): string {
  return `---\n${stringifyYaml(frontmatter).trimEnd()}\n---\n\n${body.replace(/^\s+/, "")}`;
}

/**
 * Discover all skills: built-in skills + vault skills.
 *
 * For vault skills the single source of truth is the `skill-capabilities`
 * fenced YAML block inside SKILL.md. Frontmatter carries only user-facing
 * metadata (name, description). If a skill still declares `workflows:` in
 * frontmatter (legacy format), it is accepted for backward compatibility with
 * a one-time console warning suggesting migration.
 *
 * Expected layout:
 * ```markdown
 * ---
 * name: my-skill
 * description: ...
 * ---
 *
 * ```skill-capabilities
 * workflows:
 *   - path: workflows/do-x.md
 *     description: ...
 *     inputVariables: [filePath, mode]
 * ```
 *
 * <prose body>
 * ```
 */
export async function discoverSkills(app: App): Promise<SkillMetadata[]> {
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
      const { frontmatter, body } = parseFrontmatter(content);
      const skillLabel = (frontmatter.name as string) || child.name;

      let capabilities = extractCapabilitiesBlock(body, skillFilePath);
      if (!capabilities && Array.isArray(frontmatter.workflows)) {
        warnOnce(skillFilePath, `[skills] ${skillLabel}: declares workflows in frontmatter — please migrate to a \`\`\`skill-capabilities fenced block in SKILL.md body. Falling back to the frontmatter declaration for now.`);
        capabilities = { workflows: frontmatter.workflows };
      }

      const workflows: SkillWorkflowRef[] = [];
      const rawWorkflows = (capabilities?.workflows ?? []) as Array<Record<string, unknown>>;
      if (Array.isArray(rawWorkflows)) {
        for (const wf of rawWorkflows) {
          if (!wf || typeof wf.path !== "string") {
            console.warn(`[skills] ${skillLabel}: workflow entry missing "path" — skipped.`);
            continue;
          }
          const wfFile = app.vault.getAbstractFileByPath(`${child.path}/${wf.path}`);
          if (!(wfFile instanceof TFile)) {
            console.warn(`[skills] ${skillLabel}: workflow file not found at "${wf.path}".`);
          }
          const inputVariables = Array.isArray(wf.inputVariables)
            ? (wf.inputVariables as unknown[]).filter((v): v is string => typeof v === "string")
            : undefined;
          if (inputVariables === undefined) {
            console.warn(`[skills] ${skillLabel}: workflow "${wf.path}" has no "inputVariables" declared — the LLM will not know what to pass.`);
          }
          workflows.push({
            path: wf.path,
            description: typeof wf.description === "string" ? wf.description : wf.path,
            inputVariables,
          });
        }
      }

      skills.push({
        name: skillLabel,
        description: (frontmatter.description as string) || "",
        folderPath: child.path,
        skillFilePath,
        workflows,
      });
    } catch (e) {
      console.warn(`[skills] failed to load ${skillFilePath}:`, e);
    }
  }

  return skills;
}

/**
 * Load a skill's content. Built-in skills return their full in-memory body
 * and references. Vault skills are returned in "lightweight" form (empty
 * instructions/references) because `buildSkillSystemPrompt` expects the chat
 * LLM to load SKILL.md on demand via `read_note`; reading every SKILL.md,
 * references/*, and workflows/* file up front would be wasted I/O on the
 * per-message hot path.
 */
export function loadSkill(_app: App, metadata: SkillMetadata): LoadedSkill {
  if (isBuiltinSkillPath(metadata.folderPath)) {
    const builtin = loadBuiltinSkill(metadata.folderPath);
    if (builtin) return builtin;
  }
  return { ...metadata, instructions: "", references: [] };
}

/**
 * Build a system prompt section from loaded skills.
 *
 * Built-in skills are inlined in full (instructions, references, workflow
 * listings) because they are always-on and their bodies ship with the plugin.
 * Vault skills only contribute their name + description; their workflow list,
 * input variables, and full instructions live in SKILL.md and the LLM fetches
 * them via the `read_note` tool when it needs them.
 */
export function buildSkillSystemPrompt(skills: LoadedSkill[]): string {
  if (skills.length === 0) return "";
  let sawLazyVaultSkill = false;

  const parts = skills.map(skill => {
    const isBuiltin = isBuiltinSkillPath(skill.folderPath);

    let section = `## Skill: ${skill.name}`;
    if (isBuiltin) {
      section += `\n\n${skill.instructions}`;
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
    }

    // Vault skill — minimal section. Everything (workflow IDs, descriptions,
    // inputVariables, instructions, references) lives in SKILL.md and is
    // discovered by the LLM when it reads the file. The LLM cannot construct
    // a correct `run_skill_workflow` call without reading SKILL.md first —
    // both the IDs and the required inputVariables live in the embedded
    // `skill-capabilities` block there.
    if (skill.description) {
      section += `\n\n${skill.description}`;
    }
    sawLazyVaultSkill = true;
    section += `\n\nWorkflow IDs, their input variables, and full instructions all live in SKILL.md at \`${skill.skillFilePath}\`. Call \`read_note\` on that path before invoking this skill's tools.`;
    return section;
  });

  const header = [
    "The following agent skills are active. Proactively use each skill's instructions and workflows to fulfill the user's request.",
  ];
  if (sawLazyVaultSkill) {
    header.push("Vault skills show only their name and description here — their workflow list, input variables, and full instructions live in SKILL.md. Call `read_note` on the skill's SKILL.md path before invoking any of its tools. Built-in skills are fully inlined above.");
  }
  header.push("Pass any required input variables to a workflow via the `variables` parameter as a JSON object. Infer values from the user's message when possible. If a required variable cannot be inferred, ask the user before calling the workflow.");

  const hasWorkflows = skills.some(s => s.workflows.length > 0);
  let preamble = `\n\n${header.join("\n")}`;
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
 * Build a stable workflow tool ID from skill name and workflow path.
 * Each SKILL.md capability entry now points at exactly one workflow file, so
 * the path alone is a unique identifier within a skill.
 */
function buildWorkflowToolId(skillName: string, wf: SkillWorkflowRef): string {
  const base = wf.path.replace(/\.md$/, "").replace(/\//g, "_");
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
export function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
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
