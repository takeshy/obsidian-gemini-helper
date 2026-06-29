import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { compareVersions, getSafeSkillTargetPath, installSkillFiles } from "./externalSkills";

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

describe("installSkillFiles", () => {
  it("skips folders that do not contain SKILL.md", async () => {
    const { app, written } = makeApp({});

    const result = await installSkillFiles(
      app,
      [{ relativePath: "no-skill/manifest.json", content: JSON.stringify({ id: "no-skill", version: "1.0.0" }) }],
      [],
      "gemini-helper",
      "1.16.2",
    );

    expect(result.installed).toEqual([]);
    expect(result.skipped).toEqual([{ id: "no-skill", reason: "SKILL.md not found" }]);
    expect(written).toEqual({});
  });

  it("skips a skill without a manifest.json", async () => {
    const { app, written } = makeApp({});

    const result = await installSkillFiles(
      app,
      [{ relativePath: "code-review/SKILL.md", content: "---\nname: Code review\n---\n" }],
      [],
      "gemini-helper",
      "1.16.2",
    );

    expect(result.installed).toEqual([]);
    expect(result.skipped).toEqual([{ id: "code-review", reason: "manifest.json required" }]);
    expect(written).toEqual({});
  });

  it("skips the whole skill when a file would escape its target folder", async () => {
    const { app, written } = makeApp({});

    const result = await installSkillFiles(
      app,
      [
        { relativePath: "code-review/SKILL.md", content: "---\nname: Code review\n---\n" },
        { relativePath: "code-review/manifest.json", content: JSON.stringify({ id: "code-review", version: "1.0.0" }) },
        { relativePath: "code-review/../escape.md", content: "nope" },
      ],
      [],
      "gemini-helper",
      "1.16.2",
    );

    expect(result.installed).toEqual([]);
    expect(result.skipped).toEqual([{ id: "code-review", reason: "unsafe path: code-review/../escape.md" }]);
    expect(written).toEqual({});
  });

  it("installs a skill's files into the vault skills folder", async () => {
    const { app, written } = makeApp({});

    const manifest = JSON.stringify({ id: "code-review", version: "1.0.0" });
    const result = await installSkillFiles(
      app,
      [
        { relativePath: "code-review/SKILL.md", content: "---\nname: Code review\n---\n" },
        { relativePath: "code-review/manifest.json", content: manifest },
      ],
      [],
      "gemini-helper",
      "1.16.2",
    );

    expect(result.installed).toEqual(["code-review"]);
    expect(result.skillCount).toBe(1);
    expect(result.fileCount).toBe(2);
    expect(written).toEqual({
      "skills/code-review/SKILL.md": "---\nname: Code review\n---\n",
      "skills/code-review/manifest.json": manifest,
    });
  });
});
