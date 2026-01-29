import { App, TFile } from "obsidian";
import { WorkflowNode, ExecutionContext, PromptCallbacks } from "../types";
import { replaceVariables } from "./utils";

// Helper function to create file info object from path
function createFileInfo(filePath: string): { path: string; basename: string; name: string; extension: string } {
  const parts = filePath.split("/");
  const basename = parts[parts.length - 1];
  const lastDotIndex = basename.lastIndexOf(".");
  const name = lastDotIndex > 0 ? basename.substring(0, lastDotIndex) : basename;
  const extension = lastDotIndex > 0 ? basename.substring(lastDotIndex + 1) : "";
  return { path: filePath, basename, name, extension };
}

// Handle prompt-file node - show file picker dialog or use active file in hotkey mode
// In hotkey mode: Uses __hotkeyActiveFile__ to auto-select active file without dialog
// In panel mode: Shows file picker dialog
// Set forcePrompt: "true" to always show the file picker dialog
// saveTo: stores file content, saveFileTo: stores file info JSON
export async function handlePromptFileNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App,
  promptCallbacks?: PromptCallbacks
): Promise<void> {
  const defaultPath = replaceVariables(
    node.properties["default"] || "",
    context
  );
  const saveTo = node.properties["saveTo"];
  const saveFileTo = node.properties["saveFileTo"];
  const forcePrompt = node.properties["forcePrompt"] === "true";

  if (!saveTo) {
    throw new Error("prompt-file node missing 'saveTo' property");
  }

  let filePath: string | null = null;

  // Check for hotkey mode (active file info passed via __hotkeyActiveFile__)
  // or event mode (file info passed via __eventFile__)
  const hotkeyActiveFile = context.variables.get("__hotkeyActiveFile__");
  const eventFile = context.variables.get("__eventFile__");

  // If forcePrompt is true, always show the dialog
  if (forcePrompt) {
    if (!promptCallbacks?.promptForFile) {
      throw new Error("File prompt callback not available");
    }
    filePath = await promptCallbacks.promptForFile(defaultPath);
    if (filePath === null) {
      throw new Error("File selection cancelled by user");
    }
  } else if (hotkeyActiveFile) {
    // Hotkey mode: use active file without showing dialog
    try {
      const fileInfo = JSON.parse(String(hotkeyActiveFile));
      if (fileInfo.path) {
        filePath = fileInfo.path as string;
      }
    } catch {
      // Invalid JSON, fall through to dialog
    }
  } else if (eventFile) {
    // Event mode: use event file without showing dialog
    try {
      const fileInfo = JSON.parse(String(eventFile));
      if (fileInfo.path) {
        filePath = fileInfo.path as string;
      }
    } catch {
      // Invalid JSON, fall through to dialog
    }
  }

  // Panel mode or fallback: show file picker dialog
  if (filePath === null) {
    if (!promptCallbacks?.promptForFile) {
      throw new Error("File prompt callback not available");
    }
    filePath = await promptCallbacks.promptForFile(defaultPath);
  }

  if (filePath === null) {
    throw new Error("File selection cancelled by user");
  }

  // Read file content
  const notePath = filePath.endsWith(".md") ? filePath : `${filePath}.md`;
  const file = app.vault.getAbstractFileByPath(notePath);
  if (!file || !(file instanceof TFile)) {
    throw new Error(`File not found: ${notePath}`);
  }
  const content = await app.vault.read(file);

  // Set content to saveTo
  context.variables.set(saveTo, content);

  // Set file info to saveFileTo if specified
  if (saveFileTo) {
    const fileInfo = createFileInfo(filePath);
    context.variables.set(saveFileTo, JSON.stringify(fileInfo));
  }
}

// Handle prompt-selection node - show file preview with text selection or use hotkey/event selection
// In hotkey mode: Uses __hotkeySelection__ to auto-use selected text without dialog
// In event mode: Uses __eventFileContent__ as full file selection
// In hotkey/event mode without selection: Uses full file content as selection
// In panel mode: Shows selection dialog
// saveTo: stores selected text, saveSelectionTo: stores selection metadata JSON
export async function handlePromptSelectionNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App,
  promptCallbacks?: PromptCallbacks
): Promise<void> {
  const saveTo = node.properties["saveTo"];
  const saveSelectionTo = node.properties["saveSelectionTo"];

  if (!saveTo) {
    throw new Error("prompt-selection node missing 'saveTo' property");
  }

  // Check for hotkey mode (selection passed via __hotkeySelection__)
  const hotkeySelection = context.variables.get("__hotkeySelection__");
  const hotkeySelectionInfo = context.variables.get("__hotkeySelectionInfo__");

  if (hotkeySelection !== undefined && hotkeySelection !== "") {
    // Hotkey mode with selection: use existing selection without dialog
    const selectionText = String(hotkeySelection);

    // Set user-specified variables only
    context.variables.set(saveTo, selectionText);
    if (saveSelectionTo && hotkeySelectionInfo) {
      context.variables.set(saveSelectionTo, String(hotkeySelectionInfo));
    }
    return;
  }

  // Check for hotkey mode without selection - use full file content
  const hotkeyContent = context.variables.get("__hotkeyContent__");
  const hotkeyActiveFile = context.variables.get("__hotkeyActiveFile__");

  if (hotkeyContent !== undefined && hotkeyContent !== "") {
    // Hotkey mode without selection: use full file content
    const fullContent = String(hotkeyContent);
    context.variables.set(saveTo, fullContent);

    // Create selection info for full file
    if (saveSelectionTo && hotkeyActiveFile) {
      try {
        const fileInfo = JSON.parse(String(hotkeyActiveFile));
        const lines = fullContent.split("\n");
        context.variables.set(saveSelectionTo, JSON.stringify({
          filePath: fileInfo.path,
          startLine: 1,
          endLine: lines.length,
          start: 0,
          end: fullContent.length,
        }));
      } catch {
        // Invalid JSON, skip setting selection info
      }
    }
    return;
  }

  // Check for event mode - use event file content
  const eventFileContent = context.variables.get("__eventFileContent__");
  const eventFile = context.variables.get("__eventFile__");
  const eventFilePath = context.variables.get("__eventFilePath__");

  if (eventFileContent !== undefined && eventFileContent !== "") {
    // Event mode: use full file content as selection
    const fullContent = String(eventFileContent);
    context.variables.set(saveTo, fullContent);

    // Create selection info for full file
    if (saveSelectionTo) {
      const filePath = eventFilePath ? String(eventFilePath) : "";
      const lines = fullContent.split("\n");
      context.variables.set(saveSelectionTo, JSON.stringify({
        filePath: filePath,
        startLine: 1,
        endLine: lines.length,
        start: 0,
        end: fullContent.length,
      }));
    }
    return;
  }

  // Event mode without content (e.g., delete event) - try to read from event file
  if (eventFile) {
    try {
      const fileInfo = JSON.parse(String(eventFile));
      if (fileInfo.path) {
        const file = app.vault.getAbstractFileByPath(fileInfo.path);
        if (file && file instanceof TFile) {
          const content = await app.vault.read(file);
          context.variables.set(saveTo, content);

          if (saveSelectionTo) {
            const lines = content.split("\n");
            context.variables.set(saveSelectionTo, JSON.stringify({
              filePath: fileInfo.path,
              startLine: 1,
              endLine: lines.length,
              start: 0,
              end: content.length,
            }));
          }
          return;
        }
      }
    } catch {
      // Invalid JSON or file not readable, fall through to dialog
    }
  }

  // Panel mode: show selection dialog
  if (!promptCallbacks?.promptForSelection) {
    throw new Error("Selection prompt callback not available");
  }

  const result = await promptCallbacks.promptForSelection();

  if (result === null) {
    throw new Error("Selection cancelled by user");
  }

  // Read the file content to extract the actual selected text
  const file = app.vault.getAbstractFileByPath(result.path);
  if (!file || !(file instanceof TFile)) {
    throw new Error(`File not found: ${result.path}`);
  }
  const fileContent = await app.vault.read(file);

  // Convert EditorPosition (line, ch) to character offsets
  const lines = fileContent.split("\n");
  let startOffset = 0;
  for (let i = 0; i < result.start.line; i++) {
    startOffset += lines[i].length + 1; // +1 for newline
  }
  startOffset += result.start.ch;

  let endOffset = 0;
  for (let i = 0; i < result.end.line; i++) {
    endOffset += lines[i].length + 1;
  }
  endOffset += result.end.ch;

  // Extract the selected text
  const selectedText = fileContent.substring(startOffset, endOffset);

  // Set user-specified variables only
  context.variables.set(saveTo, selectedText);
  if (saveSelectionTo) {
    context.variables.set(saveSelectionTo, JSON.stringify({
      filePath: result.path,
      startLine: result.start.line,
      endLine: result.end.line,
      start: startOffset,
      end: endOffset,
    }));
  }
}

// Handle dialog node - show a dialog with options and buttons
export async function handleDialogNode(
  node: WorkflowNode,
  context: ExecutionContext,
  _app: App,
  promptCallbacks?: PromptCallbacks
): Promise<void> {
  const title = replaceVariables(node.properties["title"] || "Dialog", context);
  const message = replaceVariables(node.properties["message"] || "", context);
  const optionsStr = replaceVariables(node.properties["options"] || "", context);
  const multiSelect = node.properties["multiSelect"] === "true";
  const markdown = node.properties["markdown"] === "true";
  const button1 = replaceVariables(node.properties["button1"] || "OK", context);
  const button2Prop = node.properties["button2"];
  const button2 = button2Prop ? replaceVariables(button2Prop, context) : undefined;
  const inputTitleProp = node.properties["inputTitle"];
  const inputTitle = inputTitleProp ? replaceVariables(inputTitleProp, context) : undefined;
  const multiline = node.properties["multiline"] === "true";
  const defaultsProp = node.properties["defaults"];
  const saveTo = node.properties["saveTo"];

  // Parse defaults JSON
  let defaults: { input?: string; selected?: string[] } | undefined;
  if (defaultsProp) {
    try {
      const parsed = JSON.parse(replaceVariables(defaultsProp, context));
      defaults = {
        input: parsed.input,
        selected: Array.isArray(parsed.selected) ? parsed.selected : undefined,
      };
    } catch {
      // Invalid JSON, ignore defaults
    }
  }

  // Parse options (comma-separated)
  const options = optionsStr
    ? optionsStr.split(",").map((o) => o.trim()).filter((o) => o.length > 0)
    : [];

  if (!promptCallbacks?.promptForDialog) {
    throw new Error("Dialog prompt callback not available");
  }

  const result = await promptCallbacks.promptForDialog(
    title,
    message,
    options,
    multiSelect,
    button1,
    button2,
    markdown,
    inputTitle,
    defaults,
    multiline
  );

  if (result === null) {
    throw new Error("Dialog cancelled by user");
  }

  // Save result to variable
  if (saveTo) {
    context.variables.set(saveTo, JSON.stringify(result));
  }
}
