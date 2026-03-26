import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createNotification, type NotificationServiceDeps } from './notification-service';

const ADMIN_USER = { id: 'admin-1', role: 'admin' as const };
const AGENT_USER = { id: 'agent-1', role: 'agent' as const };
const ALL_USERS = [ADMIN_USER, AGENT_USER];

function makeDeps(overrides?: Partial<NotificationServiceDeps>): NotificationServiceDeps {
  return {
    pool: {} as any,
    getAllUsers: vi.fn().mockResolvedValue(ALL_USERS),
    insertNotification: vi.fn().mockImplementation(async (_pool, params) => ({
      id: 1,
      userId: params.userId,
      type: params.type,
      severity: params.severity,
      title: params.title,
      body: params.body,
      data: params.data ?? null,
      readAt: null,
      createdAt: new Date('2026-03-26T10:00:00Z'),
      expiresAt: new Date('2026-04-02T10:00:00Z'),
    })),
    broadcast: vi.fn(),
    ...overrides,
  };
}

const BASE_PARAMS = {
  type: 'erp_customer_deleted' as const,
  severity: 'error' as const,
  title: 'Cliente eliminato',
  body: 'Corpo',
};

describe('createNotification', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('target=user: inserts one row and broadcasts to that user', async () => {
    const deps = makeDeps();
    await createNotification(deps, { ...BASE_PARAMS, target: 'user', userId: AGENT_USER.id });

    expect(deps.insertNotification).toHaveBeenCalledOnce();
    expect(deps.insertNotification).toHaveBeenCalledWith(deps.pool, expect.objectContaining({ userId: AGENT_USER.id }));
    expect(deps.broadcast).toHaveBeenCalledOnce();
    expect(deps.broadcast).toHaveBeenCalledWith(AGENT_USER.id, expect.objectContaining({ type: 'NOTIFICATION_NEW' }));
  });

  test('target=admin: inserts and broadcasts only to admin users', async () => {
    const deps = makeDeps();
    await createNotification(deps, { ...BASE_PARAMS, target: 'admin' });

    expect(deps.insertNotification).toHaveBeenCalledOnce();
    expect(deps.insertNotification).toHaveBeenCalledWith(deps.pool, expect.objectContaining({ userId: ADMIN_USER.id }));
    expect(deps.broadcast).toHaveBeenCalledOnce();
    expect(deps.broadcast).toHaveBeenCalledWith(ADMIN_USER.id, expect.anything());
    expect(deps.getAllUsers).toHaveBeenCalledOnce();
  });

  test('target=all: inserts and broadcasts to every user', async () => {
    const deps = makeDeps();
    await createNotification(deps, { ...BASE_PARAMS, target: 'all' });

    expect(deps.insertNotification).toHaveBeenCalledTimes(ALL_USERS.length);
    expect(deps.broadcast).toHaveBeenCalledTimes(ALL_USERS.length);
    for (const user of ALL_USERS) {
      expect(deps.insertNotification).toHaveBeenCalledWith(deps.pool, expect.objectContaining({ userId: user.id }));
      expect(deps.broadcast).toHaveBeenCalledWith(user.id, expect.objectContaining({ type: 'NOTIFICATION_NEW' }));
    }
  });

  test('target=user without userId throws', async () => {
    const deps = makeDeps();
    await expect(
      createNotification(deps, { ...BASE_PARAMS, target: 'user' })
    ).rejects.toThrow('userId required');
  });
});
