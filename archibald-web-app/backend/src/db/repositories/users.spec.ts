import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';
import type { QueryResult } from 'pg';

function createMockPool(queryFn: ReturnType<typeof vi.fn>): DbPool {
  return {
    query: queryFn,
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

const SAMPLE_USER_ROW = {
  id: 'user-abc-123',
  username: 'marco.rossi',
  full_name: 'Marco Rossi',
  role: 'agent' as const,
  whitelisted: true,
  created_at: 1700000000000,
  last_login_at: null,
  last_order_sync_at: null,
  last_customer_sync_at: null,
  monthly_target: 5000,
  yearly_target: 60000,
  currency: 'EUR',
  target_updated_at: null,
  commission_rate: 0.18,
  bonus_amount: 5000,
  bonus_interval: 75000,
  extra_budget_interval: 50000,
  extra_budget_reward: 6000,
  monthly_advance: 3500,
  hide_commissions: false,
};

describe('createUser', () => {
  test('inserts user with generated id and returns mapped User', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [SAMPLE_USER_ROW],
      rowCount: 1,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { createUser } = await import('./users');
    const result = await createUser(pool, 'marco.rossi', 'Marco Rossi');

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO agents.users'),
      expect.arrayContaining(['marco.rossi', 'Marco Rossi', 'agent']),
    );
    expect(result).toEqual({
      id: 'user-abc-123',
      username: 'marco.rossi',
      fullName: 'Marco Rossi',
      role: 'agent',
      whitelisted: true,
      createdAt: 1700000000000,
      lastLoginAt: null,
      lastOrderSyncAt: null,
      lastCustomerSyncAt: null,
      monthlyTarget: 5000,
      yearlyTarget: 60000,
      currency: 'EUR',
      targetUpdatedAt: null,
      commissionRate: 0.18,
      bonusAmount: 5000,
      bonusInterval: 75000,
      extraBudgetInterval: 50000,
      extraBudgetReward: 6000,
      monthlyAdvance: 3500,
      hideCommissions: false,
    });
  });

  test('passes custom role when provided', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [{ ...SAMPLE_USER_ROW, role: 'admin' }],
      rowCount: 1,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { createUser } = await import('./users');
    const result = await createUser(pool, 'admin.user', 'Admin User', 'admin');

    expect(queryFn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['admin.user', 'Admin User', 'admin']),
    );
    expect(result.role).toBe('admin');
  });
});

describe('getUserById', () => {
  test('returns mapped User when found', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [SAMPLE_USER_ROW],
      rowCount: 1,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { getUserById } = await import('./users');
    const result = await getUserById(pool, 'user-abc-123');

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('SELECT'),
      ['user-abc-123'],
    );
    expect(result).toEqual(expect.objectContaining({
      id: 'user-abc-123',
      username: 'marco.rossi',
      fullName: 'Marco Rossi',
    }));
  });

  test('returns null when user not found', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 0,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { getUserById } = await import('./users');
    const result = await getUserById(pool, 'nonexistent-id');

    expect(result).toBeNull();
  });
});

describe('getUserByUsername', () => {
  test('returns mapped User when found', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [SAMPLE_USER_ROW],
      rowCount: 1,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { getUserByUsername } = await import('./users');
    const result = await getUserByUsername(pool, 'marco.rossi');

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('username'),
      ['marco.rossi'],
    );
    expect(result).toEqual(expect.objectContaining({
      username: 'marco.rossi',
      fullName: 'Marco Rossi',
    }));
  });

  test('returns null when username not found', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 0,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { getUserByUsername } = await import('./users');
    const result = await getUserByUsername(pool, 'nonexistent');

    expect(result).toBeNull();
  });
});

describe('updateWhitelist', () => {
  test('updates whitelisted flag for given user id', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 1,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { updateWhitelist } = await import('./users');
    await updateWhitelist(pool, 'user-abc-123', false);

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE agents.users'),
      ['user-abc-123', false],
    );
  });
});

describe('saveEncryptedPassword', () => {
  test('saves encrypted password fields to user row', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 1,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const encrypted = {
      ciphertext: 'enc-data-hex',
      iv: 'iv-hex',
      authTag: 'auth-tag-hex',
      version: 1,
    };

    const { saveEncryptedPassword } = await import('./users');
    await saveEncryptedPassword(pool, 'user-abc-123', encrypted);

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('encrypted_password'),
      ['user-abc-123', 'enc-data-hex', 'iv-hex', 'auth-tag-hex', 1],
    );
  });
});

describe('getEncryptedPassword', () => {
  test('returns encrypted password when present', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [{
        encrypted_password: 'enc-data-hex',
        encryption_iv: 'iv-hex',
        encryption_auth_tag: 'auth-tag-hex',
        encryption_version: 1,
      }],
      rowCount: 1,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { getEncryptedPassword } = await import('./users');
    const result = await getEncryptedPassword(pool, 'user-abc-123');

    expect(result).toEqual({
      ciphertext: 'enc-data-hex',
      iv: 'iv-hex',
      authTag: 'auth-tag-hex',
      version: 1,
    });
  });

  test('returns null when no encrypted password', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [{
        encrypted_password: null,
        encryption_iv: null,
        encryption_auth_tag: null,
        encryption_version: 1,
      }],
      rowCount: 1,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { getEncryptedPassword } = await import('./users');
    const result = await getEncryptedPassword(pool, 'user-abc-123');

    expect(result).toBeNull();
  });

  test('returns null when user not found', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 0,
    } as unknown as QueryResult);
    const pool = createMockPool(queryFn);

    const { getEncryptedPassword } = await import('./users');
    const result = await getEncryptedPassword(pool, 'nonexistent');

    expect(result).toBeNull();
  });
});
