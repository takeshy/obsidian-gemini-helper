import type { App } from "obsidian";
import type { ToolDefinition } from "src/types";
import { readOkfDocument } from "./okfLoader";

export const READ_OKF_DOCUMENT_TOOL_NAME = "read_okf_document";

export const READ_OKF_DOCUMENT_TOOL: ToolDefinition = {
  name: READ_OKF_DOCUMENT_TOOL_NAME,
  description:
    "Fetch the full content of one document from an active OKF knowledge bundle. Use the bundleId shown next to the bundle heading in the system prompt and a document path referenced in that bundle's index. Leading slashes are stripped, and directory paths resolve to their index.md.",
  parameters: {
    type: "object",
    properties: {
      bundleId: {
        type: "string",
        description: "bundleId shown next to the OKF bundle heading in the system prompt",
      },
      path: {
        type: "string",
        description: "Document path referenced in the bundle index, e.g. features/chat.md",
      },
    },
    required: ["bundleId", "path"],
  },
};

export async function executeReadOkfDocumentTool(
  app: App,
  root: string | null,
  activeBundleIds: readonly string[],
  bundleId: string,
  path: string,
): Promise<Record<string, unknown>> {
  if (!activeBundleIds.includes(bundleId)) {
    return { error: `OKF bundle is not active: bundleId=${bundleId}` };
  }
  const doc = await readOkfDocument(app, root, bundleId, path);
  if (!doc) return { error: `Document not found for bundleId=${bundleId} path=${path}` };
  return { path: doc.path, title: doc.title, description: doc.description, body: doc.body };
}
