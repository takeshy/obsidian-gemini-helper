import { App, TFile } from "obsidian";
import { WorkflowNode, ExecutionContext, PromptCallbacks, FileExplorerData } from "../types";
import { replaceVariables } from "./utils";

// Binary file extensions that should be read as binary and encoded as Base64
const BINARY_EXTENSIONS = [
  // Images
  "pdf", "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg", "tiff", "tif",
  // Video
  "mp4", "mov", "avi", "mkv", "webm", "wmv", "flv", "m4v",
  // Audio
  "mp3", "wav", "ogg", "flac", "aac", "m4a", "wma",
  // Archives
  "zip", "rar", "7z", "tar", "gz", "bz2",
  // Office documents
  "docx", "xlsx", "pptx", "doc", "xls", "ppt", "odt", "ods", "odp",
  // Other binary
  "exe", "dll", "so", "dylib", "wasm", "ttf", "otf", "woff", "woff2", "eot",
];

// Check if a file extension is binary
function isBinaryExtension(extension: string): boolean {
  return BINARY_EXTENSIONS.includes(extension.toLowerCase());
}

// Get MIME type from file extension
function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    // Text
    md: "text/markdown",
    txt: "text/plain",
    json: "application/json",
    csv: "text/csv",
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    ts: "application/typescript",
    xml: "application/xml",
    yaml: "application/x-yaml",
    yml: "application/x-yaml",
    // Images
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    ico: "image/x-icon",
    svg: "image/svg+xml",
    tiff: "image/tiff",
    tif: "image/tiff",
    // Video
    mp4: "video/mp4",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    webm: "video/webm",
    wmv: "video/x-ms-wmv",
    flv: "video/x-flv",
    m4v: "video/x-m4v",
    // Audio
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    aac: "audio/aac",
    m4a: "audio/mp4",
    wma: "audio/x-ms-wma",
    // Archives
    zip: "application/zip",
    rar: "application/vnd.rar",
    "7z": "application/x-7z-compressed",
    tar: "application/x-tar",
    gz: "application/gzip",
    bz2: "application/x-bzip2",
    // Office
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    doc: "application/msword",
    xls: "application/vnd.ms-excel",
    ppt: "application/vnd.ms-powerpoint",
    odt: "application/vnd.oasis.opendocument.text",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    odp: "application/vnd.oasis.opendocument.presentation",
    // Fonts
    ttf: "font/ttf",
    otf: "font/otf",
    woff: "font/woff",
    woff2: "font/woff2",
    eot: "application/vnd.ms-fontobject",
    // Other
    wasm: "application/wasm",
  };
  return mimeTypes[extension.toLowerCase()] || "application/octet-stream";
}

// Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Decode base64 string to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Recursively ensure all parent folders exist
async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
  if (!folderPath) return;

  const folder = app.vault.getAbstractFileByPath(folderPath);
  if (folder) return; // Already exists

  // Get parent folder path
  const parentPath = folderPath.substring(0, folderPath.lastIndexOf("/"));
  if (parentPath) {
    // Recursively ensure parent exists first
    await ensureFolderExists(app, parentPath);
  }

  // Now create this folder
  try {
    await app.vault.createFolder(folderPath);
  } catch {
    // Folder might have been created by another process
  }
}

// Handle file-explorer node - select any file or create new file path
// mode: "select" (default) - pick existing file, "create" - input new file path
// extensions: comma-separated list of allowed extensions (empty = all)
// saveTo: stores FileExplorerData JSON, savePathTo: stores just the file path
export async function handleFileExplorerNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App,
  promptCallbacks?: PromptCallbacks
): Promise<void> {
  const mode = node.properties["mode"] || "select";
  const extensionsStr = node.properties["extensions"] || "";
  const defaultPath = replaceVariables(node.properties["default"] || "", context);
  const directPath = replaceVariables(node.properties["path"] || "", context);
  const saveTo = node.properties["saveTo"];
  const savePathTo = node.properties["savePathTo"];

  if (!saveTo && !savePathTo) {
    throw new Error("file-explorer node requires 'saveTo' or 'savePathTo' property");
  }

  // Parse extensions
  const extensions = extensionsStr
    ? extensionsStr.split(",").map((e) => e.trim().toLowerCase().replace(/^\./, ""))
    : undefined;

  let filePath: string | null = null;

  // If path is specified, use it directly without dialog
  if (directPath) {
    filePath = directPath;
  } else if (mode === "create") {
    // Create mode: prompt for new file path
    if (!promptCallbacks?.promptForNewFilePath) {
      throw new Error("New file path prompt callback not available");
    }
    filePath = await promptCallbacks.promptForNewFilePath(extensions, defaultPath);
  } else {
    // Select mode: pick existing file
    if (!promptCallbacks?.promptForAnyFile) {
      throw new Error("File picker callback not available");
    }
    filePath = await promptCallbacks.promptForAnyFile(extensions, defaultPath);
  }

  if (filePath === null) {
    throw new Error("File selection cancelled by user");
  }

  // Save path if savePathTo is specified
  if (savePathTo) {
    context.variables.set(savePathTo, filePath);
  }

  // If saveTo is specified, read the file and create FileExplorerData
  if (saveTo) {
    if (mode === "create") {
      // For create mode, just save empty data with path info
      const basename = filePath.split("/").pop() || filePath;
      const lastDotIndex = basename.lastIndexOf(".");
      const name = lastDotIndex > 0 ? basename.substring(0, lastDotIndex) : basename;
      const extension = lastDotIndex > 0 ? basename.substring(lastDotIndex + 1) : "";

      const fileData: FileExplorerData = {
        path: filePath,
        basename,
        name,
        extension,
        mimeType: getMimeType(extension),
        contentType: isBinaryExtension(extension) ? "binary" : "text",
        data: "",
      };
      context.variables.set(saveTo, JSON.stringify(fileData));
    } else {
      // Select mode: read the file
      const file = app.vault.getAbstractFileByPath(filePath);
      if (!file || !(file instanceof TFile)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const extension = file.extension.toLowerCase();
      const mimeType = getMimeType(extension);
      const isBinary = isBinaryExtension(extension);

      let data: string;
      if (isBinary) {
        const buffer = await app.vault.readBinary(file);
        data = arrayBufferToBase64(buffer);
      } else {
        data = await app.vault.read(file);
      }

      const fileData: FileExplorerData = {
        path: filePath,
        basename: file.basename + "." + file.extension,
        name: file.basename,
        extension,
        mimeType,
        contentType: isBinary ? "binary" : "text",
        data,
      };
      context.variables.set(saveTo, JSON.stringify(fileData));
    }
  }
}

// Handle file-save node - save FileExplorerData as a file in the vault
export async function handleFileSaveNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App
): Promise<void> {
  const sourceProp = node.properties["source"];
  const pathProp = node.properties["path"];

  if (!sourceProp) {
    throw new Error("file-save node requires 'source' property");
  }
  if (!pathProp) {
    throw new Error("file-save node requires 'path' property");
  }

  // Get the source variable value
  const sourceValue = context.variables.get(sourceProp);
  if (!sourceValue || typeof sourceValue !== "string") {
    throw new Error(`Source variable '${sourceProp}' not found or not a string`);
  }

  // Parse FileExplorerData
  let fileData: FileExplorerData;
  try {
    fileData = JSON.parse(sourceValue);
    if (!fileData.data || !fileData.contentType) {
      throw new Error("Invalid FileExplorerData structure");
    }
  } catch {
    throw new Error(`Source variable '${sourceProp}' is not valid FileExplorerData JSON`);
  }

  // Resolve path with variables
  let filePath = replaceVariables(pathProp, context);

  // Add extension if not present
  if (!filePath.includes(".") && fileData.extension) {
    filePath = `${filePath}.${fileData.extension}`;
  }

  // Ensure parent folder exists
  const folderPath = filePath.substring(0, filePath.lastIndexOf("/"));
  if (folderPath) {
    await ensureFolderExists(app, folderPath);
  }

  // Check if file exists
  const existingFile = app.vault.getAbstractFileByPath(filePath);

  if (fileData.contentType === "binary") {
    // Decode base64 to binary
    const binaryData = base64ToUint8Array(fileData.data);
    const arrayBuffer = binaryData.buffer.slice(binaryData.byteOffset, binaryData.byteOffset + binaryData.byteLength) as ArrayBuffer;

    if (existingFile && existingFile instanceof TFile) {
      await app.vault.modifyBinary(existingFile, arrayBuffer);
    } else {
      await app.vault.createBinary(filePath, arrayBuffer);
    }
  } else {
    // Text file
    if (existingFile && existingFile instanceof TFile) {
      await app.vault.modify(existingFile, fileData.data);
    } else {
      await app.vault.create(filePath, fileData.data);
    }
  }

  // Save path to variable if specified
  const savePathTo = node.properties["savePathTo"];
  if (savePathTo) {
    context.variables.set(savePathTo, filePath);
  }
}

// Handle open node - open a file in Obsidian
export async function handleOpenNode(
  node: WorkflowNode,
  context: ExecutionContext,
  app: App,
  promptCallbacks?: PromptCallbacks
): Promise<void> {
  const path = replaceVariables(node.properties["path"] || "", context);

  if (!path) {
    throw new Error("Open node missing 'path' property");
  }

  // Ensure .md extension
  const notePath = path.endsWith(".md") ? path : `${path}.md`;

  if (promptCallbacks?.openFile) {
    await promptCallbacks.openFile(notePath);
  }
}
