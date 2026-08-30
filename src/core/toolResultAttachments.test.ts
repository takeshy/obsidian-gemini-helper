import { describe, expect, it } from "vitest";
import type { Attachment } from "src/types";
import {
  dedupeAttachments,
  getToolResultAttachments,
  withoutToolResultAttachments,
} from "./toolResultAttachments";

const pdf = (name: string, sourcePath?: string): Attachment => ({
  name,
  type: "pdf",
  mimeType: "application/pdf",
  data: "JVBERi0=",
  sourcePath,
});

describe("getToolResultAttachments", () => {
  it("returns well-formed attachments", () => {
    expect(getToolResultAttachments({ success: true, attachments: [pdf("a.pdf")] })).toHaveLength(1);
  });

  it("ignores results without usable attachments", () => {
    expect(getToolResultAttachments(null)).toEqual([]);
    expect(getToolResultAttachments("text")).toEqual([]);
    expect(getToolResultAttachments({ success: true })).toEqual([]);
    expect(getToolResultAttachments({ attachments: "nope" })).toEqual([]);
    expect(getToolResultAttachments({ attachments: [{ name: "a.pdf" }] })).toEqual([]);
  });
});

describe("withoutToolResultAttachments", () => {
  it("strips the base64 payload from the serialized result", () => {
    const result = withoutToolResultAttachments({ success: true, path: "a.pdf", attachments: [pdf("a.pdf")] });
    expect(result).toEqual({ success: true, path: "a.pdf" });
  });

  it("leaves results without attachments untouched", () => {
    const result = { success: true, content: "hello" };
    expect(withoutToolResultAttachments(result)).toBe(result);
  });
});

describe("dedupeAttachments", () => {
  it("uploads one source path only once per round", () => {
    const deduped = dedupeAttachments([
      pdf("Manual.pdf", "docs/Manual.pdf"),
      pdf("Manual.pdf", "docs/Manual.pdf"),
      pdf("Manual.pdf", "archive/Manual.pdf"),
    ]);
    expect(deduped.map((a) => a.sourcePath)).toEqual(["docs/Manual.pdf", "archive/Manual.pdf"]);
  });

  it("falls back to the name when no source path is set", () => {
    expect(dedupeAttachments([pdf("a.pdf"), pdf("a.pdf")])).toHaveLength(1);
  });
});
