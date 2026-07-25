import { describe, expect, it, vi } from "vitest";
import type { ButtonComponent } from "obsidian";
import { setDestructiveButton } from "./buttonCompat";

describe("setDestructiveButton", () => {
  it("uses setWarning, which is available at the declared minimum version", () => {
    const result = {} as ButtonComponent;
    const setWarning = vi.fn(() => result);
    const button = { setWarning } as unknown as ButtonComponent;

    expect(setDestructiveButton(button)).toBe(result);
    expect(setWarning).toHaveBeenCalledOnce();
  });
});
