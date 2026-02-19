import { App, requestUrl } from "obsidian";
import type { GeminiHelperPlugin } from "../../plugin";
import type { McpAppInfo } from "../../types";
import { McpClient } from "../../core/mcpClient";
import { WorkflowNode, ExecutionContext, FileExplorerData } from "../types";
import { replaceVariables } from "./utils";

// Decode base64 string to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Try to parse FileExplorerData from string
function tryParseFileExplorerData(value: string): FileExplorerData | null {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && "contentType" in parsed && "data" in parsed && "mimeType" in parsed) {
      return parsed as FileExplorerData;
    }
  } catch {
    // Not JSON or not FileExplorerData
  }
  return null;
}

// Build multipart/form-data body with binary support
function buildMultipartBodyBinary(
  fields: Record<string, string>,
  boundary: string
): ArrayBuffer {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];

  for (const [name, value] of Object.entries(fields)) {
    // Check if value is FileExplorerData JSON (from file-explorer node)
    const fileData = tryParseFileExplorerData(value);

    let headerStr = `--${boundary}\r\n`;

    // Check if this looks like a file upload (has filename in field name)
    // Format: "fieldName" for regular fields, or "fieldName:filename" for files
    const colonIndex = name.indexOf(":");

    if (fileData) {
      // FileExplorerData: use its metadata for Content-Disposition
      const fieldName = colonIndex !== -1 ? name.substring(0, colonIndex) : name;
      const filename = fileData.basename;
      headerStr += `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n`;
      headerStr += `Content-Type: ${fileData.mimeType}\r\n\r\n`;
      parts.push(encoder.encode(headerStr));

      // Add binary or text data
      if (fileData.contentType === "binary" && fileData.data) {
        parts.push(base64ToUint8Array(fileData.data));
      } else {
        parts.push(encoder.encode(fileData.data));
      }
      parts.push(encoder.encode("\r\n"));
    } else if (colonIndex !== -1) {
      // File field with explicit filename: "file:filename.html"
      const fieldName = name.substring(0, colonIndex);
      const filename = name.substring(colonIndex + 1);
      const contentType = guessContentType(filename);
      headerStr += `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n`;
      headerStr += `Content-Type: ${contentType}\r\n\r\n`;
      parts.push(encoder.encode(headerStr));
      parts.push(encoder.encode(value));
      parts.push(encoder.encode("\r\n"));
    } else {
      // Regular field
      headerStr += `Content-Disposition: form-data; name="${name}"\r\n\r\n`;
      parts.push(encoder.encode(headerStr));
      parts.push(encoder.encode(value));
      parts.push(encoder.encode("\r\n"));
    }
  }

  // Final boundary
  parts.push(encoder.encode(`--${boundary}--\r\n`));

  // Concatenate all parts
  const totalLength = parts.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result.buffer;
}

// Guess content type from filename
function guessContentType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  const types: Record<string, string> = {
    html: "text/html",
    htm: "text/html",
    txt: "text/plain",
    json: "application/json",
    xml: "application/xml",
    css: "text/css",
    js: "application/javascript",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
  };
  return types[ext || ""] || "application/octet-stream";
}

// Helper function to determine if MIME type is binary
function isBinaryMimeType(mimeType: string): boolean {
  // Text types
  if (mimeType.startsWith("text/")) return false;
  if (mimeType === "application/json") return false;
  if (mimeType === "application/xml") return false;
  if (mimeType === "application/javascript") return false;
  if (mimeType.endsWith("+xml")) return false;
  if (mimeType.endsWith("+json")) return false;

  // Binary types
  if (mimeType.startsWith("image/")) return true;
  if (mimeType.startsWith("audio/")) return true;
  if (mimeType.startsWith("video/")) return true;
  if (mimeType === "application/pdf") return true;
  if (mimeType === "application/zip") return true;
  if (mimeType === "application/x-zip-compressed") return true;
  if (mimeType === "application/octet-stream") return true;
  if (mimeType === "application/gzip") return true;
  if (mimeType === "application/x-tar") return true;

  // Default to text for unknown types
  return false;
}

// Helper function to get file extension from MIME type
function getMimeExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
    "application/pdf": "pdf",
    "application/zip": "zip",
    "application/x-zip-compressed": "zip",
    "application/octet-stream": "bin",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "text/plain": "txt",
    "text/html": "html",
    "text/css": "css",
    "text/javascript": "js",
    "application/json": "json",
    "application/xml": "xml",
  };
  return mimeToExt[mimeType] || "";
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

// Handle HTTP request node
export async function handleHttpNode(
  node: WorkflowNode,
  context: ExecutionContext
): Promise<void> {
  const url = replaceVariables(node.properties["url"] || "", context);
  const method = (node.properties["method"] || "GET").toUpperCase();
  const contentType = node.properties["contentType"] || "json"; // json, form-data, text, binary

  if (!url) {
    throw new Error("HTTP node missing 'url' property");
  }

  // Build headers - only add Content-Type for requests with body
  const headers: Record<string, string> = {};

  // Parse custom headers (format: "Key: Value" per line or JSON)
  const headersStr = node.properties["headers"];
  if (headersStr) {
    const replacedHeaders = replaceVariables(headersStr, context);
    try {
      // Try parsing as JSON first
      const parsedHeaders = JSON.parse(replacedHeaders);
      Object.assign(headers, parsedHeaders);
    } catch {
      // Parse as "Key: Value" format
      const lines = replacedHeaders.split("\n");
      for (const line of lines) {
        const colonIndex = line.indexOf(":");
        if (colonIndex !== -1) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();
          if (key) {
            headers[key] = value;
          }
        }
      }
    }
  }

  // Build body based on contentType
  let body: string | ArrayBuffer | undefined;
  const bodyStr = node.properties["body"];

  if (bodyStr && (method === "POST" || method === "PUT" || method === "PATCH")) {
    if (contentType === "form-data") {
      // Build multipart/form-data body with binary support
      // For form-data, parse JSON first, then replace variables in each field
      // This prevents variable content (like HTML) from breaking JSON parsing
      try {
        const rawFields = JSON.parse(bodyStr);
        const fields: Record<string, string> = {};
        for (const [key, value] of Object.entries(rawFields)) {
          // Replace variables in key and value separately
          const expandedKey = replaceVariables(key, context);
          const expandedValue = replaceVariables(String(value), context);
          fields[expandedKey] = expandedValue;
        }
        const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
        body = buildMultipartBodyBinary(fields, boundary);
        headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
      } catch {
        throw new Error("form-data contentType requires body to be a valid JSON object");
      }
    } else if (contentType === "text") {
      // Plain text body
      body = replaceVariables(bodyStr, context);
      if (!headers["Content-Type"]) {
        headers["Content-Type"] = "text/plain";
      }
    } else if (contentType === "binary") {
      // Send FileExplorerData (JSON with base64 data) as raw binary
      const replacedBody = replaceVariables(bodyStr, context);
      try {
        const fileData = JSON.parse(replacedBody);
        if (fileData.data && fileData.contentType === "binary") {
          // Decode base64 (using Uint8Array for mobile compatibility)
          const binaryStr = atob(fileData.data);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          body = bytes.buffer;
          if (!headers["Content-Type"] && fileData.mimeType) {
            headers["Content-Type"] = fileData.mimeType;
          }
        } else {
          throw new Error("binary contentType requires FileExplorerData with binary content");
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("FileExplorerData")) {
          throw e;
        }
        throw new Error("binary contentType requires valid FileExplorerData JSON");
      }
    } else {
      // Default: JSON body
      body = replaceVariables(bodyStr, context);
      if (!headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
    }
  }

  // Make HTTP request using Obsidian's requestUrl (avoids CORS issues)
  let response;
  try {
    const requestOptions: Parameters<typeof requestUrl>[0] = {
      url,
      method,
    };

    // Only add headers if there are any
    if (Object.keys(headers).length > 0) {
      requestOptions.headers = headers;
    }

    // Only add body for appropriate methods
    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      requestOptions.body = body;
    }

    response = await requestUrl(requestOptions);
  } catch (err) {
    // Network error or other fetch failure
    const errorMessage = err instanceof Error ? err.message : String(err);
    throw new Error(`HTTP request failed: ${method} ${url} - ${errorMessage}`);
  }

  // Save status code if specified
  const saveStatus = node.properties["saveStatus"];
  if (saveStatus) {
    context.variables.set(saveStatus, response.status);
  }

  // Throw error if response is not ok and throwOnError is set
  if (response.status >= 400 && node.properties["throwOnError"] === "true") {
    const responseText = response.text;
    throw new Error(`HTTP ${response.status} ${method} ${url}: ${responseText}`);
  }

  // Determine response type: auto (default), text, or binary
  const responseType = node.properties["responseType"] || "auto";
  const contentTypeHeader = response.headers["content-type"] || "application/octet-stream";
  const mimeType = contentTypeHeader.split(";")[0].trim();
  const isBinary = responseType === "binary" ? true
    : responseType === "text" ? false
    : isBinaryMimeType(mimeType);
  const saveTo = node.properties["saveTo"];

  if (isBinary) {
    // Handle binary response - save as FileExplorerData format
    if (saveTo) {
      // Extract filename and extension from URL
      let basename = "download";
      let extension = "";
      try {
        const urlPath = new URL(url).pathname;
        const urlBasename = urlPath.split("/").pop();
        if (urlBasename && urlBasename.includes(".")) {
          basename = urlBasename;
          extension = urlBasename.split(".").pop() || "";
        }
      } catch {
        // URL parsing failed, use defaults
      }

      // If no extension from URL, try to derive from MIME type
      if (!extension) {
        extension = getMimeExtension(mimeType);
        if (extension) {
          basename = `download.${extension}`;
        }
      }

      const name = basename.includes(".") ? basename.substring(0, basename.lastIndexOf(".")) : basename;

      // Convert ArrayBuffer to Base64
      const arrayBuffer = response.arrayBuffer;
      const base64Data = arrayBufferToBase64(arrayBuffer);

      // Create FileExplorerData structure
      const fileData: FileExplorerData = {
        path: "",
        basename,
        name,
        extension,
        mimeType,
        contentType: "binary",
        data: base64Data,
      };

      context.variables.set(saveTo, JSON.stringify(fileData));
    }
  } else {
    // Handle text response
    const responseText = response.text;

    // Try to parse as JSON for better handling
    let responseData: string;
    try {
      const jsonData = JSON.parse(responseText);
      responseData = JSON.stringify(jsonData);
    } catch {
      responseData = responseText;
    }

    // Save response to variable if specified
    if (saveTo) {
      context.variables.set(saveTo, responseData);
    }
  }
}

// Handle MCP node - call remote MCP server tool via HTTP
// Returns McpAppInfo if the tool returned UI metadata
export async function handleMcpNode(
  node: WorkflowNode,
  context: ExecutionContext,
  _app: App,
  _plugin: GeminiHelperPlugin
): Promise<McpAppInfo | undefined> {
  const url = replaceVariables(node.properties["url"] || "", context);
  const toolName = replaceVariables(node.properties["tool"] || "", context);
  const argsStr = node.properties["args"] || "";
  const headersStr = node.properties["headers"] || "";
  const saveTo = node.properties["saveTo"];
  const saveUiTo = node.properties["saveUiTo"];  // Optional: save MCP Apps UI info

  if (!url) {
    throw new Error("MCP node missing 'url' property");
  }
  if (!toolName) {
    throw new Error("MCP node missing 'tool' property");
  }

  // Parse headers if provided
  let headers: Record<string, string> = {};
  if (headersStr) {
    const replacedHeaders = replaceVariables(headersStr, context);
    try {
      headers = JSON.parse(replacedHeaders);
    } catch {
      throw new Error(`Invalid JSON in MCP headers: ${replacedHeaders}`);
    }
  }

  // Parse arguments
  let args: Record<string, unknown> = {};
  if (argsStr) {
    const replacedArgs = replaceVariables(argsStr, context);
    try {
      args = JSON.parse(replacedArgs);
    } catch {
      throw new Error(`Invalid JSON in MCP args: ${replacedArgs}`);
    }
  }

  // Create MCP client for this URL
  const client = new McpClient({
    name: url,
    url: url,
    headers: headers,
    enabled: true,
  });

  let mcpAppInfo: McpAppInfo | undefined;

  try {
    // Call the tool with UI support
    const appResult = await client.callToolWithUi(toolName, args);

    // Extract text content for the result
    const textContents = appResult.content
      .filter(c => c.type === "text" && c.text)
      .map(c => c.text!);

    if (appResult.isError) {
      throw new Error(`MCP tool execution failed: ${textContents.join("\n")}`);
    }

    const result = textContents.join("\n");

    // Save result to variable if specified
    if (saveTo) {
      context.variables.set(saveTo, result);
    }

    // Build MCP Apps UI info if available
    if (appResult._meta?.ui?.resourceUri) {
      // Fetch the UI resource
      const uiResource = await client.readResource(appResult._meta.ui.resourceUri);
      mcpAppInfo = {
        serverUrl: url,
        serverHeaders: headers,
        toolResult: appResult,
        uiResource,
      };

      // Save to variable if saveUiTo is specified
      if (saveUiTo) {
        context.variables.set(saveUiTo, JSON.stringify(mcpAppInfo));
      }
    }
  } finally {
    // Close the client connection
    await client.close();
  }

  return mcpAppInfo;
}
