/**
 * Session cache management with daily expiration
 * Stores login cookies to avoid repeated logins
 */

import fs from "fs";
import path from "path";
import { logger } from "./logger";

interface SessionCache {
  cookies: any[];
  createdAt: number; // Unix timestamp in milliseconds
  expiresAt: number; // Unix timestamp in milliseconds
}

export class SessionCacheManager {
  private cacheDir: string;
  private cacheFile: string;

  constructor() {
    this.cacheDir = path.join(__dirname, "../.cache");
    this.cacheFile = path.join(this.cacheDir, "session.json");
  }

  /**
   * Ensure cache directory exists
   */
  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      logger.debug("Created session cache directory", { path: this.cacheDir });
    }
  }

  /**
   * Save session cookies to cache file with daily expiration
   * @param cookies - Array of cookies from Puppeteer
   */
  saveSession(cookies: any[]): void {
    this.ensureCacheDir();

    const now = Date.now();
    const expiresAt = this.getEndOfDay(now);

    const cache: SessionCache = {
      cookies,
      createdAt: now,
      expiresAt,
    };

    try {
      fs.writeFileSync(this.cacheFile, JSON.stringify(cache, null, 2), "utf8");
      logger.info("Session saved to cache", {
        cookieCount: cookies.length,
        expiresAt: new Date(expiresAt).toISOString(),
      });
    } catch (error) {
      logger.error("Failed to save session cache", { error });
    }
  }

  /**
   * Load session cookies from cache if valid
   * @returns Cookies array or null if cache is invalid/expired
   */
  loadSession(): any[] | null {
    if (!fs.existsSync(this.cacheFile)) {
      logger.debug("No session cache file found");
      return null;
    }

    try {
      const content = fs.readFileSync(this.cacheFile, "utf8");
      const cache: SessionCache = JSON.parse(content);

      const now = Date.now();

      // Check if cache is expired
      if (now >= cache.expiresAt) {
        logger.info("Session cache expired", {
          expiresAt: new Date(cache.expiresAt).toISOString(),
          now: new Date(now).toISOString(),
        });
        this.clearSession();
        return null;
      }

      // Check if cookies array is valid
      if (!Array.isArray(cache.cookies) || cache.cookies.length === 0) {
        logger.warn("Session cache has invalid cookies");
        this.clearSession();
        return null;
      }

      const remainingHours = Math.round((cache.expiresAt - now) / (1000 * 60 * 60));
      logger.info("Session loaded from cache", {
        cookieCount: cache.cookies.length,
        createdAt: new Date(cache.createdAt).toISOString(),
        expiresIn: `${remainingHours}h`,
      });

      return cache.cookies;
    } catch (error) {
      logger.error("Failed to load session cache", { error });
      this.clearSession();
      return null;
    }
  }

  /**
   * Clear session cache file
   */
  clearSession(): void {
    if (fs.existsSync(this.cacheFile)) {
      try {
        fs.unlinkSync(this.cacheFile);
        logger.debug("Session cache cleared");
      } catch (error) {
        logger.error("Failed to clear session cache", { error });
      }
    }
  }

  /**
   * Get end of day timestamp (23:59:59.999)
   * @param timestamp - Unix timestamp in milliseconds
   * @returns End of day timestamp
   */
  private getEndOfDay(timestamp: number): number {
    const date = new Date(timestamp);
    date.setHours(23, 59, 59, 999);
    return date.getTime();
  }

  /**
   * Check if session cache is valid
   * @returns true if cache exists and is not expired
   */
  isSessionValid(): boolean {
    if (!fs.existsSync(this.cacheFile)) {
      return false;
    }

    try {
      const content = fs.readFileSync(this.cacheFile, "utf8");
      const cache: SessionCache = JSON.parse(content);
      return Date.now() < cache.expiresAt;
    } catch {
      return false;
    }
  }
}
