/**
 * Session-based cache for encryption credentials
 *
 * This cache stores the password and decrypted private key in memory only.
 * Data is cleared when Obsidian is closed or the plugin is unloaded.
 * No sensitive data is persisted to disk.
 */

class CryptoCache {
  private password: string | null = null;
  private privateKey: string | null = null;

  /**
   * Set the password for the session
   */
  setPassword(password: string): void {
    this.password = password;
  }

  /**
   * Get the cached password
   */
  getPassword(): string | null {
    return this.password;
  }

  /**
   * Check if password is cached
   */
  hasPassword(): boolean {
    return this.password !== null;
  }

  /**
   * Set the decrypted private key for the session
   */
  setPrivateKey(key: string): void {
    this.privateKey = key;
  }

  /**
   * Get the cached private key
   */
  getPrivateKey(): string | null {
    return this.privateKey;
  }

  /**
   * Check if private key is cached
   */
  hasPrivateKey(): boolean {
    return this.privateKey !== null;
  }

  /**
   * Clear all cached credentials
   */
  clear(): void {
    this.password = null;
    this.privateKey = null;
  }

  /**
   * Check if any credentials are cached
   */
  isEmpty(): boolean {
    return this.password === null && this.privateKey === null;
  }
}

// Singleton instance
export const cryptoCache = new CryptoCache();
