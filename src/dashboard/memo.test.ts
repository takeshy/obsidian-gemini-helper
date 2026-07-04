import { describe, expect, it } from "vitest";
import { parseMemoFile, serializeMemoFile } from "./memo";

describe("memo file format", () => {
  it("round-trips memos without quotes", () => {
    const content = serializeMemoFile("Books/sample.epub", [{
      id: "1",
      createdAt: "2026-07-04T12:00:00.000Z",
      text: "読了",
    }]);

    expect(parseMemoFile(content).memos).toEqual([{
      id: "1",
      createdAt: "2026-07-04T12:00:00.000Z",
      text: "読了",
    }]);
  });

  it("round-trips memos with selected quote relations", () => {
    const content = serializeMemoFile("Books/sample.epub", [{
      id: "1",
      createdAt: "2026-07-04T12:00:00.000Z",
      quote: "selected\ntext",
      quoteAnchor: "page=3",
      quotePrefix: "before",
      quoteSuffix: "after",
      text: "note body",
    }]);

    expect(parseMemoFile(content).memos[0]).toMatchObject({
      id: "1",
      createdAt: "2026-07-04T12:00:00.000Z",
      quote: "selected\ntext",
      quoteAnchor: "page=3",
      quotePrefix: "before",
      quoteSuffix: "after",
      text: "note body",
    });
    expect(content).toContain("anchor: page=3");
    expect(content).toContain("quote-prefix: before");
    expect(content).toContain("---\nsource: Books/sample.epub\n---\n");
  });
});
