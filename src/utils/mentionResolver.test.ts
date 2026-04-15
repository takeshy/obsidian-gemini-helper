import { describe, it, expect } from "vitest";
import { findFileMentionOccurrences, findLiteralOccurrences } from "./mentionResolver";

describe("findFileMentionOccurrences (prefix-anchored)", () => {
  it("matches a single file with @ prefix", () => {
    const occs = findFileMentionOccurrences("see @a.md please", ["a.md"], { prefix: "@" });
    expect(occs).toHaveLength(1);
    expect(occs[0]).toMatchObject({ key: "a.md", matched: "@a.md", start: 4, end: 9 });
  });

  it("matches file paths containing spaces", () => {
    const text = "open @My Folder/Note Title.md now";
    const occs = findFileMentionOccurrences(text, ["My Folder/Note Title.md"], { prefix: "@" });
    expect(occs).toHaveLength(1);
    expect(occs[0].matched).toBe("@My Folder/Note Title.md");
    expect(text.slice(occs[0].start, occs[0].end)).toBe("@My Folder/Note Title.md");
  });

  it("matches unicode paths", () => {
    const occs = findFileMentionOccurrences("ref @メモ/日本語.md です", ["メモ/日本語.md"], { prefix: "@" });
    expect(occs).toHaveLength(1);
    expect(occs[0].matched).toBe("@メモ/日本語.md");
  });

  it("matches paths with regex-special characters", () => {
    const path = "notes/a (v2)+.md";
    const occs = findFileMentionOccurrences(`read @${path} here`, [path], { prefix: "@" });
    expect(occs).toHaveLength(1);
    expect(occs[0].matched).toBe(`@${path}`);
  });

  it("matches every occurrence of the same file", () => {
    const occs = findFileMentionOccurrences("@a.md and @a.md twice", ["a.md"], { prefix: "@" });
    expect(occs).toHaveLength(2);
    expect(occs.map(o => o.start)).toEqual([0, 10]);
  });

  it("prefers the longest matching path when two files share a suffix", () => {
    // Vault has both `a.md` and `folder/a.md`. Text mentions the longer path.
    const occs = findFileMentionOccurrences(
      "check @folder/a.md",
      ["a.md", "folder/a.md"],
      { prefix: "@" }
    );
    expect(occs).toHaveLength(1);
    expect(occs[0].key).toBe("folder/a.md");
    expect(occs[0].matched).toBe("@folder/a.md");
  });

  it("does not match when path is prefix of a longer alphanumeric token", () => {
    // `@foo.mdx` should not be split into a `@foo.md` match.
    const occs = findFileMentionOccurrences("see @foo.mdx", ["foo.md"], { prefix: "@" });
    expect(occs).toHaveLength(0);
  });

  it("does not match inside a path-continuation token (regression: @foo.md/child)", () => {
    // If only `foo.md` is in the vault but text references `@foo.md/child`,
    // we must NOT splice the `foo.md` content in and leave a dangling `/child`.
    expect(findFileMentionOccurrences("read @foo.md/child", ["foo.md"], { prefix: "@" })).toHaveLength(0);
    expect(findFileMentionOccurrences("read @foo.md_backup", ["foo.md"], { prefix: "@" })).toHaveLength(0);
    expect(findFileMentionOccurrences("read @foo.md-1", ["foo.md"], { prefix: "@" })).toHaveLength(0);
    expect(findFileMentionOccurrences("read @foo.md.backup", ["foo.md"], { prefix: "@" })).toHaveLength(0);
  });

  it("does not match trailing sentence punctuation (matches legacy strict semantic)", () => {
    // Under the legacy regex `[^\s@]+`, the captured token `foo.md.` wasn't a
    // vault file either. We preserve that behaviour so the token-or-nothing
    // rule is consistent: users should leave a space before the punctuation.
    expect(findFileMentionOccurrences("see @foo.md.", ["foo.md"], { prefix: "@" })).toHaveLength(0);
    expect(findFileMentionOccurrences("see @foo.md,", ["foo.md"], { prefix: "@" })).toHaveLength(0);
  });

  it("matches consecutive @-mentions with no whitespace between them", () => {
    const occs = findFileMentionOccurrences("@a.md@b.md", ["a.md", "b.md"], { prefix: "@" });
    expect(occs).toHaveLength(2);
    expect(occs.map(o => o.key)).toEqual(["a.md", "b.md"]);
  });

  it("does not match stateful regex across multiple calls", () => {
    // Regression guard: two consecutive calls must behave identically.
    const first = findFileMentionOccurrences("@a.md @a.md", ["a.md"], { prefix: "@" });
    const second = findFileMentionOccurrences("@a.md @a.md", ["a.md"], { prefix: "@" });
    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
  });

  it("returns matches ordered by text position", () => {
    const occs = findFileMentionOccurrences(
      "@b.md then @a.md",
      ["a.md", "b.md"],
      { prefix: "@" }
    );
    expect(occs.map(o => o.key)).toEqual(["b.md", "a.md"]);
  });
});

describe("findFileMentionOccurrences (whitespace-boundary mode)", () => {
  const opts = { requireWhitespaceBoundary: true };

  it("matches a bare file path when surrounded by whitespace", () => {
    const occs = findFileMentionOccurrences("please read foo.md now", ["foo.md"], opts);
    expect(occs).toHaveLength(1);
    expect(occs[0].matched).toBe("foo.md");
  });

  it("matches adjacent paths without eating the boundary whitespace", () => {
    // The old regex `(?:\s|$)` consumed the trailing whitespace and broke this.
    const occs = findFileMentionOccurrences(
      "read a.md b.md done",
      ["a.md", "b.md"],
      opts
    );
    expect(occs).toHaveLength(2);
    expect(occs.map(o => o.key)).toEqual(["a.md", "b.md"]);
  });

  it("does not match a path inside a word", () => {
    const occs = findFileMentionOccurrences("zzza.mdzzz", ["a.md"], opts);
    expect(occs).toHaveLength(0);
  });

  it("matches a path with spaces when the whole thing is surrounded by whitespace", () => {
    const occs = findFileMentionOccurrences(
      "open My Note.md please",
      ["My Note.md"],
      opts
    );
    expect(occs).toHaveLength(1);
    expect(occs[0].matched).toBe("My Note.md");
  });
});

describe("findLiteralOccurrences", () => {
  it("finds every occurrence of a literal token", () => {
    const occs = findLiteralOccurrences("@{selection} and @{selection}", "@{selection}");
    expect(occs).toHaveLength(2);
    expect(occs.map(o => o.start)).toEqual([0, 17]);
  });

  it("returns no occurrences when the token is absent", () => {
    expect(findLiteralOccurrences("nothing here", "@{content}")).toEqual([]);
  });

  it("returns no occurrences for an empty token (guards against infinite loop)", () => {
    expect(findLiteralOccurrences("anything", "")).toEqual([]);
  });
});
