import { describe, expect, it } from "vitest";
import {
  AVAILABLE_MODELS,
  FREE_MODELS,
  getDefaultModelForPlan,
  isImageGenerationModel,
  PAID_MODELS,
} from "./index";

describe("Gemini 3.7 Flash", () => {
  it("is available on both API plans", () => {
    expect(PAID_MODELS.map(model => model.name)).toContain("gemini-3.7-flash");
    expect(FREE_MODELS.map(model => model.name)).toContain("gemini-3.7-flash");
  });

  it("replaces Gemini 3.6 Flash in the model lists", () => {
    expect(AVAILABLE_MODELS.map(model => model.name as string)).not.toContain("gemini-3.6-flash");
  });

  it("does not expose retired Gemini 2.5 text models", () => {
    const models = AVAILABLE_MODELS.map(model => model.name as string);
    expect(models).not.toContain("gemini-2.5-flash");
    expect(models).not.toContain("gemini-2.5-pro");
  });

  it("is the default paid model", () => {
    expect(getDefaultModelForPlan("paid")).toBe("gemini-3.7-flash");
  });
});

describe("Gemini image models", () => {
  const stableImageModels = [
    "gemini-3-pro-image",
    "gemini-3.1-flash-image",
    "gemini-3.1-flash-lite-image",
  ] as const;

  it.each(stableImageModels)("recognizes stable image model %s", (model) => {
    expect(isImageGenerationModel(model)).toBe(true);
  });

  it("does not expose retired preview image models", () => {
    const modelNames = AVAILABLE_MODELS.map((model) => model.name as string);
    expect(modelNames).not.toContain("gemini-3-pro-image-preview");
    expect(modelNames).not.toContain("gemini-3.1-flash-image-preview");
  });
});
