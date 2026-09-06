import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { findSharedMarkup } from "obsidian-llm-hub-common/check-markup";

/**
 * Shared chat UI markup lives in obsidian-llm-hub-common, so the three plugins cannot drift apart.
 * These classes are shared styling this plugin applies from code that is not chat UI; each says why.
 */
const HOST_OWNED = [
  // workflow modals reuse the chat autocomplete styling from plain DOM
  "autocomplete",
  // workflow modals reuse the chat autocomplete styling from plain DOM
  "autocomplete-desc",
  // workflow modals reuse the chat autocomplete styling from plain DOM
  "autocomplete-item",
  // workflow modals reuse the chat autocomplete styling from plain DOM
  "autocomplete-name",
  // the Obsidian view container, added imperatively in ChatView
  "chat-container",
  // a selector, not markup: mobile keyboard tracking uses closest()
  "input-container",
  // the workflow generation modal reuses the thinking styling from plain DOM
  "thinking",
  // the workflow generation modal reuses the thinking styling from plain DOM
  "thinking-content",
  // the workflow generation modal reuses the thinking styling from plain DOM
  "thinking-summary",
  // the Obsidian view container, added imperatively in ChatView
  "wide-sidebar",
];

/**
 * Chat UI this plugin still renders itself, waiting to move into the library. The list only ever
 * shrinks: the second test fails once an entry is gone, and nothing is added to make new code pass.
 */
const STILL_HOST_RENDERED: string[] = [
  "modal-resizable",
];

const sourceDir = fileURLToPath(new URL("../..", import.meta.url));

describe("shared chat UI markup", () => {
  it("is not re-implemented outside the migration allowlist", async () => {
    const findings = await findSharedMarkup({ dir: sourceDir, classPrefix: "gemini-helper", allow: [...HOST_OWNED, ...STILL_HOST_RENDERED] });
    expect(findings.map((finding) => `${finding.className} (${finding.file}:${finding.line})`)).toEqual([]);
  });

  it("has no allowlist entries that are already migrated", async () => {
    const findings = await findSharedMarkup({ dir: sourceDir, classPrefix: "gemini-helper" });
    const rendered = new Set(findings.map((finding) => finding.className.replace("gemini-helper-", "")));
    expect([...HOST_OWNED, ...STILL_HOST_RENDERED].filter((className) => !rendered.has(className))).toEqual([]);
  });
});
