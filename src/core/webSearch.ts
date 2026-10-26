import type { GeminiHelperSettings } from "src/types";
export { DEFAULT_WEB_SEARCH_SETTINGS, isWebSearchConfigured, searchWeb, WEB_SEARCH_TOOL,
  type WebSearchSettings } from "obsidian-llm-hub-common/core";

export const WEB_SEARCH_SECRET_IDS = {
  tavilyApiKey: "gemini-helper-tavily-api-key",
  braveApiKey: "gemini-helper-brave-api-key",
} as const;

export function supportsGoogleSearch(model: string): boolean {
  return !model.toLowerCase().includes("gemma-4") && !/^gemini-3\.1-flash-lite-image(?:-|$)/i.test(model);
}

/** An old default external-settings object is not an explicit choice to disable Google. */
export function resolveWebSearchMode(
  mode: GeminiHelperSettings["webSearchMode"] | undefined,
  externalProvider?: GeminiHelperSettings["webSearch"]["provider"],
): GeminiHelperSettings["webSearchMode"] {
  if (mode === "google" || mode === "external" || mode === "none") return mode;
  return externalProvider === "tavily" || externalProvider === "brave" ? "external" : "google";
}
