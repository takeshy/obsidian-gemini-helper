import { describe, expect, it } from "vitest";
import {
  buildGeminiThinkingConfig,
  getReasoningEffortOptions,
  isThinkingRequired,
  resolveGeminiThinkingLevel,
} from "./gemini";

describe("Gemini reasoning effort", () => {
  it.each(["low", "medium", "high", "xhigh"] as const)("supports Hydrogen %s thinking in both APIs", (level) => {
    expect(buildGeminiThinkingConfig("gemini-4-hydrogen", false, level)).toEqual({
      includeThoughts: true,
      thinkingLevel: level.toUpperCase(),
    });
    expect(resolveGeminiThinkingLevel("gemini-4-hydrogen", false, level)).toBe(level);
  });

  it("keeps Hydrogen thinking enabled at low for legacy OFF callers", () => {
    expect(isThinkingRequired("gemini-4-hydrogen")).toBe(true);
    expect(buildGeminiThinkingConfig("gemini-4-hydrogen", false)).toEqual({ thinkingLevel: "LOW" });
    expect(resolveGeminiThinkingLevel("gemini-4-hydrogen", false)).toBe("low");
    expect(buildGeminiThinkingConfig("gemini-4-hydrogen", true)).toEqual({ includeThoughts: true, thinkingLevel: "HIGH" });
  });

  it("leaves Hydrogen default thinking to the API", () => {
    expect(buildGeminiThinkingConfig("gemini-4-hydrogen", undefined)).toBeUndefined();
    expect(resolveGeminiThinkingLevel("gemini-4-hydrogen", undefined)).toBeUndefined();
    expect(buildGeminiThinkingConfig("gemini-4-hydrogen", false, "default")).toBeUndefined();
    expect(resolveGeminiThinkingLevel("gemini-4-hydrogen", false, "default")).toBeUndefined();
  });

  it.each(["minimal", "none", "max"] as const)("does not send unsupported Hydrogen effort %s", (level) => {
    expect(buildGeminiThinkingConfig("gemini-4-hydrogen", false, level)).toBeUndefined();
    expect(resolveGeminiThinkingLevel("gemini-4-hydrogen", false, level)).toBeUndefined();
  });

  it("passes an explicit thinking level with thought summaries", () => {
    expect(buildGeminiThinkingConfig("gemini-3.8-flash", undefined, "medium")).toEqual({
      includeThoughts: true,
      thinkingLevel: "MEDIUM",
    });
    expect(resolveGeminiThinkingLevel("gemini-3.8-flash", undefined, "medium")).toBe("medium");
  });

  it("lets an explicit level override the legacy toggle", () => {
    expect(buildGeminiThinkingConfig("gemini-3.8-flash", false, "high")).toEqual({
      includeThoughts: true,
      thinkingLevel: "HIGH",
    });
    expect(resolveGeminiThinkingLevel("gemini-3.5-flash-lite", true, "minimal")).toBe("minimal");
  });

  it("leaves thinking to the API for default", () => {
    expect(buildGeminiThinkingConfig("gemini-3.8-flash", undefined, "default")).toBeUndefined();
    expect(buildGeminiThinkingConfig("gemini-3.1-pro-preview", undefined)).toBeUndefined();
    expect(resolveGeminiThinkingLevel("gemini-3.8-flash", undefined, "default")).toBeUndefined();
  });

  it("keeps the binary toggle for workflow callers", () => {
    expect(buildGeminiThinkingConfig("gemini-3.8-flash", true)).toEqual({ includeThoughts: true, thinkingLevel: "HIGH" });
    expect(buildGeminiThinkingConfig("gemini-3.8-flash", false)).toEqual({ thinkingLevel: "LOW" });
    expect(buildGeminiThinkingConfig("gemini-3.5-flash-lite", false)).toBeUndefined();
    expect(buildGeminiThinkingConfig("gemini-3.1-pro-preview", false)).toEqual({ includeThoughts: true });
    expect(resolveGeminiThinkingLevel("gemini-3.8-flash", false)).toBe("low");
    expect(resolveGeminiThinkingLevel("gemini-3.1-pro-preview", false)).toBe("high");
    expect(resolveGeminiThinkingLevel("gemini-3.5-flash-lite", false)).toBe("minimal");
  });

  it("never sends thinking config to Gemma 4", () => {
    expect(buildGeminiThinkingConfig("gemma-4-31b-it", true, "high")).toBeUndefined();
    expect(resolveGeminiThinkingLevel("gemma-4-31b-it", true, "high")).toBeUndefined();
  });

  it("offers per-model effort options", () => {
    expect(getReasoningEffortOptions("gemini-4-hydrogen")).toEqual(["default", "low", "medium", "high", "xhigh"]);
    expect(getReasoningEffortOptions("gemini-3.8-flash")).toEqual(["default", "minimal", "low", "medium", "high"]);
    expect(getReasoningEffortOptions("gemini-3.5-flash-lite")).toEqual(["default", "minimal", "low", "medium", "high"]);
    expect(getReasoningEffortOptions("gemini-3.1-pro-preview")).toEqual(["default", "low", "medium", "high"]);
    expect(getReasoningEffortOptions("gemma-4-31b-it")).toEqual([]);
    expect(getReasoningEffortOptions("gemini-3.1-flash-image")).toEqual([]);
  });
});

describe.each(["gemini-4-argon", "gemini-4-carbon"] as const)("%s thinking", (model) => {
  it.each(["low", "medium", "high"] as const)("supports %s in both APIs", (level) => {
    expect(buildGeminiThinkingConfig(model, false, level)).toEqual({ includeThoughts: true, thinkingLevel: level.toUpperCase() });
    expect(resolveGeminiThinkingLevel(model, false, level)).toBe(level);
  });

  it("offers only supported levels and leaves the default to the API", () => {
    expect(getReasoningEffortOptions(model)).toEqual(["default", "low", "medium", "high"]);
    expect(buildGeminiThinkingConfig(model, undefined)).toBeUndefined();
    expect(resolveGeminiThinkingLevel(model, undefined)).toBeUndefined();
    expect(buildGeminiThinkingConfig(model, false, "default")).toBeUndefined();
    expect(resolveGeminiThinkingLevel(model, false, "default")).toBeUndefined();
  });

  it("maps the legacy toggle to high/low without disabling thinking", () => {
    expect(isThinkingRequired(model)).toBe(true);
    expect(buildGeminiThinkingConfig(model, true)).toEqual({ includeThoughts: true, thinkingLevel: "HIGH" });
    expect(buildGeminiThinkingConfig(model, false)).toEqual({ thinkingLevel: "LOW" });
    expect(resolveGeminiThinkingLevel(model, true)).toBe("high");
    expect(resolveGeminiThinkingLevel(model, false)).toBe("low");
  });

  it.each(["minimal", "none", "xhigh", "max"] as const)("does not send unsupported effort %s", (level) => {
    expect(buildGeminiThinkingConfig(model, false, level)).toBeUndefined();
    expect(resolveGeminiThinkingLevel(model, false, level)).toBeUndefined();
  });
});
