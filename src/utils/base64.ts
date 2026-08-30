/** Encode bytes as base64 in chunks so large buffers do not blow the call stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Largest attachment (base64 source bytes) accepted by the Gemini request builder. */
export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024; // 20MB
