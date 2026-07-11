import { describe, expect, it } from "vitest";
import { groupSecretPaths, matchesSecretSearch, normalizeSecretFolder, secretFilePath } from "./secretManager";

describe("secret manager helpers", () => {
  it("normalizes folders without traversal", () => {
    expect(normalizeSecretFolder(" /Secrets/../Team/./ ")).toBe("Secrets/Team");
  });

  it("creates a safe encrypted file path", () => {
    expect(secretFilePath("Secrets", " API/key.encrypted ")).toBe("Secrets/API-key.encrypted");
    expect(() => secretFilePath("Secrets", "###")).toThrow("Invalid secret name");
  });

  it("searches public metadata", () => {
    expect(matchesSecretSearch("API", "production", "alice", { owner: "Alice" })).toBe(true);
    expect(matchesSecretSearch("API", "production", "staging", { owner: "Alice" })).toBe(false);
  });

  it("preserves directories for shared files and singletons", () => {
    const one = { id: "1", path: "team/api/one.encrypted" };
    const two = { id: "2", path: "team/api/two.encrypted" };
    const solo = { id: "3", path: "personal/solo.encrypted" };
    expect(groupSecretPaths([one, solo, two])).toEqual([
      { kind: "group", folderPath: "team", items: [one, two], children: [
        { kind: "group", folderPath: "team/api", items: [one, two], children: [
          { kind: "file", item: one },
          { kind: "file", item: two },
        ] },
      ] },
      { kind: "group", folderPath: "personal", items: [solo], children: [
        { kind: "file", item: solo },
      ] },
    ]);
  });

  it("keeps a directory visible when it contains only one secret", () => {
    const only = { id: "1", path: "team/only.encrypted" };
    expect(groupSecretPaths([only])).toEqual([
      { kind: "group", folderPath: "team", items: [only], children: [
        { kind: "file", item: only },
      ] },
    ]);
  });
});
