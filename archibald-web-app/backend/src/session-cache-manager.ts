import fs from "fs";
import path from "path";
import type { Protocol } from "puppeteer";
import { logger } from "./logger";

export interface UserSessionData {
  userId: string;
  cookies: Protocol.Network.Cookie[];
  timestamp: number;
  expiresAt: number;
}

/**
 * Manages per-user session cookie caching
 * Replaces single-user SessionManager with multi-user support
 */
export class SessionCacheManager {
  private static instance: SessionCacheManager;
  private cacheDir: string;
  private readonly SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24h

  private constructor() {
    this.cacheDir = path.join(__dirname, "..", ".cache");
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  static getInstance(): SessionCacheManager {
    if (!SessionCacheManager.instance) {
      SessionCacheManager.instance = new SessionCacheManager();
    }
    return SessionCacheManager.instance;
  }

  private getSessionFilePath(userId: string): string {
    return path.join(this.cacheDir, `session-${userId}.json`);
  }

  /**
   * Save user's session cookies
   */
  async saveSession(
    userId: string,
    cookies: Protocol.Network.Cookie[],
  ): Promise<void> {
    const sessionData: UserSessionData = {
      userId,
      cookies,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.SESSION_DURATION_MS,
    };

    try {
      const filePath = this.getSessionFilePath(userId);
      fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));
      logger.info(`Session saved for user ${userId}`, {
        cookieCount: cookies.length,
        expiresIn: "24h",
      });
    } catch (error) {
      logger.error(`Error saving session for user ${userId}`, { error });
    }
  }

  /**
   * Load user's session cookies if valid
   */
  async loadSession(userId: string): Promise<Protocol.Network.Cookie[] | null> {
    const filePath = this.getSessionFilePath(userId);

    if (!fs.existsSync(filePath)) {
      logger.debug(`No cached session for user ${userId}`);
      return null;
    }

    try {
      const data = fs.readFileSync(filePath, "utf-8");
      const sessionData: UserSessionData = JSON.parse(data);

      // Verify session is still valid
      if (Date.now() > sessionData.expiresAt) {
        logger.info(`Session expired for user ${userId}`);
        this.clearSession(userId);
        return null;
      }

      const remainingHours = Math.round(
        (sessionData.expiresAt - Date.now()) / (60 * 60 * 1000),
      );
      logger.info(`Loaded cached session for user ${userId}`, {
        cookieCount: sessionData.cookies.length,
        expiresIn: `${remainingHours}h`,
      });

      return sessionData.cookies;
    } catch (error) {
      logger.error(`Error loading session for user ${userId}`, { error });
      this.clearSession(userId);
      return null;
    }
  }

  /**
   * Clear user's session cache
   */
  clearSession(userId: string): void {
    const filePath = this.getSessionFilePath(userId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`Session cleared for user ${userId}`);
    }
  }

  /**
   * Check if user has valid cached session
   */
  async hasValidSession(userId: string): Promise<boolean> {
    const cookies = await this.loadSession(userId);
    return cookies !== null && cookies.length > 0;
  }

  /**
   * Clear all cached sessions (for maintenance)
   */
  clearAllSessions(): void {
    const files = fs
      .readdirSync(this.cacheDir)
      .filter((f) => f.startsWith("session-"));
    files.forEach((file) => {
      fs.unlinkSync(path.join(this.cacheDir, file));
    });
    logger.info(`Cleared ${files.length} cached sessions`);
  }
}
