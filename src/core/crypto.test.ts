import { describe, expect, it } from "vitest";
import { getEncryptedFileMetadata, setEncryptedFileMetadata, unwrapEncryptedFile, wrapEncryptedFile } from "./crypto";

describe("encrypted file metadata", () => {
  it("round trips searchable metadata without changing ciphertext", () => {
    const content = wrapEncryptedFile("ciphertext", "key", "salt", {
      description: "Production token",
      publicMetadata: { owner: "Alice" },
    });
    expect(getEncryptedFileMetadata(content)).toEqual({
      description: "Production token",
      publicMetadata: { owner: "Alice" },
    });

    const updated = setEncryptedFileMetadata(content, {
      description: "Rotated token",
      publicMetadata: { owner: "Bob" },
    });
    expect(unwrapEncryptedFile(updated)?.data).toBe("ciphertext");
    expect(getEncryptedFileMetadata(updated)).toEqual({
      description: "Rotated token",
      publicMetadata: { owner: "Bob" },
    });
  });

  it("keeps legacy encrypted files readable", () => {
    const legacy = "---\nencrypted: true\nkey: key\nsalt: salt\n---\nciphertext";
    expect(getEncryptedFileMetadata(legacy)).toEqual({ description: "", publicMetadata: {} });
  });

  it("does not confuse description text with key and salt fields", () => {
    const content = wrapEncryptedFile("ciphertext", "actual-key", "actual-salt", {
      description: "key: display-only; salt: display-only",
    });
    expect(unwrapEncryptedFile(content)).toMatchObject({
      key: "actual-key",
      salt: "actual-salt",
      data: "ciphertext",
    });
  });
});
