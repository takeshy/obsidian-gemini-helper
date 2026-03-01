import { MarkdownView } from "obsidian";
import { EditorView } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";
import {
  selectionHighlightField,
  setSelectionHighlight,
  type SelectionHighlightInfo,
  type SelectionLocationInfo,
} from "src/ui/selectionHighlight";
import type { GeminiHelperPlugin } from "src/plugin";

export class SelectionManager {
  private plugin: GeminiHelperPlugin;
  private lastSelection = "";
  private selectionHighlight: SelectionHighlightInfo | null = null;
  private selectionLocation: SelectionLocationInfo | null = null;

  constructor(plugin: GeminiHelperPlugin) {
    this.plugin = plugin;
  }

  captureSelectionFromView(view: MarkdownView | null): void {
    // Clear previous highlight and location first
    this.clearSelectionHighlight();
    this.selectionLocation = null;

    if (!view?.editor) {
      // Fallback to searching all markdown leaves
      this.captureSelection();
      return;
    }

    const editor = view.editor;
    const selection = editor.getSelection();
    if (selection) {
      this.lastSelection = selection;
      // Get selection range for highlighting
      const fromPos = editor.getCursor("from");
      const toPos = editor.getCursor("to");
      const from = editor.posToOffset(fromPos);
      const to = editor.posToOffset(toPos);
      this.applySelectionHighlight(view, from, to);
      // Store file path, line numbers, and character offsets
      const file = view.file;
      if (file) {
        this.selectionLocation = {
          filePath: file.path,
          startLine: fromPos.line + 1,
          endLine: toPos.line + 1,
          start: from,
          end: to,
        };
      }
    }
  }

  // Capture current selection from any markdown editor and apply highlight
  captureSelection(): void {
    // Clear previous highlight and location first
    this.clearSelectionHighlight();
    this.selectionLocation = null;

    // First try active view
    const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView) {
      const editor = activeView.editor;
      const selection = editor.getSelection();
      if (selection) {
        this.lastSelection = selection;
        // Get selection range for highlighting
        const fromPos = editor.getCursor("from");
        const toPos = editor.getCursor("to");
        const from = editor.posToOffset(fromPos);
        const to = editor.posToOffset(toPos);
        this.applySelectionHighlight(activeView, from, to);
        // Store file path, line numbers, and character offsets
        const file = activeView.file;
        if (file) {
          this.selectionLocation = {
            filePath: file.path,
            startLine: fromPos.line + 1, // 1-indexed for display
            endLine: toPos.line + 1,
            start: from,
            end: to,
          };
        }
        return;
      }
    }

    // Fallback: search all markdown leaves for a selection
    const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      const view = leaf.view as MarkdownView;
      if (view?.editor) {
        const editor = view.editor;
        const selection = editor.getSelection();
        if (selection) {
          this.lastSelection = selection;
          // Get selection range for highlighting
          const fromPos = editor.getCursor("from");
          const toPos = editor.getCursor("to");
          const from = editor.posToOffset(fromPos);
          const to = editor.posToOffset(toPos);
          this.applySelectionHighlight(view, from, to);
          // Store file path, line numbers, and character offsets
          const file = view.file;
          if (file) {
            this.selectionLocation = {
              filePath: file.path,
              startLine: fromPos.line + 1,
              endLine: toPos.line + 1,
              start: from,
              end: to,
            };
          }
          return;
        }
      }
    }
  }

  // Apply highlight decoration to the selection range
  private applySelectionHighlight(view: MarkdownView, from: number, to: number): void {
    try {
      // Access CodeMirror EditorView through the editor
      // @ts-expect-error - Obsidian's editor.cm is the CodeMirror EditorView
      const editorView = view.editor.cm as EditorView;
      if (!editorView) return;

      // Check if the StateField is already installed by directly querying the state
      const hasField = editorView.state.field(selectionHighlightField, false) !== undefined;
      if (!hasField) {
        editorView.dispatch({
          effects: StateEffect.appendConfig.of([selectionHighlightField]),
        });
      }

      // Apply the highlight
      editorView.dispatch({
        effects: setSelectionHighlight.of({ from, to }),
      });

      // Store the highlight info for later cleanup
      this.selectionHighlight = { view, from, to };
    } catch {
      // Ignore errors - highlight is optional
    }
  }

  // Clear the selection highlight
  clearSelectionHighlight(): void {
    if (!this.selectionHighlight) return;

    try {
      const { view } = this.selectionHighlight;
      // @ts-expect-error - Obsidian's editor.cm is the CodeMirror EditorView
      const editorView = view.editor?.cm as EditorView;
      if (editorView) {
        // Check if the field is installed before trying to clear
        const hasField = editorView.state.field(selectionHighlightField, false) !== undefined;
        if (hasField) {
          editorView.dispatch({
            effects: setSelectionHighlight.of(null),
          });
        }
      }
    } catch {
      // Ignore errors
    }

    this.selectionHighlight = null;
  }

  // Get the last captured selection
  getLastSelection(): string {
    return this.lastSelection;
  }

  // Get the location info of the last captured selection
  getSelectionLocation(): SelectionLocationInfo | null {
    return this.selectionLocation;
  }

  // Clear the cached selection (call after using it)
  clearLastSelection(): void {
    this.lastSelection = "";
    this.selectionLocation = null;
    this.clearSelectionHighlight();
  }
}
