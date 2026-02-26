import { describe, test, expect } from "vitest";
import * as Diff from "diff";
import {
  applyDiff,
  reverseApplyDiff,
  reconstructContent,
  type DiffWithOrigin,
} from "./diffUtils";

// ── Helper ──────────────────────────────────────────────────────────────────
// Creates a forward unified diff (old → new), same format as driveEditHistory.
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

    const diffs: DiffWithOrigin[] = [{ diff, origin: "local" }];
    const result = reconstructContent(current, diffs);
    expect(result).toBe(base);
  });

  test("two local diffs restore through chain", () => {
    const base = "alpha\n";
    const v1 = "alpha\nbeta\n";
    const current = "alpha\nbeta\ngamma\n";

    const diff_v1_to_current = makeReverseDiff(v1, current);
    const diff_base_to_v1 = makeReverseDiff(base, v1);

    // Ordered newest-first
    const diffs: DiffWithOrigin[] = [
      { diff: diff_v1_to_current, origin: "local" },
      { diff: diff_base_to_v1, origin: "local" },
    ];

    const result = reconstructContent(current, diffs);
    expect(result).toBe(base);
  });

  test("restore to middle of local chain gives v1", () => {
    const v1 = "alpha\nbeta\n";
    const current = "alpha\nbeta\ngamma\n";

    const diff_v1_to_current = makeReverseDiff(v1, current);

    const diffs: DiffWithOrigin[] = [
      { diff: diff_v1_to_current, origin: "local" },
    ];

    const result = reconstructContent(current, diffs);
    expect(result).toBe(v1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// reconstructContent — remote diffs only
// ══════════════════════════════════════════════════════════════════════════════

describe("reconstructContent — remote diffs only", () => {
  test("single remote diff reverse-applied", () => {
    const old_drive = "line1\n";
    const new_drive = "line1\nline2\n";
    const remoteDiff = makeDiff(old_drive, new_drive);

    const diffs: DiffWithOrigin[] = [{ diff: remoteDiff, origin: "remote" }];
    const result = reconstructContent(new_drive, diffs);
    expect(result).toBe(old_drive);
  });

  test("chain of remote diffs reverse-applied from newest", () => {
    const v0 = "first\n";
    const v1 = "first\nsecond\n";
    const v2 = "first\nsecond\nthird\n";

    const remoteDiff_v0_to_v1 = makeDiff(v0, v1);
    const remoteDiff_v1_to_v2 = makeDiff(v1, v2);

    // newest-first
    const diffs: DiffWithOrigin[] = [
      { diff: remoteDiff_v1_to_v2, origin: "remote" },
      { diff: remoteDiff_v0_to_v1, origin: "remote" },
    ];

    const result = reconstructContent(v2, diffs);
    expect(result).toBe(v0);
  });

  test("multiple remote pushes, no local changes, restore from pulled state", () => {
    const v0 = "aaa\n";
    const v1 = "aaa\nbbb\n";
    const v2 = "aaa\nbbb\nccc\n";
    const v3 = "aaa\nbbb\nccc\nddd\n";

    const remoteDiff_v0_v1 = makeDiff(v0, v1);
    const remoteDiff_v1_v2 = makeDiff(v1, v2);
    const remoteDiff_v2_v3 = makeDiff(v2, v3);

    const diffs: DiffWithOrigin[] = [
      { diff: remoteDiff_v2_v3, origin: "remote" },
      { diff: remoteDiff_v1_v2, origin: "remote" },
      { diff: remoteDiff_v0_v1, origin: "remote" },
    ];

    const result = reconstructContent(v3, diffs);
    expect(result).toBe(v0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// reconstructContent — mixed local + remote
// ══════════════════════════════════════════════════════════════════════════════

describe("reconstructContent — mixed local + remote", () => {
  test("reverse-apply all diffs in chain", () => {
    // Timeline:
    //   remote push 1: v0 → v1
    //   remote push 2: v1 → v2
    //   pull v2 to local
    //   local edit 1: v2 → v3
    //   local edit 2: v3 → v4
    const v0 = "line1\n";
    const v1 = "line1\nline2\n";
    const v2 = "line1\nline2\nline3\n";
    const v3 = "line1\nline2\nline3\nline4\n";
    const v4 = "line1\nline2\nline3\nline4\nline5\n";

    const remoteDiff_v0_v1 = makeDiff(v0, v1);
    const remoteDiff_v1_v2 = makeDiff(v1, v2);
    const localDiff_v2_v3 = makeReverseDiff(v2, v3);
    const localDiff_v3_v4 = makeReverseDiff(v3, v4);

    const allDiffs: DiffWithOrigin[] = [
      { diff: localDiff_v3_v4, origin: "local" },
      { diff: localDiff_v2_v3, origin: "local" },
      { diff: remoteDiff_v1_v2, origin: "remote" },
      { diff: remoteDiff_v0_v1, origin: "remote" },
    ];

    const result = reconstructContent(v4, allDiffs);
    expect(result).toBe(v0);
  });

  test("UI restore — click on remote push 2, get v1", () => {
    // Reverse locals + remote(v1→v2) → v1
    const v1 = "line1\nline2\n";
    const v2 = "line1\nline2\nline3\n";
    const v3 = "line1\nline2\nline3\nline4\n";
    const v4 = "line1\nline2\nline3\nline4\nline5\n";

    const remoteDiff_v1_v2 = makeDiff(v1, v2);
    const localDiff_v2_v3 = makeReverseDiff(v2, v3);
    const localDiff_v3_v4 = makeReverseDiff(v3, v4);

    const diffs: DiffWithOrigin[] = [
      { diff: localDiff_v3_v4, origin: "local" },
      { diff: localDiff_v2_v3, origin: "local" },
      { diff: remoteDiff_v1_v2, origin: "remote" },
    ];

    const result = reconstructContent(v4, diffs);
    expect(result).toBe(v1);
  });

  test("UI restore — click on local session 1, get v3", () => {
    const v3 = "line1\nline2\nline3\nline4\n";
    const v4 = "line1\nline2\nline3\nline4\nline5\n";

    const localDiff_v3_v4 = makeReverseDiff(v3, v4);

    const diffs: DiffWithOrigin[] = [
      { diff: localDiff_v3_v4, origin: "local" },
    ];

    const result = reconstructContent(v4, diffs);
    expect(result).toBe(v3);
  });

  test("complex content with modifications in the middle", () => {
    const v0 = "# Title\n\nParagraph one.\n\nParagraph two.\n\nParagraph three.\n";
    const v1 = "# Title\n\nParagraph one.\n\nUpdated paragraph two.\n\nParagraph three.\n";
    const v2 = "# Title\n\nParagraph one.\n\nUpdated paragraph two.\n\nParagraph three.\n\nNew section.\n";
    const v3 = "# New Title\n\nParagraph one.\n\nUpdated paragraph two.\n\nParagraph three.\n\nNew section.\n";

    const remoteDiff_v0_v1 = makeDiff(v0, v1);
    const remoteDiff_v1_v2 = makeDiff(v1, v2);
    const localDiff_v2_v3 = makeReverseDiff(v2, v3);

    // Restore all the way back to v0
    const allDiffs: DiffWithOrigin[] = [
      { diff: localDiff_v2_v3, origin: "local" },
      { diff: remoteDiff_v1_v2, origin: "remote" },
      { diff: remoteDiff_v0_v1, origin: "remote" },
    ];

    const result = reconstructContent(v3, allDiffs);
    expect(result).toBe(v0);

    // Restore to v1 (undo local + last remote only)
    const diffs_to_v1: DiffWithOrigin[] = [
      { diff: localDiff_v2_v3, origin: "local" },
      { diff: remoteDiff_v1_v2, origin: "remote" },
    ];
    const result_v1 = reconstructContent(v3, diffs_to_v1);
    expect(result_v1).toBe(v1);
  });

  test("local edit overlaps with remote change region", () => {
    const v0 = "aaa\nbbb\nccc\n";
    const v1 = "aaa\nBBB\nccc\n"; // remote: bbb → BBB
    const v2 = "aaa\nXXX\nccc\n"; // local after pull: BBB → XXX

    const remoteDiff_v0_v1 = makeDiff(v0, v1);
    const localDiff_v1_v2 = makeReverseDiff(v1, v2);

    const diffs: DiffWithOrigin[] = [
      { diff: localDiff_v1_v2, origin: "local" },
      { diff: remoteDiff_v0_v1, origin: "remote" },
    ];

    const result = reconstructContent(v2, diffs);
    expect(result).toBe(v0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// reconstructContent — remote restore via reverseApplyDiff from remote file
// (tests the getContentAtEntry remote path and clear history remote path)
// ══════════════════════════════════════════════════════════════════════════════

describe("remote restore via reverseApplyDiff from remote file", () => {
  test("reverse-apply all remote diffs from remote file to get earliest state", () => {
    // Simulates: Clear History with Drive sync
    // Remote file has v3, history has 3 diffs
    const v0 = "Hello World\n";
    const v1 = "Hello World\nNew paragraph.\n";
    const v2 = "Hello World\nModified paragraph.\n";
    const v3 = "Hello World\nModified paragraph.\n---\nFooter\n";

    const remoteDiff_v0_v1 = makeDiff(v0, v1);
    const remoteDiff_v1_v2 = makeDiff(v1, v2);
    const remoteDiff_v2_v3 = makeDiff(v2, v3);

    // Entries from loadRemoteEditHistory (chronological: oldest first)
    const remoteEntries = [remoteDiff_v0_v1, remoteDiff_v1_v2, remoteDiff_v2_v3];

    // Reverse-apply from newest to oldest (same as clear history code)
    let content = v3; // remote file content
    for (let i = remoteEntries.length - 1; i >= 0; i--) {
      content = reverseApplyDiff(content, remoteEntries[i]);
    }

    expect(content).toBe(v0);
  });

  test("reverse-apply remote diffs to specific entry (getContentAtEntry)", () => {
    // Simulates: clicking Restore on a specific remote entry
    // Remote file has v3, we want content before remote push 3 (= v2)
    const v0 = "Hello World\n";
    const v1 = "Hello World\nNew paragraph.\n";
    const v2 = "Hello World\nModified paragraph.\n";
    const v3 = "Hello World\nModified paragraph.\n---\nFooter\n";

    const remoteDiff_v0_v1 = makeDiff(v0, v1);
    const remoteDiff_v1_v2 = makeDiff(v1, v2);
    const remoteDiff_v2_v3 = makeDiff(v2, v3);

    // allEntries remote-only, newest-first
    const remoteOnly = [remoteDiff_v2_v3, remoteDiff_v1_v2, remoteDiff_v0_v1];

    // Target: remoteDiff_v2_v3 at index 0 → reverse-apply [0..0] → v2
    let content = v3;
    for (let i = 0; i <= 0; i++) {
      content = reverseApplyDiff(content, remoteOnly[i]);
    }
    expect(content).toBe(v2);

    // Target: remoteDiff_v1_v2 at index 1 → reverse-apply [0..1] → v1
    content = v3;
    for (let i = 0; i <= 1; i++) {
      content = reverseApplyDiff(content, remoteOnly[i]);
    }
    expect(content).toBe(v1);

    // Target: remoteDiff_v0_v1 at index 2 → reverse-apply [0..2] → v0
    content = v3;
    for (let i = 0; i <= 2; i++) {
      content = reverseApplyDiff(content, remoteOnly[i]);
    }
    expect(content).toBe(v0);
  });

  test("history starting mid-file (not from empty)", () => {
    // Remote history doesn't include file creation
    // File already had content before tracking started
    const existing = "# Existing\n\nSome content.\n";
    const v1 = "# Existing\n\nSome content.\n\nAdded section.\n";
    const v2 = "# Existing\n\nUpdated content.\n\nAdded section.\n";

    const remoteDiff_existing_v1 = makeDiff(existing, v1);
    const remoteDiff_v1_v2 = makeDiff(v1, v2);

    // Remote file has v2, reverse-apply all → existing
    let content = v2;
    const entries = [remoteDiff_existing_v1, remoteDiff_v1_v2];
    for (let i = entries.length - 1; i >= 0; i--) {
      content = reverseApplyDiff(content, entries[i]);
    }
    expect(content).toBe(existing);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3 remote pushes + 2 local edits (full realistic scenario)
// ══════════════════════════════════════════════════════════════════════════════

describe("full realistic scenario: 3 remote + 2 local", () => {
  const v0 = "Hello World\n";
  const v1 = "Hello World\nNew paragraph.\n";
  const v2 = "Hello World\nModified paragraph.\n";
  const v3 = "Hello World\nModified paragraph.\n---\nFooter\n";
  const v4 = "Hello World!\nModified paragraph.\n---\nFooter\n";
  const v5 = "// comment\nHello World!\nModified paragraph.\n---\nFooter\n";

  const remoteDiff_v0_v1 = makeDiff(v0, v1);
  const remoteDiff_v1_v2 = makeDiff(v1, v2);
  const remoteDiff_v2_v3 = makeDiff(v2, v3);
  const localDiff_v3_v4 = makeReverseDiff(v3, v4);
  const localDiff_v4_v5 = makeReverseDiff(v4, v5);

  // All entries newest-first
  const allDiffs: DiffWithOrigin[] = [
    { diff: localDiff_v4_v5, origin: "local" },
    { diff: localDiff_v3_v4, origin: "local" },
    { diff: remoteDiff_v2_v3, origin: "remote" },
    { diff: remoteDiff_v1_v2, origin: "remote" },
    { diff: remoteDiff_v0_v1, origin: "remote" },
  ];

  test("restore to v0 (all diffs)", () => {
    const result = reconstructContent(v5, allDiffs);
    expect(result).toBe(v0);
  });

  test("restore to v2 (undo local + remote push 3)", () => {
    const diffs = allDiffs.slice(0, 3);
    const result = reconstructContent(v5, diffs);
    expect(result).toBe(v2);
  });

  test("restore to v3 (undo local diffs only)", () => {
    const diffs = allDiffs.slice(0, 2);
    const result = reconstructContent(v5, diffs);
    expect(result).toBe(v3);
  });

  test("restore to v4 (undo latest local diff)", () => {
    const diffs = allDiffs.slice(0, 1);
    const result = reconstructContent(v5, diffs);
    expect(result).toBe(v4);
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

    const diffs: DiffWithOrigin[] = [{ diff, origin: "local" }];
    const result = reconstructContent(current, diffs);
    expect(result).toBe(base);
  });

  test("Japanese content with remote diff", () => {
    const old_content = "本当にいいお父さんですか？\n本当にいいお母さんですか？\n";
    const new_content = "本当にいいお父さんですか？\n本当にいいお母さんですか？\naaaaaa\n";
    const remoteDiff = makeDiff(old_content, new_content);

    const diffs: DiffWithOrigin[] = [{ diff: remoteDiff, origin: "remote" }];
    const result = reconstructContent(new_content, diffs);
    expect(result).toBe(old_content);
  });
});
