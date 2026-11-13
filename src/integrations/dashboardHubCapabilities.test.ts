import { describe, expect, it } from "vitest";
import { listDashboardModels } from "./dashboardHubCapabilities";

describe("Dashboard Hub AI integration contract", () => {
  it("exposes selectable text models with Vault capabilities", () => {
    const models = listDashboardModels({ settings: { apiPlan: "paid" } } as never);
    expect(models.length).toBeGreaterThan(0);
    expect(models.some((model) => model.id === "gemini-4-hydrogen")).toBe(true);
    expect(models.some((model) => model.id === "gemini-4-argon")).toBe(true);
    expect(models.some((model) => model.id === "gemini-4-carbon")).toBe(true);
    expect(models.every((model) => model.id && model.name && model.capabilities.text)).toBe(true);
    expect(models.every((model) => model.capabilities.vaultRead && model.capabilities.tools)).toBe(true);
  });
});
