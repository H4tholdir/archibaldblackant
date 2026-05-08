import { describe, expect, test, beforeEach } from 'vitest';
import { createPool } from '../pool';
import { updateSyncFreshness, getLastSyncAt, getAllFreshnessForUser } from './sync-freshness';

const TEST_USER = 'test-freshness-user';

describe.skipIf(!process.env.PG_HOST)('sync_freshness repository', () => {
  const pool = createPool({
    host: process.env.PG_HOST ?? 'localhost',
    port: Number(process.env.PG_PORT ?? 5432),
    database: process.env.PG_DATABASE ?? 'archibald_test',
    user: process.env.PG_USER ?? 'archibald',
    password: process.env.PG_PASSWORD ?? 'archibald',
    maxConnections: 5,
  });

  beforeEach(async () => {
    await pool.query(
      `DELETE FROM agents.sync_freshness WHERE user_id = $1`,
      [TEST_USER],
    );
  });

  test('updateSyncFreshness inserisce o aggiorna last_completed_at', async () => {
    await updateSyncFreshness(pool, TEST_USER, 'sync-orders');
    const result = await getLastSyncAt(pool, TEST_USER, 'sync-orders');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBeCloseTo(Date.now(), -3);
  });

  test('getLastSyncAt ritorna null se non esiste', async () => {
    const result = await getLastSyncAt(pool, TEST_USER, 'sync-orders');
    expect(result).toBeNull();
  });

  test('getAllFreshnessForUser ritorna mappa syncType → Date', async () => {
    await updateSyncFreshness(pool, TEST_USER, 'sync-orders');
    await updateSyncFreshness(pool, TEST_USER, 'sync-customers');
    const map = await getAllFreshnessForUser(pool, TEST_USER);
    expect(map['sync-orders']).toBeInstanceOf(Date);
    expect(map['sync-customers']).toBeInstanceOf(Date);
    expect(map['sync-ddt']).toBeUndefined();
  });
});
