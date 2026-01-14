/**
 * In-memory password cache for lazy credential validation
 *
 * Stores user passwords temporarily after login, to be validated
 * via Puppeteer only when the user creates their first order.
 * This makes login instant while maintaining security.
 *
 * Passwords are:
 * - Never persisted to disk
 * - Auto-cleared after 1 hour
 * - Cleared on logout
 * - Only used for Puppeteer validation
 */

interface CachedPassword {
  password: string;
  timestamp: number;
}

export class PasswordCache {
  private static instance: PasswordCache;
  private cache: Map<string, CachedPassword> = new Map();
  private readonly TTL_MS = 60 * 60 * 1000; // 1 hour

  private constructor() {
    // Cleanup expired entries every 10 minutes
    setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  static getInstance(): PasswordCache {
    if (!PasswordCache.instance) {
      PasswordCache.instance = new PasswordCache();
    }
    return PasswordCache.instance;
  }

  /**
   * Store password for userId
   */
  set(userId: string, password: string): void {
    this.cache.set(userId, {
      password,
      timestamp: Date.now()
    });
  }

  /**
   * Get password for userId (returns null if expired or not found)
   */
  get(userId: string): string | null {
    const cached = this.cache.get(userId);
    if (!cached) {
      return null;
    }

    // Check if expired
    if (Date.now() - cached.timestamp > this.TTL_MS) {
      this.cache.delete(userId);
      return null;
    }

    return cached.password;
  }

  /**
   * Clear password for userId
   */
  clear(userId: string): void {
    this.cache.delete(userId);
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [userId, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.TTL_MS) {
        this.cache.delete(userId);
      }
    }
  }
}
