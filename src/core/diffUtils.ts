// Diff reconstruction utilities for edit history.
// Extracted from EditHistoryModal for testability.

/** Parsed hunk with search/replace line arrays */
interface ParsedHunk {
  startIdx: number;
  searchLines: string[];
  replaceLines: string[];
}

/**
 * Parse a unified diff string into hunks with search/replace lines.
 * "-" lines go into searchLines, "+" lines go into replaceLines,
 * context " " lines go into both.
 */
function parseHunks(diffStr: string): ParsedHunk[] {
  const diffLines = diffStr.split("\n");
  const hunks: ParsedHunk[] = [];
  let i = 0;

  while (i < diffLines.length) {
    const line = diffLines[i];
    const hunkMatch = line.match(/^@@ -(\d+),?\d* \+(\d+),?\d* @@/);

    if (hunkMatch) {
      const startIdx = parseInt(hunkMatch[1], 10) - 1;
      const searchLines: string[] = [];
      const replaceLines: string[] = [];

      i++;
      while (i < diffLines.length && !diffLines[i].startsWith("@@")) {
        const hunkLine = diffLines[i];
        if (hunkLine.startsWith("-")) {
          searchLines.push(hunkLine.substring(1));
        } else if (hunkLine.startsWith("+")) {
          replaceLines.push(hunkLine.substring(1));
        } else if (hunkLine.startsWith(" ")) {
          searchLines.push(hunkLine.substring(1));
          replaceLines.push(hunkLine.substring(1));
        }
        i++;
      }

      hunks.push({ startIdx, searchLines, replaceLines });
    } else {
      i++;
    }
  }

  return hunks;
}

interface ApplyHunksResult {
  content: string;
  unmatchedHunks: number;
}

/**
 * Apply parsed hunks to content using content-matching with ±5 line tolerance.
 * Hunks are applied in reverse order (end-of-file first) to preserve line numbers.
 */
function applyHunks(content: string, hunks: ParsedHunk[]): ApplyHunksResult {
  const lines = content.split("\n");
  const reversed = [...hunks].reverse();
  let unmatchedHunks = 0;

  for (const hunk of reversed) {
    let startIdx = hunk.startIdx;
    let matched = false;

    // Find exact match location with ±5 line tolerance for drift
    if (hunk.searchLines.length === 0) {
      // Pure insertion: no search needed, just insert at startIdx
      matched = true;
    } else {
      const lo = Math.max(0, startIdx - 5);
      const hi = Math.min(lines.length - hunk.searchLines.length, startIdx + 5);
      for (let j = lo; j <= hi; j++) {
        // Ensure enough lines remain for a full match
        if (j + hunk.searchLines.length > lines.length) continue;
        let isMatch = true;
        for (let k = 0; k < hunk.searchLines.length; k++) {
          if (lines[j + k] !== hunk.searchLines[k]) {
            isMatch = false;
            break;
          }
        }
        if (isMatch) {
          startIdx = j;
          matched = true;
          break;
        }
      }
    }

    if (matched) {
      lines.splice(startIdx, hunk.searchLines.length, ...hunk.replaceLines);
    } else {
      unmatchedHunks++;
      console.warn("[diffUtils] hunk did not match at expected position", hunk.startIdx, hunk.searchLines.slice(0, 3));
    }
  }

  return { content: lines.join("\n"), unmatchedHunks };
}

/**
 * Apply a diff patch to content using content-matching.
 * Used for local diffs which are stored in reverse direction (new → old).
 * If strict is true, throws when any hunk fails to match.
 */
export function applyDiff(content: string, diff: string, options?: { strict?: boolean }): string {
  const hunks = parseHunks(diff);
  const result = applyHunks(content, hunks);
  if (options?.strict && result.unmatchedHunks > 0) {
    throw new Error(`${result.unmatchedHunks} diff hunk(s) failed to match`);
  }
  return result.content;
}

/**
 * Reverse a diff (swap +/- and hunk header positions) then apply it
 * using content-matching.
 * Used for remote diffs which are stored in forward direction (old → new).
 * If strict is true, throws when any hunk fails to match.
 */
export function reverseApplyDiff(content: string, diffStr: string, options?: { strict?: boolean }): string {
  const lines = diffStr.split("\n");
  const reversed: string[] = [];

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@(.*)$/);
    if (hunkMatch) {
      const oldPart = hunkMatch[4] ? `${hunkMatch[3]},${hunkMatch[4]}` : hunkMatch[3];
      const newPart = hunkMatch[2] ? `${hunkMatch[1]},${hunkMatch[2]}` : hunkMatch[1];
      reversed.push(`@@ -${oldPart} +${newPart} @@${hunkMatch[5]}`);
    } else if (line.startsWith("+")) {
      reversed.push("-" + line.slice(1));
    } else if (line.startsWith("-")) {
      reversed.push("+" + line.slice(1));
    } else {
      reversed.push(line);
    }
  }

  const reversedStr = reversed.join("\n");
  const hunks = parseHunks(reversedStr);
  const result = applyHunks(content, hunks);
  if (options?.strict && result.unmatchedHunks > 0) {
    throw new Error(`${result.unmatchedHunks} diff hunk(s) failed to match`);
  }
  return result.content;
}

export type DiffWithOrigin = { diff: string; origin: "local" | "remote" };

/**
 * Reconstruct file content at a specific point in merged history.
 *
 * @param currentContent - Current file content (snapshot or vault read)
 * @param entriesToReverse - Entries to reverse-apply, ordered newest-first.
 *   Local diffs: reverse direction (new → old) — apply directly.
 *   Remote diffs: forward direction (old → new) — reverse then apply.
 */
export function reconstructContent(
  currentContent: string,
  entriesToReverse: DiffWithOrigin[]
): string {
  let content = currentContent;
  for (const entry of entriesToReverse) {
    if (entry.origin === "remote") {
      content = reverseApplyDiff(content, entry.diff);
    } else {
      content = applyDiff(content, entry.diff);
    }
  }
  return content;
}
