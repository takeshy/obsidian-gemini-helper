import type { Attachment } from "src/types";

export interface ToolResultWithAttachments {
  attachments: Attachment[];
  [key: string]: unknown;
}

export function getToolResultAttachments(result: unknown): Attachment[] {
  if (!result || typeof result !== "object") return [];
  const value = (result as { attachments?: unknown }).attachments;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Attachment => {
    if (!item || typeof item !== "object") return false;
    const attachment = item as Partial<Attachment>;
    return typeof attachment.name === "string"
      && typeof attachment.type === "string"
      && typeof attachment.mimeType === "string"
      && typeof attachment.data === "string";
  });
}

/** Avoid duplicating large base64 payloads in the textual tool result. */
export function withoutToolResultAttachments(result: unknown): unknown {
  if (!result || typeof result !== "object" || !Array.isArray((result as { attachments?: unknown }).attachments)) {
    return result;
  }
  const { attachments: _attachments, ...rest } = result as ToolResultWithAttachments;
  return rest;
}

/** One PDF read twice in a round only needs to be uploaded once. */
export function dedupeAttachments(attachments: Attachment[]): Attachment[] {
  const seen = new Set<string>();
  return attachments.filter((attachment) => {
    const key = attachment.sourcePath ?? attachment.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
