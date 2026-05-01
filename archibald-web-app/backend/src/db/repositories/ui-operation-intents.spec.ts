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

  it('starts and completes an intent, aggregates total active_ms', async () => {
    const intentId = randomUUID();
    const pendingOrderId = `pending_${randomUUID()}`;
    await startIntent(pool, { intentId, userId: 'test_ui', pendingOrderId, type: 'new-order' });
    await new Promise(r => setTimeout(r, 100));
    await completeIntent(pool, { intentId, pendingOrderId });

    const agg = await aggregateUiDurationForPending(pool, pendingOrderId);
    expect(agg.activeMs).toBeGreaterThan(50);
  });

  it('aggregates multiple sessions for same pending order', async () => {
    const i1 = randomUUID();
    const i2 = randomUUID();
    const pendingOrderId = `pending_${randomUUID()}`;

    await startIntent(pool, { intentId: i1, userId: 'test_ui', pendingOrderId, type: 'new-order' });
    await new Promise(r => setTimeout(r, 50));
    await completeIntent(pool, { intentId: i1, pendingOrderId });

    await startIntent(pool, { intentId: i2, userId: 'test_ui', pendingOrderId, type: 'edit-pending' });
    await new Promise(r => setTimeout(r, 80));
    await completeIntent(pool, { intentId: i2, pendingOrderId });

    const agg = await aggregateUiDurationForPending(pool, pendingOrderId);
    expect(agg.activeMs).toBeGreaterThan(120);
  });
});
