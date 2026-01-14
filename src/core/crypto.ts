/**
 * Hybrid encryption utilities using Web Crypto API
 *
 * Encryption flow:
 * 1. Generate AES key for data encryption
 * 2. Encrypt data with AES-GCM
 * 3. Encrypt AES key with RSA-OAEP public key
 * 4. Store: encrypted data + encrypted AES key + IV
 *
 * Decryption flow:
 * 1. Derive RSA private key from password
 * 2. Decrypt AES key with RSA private key
 * 3. Decrypt data with AES key
 */

// Generate RSA key pair for encryption
export async function generateKeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const publicKeyBuffer = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const privateKeyBuffer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  return {
    publicKey: arrayBufferToBase64(publicKeyBuffer),
    privateKey: arrayBufferToBase64(privateKeyBuffer),
  };
}

// Derive key from password using PBKDF2
async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Encrypt private key with password
export async function encryptPrivateKey(
  privateKey: string,
  password: string
): Promise<{ encryptedPrivateKey: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derivedKey = await deriveKeyFromPassword(password, salt);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    derivedKey,
    encoder.encode(privateKey)
  );

  // Combine IV + encrypted data
  const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedBuffer), iv.length);

  return {
    encryptedPrivateKey: arrayBufferToBase64(combined.buffer),
    salt: arrayBufferToBase64(salt.buffer),
  };
}

// Decrypt private key with password
export async function decryptPrivateKey(
  encryptedPrivateKey: string,
  salt: string,
  password: string
): Promise<string> {
  const saltBuffer = base64ToArrayBuffer(salt);
  const derivedKey = await deriveKeyFromPassword(password, new Uint8Array(saltBuffer));

  const combined = new Uint8Array(base64ToArrayBuffer(encryptedPrivateKey));
  const iv = combined.slice(0, 12);
  const encryptedData = combined.slice(12);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    derivedKey,
    encryptedData
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

// Encrypt data with public key (hybrid encryption)
export async function encryptData(
  data: string,
  publicKeyBase64: string
): Promise<string> {
  // Generate random AES key
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  // Encrypt data with AES
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encryptedDataBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoder.encode(data)
  );

  // Export AES key
  const aesKeyBuffer = await crypto.subtle.exportKey("raw", aesKey);

  // Import public key
  const publicKeyBuffer = base64ToArrayBuffer(publicKeyBase64);
  const publicKey = await crypto.subtle.importKey(
    "spki",
    publicKeyBuffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );

  // Encrypt AES key with RSA
  const encryptedAesKeyBuffer = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    aesKeyBuffer
  );

  // Package: encryptedAesKey length (2 bytes) + encryptedAesKey + IV + encryptedData
  const encryptedAesKey = new Uint8Array(encryptedAesKeyBuffer);
  const encryptedData = new Uint8Array(encryptedDataBuffer);

  const result = new Uint8Array(2 + encryptedAesKey.length + iv.length + encryptedData.length);
  const keyLength = encryptedAesKey.length;
  result[0] = (keyLength >> 8) & 0xff;
  result[1] = keyLength & 0xff;
  result.set(encryptedAesKey, 2);
  result.set(iv, 2 + encryptedAesKey.length);
  result.set(encryptedData, 2 + encryptedAesKey.length + iv.length);

  return arrayBufferToBase64(result.buffer);
}

// Decrypt data with private key (hybrid decryption)
export async function decryptData(
  encryptedDataBase64: string,
  privateKeyBase64: string
): Promise<string> {
  const combined = new Uint8Array(base64ToArrayBuffer(encryptedDataBase64));

  // Parse: encryptedAesKey length (2 bytes) + encryptedAesKey + IV + encryptedData
  const keyLength = (combined[0] << 8) | combined[1];
  const encryptedAesKey = combined.slice(2, 2 + keyLength);
  const iv = combined.slice(2 + keyLength, 2 + keyLength + 12);
  const encryptedData = combined.slice(2 + keyLength + 12);

  // Import private key
  const privateKeyBuffer = base64ToArrayBuffer(privateKeyBase64);
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBuffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"]
  );

  // Decrypt AES key
  const aesKeyBuffer = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    encryptedAesKey
  );

  // Import AES key
  const aesKey = await crypto.subtle.importKey(
    "raw",
    aesKeyBuffer,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  // Decrypt data
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encryptedData
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

// Verify password by attempting to decrypt private key
export async function verifyPassword(
  encryptedPrivateKey: string,
  salt: string,
  password: string
): Promise<boolean> {
  try {
    await decryptPrivateKey(encryptedPrivateKey, salt, password);
    return true;
  } catch {
    return false;
  }
}

// Check if file content is encrypted using YAML frontmatter
export function isEncryptedFile(content: string): boolean {
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) return false;
  return /encrypted:\s*true/.test(frontmatter[1]);
}

// Wrap encrypted data with YAML frontmatter format
export function wrapEncryptedFile(data: string, key: string, salt: string): string {
  return `---\nencrypted: true\nkey: ${key}\nsalt: ${salt}\n---\n${data}`;
}

// Extract encryption info from YAML frontmatter format
export function unwrapEncryptedFile(content: string): { data: string; key: string; salt: string } | null {
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatter) return null;

  const keyMatch = frontmatter[1].match(/key:\s*(.+)/);
  const saltMatch = frontmatter[1].match(/salt:\s*(.+)/);
  if (!keyMatch || !saltMatch) return null;

  return {
    key: keyMatch[1].trim(),
    salt: saltMatch[1].trim(),
    data: frontmatter[2].trim()
  };
}

// Encrypt file content and wrap with YAML frontmatter
export async function encryptFileContent(
  content: string,
  publicKey: string,
  encryptedPrivateKey: string,
  salt: string
): Promise<string> {
  const encryptedData = await encryptData(content, publicKey);
  return wrapEncryptedFile(encryptedData, encryptedPrivateKey, salt);
}

// Decrypt file content from YAML frontmatter format
export async function decryptFileContent(
  fileContent: string,
  password: string
): Promise<string> {
  const encrypted = unwrapEncryptedFile(fileContent);
  if (!encrypted) {
    throw new Error("Invalid encrypted file format");
  }

  const privateKey = await decryptPrivateKey(encrypted.key, encrypted.salt, password);
  return decryptData(encrypted.data, privateKey);
}

// Utility functions
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
