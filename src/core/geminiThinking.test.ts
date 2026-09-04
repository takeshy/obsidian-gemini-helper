import { describe, expect, it } from "vitest";
import {
  buildGeminiThinkingConfig,
  getReasoningEffortOptions,
  resolveGeminiThinkingLevel,
} from "./gemini";

describe("Gemini reasoning effort", () => {
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
    expect(getReasoningEffortOptions("gemini-3.8-flash")).toEqual(["default", "minimal", "low", "medium", "high"]);
    expect(getReasoningEffortOptions("gemini-3.5-flash-lite")).toEqual(["default", "minimal", "low", "medium", "high"]);
    expect(getReasoningEffortOptions("gemini-3.1-pro-preview")).toEqual(["default", "low", "medium", "high"]);
    expect(getReasoningEffortOptions("gemma-4-31b-it")).toEqual([]);
    expect(getReasoningEffortOptions("gemini-3.1-flash-image")).toEqual([]);
  });
});
