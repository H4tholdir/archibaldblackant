/**
 * PasswordCache - Session-scoped in-memory credential cache
 *
 * Purpose: Temporarily cache user passwords to avoid repeated Puppeteer logins
 * within a session. This is NOT persistent storage.
 *
 * Architecture Note (Phase 7):
 * - Credentials are stored ENCRYPTED on frontend device (IndexedDB)
 * - Backend receives credentials only during login validation
 * - PasswordCache provides session-scoped cache (24h TTL) for UX
 * - This is acceptable as "temporary session state", not "persistent storage"
 * - Backend never writes credentials to disk or database
 *
 * Security:
 * - In-memory only (lost on backend restart)
 * - 24-hour TTL per credential (matches JWT expiration)
 * - Cleared on explicit logout
 * - HTTPS required to protect credentials in transit during login POST
 *
 * Trade-offs:
 * - Backend is not 100% stateless (has in-memory session state)
 * - Backend restart requires users to re-authenticate
 * - Acceptable for Phase 7 given UX benefits (no Puppeteer login per order)
 */

interface CachedPassword {
  password: string;
  timestamp: number;
}

export class PasswordCache {
  private static instance: PasswordCache;
  private cache: Map<string, CachedPassword> = new Map();
  private readonly TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (match JWT expiration)

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
