/**
 * PasswordCache - Session-scoped in-memory credential cache with DB fallback
 *
 * Purpose: Cache user passwords to avoid repeated Puppeteer logins.
 * Now with automatic lazy-load from encrypted database storage.
 *
 * Architecture:
 * - Primary: In-memory cache (fast, session-scoped)
 * - Fallback: Database encrypted storage (persistent, survives restarts)
 * - Auto-recovery: Lazy-load from DB when cache miss
 *
 * Security:
 * - In-memory cache: 24-hour TTL per credential
 * - Database storage: AES-256-GCM encrypted at rest
 * - Lazy-load: Automatic, transparent to caller
 * - HTTPS required to protect credentials in transit
 *
 * Benefits:
 * - Backend restart: Automatic recovery via lazy-load
 * - Race conditions: No issue, lazy-load handles it
 * - Zero manual intervention: Fully transparent to users
 */

interface CachedPassword {
  password: string;
  timestamp: number;
}

export class PasswordCache {
  private static instance: PasswordCache;
  private cache: Map<string, CachedPassword> = new Map();
  private readonly TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (match JWT expiration)
  private userDb: any = null; // UserDatabase instance
  private passwordEncryption: any = null; // PasswordEncryptionService instance

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
   * Set dependencies for lazy-loading from database
   * Must be called during application initialization
   */
  setDependencies(userDb: any, passwordEncryption: any): void {
    this.userDb = userDb;
    this.passwordEncryption = passwordEncryption;
  }

  /**
   * Store password for userId
   */
  set(userId: string, password: string): void {
    this.cache.set(userId, {
      password,
      timestamp: Date.now(),
    });
  }

  /**
   * Get password for userId with automatic lazy-load from database
   *
   * Flow:
   * 1. Check in-memory cache (fast path)
   * 2. If not found, try lazy-load from encrypted DB (slower path)
   * 3. If loaded, cache it and return
   * 4. If not in DB either, return null
   *
   * This makes backend restart transparent to users!
   */
  get(userId: string): string | null {
    // 1. Try in-memory cache first (fast path)
    const cached = this.cache.get(userId);

    if (cached) {
      // Check if expired
      if (Date.now() - cached.timestamp > this.TTL_MS) {
        this.cache.delete(userId);
        // Continue to lazy-load attempt below
      } else {
        // Cache hit and valid
        return cached.password;
      }
    }

    // 2. Cache miss or expired - try lazy-load from database
    if (this.userDb && this.passwordEncryption) {
      try {
        const encrypted = this.userDb.getEncryptedPassword(userId);

        if (encrypted) {
          // Decrypt password
          const password = this.passwordEncryption.decrypt(encrypted, userId);

          // Cache it for future requests
          this.set(userId, password);

          console.log(
            `[PasswordCache] Lazy-loaded password for user ${userId} from database`,
          );
          return password;
        }
      } catch (error) {
        console.error(
          `[PasswordCache] Failed to lazy-load password for user ${userId}:`,
          error,
        );
        // Fall through to return null
      }
    }

    // 3. Not in cache, not in DB, or lazy-load failed
    return null;
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
