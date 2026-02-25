import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createInteractiveSessionManager } from './interactive-session-manager';

function createMockBot() {
  return { close: vi.fn().mockResolvedValue(undefined) };
}

describe('createInteractiveSessionManager', () => {
  let manager: ReturnType<typeof createInteractiveSessionManager>;

  beforeEach(() => {
    manager = createInteractiveSessionManager();
  });

  describe('createSession', () => {
    test('creates session and returns unique id', () => {
      const id1 = manager.createSession('user-1');
      const id2 = manager.createSession('user-2');

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    test('session starts in starting state', () => {
      const sessionId = manager.createSession('user-1');
      const session = manager.getSession(sessionId, 'user-1');

      expect(session).toEqual(expect.objectContaining({
        sessionId,
        userId: 'user-1',
        state: 'starting',
        vatResult: null,
        error: null,
        syncsPaused: false,
      }));
    });
  });

  describe('getSession', () => {
    test('returns null for wrong userId', () => {
      const sessionId = manager.createSession('user-1');

      expect(manager.getSession(sessionId, 'user-2')).toBeNull();
    });

    test('returns null for unknown sessionId', () => {
      expect(manager.getSession('nonexistent', 'user-1')).toBeNull();
    });
  });

  describe('getActiveSessionForUser', () => {
    test('returns active session', () => {
      const sessionId = manager.createSession('user-1');
      const active = manager.getActiveSessionForUser('user-1');

      expect(active?.sessionId).toBe(sessionId);
    });

    test('skips completed sessions', () => {
      const sessionId = manager.createSession('user-1');
      manager.updateState(sessionId, 'completed');

      expect(manager.getActiveSessionForUser('user-1')).toBeNull();
    });

    test('skips cancelled sessions', () => {
      const sessionId = manager.createSession('user-1');
      manager.updateState(sessionId, 'cancelled');

      expect(manager.getActiveSessionForUser('user-1')).toBeNull();
    });

    test('returns null when no sessions exist', () => {
      expect(manager.getActiveSessionForUser('user-1')).toBeNull();
    });
  });

  describe('updateState', () => {
    test('updates session state', () => {
      const sessionId = manager.createSession('user-1');
      manager.updateState(sessionId, 'ready');

      expect(manager.getSession(sessionId, 'user-1')?.state).toBe('ready');
    });
  });

  describe('setVatResult', () => {
    test('stores VAT result and sets state to vat_complete', () => {
      const sessionId = manager.createSession('user-1');
      const vatResult = {
        lastVatCheck: '2024-01-01',
        vatValidated: 'IT12345678901',
        vatAddress: 'Via Roma 1',
        parsed: { companyName: 'Test SRL', street: 'Via Roma', postalCode: '47921', city: 'Rimini', vatStatus: 'active', internalId: '123' },
        pec: 'test@pec.it',
        sdi: 'ABC1234',
      };

      manager.setVatResult(sessionId, vatResult);
      const session = manager.getSession(sessionId, 'user-1');

      expect(session?.state).toBe('vat_complete');
      expect(session?.vatResult).toEqual(vatResult);
    });
  });

  describe('setError', () => {
    test('stores error and sets state to failed', () => {
      const sessionId = manager.createSession('user-1');
      manager.setError(sessionId, 'Bot timeout');

      const session = manager.getSession(sessionId, 'user-1');
      expect(session?.state).toBe('failed');
      expect(session?.error).toBe('Bot timeout');
    });
  });

  describe('bot management', () => {
    test('setBot/getBot stores and retrieves bot', () => {
      const sessionId = manager.createSession('user-1');
      const bot = createMockBot();

      manager.setBot(sessionId, bot);
      expect(manager.getBot(sessionId)).toBe(bot);
    });

    test('removeBot closes and removes bot', async () => {
      const sessionId = manager.createSession('user-1');
      const bot = createMockBot();
      manager.setBot(sessionId, bot);

      await manager.removeBot(sessionId);

      expect(bot.close).toHaveBeenCalled();
      expect(manager.getBot(sessionId)).toBeUndefined();
    });

    test('removeBot handles bot close error gracefully', async () => {
      const sessionId = manager.createSession('user-1');
      const bot = { close: vi.fn().mockRejectedValue(new Error('close failed')) };
      manager.setBot(sessionId, bot);

      await expect(manager.removeBot(sessionId)).resolves.not.toThrow();
      expect(manager.getBot(sessionId)).toBeUndefined();
    });
  });

  describe('destroySession', () => {
    test('removes session and bot', () => {
      const sessionId = manager.createSession('user-1');
      manager.setBot(sessionId, createMockBot());

      manager.destroySession(sessionId);

      expect(manager.getSession(sessionId, 'user-1')).toBeNull();
      expect(manager.getBot(sessionId)).toBeUndefined();
      expect(manager.getSessionCount()).toBe(0);
    });
  });

  describe('touchSession', () => {
    test('returns true for valid session', () => {
      const sessionId = manager.createSession('user-1');

      expect(manager.touchSession(sessionId, 'user-1')).toBe(true);
    });

    test('returns false for wrong userId', () => {
      const sessionId = manager.createSession('user-1');

      expect(manager.touchSession(sessionId, 'user-2')).toBe(false);
    });

    test('returns false for unknown sessionId', () => {
      expect(manager.touchSession('nonexistent', 'user-1')).toBe(false);
    });
  });

  describe('syncsPaused', () => {
    test('markSyncsPaused/isSyncsPaused tracks pause state', () => {
      const sessionId = manager.createSession('user-1');

      expect(manager.isSyncsPaused(sessionId)).toBe(false);
      manager.markSyncsPaused(sessionId, true);
      expect(manager.isSyncsPaused(sessionId)).toBe(true);
      manager.markSyncsPaused(sessionId, false);
      expect(manager.isSyncsPaused(sessionId)).toBe(false);
    });

    test('isSyncsPaused returns false for unknown session', () => {
      expect(manager.isSyncsPaused('nonexistent')).toBe(false);
    });
  });

  describe('cleanupExpired', () => {
    test('removes expired sessions', async () => {
      const sessionId = manager.createSession('user-1');
      const session = manager.getSession(sessionId, 'user-1')!;
      session.updatedAt = Date.now() - 11 * 60 * 1000;

      const expired = await manager.cleanupExpired();

      expect(expired).toEqual([sessionId]);
      expect(manager.getSessionCount()).toBe(0);
    });

    test('keeps fresh sessions', async () => {
      manager.createSession('user-1');

      const expired = await manager.cleanupExpired();

      expect(expired).toEqual([]);
      expect(manager.getSessionCount()).toBe(1);
    });

    test('closes bot on expired session', async () => {
      const sessionId = manager.createSession('user-1');
      const bot = createMockBot();
      manager.setBot(sessionId, bot);
      const session = manager.getSession(sessionId, 'user-1')!;
      session.updatedAt = Date.now() - 11 * 60 * 1000;

      await manager.cleanupExpired();

      expect(bot.close).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    test('clears all sessions and bots', async () => {
      const id1 = manager.createSession('user-1');
      const id2 = manager.createSession('user-2');
      const bot1 = createMockBot();
      const bot2 = createMockBot();
      manager.setBot(id1, bot1);
      manager.setBot(id2, bot2);

      await manager.destroy();

      expect(manager.getSessionCount()).toBe(0);
      expect(bot1.close).toHaveBeenCalled();
      expect(bot2.close).toHaveBeenCalled();
    });
  });
});
