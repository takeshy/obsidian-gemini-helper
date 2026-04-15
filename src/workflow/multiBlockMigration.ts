import { findWorkflowBlocks } from "./parser";

export interface MultiBlockMigrationEntry {
  blockIndex: number;
  path: string;
  raw: string;
}

export interface MultiBlockMigrationPlan {
  /** Paths + raw block content for blocks [1..N] that will be written to sibling files. */
  entries: MultiBlockMigrationEntry[];
  /** Original file contents with blocks [1..N] stripped out and excess blank lines collapsed. */
  stripped: string;
}

const DEFAULT_FALLBACK_BASE = "workflow";

function slugify(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || DEFAULT_FALLBACK_BASE
  );
}

/**
 * Pure planner for the "split multi-block workflow file into sibling files"
 * migration. Given the original file content, the folder the file lives in,
 * and the set of paths that already exist in the vault (or have been planned
 * earlier in a batch), returns the list of new files to create plus the
 * stripped version of the original content.
 *
 * Block[0] stays in the original file. Blocks[1..N] become new sibling files
 * whose basename is slugified from the block's YAML `name:`, falling back to
 * `workflow-<index>` and then suffixing `-2`, `-3`, ... on collision.
 *
 * Returns `null` when there is nothing to migrate (<2 blocks).
 */
export function planMultiBlockMigration(
  content: string,
  folderPath: string,
  existingPaths: ReadonlySet<string>,
): MultiBlockMigrationPlan | null {
  const blocks = findWorkflowBlocks(content);
  if (blocks.length < 2) return null;

  const entries: MultiBlockMigrationEntry[] = [];
  const prefix = folderPath ? `${folderPath}/` : "";
  for (let i = 1; i < blocks.length; i++) {
    const base = slugify(blocks[i].name || `workflow-${i + 1}`);
    let candidate = `${prefix}${base}.md`;
    let counter = 2;
    while (existingPaths.has(candidate) || entries.some(e => e.path === candidate)) {
      candidate = `${prefix}${base}-${counter}.md`;
      counter++;
    }
    entries.push({ blockIndex: i, path: candidate, raw: blocks[i].raw });
  }

  // Walk right-to-left so earlier block offsets stay valid during splice.
  let stripped = content;
  for (let i = blocks.length - 1; i >= 1; i--) {
    const b = blocks[i];
    stripped = stripped.slice(0, b.start) + stripped.slice(b.end);
  }
  stripped = stripped.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "\n");

  return { entries, stripped };
}
