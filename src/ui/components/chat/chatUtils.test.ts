import { describe, expect, it } from "vitest";
import { isCaretOnFirstLine, isCaretOnLastLine } from "./chatUtils";

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
