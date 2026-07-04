import { describe, expect, it } from "vitest";
import { resolveEpubHref, type SpineLinkTarget } from "./epub";

const spineByPath = new Map<string, SpineLinkTarget>([
  ["OEBPS/chap1.xhtml", { index: 0, path: "OEBPS/chap1.xhtml" }],
  ["OEBPS/chap2.xhtml", { index: 1, path: "OEBPS/chap2.xhtml" }],
]);

const chapter = spineByPath.get("OEBPS/chap1.xhtml")!;

describe("resolveEpubHref", () => {
  it("keeps same-chapter anchors inside the generated chapter id space", () => {
    expect(resolveEpubHref("#note", chapter, spineByPath)).toBe("#epub-c1-note");
  });

  it("maps cross-chapter anchors to generated document anchors", () => {
    expect(resolveEpubHref("chap2.xhtml#target", chapter, spineByPath)).toBe("#epub-c2-target");
  });

  it("maps cross-chapter links without fragments to chapter top", () => {
    expect(resolveEpubHref("chap2.xhtml", chapter, spineByPath)).toBe("#epub-chapter-2");
  });

  it("disables unresolved relative links instead of sending the reader to top", () => {
    expect(resolveEpubHref("missing.xhtml", chapter, spineByPath)).toBeNull();
  });
});
