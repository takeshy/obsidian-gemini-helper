import { describe, expect, it, vi } from "vitest";
import type { ButtonComponent } from "obsidian";
import { setDestructiveButton } from "./buttonCompat";

describe("setDestructiveButton", () => {
  it("uses setDestructive when available", () => {
    const result = {} as ButtonComponent;
    const setDestructive = vi.fn(() => result);
    const setWarning = vi.fn(() => result);
    const button = { setDestructive, setWarning } as unknown as ButtonComponent;

    expect(setDestructiveButton(button)).toBe(result);
    expect(setDestructive).toHaveBeenCalledOnce();
    expect(setWarning).not.toHaveBeenCalled();
  });

  it("falls back to setWarning before Obsidian 1.13", () => {
    const result = {} as ButtonComponent;
    const setWarning = vi.fn(() => result);
    const button = { setWarning } as unknown as ButtonComponent;

    expect(setDestructiveButton(button)).toBe(result);
    expect(setWarning).toHaveBeenCalledOnce();
  });
});
