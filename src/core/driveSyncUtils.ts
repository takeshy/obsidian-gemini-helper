// Sync utility functions for Google Drive sync.
// Ported from GemiHub's sync-client-utils.ts with Obsidian-specific additions.

export const SYNC_EXCLUDED_FILE_NAMES = new Set(["_sync-meta.json", "_encrypted-auth.json", "settings.json"]);
// Note: ".obsidian/" is handled dynamically via Vault.configDir in isSyncExcludedPath
export const SYNC_EXCLUDED_PREFIXES = [
  "history/",
  "trash/",
  "sync_conflicts/",
  "__TEMP__/",
  "plugins/",
  ".trash/",
  "node_modules/",
];

export function isSyncExcludedPath(filePath: string, userExcludePatterns: string[] = [], configDir?: string, workspaceFolder?: string): boolean {
  const normalized = filePath.replace(/^\/+/, "");
  if (SYNC_EXCLUDED_FILE_NAMES.has(normalized)) return true;
  if (SYNC_EXCLUDED_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
  // Exclude Obsidian config directory (configurable via Vault.configDir)
  if (configDir && (normalized.startsWith(configDir + "/") || normalized === configDir)) return true;
  // Exclude plugin workspace folder (chat history, sync meta, etc.)
  if (workspaceFolder && (normalized.startsWith(workspaceFolder + "/") || normalized === workspaceFolder)) return true;
  // User-defined exclude patterns
  for (const pattern of userExcludePatterns) {
    const trimmed = pattern.trim();
    if (!trimmed) continue;
    // Support folder patterns (ending with /) and simple prefix matching
    if (trimmed.endsWith("/")) {
      if (normalized.startsWith(trimmed) || normalized.startsWith(trimmed.slice(0, -1))) return true;
    } else {
      // Simple glob-like matching: * matches any characters, ? matches single character
      // Escape regex metacharacters first, then convert glob wildcards
      const escaped = trimmed
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".");
      const regex = new RegExp("^" + escaped + "$");
      if (regex.test(normalized) || regex.test(normalized.split("/").pop() ?? "")) return true;
    }
  }
  return false;
}

const BINARY_APPLICATION_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/gzip",
  "application/x-tar",
  "application/x-gzip",
  "application/x-bzip2",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/octet-stream",
  "application/wasm",
]);

const BINARY_APPLICATION_PREFIXES = [
  "application/vnd.openxmlformats-",
  "application/vnd.ms-",
  "application/vnd.oasis.opendocument.",
];

export function isBinaryMimeType(mimeType: string | undefined | null): boolean {
  if (!mimeType) return false;
  if (
    mimeType.startsWith("image/") ||
    mimeType.startsWith("video/") ||
    mimeType.startsWith("audio/") ||
    mimeType.startsWith("font/")
  ) return true;
  if (BINARY_APPLICATION_TYPES.has(mimeType)) return true;
  return BINARY_APPLICATION_PREFIXES.some((p) => mimeType.startsWith(p));
}

export function looksLikeBinary(content: string): boolean {
  const sample = content.slice(0, 512);
  if (sample.length === 0) return false;
  let controlCount = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      controlCount++;
    }
  }
  return controlCount / sample.length >= 0.1;
}

// MIME type detection from file extension
const MIME_TYPE_MAP: Record<string, string> = {
  // Text
  md: "text/markdown",
  txt: "text/plain",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "application/javascript",
  ts: "application/typescript",
  json: "application/json",
  xml: "application/xml",
  yaml: "text/yaml",
  yml: "text/yaml",
  csv: "text/csv",
  svg: "image/svg+xml",
  // Images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  // Documents
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Archives
  zip: "application/zip",
  gz: "application/gzip",
  tar: "application/x-tar",
  // Audio/Video
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  webm: "video/webm",
  // Fonts
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg",
  "pdf", "doc", "docx", "xls", "xlsx", "pptx",
  "zip", "gz", "tar", "7z", "rar",
  "mp3", "mp4", "wav", "ogg", "webm",
  "woff", "woff2", "ttf", "otf",
  "exe", "dll", "so", "dylib",
]);

export function getMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().split(".").pop() || "";
  return MIME_TYPE_MAP[ext] || "application/octet-stream";
}

export function isBinaryExtension(filePath: string): boolean {
  const ext = filePath.toLowerCase().split(".").pop() || "";
  return BINARY_EXTENSIONS.has(ext);
}

// ========================================
// MD5 implementation (pure JS)
// Required for Google Drive checksum compatibility
// ========================================

function md5cycle(x: number[], k: number[]): void {
  let a = x[0], b = x[1], c = x[2], d = x[3];

  a = ff(a, b, c, d, k[0], 7, -680876936);
  d = ff(d, a, b, c, k[1], 12, -389564586);
  c = ff(c, d, a, b, k[2], 17, 606105819);
  b = ff(b, c, d, a, k[3], 22, -1044525330);
  a = ff(a, b, c, d, k[4], 7, -176418897);
  d = ff(d, a, b, c, k[5], 12, 1200080426);
  c = ff(c, d, a, b, k[6], 17, -1473231341);
  b = ff(b, c, d, a, k[7], 22, -45705983);
  a = ff(a, b, c, d, k[8], 7, 1770035416);
  d = ff(d, a, b, c, k[9], 12, -1958414417);
  c = ff(c, d, a, b, k[10], 17, -42063);
  b = ff(b, c, d, a, k[11], 22, -1990404162);
  a = ff(a, b, c, d, k[12], 7, 1804603682);
  d = ff(d, a, b, c, k[13], 12, -40341101);
  c = ff(c, d, a, b, k[14], 17, -1502002290);
  b = ff(b, c, d, a, k[15], 22, 1236535329);

  a = gg(a, b, c, d, k[1], 5, -165796510);
  d = gg(d, a, b, c, k[6], 9, -1069501632);
  c = gg(c, d, a, b, k[11], 14, 643717713);
  b = gg(b, c, d, a, k[0], 20, -373897302);
  a = gg(a, b, c, d, k[5], 5, -701558691);
  d = gg(d, a, b, c, k[10], 9, 38016083);
  c = gg(c, d, a, b, k[15], 14, -660478335);
  b = gg(b, c, d, a, k[4], 20, -405537848);
  a = gg(a, b, c, d, k[9], 5, 568446438);
  d = gg(d, a, b, c, k[14], 9, -1019803690);
  c = gg(c, d, a, b, k[3], 14, -187363961);
  b = gg(b, c, d, a, k[8], 20, 1163531501);
  a = gg(a, b, c, d, k[13], 5, -1444681467);
  d = gg(d, a, b, c, k[2], 9, -51403784);
  c = gg(c, d, a, b, k[7], 14, 1735328473);
  b = gg(b, c, d, a, k[12], 20, -1926607734);

  a = hh(a, b, c, d, k[5], 4, -378558);
  d = hh(d, a, b, c, k[8], 11, -2022574463);
  c = hh(c, d, a, b, k[11], 16, 1839030562);
  b = hh(b, c, d, a, k[14], 23, -35309556);
  a = hh(a, b, c, d, k[1], 4, -1530992060);
  d = hh(d, a, b, c, k[4], 11, 1272893353);
  c = hh(c, d, a, b, k[7], 16, -155497632);
  b = hh(b, c, d, a, k[10], 23, -1094730640);
  a = hh(a, b, c, d, k[13], 4, 681279174);
  d = hh(d, a, b, c, k[0], 11, -358537222);
  c = hh(c, d, a, b, k[3], 16, -722521979);
  b = hh(b, c, d, a, k[6], 23, 76029189);
  a = hh(a, b, c, d, k[9], 4, -640364487);
  d = hh(d, a, b, c, k[12], 11, -421815835);
  c = hh(c, d, a, b, k[15], 16, 530742520);
  b = hh(b, c, d, a, k[2], 23, -995338651);

  a = ii(a, b, c, d, k[0], 6, -198630844);
  d = ii(d, a, b, c, k[7], 10, 1126891415);
  c = ii(c, d, a, b, k[14], 15, -1416354905);
  b = ii(b, c, d, a, k[5], 21, -57434055);
  a = ii(a, b, c, d, k[12], 6, 1700485571);
  d = ii(d, a, b, c, k[3], 10, -1894986606);
  c = ii(c, d, a, b, k[10], 15, -1051523);
  b = ii(b, c, d, a, k[1], 21, -2054922799);
  a = ii(a, b, c, d, k[8], 6, 1873313359);
  d = ii(d, a, b, c, k[15], 10, -30611744);
  c = ii(c, d, a, b, k[6], 15, -1560198380);
  b = ii(b, c, d, a, k[13], 21, 1309151649);
  a = ii(a, b, c, d, k[4], 6, -145523070);
  d = ii(d, a, b, c, k[11], 10, -1120210379);
  c = ii(c, d, a, b, k[2], 15, 718787259);
  b = ii(b, c, d, a, k[9], 21, -343485551);

  x[0] = add32(a, x[0]);
  x[1] = add32(b, x[1]);
  x[2] = add32(c, x[2]);
  x[3] = add32(d, x[3]);
}

function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
  a = add32(add32(a, q), add32(x, t));
  return add32((a << s) | (a >>> (32 - s)), b);
}

function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return cmn((b & c) | (~b & d), a, b, x, s, t);
}

function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return cmn((b & d) | (c & ~d), a, b, x, s, t);
}

function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return cmn(b ^ c ^ d, a, b, x, s, t);
}

function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return cmn(c ^ (b | ~d), a, b, x, s, t);
}

function add32(a: number, b: number): number {
  return (a + b) & 0xffffffff;
}

function md5blk(s: Uint8Array, offset: number): number[] {
  const md5blks: number[] = [];
  for (let i = 0; i < 64; i += 4) {
    md5blks[i >> 2] =
      s[offset + i] +
      (s[offset + i + 1] << 8) +
      (s[offset + i + 2] << 16) +
      (s[offset + i + 3] << 24);
  }
  return md5blks;
}

const hexChr = "0123456789abcdef".split("");

function rhex(n: number): string {
  let s = "";
  for (let j = 0; j < 4; j++) {
    s += hexChr[(n >> (j * 8 + 4)) & 0x0f] + hexChr[(n >> (j * 8)) & 0x0f];
  }
  return s;
}

/**
 * Compute MD5 hash of a Uint8Array. Returns hex string.
 */
export function md5Hash(data: Uint8Array): string {
  const n = data.length;
  const state = [1732584193, -271733879, -1732584194, 271733878];
  let i: number;

  for (i = 64; i <= n; i += 64) {
    md5cycle(state, md5blk(data, i - 64));
  }

  // Padding
  const tail = new Uint8Array(64);
  const remaining = n - (i - 64);
  for (let j = 0; j < remaining; j++) {
    tail[j] = data[i - 64 + j];
  }
  tail[remaining] = 0x80;

  if (remaining > 55) {
    md5cycle(state, md5blk(tail, 0));
    tail.fill(0);
  }

  // Length in bits as 64-bit LE (handle files > 512MB correctly)
  const bitLenLo = (n * 8) >>> 0;                  // lower 32 bits
  const bitLenHi = Math.floor((n * 8) / 0x100000000) >>> 0; // upper 32 bits
  tail[56] = bitLenLo & 0xff;
  tail[57] = (bitLenLo >>> 8) & 0xff;
  tail[58] = (bitLenLo >>> 16) & 0xff;
  tail[59] = (bitLenLo >>> 24) & 0xff;
  tail[60] = bitLenHi & 0xff;
  tail[61] = (bitLenHi >>> 8) & 0xff;
  tail[62] = (bitLenHi >>> 16) & 0xff;
  tail[63] = (bitLenHi >>> 24) & 0xff;

  md5cycle(state, md5blk(tail, 0));

  return rhex(state[0]) + rhex(state[1]) + rhex(state[2]) + rhex(state[3]);
}

/**
 * Compute MD5 hash of a string (UTF-8 encoded).
 */
export function md5HashString(str: string): string {
  const encoder = new TextEncoder();
  return md5Hash(encoder.encode(str));
}
