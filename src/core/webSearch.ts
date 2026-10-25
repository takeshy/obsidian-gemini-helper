export { DEFAULT_WEB_SEARCH_SETTINGS, isWebSearchConfigured, searchWeb, WEB_SEARCH_TOOL,
  type WebSearchSettings } from "obsidian-llm-hub-common/core";

export const WEB_SEARCH_SECRET_IDS = {
  tavilyApiKey: "gemini-helper-tavily-api-key",
  braveApiKey: "gemini-helper-brave-api-key",
} as const;
