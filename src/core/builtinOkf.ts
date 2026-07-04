import { gunzipSync, strFromU8 } from "fflate";
import {
  BUILTIN_OKF_BUNDLE_ID,
  BUILTIN_OKF_BUNDLE_NAME,
  BUILTIN_OKF_DOCUMENT_COUNT,
  BUILTIN_OKF_DOCUMENTS_GZIP_BASE64,
} from "../generated/builtinOkfData";

export interface BuiltinOkfDocument {
  path: string;
  type: string;
  title: string;
  description: string;
  tags: readonly string[];
  body: string;
}

function base64ToBytes(base64: string): Uint8Array {
  // atob exists in the renderer and in Node >= 16 (used by tests);
  // the Buffer branch is a fallback for older Node environments.
  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  const buffer = Buffer.from(base64, "base64");
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function loadBuiltinOkfDocuments(): BuiltinOkfDocument[] {
  const json = strFromU8(gunzipSync(base64ToBytes(BUILTIN_OKF_DOCUMENTS_GZIP_BASE64)));
  const docs = JSON.parse(json) as BuiltinOkfDocument[];
  if (docs.length !== BUILTIN_OKF_DOCUMENT_COUNT) {
    throw new Error(`Built-in OKF document count mismatch: expected ${BUILTIN_OKF_DOCUMENT_COUNT}, got ${docs.length}`);
  }
  return docs;
}

export const BUILTIN_OKF_DOCUMENTS = loadBuiltinOkfDocuments();

export {
  BUILTIN_OKF_BUNDLE_ID,
  BUILTIN_OKF_BUNDLE_NAME,
};
