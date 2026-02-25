import { randomUUID } from 'crypto';
import type { InteractiveSessionState, VatLookupResult } from './types';

type BotLike = {
  close: () => Promise<void>;
};

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

const SESSION_TTL_MS = 10 * 60 * 1000;

function createInteractiveSessionManager() {
  const sessions = new Map<string, InteractiveSession>();
  const bots = new Map<string, BotLike>();
  let cleanupTimer: ReturnType<typeof setInterval> | null = null;

  function createSession(userId: string): string {
    const sessionId = randomUUID();
    sessions.set(sessionId, {
      sessionId,
      userId,
      state: 'starting',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      vatResult: null,
      error: null,
      syncsPaused: false,
    });
    return sessionId;
  }

  function getSession(sessionId: string, userId: string): InteractiveSession | null {
    const session = sessions.get(sessionId);
    if (!session || session.userId !== userId) return null;
    return session;
  }

  function getActiveSessionForUser(userId: string): InteractiveSession | null {
    for (const session of sessions.values()) {
      if (session.userId === userId && session.state !== 'completed' && session.state !== 'cancelled' && session.state !== 'failed') {
        return session;
      }
    }
    return null;
  }

  function updateState(sessionId: string, state: InteractiveSessionState): void {
    const session = sessions.get(sessionId);
    if (session) {
      session.state = state;
      session.updatedAt = Date.now();
    }
  }

  function setVatResult(sessionId: string, result: VatLookupResult): void {
    const session = sessions.get(sessionId);
    if (session) {
      session.vatResult = result;
      session.state = 'vat_complete';
      session.updatedAt = Date.now();
    }
  }

  function setError(sessionId: string, error: string): void {
    const session = sessions.get(sessionId);
    if (session) {
      session.error = error;
      session.state = 'failed';
      session.updatedAt = Date.now();
    }
  }

  function setBot(sessionId: string, bot: BotLike): void {
    bots.set(sessionId, bot);
  }

  function getBot(sessionId: string): BotLike | undefined {
    return bots.get(sessionId);
  }

  async function removeBot(sessionId: string): Promise<void> {
    const bot = bots.get(sessionId);
    if (bot) {
      try {
        await bot.close();
      } catch {
        // ignore cleanup errors
      }
      bots.delete(sessionId);
    }
  }

  function destroySession(sessionId: string): void {
    sessions.delete(sessionId);
    bots.delete(sessionId);
  }

  function touchSession(sessionId: string, userId: string): boolean {
    const session = sessions.get(sessionId);
    if (!session || session.userId !== userId) return false;
    session.updatedAt = Date.now();
    return true;
  }

  function markSyncsPaused(sessionId: string, paused: boolean): void {
    const session = sessions.get(sessionId);
    if (session) {
      session.syncsPaused = paused;
    }
  }

  function isSyncsPaused(sessionId: string): boolean {
    const session = sessions.get(sessionId);
    return session?.syncsPaused ?? false;
  }

  async function cleanupExpired(): Promise<string[]> {
    const now = Date.now();
    const expired: string[] = [];
    for (const [sessionId, session] of sessions) {
      if (now - session.updatedAt > SESSION_TTL_MS) {
        await removeBot(sessionId);
        sessions.delete(sessionId);
        expired.push(sessionId);
      }
    }
    return expired;
  }

  function startAutoCleanup(intervalMs = 60_000): void {
    if (cleanupTimer) return;
    cleanupTimer = setInterval(() => { cleanupExpired(); }, intervalMs);
  }

  function stopAutoCleanup(): void {
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }

  async function destroy(): Promise<void> {
    stopAutoCleanup();
    for (const sessionId of sessions.keys()) {
      await removeBot(sessionId);
    }
    sessions.clear();
    bots.clear();
  }

  function getSessionCount(): number {
    return sessions.size;
  }

  return {
    createSession,
    getSession,
    getActiveSessionForUser,
    updateState,
    setVatResult,
    setError,
    setBot,
    getBot,
    removeBot,
    destroySession,
    touchSession,
    markSyncsPaused,
    isSyncsPaused,
    cleanupExpired,
    startAutoCleanup,
    stopAutoCleanup,
    destroy,
    getSessionCount,
  };
}

type InteractiveSessionManager = ReturnType<typeof createInteractiveSessionManager>;

export {
  createInteractiveSessionManager,
  type InteractiveSessionManager,
  type InteractiveSession,
  type BotLike,
};
