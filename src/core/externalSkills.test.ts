import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { compareVersions, getSafeSkillTargetPath, importExternalSkills } from "./externalSkills";

function makeApp(files: Record<string, string>) {
  const folders = new Set<string>();
  const written: Record<string, string> = {};
  for (const filePath of Object.keys(files)) {
    const parts = filePath.split("/");
    for (let i = 1; i < parts.length; i++) {
      folders.add(parts.slice(0, i).join("/"));
    }
  }

  function directChildren(dir: string): { folders: string[]; files: string[] } {
    const prefix = dir ? `${dir}/` : "";
    const childFolders = new Set<string>();
    const childFiles: string[] = [];

    for (const folderPath of folders) {
      if (!folderPath.startsWith(prefix) || folderPath === dir) continue;
      const rest = folderPath.slice(prefix.length);
      if (!rest.includes("/")) childFolders.add(folderPath);
    }
    for (const filePath of Object.keys(files)) {
      if (!filePath.startsWith(prefix)) continue;
      const rest = filePath.slice(prefix.length);
      if (!rest.includes("/")) childFiles.push(filePath);
    }

    return { folders: [...childFolders].sort(), files: childFiles.sort() };
  }

  const app = {
    vault: {
      adapter: {
        exists: async (path: string) => folders.has(path) || Object.hasOwn(files, path),
        list: async (path: string) => directChildren(path),
        read: async (path: string) => files[path],
        write: async (path: string, content: string) => {
          files[path] = content;
          written[path] = content;
        },
      },
      createFolder: async (path: string) => {
        folders.add(path);
      },
      create: async (path: string, content: string) => {
        files[path] = content;
        written[path] = content;
      },
    },
  } as unknown as App;

  return { app, files, written };
}

describe("compareVersions", () => {
  it("treats a release as newer than its prerelease", () => {
    expect(compareVersions("1.0.0", "1.0.0-beta")).toBeGreaterThan(0);
  });

  it("rejects non-semver versions", () => {
    expect(compareVersions("1.0", "1.0.0")).toBeNull();
  });
});

describe("getSafeSkillTargetPath", () => {
  it("keeps normal files under the skill folder", () => {
    expect(getSafeSkillTargetPath("code-review", "code-review/SKILL.md")).toBe("skills/code-review/SKILL.md");
  });

  it("rejects paths that escape the skill folder", () => {
    expect(getSafeSkillTargetPath("code-review", "code-review/../other.md")).toBeNull();
    expect(getSafeSkillTargetPath("code-review", "../code-review/SKILL.md")).toBeNull();
  });
});

describe("importExternalSkills", () => {
  it("skips folders that do not contain SKILL.md", async () => {
    const { app, written } = makeApp({
      "Source/skills/no-skill/manifest.json": JSON.stringify({ id: "no-skill", version: "1.0.0" }),
    });

    const result = await importExternalSkills(app, "Source", [], "gemini-helper", "1.16.2");

    expect(result.installed).toEqual([]);
    expect(result.skipped).toEqual([{ id: "no-skill", reason: "SKILL.md not found" }]);
    expect(written).toEqual({});
  });

  it("skips the whole skill when a file would escape its target folder", async () => {
    const { app, written } = makeApp({
      "Source/skills/code-review/SKILL.md": "---\nname: Code review\n---\n",
      "Source/skills/code-review/../escape.md": "nope",
    });

    const result = await importExternalSkills(app, "Source", [], "gemini-helper", "1.16.2");

    expect(result.installed).toEqual([]);
    expect(result.skipped).toEqual([{ id: "code-review", reason: "unsafe path: code-review/../escape.md" }]);
    expect(written).toEqual({});
  });
});
