import { describe, expect, it } from "vitest";
import { AVAILABLE_MODELS, isImageGenerationModel } from "./index";

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
