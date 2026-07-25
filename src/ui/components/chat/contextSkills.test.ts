import { describe, expect, it } from "vitest";
import { resolveEffectiveSkillPaths } from "./contextSkills";

const MARKDOWN = "builtin:markdown";
const DASHBOARD = "runtime:dashboard";
const CANVAS = "builtin:canvas";
const CUSTOM = "custom:review";
const CONTEXT_SKILLS = new Set([MARKDOWN, DASHBOARD, CANVAS]);

describe("resolveEffectiveSkillPaths", () => {
	it("replaces the default context skill with the active file context", () => {
		expect(resolveEffectiveSkillPaths(
			[MARKDOWN, CUSTOM], DASHBOARD, new Set(), CONTEXT_SKILLS,
		)).toEqual([DASHBOARD, CUSTOM]);
	});

	it("keeps an automatically selected context skill disabled after removal", () => {
		expect(resolveEffectiveSkillPaths(
			[CUSTOM], DASHBOARD, new Set([DASHBOARD]), CONTEXT_SKILLS,
		)).toEqual([CUSTOM]);
	});

	it("allows an explicitly requested context skill for a single send", () => {
		expect(resolveEffectiveSkillPaths(
			[MARKDOWN, CUSTOM], DASHBOARD, new Set([DASHBOARD]), CONTEXT_SKILLS, CANVAS,
		)).toEqual([CUSTOM, CANVAS]);
	});
});
