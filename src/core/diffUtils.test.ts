import { describe, test, expect } from "vitest";
import * as Diff from "diff";
import {
  applyDiff,
  reverseApplyDiff,
  reconstructContent,
} from "./diffUtils";

// ── Helper ──────────────────────────────────────────────────────────────────
// Creates a forward unified diff (old → new).
function makeDiff(oldContent: string, newContent: string): string {
  const patch = Diff.structuredPatch(
    "original",
    "modified",
    oldContent,
    newContent,
    undefined,
    undefined,
    { context: 3 }
  );
  const lines: string[] = [];
  for (const hunk of patch.hunks) {
    lines.push(
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
    );
    for (const line of hunk.lines) {
      lines.push(line);
    }
  }
  return lines.join("\n");
}

// Creates a reverse diff (new → old), same format as local editHistory.
function makeReverseDiff(oldContent: string, newContent: string): string {
  return makeDiff(newContent, oldContent);
}

// ══════════════════════════════════════════════════════════════════════════════
// reverseApplyDiff
// ══════════════════════════════════════════════════════════════════════════════

describe("reverseApplyDiff", () => {
  test("undo a single line addition", () => {
    const old = "line1\nline2\n";
    const cur = "line1\nline2\nline3\n";
    const diff = makeDiff(old, cur);

    const result = reverseApplyDiff(cur, diff);
    expect(result).toBe(old);
  });

  test("undo a single line deletion", () => {
    const old = "aaa\nbbb\nccc\n";
    const cur = "aaa\nccc\n";
    const diff = makeDiff(old, cur);

    const result = reverseApplyDiff(cur, diff);
    expect(result).toBe(old);
  });

  test("undo a modification", () => {
    const old = "hello world\n";
    const cur = "hello universe\n";
    const diff = makeDiff(old, cur);

    const result = reverseApplyDiff(cur, diff);
    expect(result).toBe(old);
  });

  test("undo multi-line changes", () => {
    const old = "a\nb\nc\nd\ne\n";
    const cur = "a\nB\nc\nD\ne\nf\n";
    const diff = makeDiff(old, cur);

    const result = reverseApplyDiff(cur, diff);
    expect(result).toBe(old);
  });

  test("Japanese content", () => {
    const old = "本当にいいお父さんですか？\n本当にいいお母さんですか？\n";
    const cur = "本当にいいお父さんですか？\n本当にいいお母さんですか？\naaaaaa\n";
    const diff = makeDiff(old, cur);

    const result = reverseApplyDiff(cur, diff);
    expect(result).toBe(old);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// applyDiff (for local reverse diffs: new → old)
// ══════════════════════════════════════════════════════════════════════════════

describe("applyDiff (local reverse diffs)", () => {
  test("apply reverse diff restores to old content", () => {
    const old = "line1\nline2\n";
    const current = "line1\nline2\nline3\n";
    const reverseDiff = makeReverseDiff(old, current);

    const result = applyDiff(current, reverseDiff);
    expect(result).toBe(old);
  });

  test("apply reverse diff with modification", () => {
    const old = "hello world\n";
    const current = "hello universe\n";
    const reverseDiff = makeReverseDiff(old, current);

    const result = applyDiff(current, reverseDiff);
    expect(result).toBe(old);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// reconstructContent — local diffs only
// ══════════════════════════════════════════════════════════════════════════════

describe("reconstructContent — local diffs only", () => {
  test("single local diff restores to base", () => {
    const base = "line1\nline2\n";
    const current = "line1\nline2\nline3\n";
    const diff = makeReverseDiff(base, current);

    const result = reconstructContent(current, [{ diff }]);
    expect(result).toBe(base);
  });

  test("two local diffs restore through chain", () => {
    const base = "alpha\n";
    const v1 = "alpha\nbeta\n";
    const current = "alpha\nbeta\ngamma\n";

    const diff_v1_to_current = makeReverseDiff(v1, current);
    const diff_base_to_v1 = makeReverseDiff(base, v1);

    // Ordered newest-first
    const result = reconstructContent(current, [
      { diff: diff_v1_to_current },
      { diff: diff_base_to_v1 },
    ]);
    expect(result).toBe(base);
  });

  test("restore to middle of local chain gives v1", () => {
    const v1 = "alpha\nbeta\n";
    const current = "alpha\nbeta\ngamma\n";

    const diff_v1_to_current = makeReverseDiff(v1, current);

    const result = reconstructContent(current, [{ diff: diff_v1_to_current }]);
    expect(result).toBe(v1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Edge cases
// ══════════════════════════════════════════════════════════════════════════════

describe("edge cases", () => {
  test("empty diffs array returns current content unchanged", () => {
    const result = reconstructContent("hello\n", []);
    expect(result).toBe("hello\n");
  });

  test("content without trailing newline", () => {
    const base = "no trailing newline";
    const current = "no trailing newline\nadded line";
    const diff = makeReverseDiff(base, current);

    const result = reconstructContent(current, [{ diff }]);
    expect(result).toBe(base);
  });

  test("Japanese content", () => {
    const base = "本当にいいお父さんですか？\n本当にいいお母さんですか？\n";
    const current = "本当にいいお父さんですか？\n本当にいいお母さんですか？\naaaaaa\n";
    const diff = makeReverseDiff(base, current);

    const result = reconstructContent(current, [{ diff }]);
    expect(result).toBe(base);
  });
});
