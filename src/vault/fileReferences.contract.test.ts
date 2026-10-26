import { describe, expect, it, vi } from "vitest";
import { type App, TFile } from "obsidian";
import { getEnabledVaultTools } from "obsidian-llm-hub-common/core";
import {
  messagesForModel, resolveChatFileMentions, messagesToMarkdown, parseMarkdownToMessages,
} from "obsidian-llm-hub-common/chat";
import { executeToolCall } from "./toolExecutor";

const sources = {
  takeExternalSelection: () => null,
  getLastSelection: () => "",
  getSelectionLocation: () => null,
};

function setup() {
  const contents: Record<string, string> = {
    "Notes/Large Note.md": Array.from({ length: 10000 }, (_, index) => `line ${index + 1}`).join("\n"),
    "資料/Other Note.md": "other content",
    "Notes/Plain Text.txt": "one\r\ntwo\r\nthree\r\n",
  };
  const files = Object.entries(contents).map(([path, content]) => Object.assign(new TFile(), {
    path, name: path.split("/").pop(), extension: path.split(".").pop(),
    stat: { size: new TextEncoder().encode(content).length, mtime: 0, ctime: 0 },
  }));
  const read = vi.fn(async (file: TFile) => contents[file.path]);
  const app = {
    vault: {
      getFiles: () => files,
      getAbstractFileByPath: (path: string) => files.find(file => file.path === path) ?? null,
      read, cachedRead: read,
    },
    workspace: { getActiveFile: () => null },
    metadataCache: {
      getFirstLinkpathDest: (path: string) => files.find(file => file.path === path
        || file.path.replace(/\.md$/, "") === path) ?? null,
    },
  } as unknown as App;
  return { app, read };
}

describe("chat file reference and partial-read contract", () => {
  it("passes multiple spaced references as metadata and reads only the requested model context", async () => {
    const { app, read } = setup();
    const prompt = "Compare [[Notes/Large Note.md]] and [[資料/Other Note.md]].";
    const resolved = await resolveChatFileMentions(app, prompt, sources, {
      inlineFileMentions: false, maxNoteChars: 20000, readMentionText: read,
    });
    expect(resolved.displayContent).toBe(prompt);
    expect(resolved.llmContent).toContain("[[Notes/Large Note.md]] (type: md; size:");
    expect(resolved.llmContent).toContain("[[資料/Other Note.md]] (type: md; size:");
    expect(resolved.llmContent).not.toContain("line 5000");
    expect(resolved.displayContent).not.toContain("read_note");
    expect(read).not.toHaveBeenCalled();

    const message = { role: "user" as const, content: resolved.displayContent, llmContent: resolved.llmContent, timestamp: 1 };
    expect(messagesForModel([message])[0].content).toBe(resolved.llmContent);
    expect(message.content).toBe(prompt);

    const tool = getEnabledVaultTools({ allowWrite: false, allowDelete: false })
      .find(tool => tool.name === "read_note");
    expect(tool?.parameters).toMatchObject({ properties: {
      startLine: { type: "integer" }, endLine: { type: "integer" },
    } });
    const result = await executeToolCall(app, "read_note", {
      fileName: "Notes/Large Note.md", startLine: 5000, endLine: 5001,
    });
    expect(result).toMatchObject({
      success: true, content: "line 5000\nline 5001\n", startLine: 5000, endLine: 5001, totalLines: 10000,
    });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ endLine: 2 }, "one\r\ntwo\r\n", 1, 2],
    [{ startLine: 2 }, "two\r\nthree\r\n", 2, 3],
    [{ startLine: "2", endLine: "99" }, "two\r\nthree\r\n", 2, 3],
  ])("supports open-ended and numeric-string ranges: %j", async (range, content, startLine, endLine) => {
    const { app } = setup();
    const result = await executeToolCall(app, "read_note", { fileName: "Notes/Plain Text.txt", ...range });
    expect(result).toMatchObject({ success: true, content, startLine, endLine, totalLines: 3 });
  });

  it("preserves full text reads without range parameters", async () => {
    const { app } = setup();
    const result = await executeToolCall(app, "read_note", { fileName: "Notes/Plain Text.txt" });
    expect(result).toMatchObject({ success: true, content: "one\r\ntwo\r\nthree\r\n" });
  });

  it.each([{ startLine: 0 }, { startLine: 3, endLine: 2 }, { startLine: 1, startPage: 1 }])(
    "rejects invalid or mixed ranges before reading: %j", async range => {
      const { app, read } = setup();
      const result = await executeToolCall(app, "read_note", { fileName: "Notes/Plain Text.txt", ...range });
      expect(result.success).toBe(false);
      expect(read).not.toHaveBeenCalled();
    },
  );

  it("enforces allowed folders for partial reads", async () => {
    const { app, read } = setup();
    const result = await executeToolCall(app, "read_note", {
      fileName: "Notes/Large Note.md", startLine: 1, endLine: 2,
    }, { limitVaultToolScope: true, vaultToolAllowedFolders: ["Public"] });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Access denied");
    expect(read).not.toHaveBeenCalled();
  });

  it("keeps references readable after saving and loading chat history", async () => {
    const { app, read } = setup();
    const prompt = "Compare [[Notes/Large Note.md]] and [[資料/Other Note.md]].";
    const resolved = await resolveChatFileMentions(app, prompt, sources, {
      inlineFileMentions: false, readMentionText: read,
    });
    const markdown = await messagesToMarkdown([{
      role: "user", content: resolved.displayContent, llmContent: resolved.llmContent, timestamp: 1,
    }], "File references", 1, undefined);
    const restored = parseMarkdownToMessages(markdown);
    expect(restored?.messages[0].content).toBe(prompt);
    expect(restored?.messages[0].llmContent).toBe(resolved.llmContent);
  });

  it("keeps inline fallback text hidden and applies the host character limit", async () => {
    const { app, read } = setup();
    const prompt = "Read [[Notes/Large Note.md]]";
    const resolved = await resolveChatFileMentions(app, prompt, sources, {
      inlineFileMentions: true, maxNoteChars: 20, readMentionText: read,
    });
    expect(resolved.displayContent).toBe(prompt);
    expect(resolved.llmContent).toContain('[Content truncated at 20 characters]');
    expect(resolved.llmContent).not.toContain("line 5000");
    expect(read).toHaveBeenCalledTimes(1);
  });
});
