// Google Drive authentication for Obsidian.
// Uses RSA hybrid encrypted auth exported from GemiHub.
// Token refresh is proxied through GemiHub API (clientId/clientSecret stay server-side).

import { requestUrl } from "obsidian";
import { findFileByExactName, readFile } from "./googleDrive";
import { decryptPrivateKey, decryptData } from "./crypto";
import type { DriveSessionTokens } from "src/types";

// ========================================
// Backup token decode (XOR 0x5a, same as GemiHub)
// ========================================

/**
 * Decode a GemiHub backup token (hex-encoded XOR 0x5a payload).
 * Returns { accessToken, rootFolderId }.
 */
export function decodeBackupToken(hexToken: string): { accessToken: string; rootFolderId: string } {
  if (hexToken.length % 2 !== 0) {
    throw new Error("Invalid backup token: odd-length hex string");
  }
  const bytes = new Uint8Array(hexToken.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hexToken.substring(i * 2, i * 2 + 2), 16) ^ 0x5a;
  }
  const text = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(text) as { a: string; r: string };
  if (!parsed.a || !parsed.r) {
    throw new Error("Invalid backup token format");
  }
  return { accessToken: parsed.a, rootFolderId: parsed.r };
}

// ========================================
// Fetch encrypted auth from Drive
// ========================================

/**
 * Fetch _encrypted-auth.json from Drive using a temporary access token.
 * Returns RSA hybrid encrypted auth fields.
 */
export async function fetchEncryptedAuth(
  accessToken: string,
  rootFolderId: string
): Promise<{ data: string; encryptedPrivateKey: string; salt: string }> {
  const file = await findFileByExactName(accessToken, "_encrypted-auth.json", rootFolderId);
  if (!file) {
    throw new Error("_encrypted-auth.json not found on Drive. Export from GemiHub first.");
  }
  const content = await readFile(accessToken, file.id);
  const parsed = JSON.parse(content) as { data?: string; encryptedPrivateKey?: string; salt?: string };
  if (!parsed.data || !parsed.encryptedPrivateKey || !parsed.salt) {
    throw new Error("Invalid _encrypted-auth.json format");
  }
  return { data: parsed.data, encryptedPrivateKey: parsed.encryptedPrivateKey, salt: parsed.salt };
}

// ========================================
// Decrypt auth (RSA hybrid via crypto.ts)
// ========================================

interface DecryptedAuth {
  refreshToken: string;
  apiOrigin: string;
}

/**
 * Decrypt the RSA hybrid encrypted auth payload with user password.
 * 1. Decrypt RSA private key with password (PBKDF2+AES-GCM)
 * 2. Decrypt auth data with RSA private key (hybrid decryption)
 */
export async function decryptAuthData(
  data: string,
  encryptedPrivateKey: string,
  salt: string,
  password: string
): Promise<DecryptedAuth> {
  const privateKey = await decryptPrivateKey(encryptedPrivateKey, salt, password);
  const decrypted = await decryptData(data, privateKey);
  const parsed = JSON.parse(decrypted) as DecryptedAuth;

  if (!parsed.refreshToken || !parsed.apiOrigin) {
    throw new Error("Decrypted auth data is incomplete");
  }
  return parsed;
}

// ========================================
// Token refresh (via GemiHub API proxy)
// ========================================

/**
 * Refresh the access token via GemiHub API proxy.
 * The server holds clientId/clientSecret and forwards to Google.
 */
export async function refreshAccessToken(
  apiOrigin: string,
  refreshToken: string
): Promise<{ accessToken: string; expiryTime: number }> {
  if (!apiOrigin.startsWith("https://")) {
    throw new Error("Token refresh requires HTTPS. Insecure apiOrigin rejected.");
  }
  const response = await requestUrl({
    url: `${apiOrigin}/api/obsidian/token`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (response.status !== 200) {
    throw new Error(`Token refresh failed: ${response.text}`);
  }

  const data = response.json;
  if (!data.access_token) {
    throw new Error("Failed to refresh access token");
  }

  return {
    accessToken: data.access_token,
    expiryTime: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

/**
 * Get a valid access token from session tokens, refreshing if needed (5-minute buffer).
 */
export async function getValidSessionTokens(
  session: DriveSessionTokens
): Promise<DriveSessionTokens> {
  const FIVE_MINUTES = 5 * 60 * 1000;
  if (session.expiryTime - Date.now() > FIVE_MINUTES) {
    return session;
  }

  const refreshed = await refreshAccessToken(
    session.apiOrigin,
    session.refreshToken
  );

  return {
    ...session,
    accessToken: refreshed.accessToken,
    expiryTime: refreshed.expiryTime,
  };
}
