import { beforeEach, describe, expect, it } from "vitest";
import { getRuntimeSkillMetadata, loadRuntimeSkill, registerRuntimeSkill, unregisterRuntimeSkill } from "./runtimeSkills";

const contribution = {
  protocolVersion: 1 as const,
  ownerId: "dashboard-hub",
  id: "dashboard",
  name: "dashboard",
  description: "Dashboard files",
  instructions: "Create a dashboard.",
  dependencies: ["obsidian-bases"],
  revision: "1.0.0",
};

beforeEach(() => { unregisterRuntimeSkill(contribution); });

describe("runtime skill registry contract", () => {
  it("registers, loads, and unregisters Dashboard Hub's skill", () => {
    expect(registerRuntimeSkill(contribution)).toBe(true);
    const [metadata] = getRuntimeSkillMetadata();
    expect(metadata.folderPath).toBe("runtime-skill:dashboard-hub/dashboard");
    expect(loadRuntimeSkill(metadata.folderPath)?.dependencies).toEqual(["obsidian-bases"]);
    expect(unregisterRuntimeSkill(contribution)).toBe(true);
    expect(getRuntimeSkillMetadata()).toHaveLength(0);
  });

  it("rejects an unsupported protocol", () => {
    expect(registerRuntimeSkill({ ...contribution, protocolVersion: 2 })).toBe(false);
  });
});
