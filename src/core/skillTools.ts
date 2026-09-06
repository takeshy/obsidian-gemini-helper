// The skill tool schemas live in the shared library. This host has no
// `[READ_SKILL: name]` marker handler, so its copies point the model at
// read_note as the only way to reach a vault skill's SKILL.md.
import { createSkillWorkflowTool } from "obsidian-llm-hub-common/skills";

export { SKILL_WORKFLOW_TOOL_NAME } from "obsidian-llm-hub-common/skills";

export const skillWorkflowTool = createSkillWorkflowTool({ readSkillMarker: false });
