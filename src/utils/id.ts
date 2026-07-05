/**
 * crypto.randomUUID requires a secure context, which Obsidian mobile's
 * WebView is not guaranteed to be — calling it there throws. Fall back to a
 * timestamp + random suffix, which is unique enough for widget/memo ids.
 */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
