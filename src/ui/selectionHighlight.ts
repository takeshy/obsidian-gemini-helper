import { StateField, StateEffect } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import type { MarkdownView } from "obsidian";

// Selection highlight decoration
const selectionHighlightMark = Decoration.mark({ class: "gemini-helper-selection-highlight" });

// StateEffect to set/clear the highlight range
export const setSelectionHighlight = StateEffect.define<{ from: number; to: number } | null>();

// StateField to manage highlight decorations
export const selectionHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    // Map decorations through document changes
    decorations = decorations.map(tr.changes);

    for (const effect of tr.effects) {
      if (effect.is(setSelectionHighlight)) {
        if (effect.value === null) {
          // Clear highlight
          decorations = Decoration.none;
        } else {
          // Set new highlight
          const { from, to } = effect.value;
          decorations = Decoration.set([selectionHighlightMark.range(from, to)]);
        }
      }
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

// Selection highlight info
export interface SelectionHighlightInfo {
  view: MarkdownView;
  from: number;
  to: number;
}

// Selection location info (file path, line numbers, and character offsets)
export interface SelectionLocationInfo {
  filePath: string;
  startLine: number;
  endLine: number;
  start: number;  // Character offset from beginning of file
  end: number;    // Character offset from beginning of file
}
