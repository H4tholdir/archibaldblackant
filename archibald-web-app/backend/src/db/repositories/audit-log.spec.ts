import { describe, it, expect, vi } from 'vitest';
import { audit } from './audit-log';
import type { DbPool } from '../pool';

function makePool(queryFn = vi.fn().mockResolvedValue({ rows: [] })) {
  return { query: queryFn, withTransaction: vi.fn(), end: vi.fn(), getStats: vi.fn() } as unknown as DbPool;
}

describe('audit', () => {
  it('inserts a record with all provided fields', async () => {
    const pool = makePool();
    await audit(pool, {
      actorId: 'user-1',
      actorRole: 'admin',
      action: 'customer.updated',
      targetType: 'customer',
      targetId: 'cust-1',
      ipAddress: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
      metadata: { changed: ['name'] },
    });
    expect(pool.query).toHaveBeenCalledOnce();
    const [sql, params] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain('INSERT INTO system.audit_log');
    expect(params).toContain('customer.updated');
    expect(params).toContain('user-1');
  });

  it('inserts with minimal fields (only action required)', async () => {
    const pool = makePool();
    await audit(pool, { action: 'system.backup_completed' });
    expect(pool.query).toHaveBeenCalledOnce();
  });

  it('swallows DB errors silently', async () => {
    const pool = makePool(vi.fn().mockRejectedValue(new Error('DB down')));
    await expect(audit(pool, { action: 'auth.login_success', actorId: 'u1' })).resolves.toBeUndefined();
  });
});
