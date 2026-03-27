import * as Diff from "diff";
import { computeLineDiff, type DiffLine, type DiffLineType } from "./EditConfirmationModal";
import { t } from "src/i18n";

export { type DiffLine, type DiffLineType };

/**
 * Options for rendering a diff view
 */
export interface DiffRenderOptions {
  viewMode: "unified" | "split";
  enableComments: boolean;
}

/**
 * A comment attached to a specific diff line
 */
export interface LineComment {
  lineIndex: number;
  lineType: DiffLineType;
  lineNum: number;
  content: string;
  comment: string;
}

/**
 * State object returned by renderDiffView for external interaction
 */
export interface DiffRendererState {
  container: HTMLElement;
  viewMode: "unified" | "split";
  lineComments: Map<number, LineComment>;
  onCommentsChange: (() => void) | null;
  setViewMode: (mode: "unified" | "split") => void;
  destroy: () => void;
}

/**
 * Paired row for split view: left (old) and right (new) sides
 */
interface SplitRow {
  left: DiffLine | null;
  right: DiffLine | null;
  leftIndex: number;
  rightIndex: number;
}

/**
 * Pair info for word-level diff: maps a line index to its paired counterpart
 */
interface LinePair {
  removedIndex: number;
  addedIndex: number;
  removedContent: string;
  addedContent: string;
}

/**
 * Build pairs of removed/added lines for word-level diff
 */
function buildLinePairs(diffLines: DiffLine[]): Map<number, LinePair> {
  const pairs = new Map<number, LinePair>();
  let i = 0;
  while (i < diffLines.length) {
    if (diffLines[i].type === "removed") {
      const removed: { index: number; line: DiffLine }[] = [];
      const added: { index: number; line: DiffLine }[] = [];
      while (i < diffLines.length && diffLines[i].type === "removed") {
        removed.push({ index: i, line: diffLines[i] });
        i++;
      }
      while (i < diffLines.length && diffLines[i].type === "added") {
        added.push({ index: i, line: diffLines[i] });
        i++;
      }
      const pairCount = Math.min(removed.length, added.length);
      for (let j = 0; j < pairCount; j++) {
        const pair: LinePair = {
          removedIndex: removed[j].index,
          addedIndex: added[j].index,
          removedContent: removed[j].line.content,
          addedContent: added[j].line.content,
        };
        pairs.set(removed[j].index, pair);
        pairs.set(added[j].index, pair);
      }
    } else {
      i++;
    }
  }
  return pairs;
}

/**
 * Render word-level diff highlights into a content element
 */
function renderWordDiff(
  contentEl: HTMLElement,
  oldContent: string,
  newContent: string,
  side: "old" | "new"
): void {
  const changes = Diff.diffWords(oldContent, newContent);
  for (const change of changes) {
    if (change.added) {
      if (side === "new") {
        const span = contentEl.createSpan({ cls: "gemini-helper-diff-word-added" });
        span.textContent = change.value;
      }
      // Skip added parts on old side
    } else if (change.removed) {
      if (side === "old") {
        const span = contentEl.createSpan({ cls: "gemini-helper-diff-word-removed" });
        span.textContent = change.value;
      }
      // Skip removed parts on new side
    } else {
      const span = contentEl.createSpan();
      span.textContent = change.value;
    }
  }
}

/**
 * Pair diff lines for split view
 */
function pairLinesForSplitView(diffLines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let i = 0;
  while (i < diffLines.length) {
    if (diffLines[i].type === "unchanged") {
      rows.push({ left: diffLines[i], right: diffLines[i], leftIndex: i, rightIndex: i });
      i++;
    } else {
      const removed: { index: number; line: DiffLine }[] = [];
      const added: { index: number; line: DiffLine }[] = [];
      while (i < diffLines.length && diffLines[i].type === "removed") {
        removed.push({ index: i, line: diffLines[i] });
        i++;
      }
      while (i < diffLines.length && diffLines[i].type === "added") {
        added.push({ index: i, line: diffLines[i] });
        i++;
      }
      const maxLen = Math.max(removed.length, added.length);
      for (let j = 0; j < maxLen; j++) {
        rows.push({
          left: j < removed.length ? removed[j].line : null,
          right: j < added.length ? added[j].line : null,
          leftIndex: j < removed.length ? removed[j].index : -1,
          rightIndex: j < added.length ? added[j].index : -1,
        });
      }
    }
  }
  return rows;
}

/**
 * Render a unified diff view into the container
 */
function renderUnifiedView(
  container: HTMLElement,
  diffLines: DiffLine[],
  linePairs: Map<number, LinePair>,
  enableComments: boolean,
  lineComments: Map<number, LineComment>,
  openCommentEditor: ((lineIndex: number, afterEl: HTMLElement) => void) | null
): void {
  container.addClass("gemini-helper-diff-unified");
  container.removeClass("gemini-helper-diff-split");

  for (let idx = 0; idx < diffLines.length; idx++) {
    const line = diffLines[idx];
    const lineEl = container.createDiv({
      cls: `gemini-helper-diff-line gemini-helper-diff-${line.type}`,
    });

    if (lineComments.has(idx)) {
      lineEl.addClass("gemini-helper-diff-has-comment");
    }

    // Old line number
    const oldNumEl = lineEl.createSpan({ cls: "gemini-helper-diff-linenum gemini-helper-diff-linenum-old" });
    oldNumEl.textContent = line.oldLineNum != null ? String(line.oldLineNum) : "";

    // New line number
    const newNumEl = lineEl.createSpan({ cls: "gemini-helper-diff-linenum gemini-helper-diff-linenum-new" });
    newNumEl.textContent = line.newLineNum != null ? String(line.newLineNum) : "";

    // Gutter (+/-/space)
    const gutterEl = lineEl.createSpan({ cls: "gemini-helper-diff-gutter" });
    if (line.type === "removed") {
      gutterEl.textContent = "-";
    } else if (line.type === "added") {
      gutterEl.textContent = "+";
    } else {
      gutterEl.textContent = " ";
    }

    // Content with optional word-level diff
    const contentEl = lineEl.createSpan({ cls: "gemini-helper-diff-content" });
    const pair = linePairs.get(idx);
    if (pair && line.type === "removed") {
      renderWordDiff(contentEl, pair.removedContent, pair.addedContent, "old");
    } else if (pair && line.type === "added") {
      renderWordDiff(contentEl, pair.removedContent, pair.addedContent, "new");
    } else {
      contentEl.textContent = line.content || " ";
    }

    // Click-to-comment on added/removed lines
    if (enableComments && line.type !== "unchanged" && openCommentEditor) {
      lineEl.addClass("gemini-helper-diff-commentable");
      lineEl.addEventListener("click", (e) => {
        // Don't trigger if clicking inside a comment editor
        if ((e.target as HTMLElement).closest(".gemini-helper-diff-comment-editor")) return;
        openCommentEditor(idx, lineEl);
      });
    }

    // Show existing comment indicator inline
    if (lineComments.has(idx)) {
      const commentPreview = container.createDiv({ cls: "gemini-helper-diff-comment-preview" });
      const commentText = commentPreview.createSpan();
      commentText.textContent = lineComments.get(idx)!.comment;
    }
  }
}

/**
 * Render a split (side-by-side) diff view into the container
 */
function renderSplitView(
  container: HTMLElement,
  diffLines: DiffLine[],
  linePairs: Map<number, LinePair>,
  enableComments: boolean,
  lineComments: Map<number, LineComment>,
  openCommentEditor: ((lineIndex: number, afterEl: HTMLElement) => void) | null
): void {
  container.addClass("gemini-helper-diff-split");
  container.removeClass("gemini-helper-diff-unified");

  const rows = pairLinesForSplitView(diffLines);

  for (const row of rows) {
    const rowEl = container.createDiv({ cls: "gemini-helper-diff-split-row" });

    // Left side (old)
    const leftEl = rowEl.createDiv({
      cls: `gemini-helper-diff-split-cell gemini-helper-diff-split-left ${row.left ? `gemini-helper-diff-${row.left.type}` : "gemini-helper-diff-split-filler"}`,
    });
    if (row.left) {
      if (lineComments.has(row.leftIndex)) {
        leftEl.addClass("gemini-helper-diff-has-comment");
      }
      const lineNumEl = leftEl.createSpan({ cls: "gemini-helper-diff-linenum" });
      lineNumEl.textContent = row.left.oldLineNum != null ? String(row.left.oldLineNum) : "";

      const gutterEl = leftEl.createSpan({ cls: "gemini-helper-diff-gutter" });
      gutterEl.textContent = row.left.type === "removed" ? "-" : " ";

      const contentEl = leftEl.createSpan({ cls: "gemini-helper-diff-content" });
      const pair = linePairs.get(row.leftIndex);
      if (pair && row.left.type === "removed") {
        renderWordDiff(contentEl, pair.removedContent, pair.addedContent, "old");
      } else {
        contentEl.textContent = row.left.content || " ";
      }

      if (enableComments && row.left.type === "removed" && openCommentEditor) {
        leftEl.addClass("gemini-helper-diff-commentable");
        const capturedIndex = row.leftIndex;
        leftEl.addEventListener("click", (e) => {
          if ((e.target as HTMLElement).closest(".gemini-helper-diff-comment-editor")) return;
          openCommentEditor(capturedIndex, rowEl);
        });
      }
    }

    // Right side (new)
    const rightEl = rowEl.createDiv({
      cls: `gemini-helper-diff-split-cell gemini-helper-diff-split-right ${row.right ? `gemini-helper-diff-${row.right.type}` : "gemini-helper-diff-split-filler"}`,
    });
    if (row.right) {
      if (lineComments.has(row.rightIndex)) {
        rightEl.addClass("gemini-helper-diff-has-comment");
      }
      const lineNumEl = rightEl.createSpan({ cls: "gemini-helper-diff-linenum" });
      lineNumEl.textContent = row.right.newLineNum != null ? String(row.right.newLineNum) : "";

      const gutterEl = rightEl.createSpan({ cls: "gemini-helper-diff-gutter" });
      gutterEl.textContent = row.right.type === "added" ? "+" : " ";

      const contentEl = rightEl.createSpan({ cls: "gemini-helper-diff-content" });
      const pair = linePairs.get(row.rightIndex);
      if (pair && row.right.type === "added") {
        renderWordDiff(contentEl, pair.removedContent, pair.addedContent, "new");
      } else {
        contentEl.textContent = row.right.content || " ";
      }

      if (enableComments && row.right.type === "added" && openCommentEditor) {
        rightEl.addClass("gemini-helper-diff-commentable");
        const capturedIndex = row.rightIndex;
        rightEl.addEventListener("click", (e) => {
          if ((e.target as HTMLElement).closest(".gemini-helper-diff-comment-editor")) return;
          openCommentEditor(capturedIndex, rowEl);
        });
      }
    }

    // Show comment previews for this row
    const commentIndices = [row.leftIndex, row.rightIndex].filter(
      (idx) => idx >= 0 && lineComments.has(idx)
    );
    for (const idx of commentIndices) {
      const commentPreview = container.createDiv({ cls: "gemini-helper-diff-comment-preview" });
      const commentText = commentPreview.createSpan();
      commentText.textContent = lineComments.get(idx)!.comment;
    }
  }
}

/**
 * Create a comment editor inline after a diff line
 */
function createCommentEditor(
  diffLines: DiffLine[],
  lineIndex: number,
  afterEl: HTMLElement,
  lineComments: Map<number, LineComment>,
  onSave: () => void
): void {
  // Remove any existing open editor
  const existing = afterEl.parentElement?.querySelector(".gemini-helper-diff-comment-editor");
  if (existing) {
    existing.remove();
  }

  const line = diffLines[lineIndex];
  const existingComment = lineComments.get(lineIndex);

  const editor = document.createElement("div");
  editor.className = "gemini-helper-diff-comment-editor";
  afterEl.insertAdjacentElement("afterend", editor);

  const textarea = document.createElement("textarea");
  textarea.className = "gemini-helper-diff-comment-input";
  textarea.placeholder = t("diff.commentPlaceholder");
  textarea.rows = 2;
  if (existingComment) {
    textarea.value = existingComment.comment;
  }
  // Prevent clicks inside the editor from triggering diff line click handlers
  editor.addEventListener("click", (e) => e.stopPropagation());
  editor.appendChild(textarea);

  const actions = document.createElement("div");
  actions.className = "gemini-helper-diff-comment-actions";
  editor.appendChild(actions);

  const saveBtn = document.createElement("button");
  saveBtn.textContent = t("diff.saveComment");
  saveBtn.className = "mod-cta";
  saveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const text = textarea.value.trim();
    if (text) {
      lineComments.set(lineIndex, {
        lineIndex,
        lineType: line.type,
        lineNum: (line.type === "removed" ? line.oldLineNum : line.newLineNum) ?? 0,
        content: line.content,
        comment: text,
      });
    } else if (existingComment) {
      // Empty text removes existing comment
      lineComments.delete(lineIndex);
    }
    editor.remove();
    onSave();
  });
  actions.appendChild(saveBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = t("diff.cancelComment");
  cancelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    editor.remove();
  });
  actions.appendChild(cancelBtn);

  if (existingComment) {
    const removeBtn = document.createElement("button");
    removeBtn.textContent = t("diff.removeComment");
    removeBtn.className = "mod-warning";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      lineComments.delete(lineIndex);
      editor.remove();
      onSave();
    });
    actions.appendChild(removeBtn);
  }

  textarea.focus();
}

/**
 * Main entry point: render a diff view into a parent element
 */
export function renderDiffView(
  parentEl: HTMLElement,
  oldText: string,
  newText: string,
  options?: Partial<DiffRenderOptions>
): DiffRendererState {
  const opts: DiffRenderOptions = {
    viewMode: options?.viewMode ?? "split",
    enableComments: options?.enableComments ?? false,
  };

  const diffLines = computeLineDiff(oldText, newText);
  const linePairs = buildLinePairs(diffLines);
  const lineComments = new Map<number, LineComment>();

  const container = parentEl.createDiv({ cls: "gemini-helper-diff-view" });
  let currentMode = opts.viewMode;

  const openCommentEditor = opts.enableComments
    ? (lineIndex: number, afterEl: HTMLElement) => {
        createCommentEditor(diffLines, lineIndex, afterEl, lineComments, () => {
          rerender();
          state.onCommentsChange?.();
        });
      }
    : null;

  function rerender() {
    container.empty();
    container.className = "gemini-helper-diff-view";
    if (currentMode === "unified") {
      renderUnifiedView(container, diffLines, linePairs, opts.enableComments, lineComments, openCommentEditor);
    } else {
      renderSplitView(container, diffLines, linePairs, opts.enableComments, lineComments, openCommentEditor);
    }
  }

  rerender();

  const state: DiffRendererState = {
    container,
    viewMode: currentMode,
    lineComments,
    onCommentsChange: null,
    setViewMode(mode: "unified" | "split") {
      currentMode = mode;
      state.viewMode = mode;
      rerender();
    },
    destroy() {
      container.remove();
    },
  };

  return state;
}

/**
 * Format line comments as structured feedback for the LLM
 */
export function formatLineComments(
  filePath: string,
  lineComments: Map<number, LineComment>
): string {
  if (lineComments.size === 0) return "";

  const lines: string[] = [`File: ${filePath}`, ""];

  const sorted = [...lineComments.values()].sort((a, b) => a.lineIndex - b.lineIndex);

  for (const lc of sorted) {
    const prefix = lc.lineType === "removed" ? "-" : "+";
    lines.push(`Line ${lc.lineNum} (${prefix}): \`${lc.content.trim()}\``);
    lines.push(`Comment: ${lc.comment}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Create a Unified/Split view toggle and attach it to a DiffRendererState
 */
export function createDiffViewToggle(
  parentEl: HTMLElement,
  state: DiffRendererState
): void {
  const toggle = parentEl.createDiv({ cls: "gemini-helper-diff-view-toggle" });
  const unifiedBtn = toggle.createEl("button", {
    text: t("diff.unifiedView"),
    cls: `gemini-helper-diff-view-toggle-btn${state.viewMode === "unified" ? " is-active" : ""}`,
  });
  const splitBtn = toggle.createEl("button", {
    text: t("diff.splitView"),
    cls: `gemini-helper-diff-view-toggle-btn${state.viewMode === "split" ? " is-active" : ""}`,
  });

  unifiedBtn.addEventListener("click", () => {
    if (state.viewMode !== "unified") {
      state.setViewMode("unified");
      unifiedBtn.addClass("is-active");
      splitBtn.removeClass("is-active");
    }
  });
  splitBtn.addEventListener("click", () => {
    if (state.viewMode !== "split") {
      state.setViewMode("split");
      splitBtn.addClass("is-active");
      unifiedBtn.removeClass("is-active");
    }
  });
}
