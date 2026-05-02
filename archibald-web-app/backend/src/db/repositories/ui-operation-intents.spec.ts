import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { createPool } from '../pool';
import { startIntent, completeIntent, aggregateUiDurationForPending } from './ui-operation-intents';

const skipIf = process.env.CI === 'true' || !process.env.PG_HOST;

const pool = createPool({
  host: process.env.PG_HOST ?? 'localhost',
  port: Number(process.env.PG_PORT ?? 5432),
  database: process.env.PG_DATABASE ?? 'archibald_test',
  user: process.env.PG_USER ?? 'archibald',
  password: process.env.PG_PASSWORD ?? 'archibald',
  maxConnections: 5,
});

describe.skipIf(skipIf)('ui-operation-intents repository', () => {
  beforeEach(async () => {
    await pool.query("DELETE FROM system.ui_operation_intents WHERE user_id LIKE 'test_%'");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM system.ui_operation_intents WHERE user_id LIKE 'test_%'");
    await pool.end();
  });

  describe('startIntent', () => {
    it('inserts an intent and is idempotent on conflict', async () => {
      const intentId = randomUUID();
      const pendingOrderId = `pending_${randomUUID()}`;
      await startIntent(pool, { intentId, userId: 'test_ui', pendingOrderId, type: 'new-order' });
      // second call must not throw (ON CONFLICT DO NOTHING)
      await expect(
        startIntent(pool, { intentId, userId: 'test_ui', pendingOrderId, type: 'new-order' }),
      ).resolves.toBeUndefined();
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM system.ui_operation_intents WHERE intent_id = $1`,
        [intentId],
      );
      expect(parseInt(rows[0].count, 10)).toBe(1);
    });
  });

  describe('completeIntent', () => {
    it('sets ui_completed_at for an existing intent', async () => {
      const intentId = randomUUID();
      const pendingOrderId = `pending_${randomUUID()}`;
      await startIntent(pool, { intentId, userId: 'test_ui', pendingOrderId, type: 'new-order' });
      await completeIntent(pool, { intentId });
      const { rows } = await pool.query<{ ui_completed_at: Date | null }>(
        `SELECT ui_completed_at FROM system.ui_operation_intents WHERE intent_id = $1`,
        [intentId],
      );
      expect(rows[0].ui_completed_at).not.toBeNull();
    });
  });

  describe('aggregateUiDurationForPending', () => {
    it('aggregates total active_ms for a single session', async () => {
      const intentId = randomUUID();
      const pendingOrderId = `pending_${randomUUID()}`;
      const startedAt = new Date('2026-01-01T10:00:00Z');
      const completedAt = new Date('2026-01-01T10:01:00Z'); // 60 000 ms dopo

      await pool.query(
        `INSERT INTO system.ui_operation_intents (intent_id, user_id, pending_order_id, type, ui_started_at, ui_completed_at)
         VALUES ($1, $2, $3, 'new-order', $4, $5)`,
        [intentId, 'test_ui', pendingOrderId, startedAt, completedAt],
      );

      const agg = await aggregateUiDurationForPending(pool, pendingOrderId);
      expect(agg.activeMs).toBe(60000);
      expect(agg.firstOpen).toEqual(startedAt);
      expect(agg.lastSave).toEqual(completedAt);
    });

    it('aggregates multiple sessions for same pending order', async () => {
      const i1 = randomUUID();
      const i2 = randomUUID();
      const pendingOrderId = `pending_${randomUUID()}`;

      const s1 = new Date('2026-01-01T10:00:00Z');
      const e1 = new Date('2026-01-01T10:00:05Z'); // 5 000 ms
      const s2 = new Date('2026-01-01T10:01:00Z');
      const e2 = new Date('2026-01-01T10:01:08Z'); // 8 000 ms

      await pool.query(
        `INSERT INTO system.ui_operation_intents (intent_id, user_id, pending_order_id, type, ui_started_at, ui_completed_at)
         VALUES ($1, $2, $3, 'new-order', $4, $5), ($6, $2, $3, 'edit-pending', $7, $8)`,
        [i1, 'test_ui', pendingOrderId, s1, e1, i2, s2, e2],
      );

      const agg = await aggregateUiDurationForPending(pool, pendingOrderId);
      expect(agg.activeMs).toBe(13000); // 5000 + 8000
    });
  });
});
