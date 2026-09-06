import { describe, expect, it } from "vitest";
import { isCaretOnFirstLine, isCaretOnLastLine, limitConversationHistory } from "./chatUtils";
import type { Message } from "src/types";

describe("chat input caret helpers", () => {
	it("detects whether the caret is on the first line", () => {
		expect(isCaretOnFirstLine("first\nsecond", 3)).toBe(true);
		expect(isCaretOnFirstLine("first\nsecond", 8)).toBe(false);
	});

	it("detects whether the caret is on the last line", () => {
		expect(isCaretOnLastLine("first\nsecond", 3)).toBe(false);
		expect(isCaretOnLastLine("first\nsecond", 8)).toBe(true);
	});
});

describe("limitConversationHistory", () => {
  const message = (content: string) => ({ role: "user", content, timestamp: 0 }) as unknown as Message;

  it("keeps the newest message plus the requested number of older ones", () => {
    const messages = ["a", "b", "c", "d"].map(message);
    expect(limitConversationHistory(messages, 1).map((m) => m.content)).toEqual(["c", "d"]);
    expect(limitConversationHistory(messages, 0).map((m) => m.content)).toEqual(["d"]);
  });

  it("clamps out-of-range limits and tolerates an empty conversation", () => {
    const messages = ["a", "b"].map(message);
    expect(limitConversationHistory(messages, -5).map((m) => m.content)).toEqual(["b"]);
    expect(limitConversationHistory(messages, 999)).toHaveLength(2);
    expect(limitConversationHistory([], 3)).toEqual([]);
  });
});
