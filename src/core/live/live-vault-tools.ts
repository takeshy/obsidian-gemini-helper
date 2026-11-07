import { MarkdownView, type App } from "obsidian";
import { isFileAllowedForVaultTools } from "obsidian-llm-hub-common/core";
import { createToolExecutor } from "src/vault/toolExecutor";
import type { GeminiHelperSettings, Message } from "src/types";
import { searchLiveRag, type LiveRagSelection } from "./live-rag";
import { liveToolDefinitions, type LiveFileAccess, type LiveToolCall } from "./live-tool-definitions";
import type { LiveTranscript } from "./live-session";

/** Dedicated read-only runner, with the same allowed-folder scope as normal chat. */
export function createLiveVaultToolRunner(app: App, settings: GeminiHelperSettings, access: LiveFileAccess, rag?: LiveRagSelection) {
  const allowed = new Set(liveToolDefinitions(access).map(tool => tool.name));
  const folders = [...settings.aiVaultToolAllowedFolders];
  const maxChars = Math.max(1, Math.min(settings.maxNoteChars || 40_000, 40_000));
  const execute = createToolExecutor(app, {
    limitVaultToolScope: true, vaultToolAllowedFolders: folders,
    listNotesLimit: Math.max(1, Math.min(settings.listNotesLimit || 50, 50)), maxNoteChars: maxChars,
    pdfInputMode: "extract-text",
  });
  return async (call: LiveToolCall, signal: AbortSignal): Promise<unknown> => {
    signal.throwIfAborted();
    if (!allowed.has(call.name)) return { error: "This tool is unavailable in Live." };
    try {
      let result: unknown;
      let resultCount: number | undefined;
      if (call.name === "read_current_file") {
        const view = app.workspace.getMostRecentLeaf()?.view;
        const file = view instanceof MarkdownView ? view.file : app.workspace.getActiveFile();
        if (!file) return { error: "No file is open in the editor." };
        if (!isFileAllowedForVaultTools(file, folders)) return { error: "Access denied: the current file is outside the allowed vault folders." };
        if (view instanceof MarkdownView) {
          const content = view.editor.getValue();
          result = { filePath: file.path, content: content.slice(0, maxChars), truncated: content.length > maxChars, unsavedEditorText: true };
        } else result = await execute("read_note", { fileName: file.path });
      } else if (call.name === "rag_search") {
        if (!rag || !access.ragEnabled) return { error: "No RAG setting is selected." };
        const query = typeof call.args.query === "string" ? call.args.query.trim() : "";
        if (!query) return { error: "A non-empty query is required." };
        const response = await searchLiveRag(settings.googleApiKey, rag, query, settings.ragTopK, signal);
        resultCount = response.resultCount;
        result = response;
      } else result = await execute(call.name, call.args);
      signal.throwIfAborted();
      const json = JSON.stringify(result);
      return json && json.length > 40_000 ? { ...(resultCount !== undefined ? { resultCount } : {}), truncated: true, resultText: json.slice(0, 40_000) } : result;
    } catch (error) {
      signal.throwIfAborted();
      let message = error instanceof Error ? error.message : String(error);
      if (settings.googleApiKey) message = message.split(settings.googleApiKey).join("[redacted]");
      return { error: message.slice(0, 1000) };
    }
  };
}

export function liveTranscriptMessages(transcript: LiveTranscript[], now = Date.now()): Message[] {
  return transcript.filter(item => item.text.trim()).map((item, index) => ({ role: item.role, content: item.text, timestamp: now + index }));
}
