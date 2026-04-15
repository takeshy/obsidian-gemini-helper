/**
 * Mention resolution utilities.
 *
 * The chat and AI-workflow flows both look for mentions of vault files inside
 * free-form user text. Historically they used regex character classes like
 * `[^\s@]+` or `[\w/-]+` to extract candidate paths, which silently fails on
 * file paths that contain spaces, Unicode, or regex-special characters.
 *
 * This module replaces that approach with a vault-driven scan: iterate the
 * known file list (longest path first) and match each path literally against
 * the input text. Longest-first ordering ensures that `folder/a.md` is
 * claimed before an `a.md` substring inside it could steal the replacement.
 */

export interface MentionOccurrence {
  /** The file path (or literal token) that matched. */
  key: string;
  /** Inclusive start offset in the input text. */
  start: number;
  /** Exclusive end offset in the input text. */
  end: number;
  /** The exact substring matched (includes any prefix). */
  matched: string;
}

export interface FindFileMentionsOptions {
  /**
   * Required prefix before the file path (e.g. `"@"`). When empty, the path
   * must stand alone — typically paired with `requireWhitespaceBoundary`.
   */
  prefix?: string;
  /**
   * When true, the matched token must start at string-start or after
   * whitespace, and end at string-end or before whitespace. Used by the chat
   * resolver where bare file paths are recognised only when they look like
   * "words".
   */
  requireWhitespaceBoundary?: boolean;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Escape a literal string for safe use in a RegExp. Exported for callers
 * that need to build their own patterns compatible with this module.
 */
export const escapeForRegex = escapeRegex;

/**
 * Find all non-overlapping occurrences of the given file paths inside `text`.
 *
 * Longer paths take priority: when two paths could both claim a region of
 * text, the longer one wins and the shorter one is skipped. This matters for
 * cases like two files `a.md` and `folder/a.md` where a user typed
 * `@folder/a.md` — without longest-first we'd replace the `a.md` suffix and
 * leave a broken `@folder/` fragment behind.
 *
 * Paths are matched literally (regex-escaped), so paths containing spaces,
 * unicode, brackets, or other special characters resolve correctly.
 */
export function findFileMentionOccurrences(
  text: string,
  filePaths: readonly string[],
  options: FindFileMentionsOptions = {}
): MentionOccurrence[] {
  const prefix = options.prefix ?? "";
  const sorted = [...filePaths].sort((a, b) => b.length - a.length);
  const occurrences: MentionOccurrence[] = [];

  for (const path of sorted) {
    const literal = `${prefix}${path}`;
    const escaped = escapeRegex(literal);

    // Trailing boundary. We avoid lookbehind (not supported on iOS < 16.4)
    // and implement the leading whitespace check manually below.
    let after = "";
    if (options.requireWhitespaceBoundary) {
      after = "(?=\\s|$)";
    } else if (prefix.length > 0) {
      // Prefix-anchored mode: the matched region must be a *complete* token —
      // terminated by whitespace, the start of another prefixed mention, or
      // end-of-string. This matches the legacy `@([^\s@]+)` semantic and
      // avoids claiming `@foo.md` inside `@foo.md/child`, `@foo.md_backup`,
      // `@foo.md-1`, `@foo.mdx`, or `@foo.md.backup`. The whole `@token`
      // must be exactly a vault path — otherwise no resolution.
      after = "(?=\\s|@|$)";
    }

    const pattern = new RegExp(`${escaped}${after}`, "g");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      if (options.requireWhitespaceBoundary && start > 0) {
        const prev = text.charCodeAt(start - 1);
        // Whitespace test: space, tab, newline, carriage return, form feed,
        // vertical tab, NBSP, etc. Matching `\s` in regex, but implemented
        // inline to keep the leading-boundary check lookbehind-free.
        const isWhitespace =
          prev === 0x20 || prev === 0x09 || prev === 0x0a || prev === 0x0d ||
          prev === 0x0c || prev === 0x0b || prev === 0xa0 ||
          /\s/.test(text[start - 1]);
        if (!isWhitespace) {
          // Skip this occurrence; `exec` has already advanced lastIndex past it.
          continue;
        }
      }

      if (overlaps(start, end, occurrences)) continue;
      occurrences.push({ key: path, start, end, matched: match[0] });
      // Zero-width matches would loop forever; the literal has length > 0 by
      // construction (path + optional prefix), so this can't trigger here —
      // but guard defensively.
      if (match[0].length === 0) pattern.lastIndex++;
    }
  }

  return occurrences.sort((a, b) => a.start - b.start);
}

/**
 * Find all literal-token occurrences (e.g. `@{selection}`, `@{content}`) in
 * text. Useful alongside `findFileMentionOccurrences` to build a unified
 * splice list.
 */
export function findLiteralOccurrences(text: string, token: string): MentionOccurrence[] {
  if (token.length === 0) return [];
  const results: MentionOccurrence[] = [];
  let idx = 0;
  while ((idx = text.indexOf(token, idx)) !== -1) {
    results.push({ key: token, start: idx, end: idx + token.length, matched: token });
    idx += token.length;
  }
  return results;
}

function overlaps(start: number, end: number, existing: readonly MentionOccurrence[]): boolean {
  for (const o of existing) {
    if (!(end <= o.start || start >= o.end)) return true;
  }
  return false;
}
