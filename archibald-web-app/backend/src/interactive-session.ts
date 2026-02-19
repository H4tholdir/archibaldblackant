import type { InteractiveSessionState, VatLookupResult } from "./types";
import type { ArchibaldBot } from "./bot/archibald-bot";
import { logger } from "./logger";

type InteractiveSession = {
  sessionId: string;
  userId: string;
  state: InteractiveSessionState;
  createdAt: number;
  updatedAt: number;
  vatResult: VatLookupResult | null;
  error: string | null;
  syncsPaused: boolean;
};

const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

class InteractiveSessionManager {
  private static instance: InteractiveSessionManager | null = null;
  private sessions = new Map<string, InteractiveSession>();
  private bots = new Map<string, ArchibaldBot>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private onSessionCleanupCallback:
    | ((sessionId: string, userId: string) => void)
    | null = null;

  private constructor() {
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), 60_000);
  }

  static getInstance(): InteractiveSessionManager {
    if (!InteractiveSessionManager.instance) {
      InteractiveSessionManager.instance = new InteractiveSessionManager();
    }
    return InteractiveSessionManager.instance;
  }

  createSession(userId: string): string {
    const sessionId = `isess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    this.sessions.set(sessionId, {
      sessionId,
      userId,
      state: "starting",
      createdAt: now,
      updatedAt: now,
      vatResult: null,
      error: null,
      syncsPaused: false,
    });

    logger.info("[InteractiveSession] Created", { sessionId, userId });
    return sessionId;
  }

  getSession(sessionId: string, userId: string): InteractiveSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.userId !== userId) return null;
    return session;
  }

  updateState(sessionId: string, state: InteractiveSessionState): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.state = state;
    session.updatedAt = Date.now();
    logger.debug("[InteractiveSession] State updated", { sessionId, state });
  }

  setVatResult(sessionId: string, result: VatLookupResult): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.vatResult = result;
    session.state = "vat_complete";
    session.updatedAt = Date.now();
  }

  setError(sessionId: string, error: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.error = error;
    session.state = "failed";
    session.updatedAt = Date.now();
  }

  setBot(sessionId: string, bot: ArchibaldBot): void {
    this.bots.set(sessionId, bot);
  }

  getBot(sessionId: string): ArchibaldBot | undefined {
    return this.bots.get(sessionId);
  }

  async removeBot(sessionId: string): Promise<void> {
    const bot = this.bots.get(sessionId);
    if (bot) {
      try {
        await bot.close();
      } catch {
        /* ignore close error */
      }
      this.bots.delete(sessionId);
    }
  }

  destroySession(sessionId: string): void {
    this.sessions.delete(sessionId);
    logger.info("[InteractiveSession] Destroyed", { sessionId });
  }

  async cleanupExpired(): Promise<void> {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, session] of this.sessions) {
      if (now - session.updatedAt > SESSION_TIMEOUT_MS) {
        const hadSyncsPaused = session.syncsPaused;
        const { userId } = session;
        await this.removeBot(id);
        this.sessions.delete(id);
        cleaned++;
        if (hadSyncsPaused && this.onSessionCleanupCallback) {
          this.onSessionCleanupCallback(id, userId);
        }
      }
    }
    if (cleaned > 0) {
      logger.info("[InteractiveSession] Cleaned up expired sessions", {
        cleaned,
      });
    }
  }

  setOnSessionCleanup(
    callback: (sessionId: string, userId: string) => void,
  ): void {
    this.onSessionCleanupCallback = callback;
  }

  markSyncsPaused(sessionId: string, paused: boolean): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.syncsPaused = paused;
    }
  }

  isSyncsPaused(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.syncsPaused ?? false;
  }

  touchSession(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) return false;
    session.updatedAt = Date.now();
    return true;
  }

  getActiveSessionForUser(userId: string): InteractiveSession | null {
    for (const session of this.sessions.values()) {
      if (
        session.userId === userId &&
        session.state !== "completed" &&
        session.state !== "failed" &&
        session.state !== "cancelled"
      ) {
        return session;
      }
    }
    return null;
  }

  async destroy(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const [id] of this.bots) {
      await this.removeBot(id);
    }
    this.sessions.clear();
    InteractiveSessionManager.instance = null;
  }
}

export { InteractiveSessionManager };
export type { InteractiveSession };
