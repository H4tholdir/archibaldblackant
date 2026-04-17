import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createPool } from '../pool';
import { runMigrations, loadMigrationFiles } from '../migrate';
import path from 'path';
import {
  insertActiveJob,
  deleteActiveJob,
  getActiveJobsByUserId,
  deleteStaleActiveJobs,
} from './active-jobs';

const pool = createPool({
  host: process.env.PG_HOST ?? 'localhost',
  port: Number(process.env.PG_PORT ?? 5432),
  database: process.env.PG_DATABASE ?? 'archibald_test',
  user: process.env.PG_USER ?? 'archibald',
  password: process.env.PG_PASSWORD ?? 'archibald',
  maxConnections: 5,
});

async function cleanTable() {
  await pool.query("DELETE FROM system.active_jobs");
}

describe('active-jobs repository', () => {
  beforeEach(async () => {
    const migrationsDir = path.resolve(__dirname, '../migrations');
    const migrations = loadMigrationFiles(migrationsDir);
    await runMigrations(pool, migrations);
    await cleanTable();
  });

  afterEach(async () => {
    await cleanTable();
  });

  describe('insertActiveJob', () => {
    test('inserisce un record recuperabile per userId', async () => {
      await insertActiveJob(pool, {
        jobId: 'job-1',
        type: 'submit-order',
        userId: 'user-1',
        entityId: 'order-1',
        entityName: 'Mario Rossi',
      });

      const jobs = await getActiveJobsByUserId(pool, 'user-1');
      expect(jobs).toEqual([
        expect.objectContaining({
          jobId: 'job-1',
          type: 'submit-order',
          userId: 'user-1',
          entityId: 'order-1',
          entityName: 'Mario Rossi',
        }),
      ]);
    });

    test('non inserisce duplicati — ON CONFLICT DO NOTHING', async () => {
      await insertActiveJob(pool, {
        jobId: 'job-dup',
        type: 'submit-order',
        userId: 'user-1',
        entityId: 'order-1',
        entityName: 'Mario Rossi',
      });
      await insertActiveJob(pool, {
        jobId: 'job-dup',
        type: 'submit-order',
        userId: 'user-1',
        entityId: 'order-1',
        entityName: 'Mario Rossi (aggiornato)',
      });

      const jobs = await getActiveJobsByUserId(pool, 'user-1');
      expect(jobs).toHaveLength(1);
    });
  });

  describe('deleteActiveJob', () => {
    test('elimina il record per jobId', async () => {
      await insertActiveJob(pool, {
        jobId: 'job-del',
        type: 'delete-order',
        userId: 'user-2',
        entityId: 'order-99',
        entityName: 'Luigi Verdi',
      });

      await deleteActiveJob(pool, 'job-del');

      const jobs = await getActiveJobsByUserId(pool, 'user-2');
      expect(jobs).toEqual([]);
    });

    test('è idempotente quando il record non esiste', async () => {
      await expect(deleteActiveJob(pool, 'non-existent')).resolves.toBeUndefined();
    });
  });

  describe('getActiveJobsByUserId', () => {
    test('restituisce solo i job dello userId richiesto', async () => {
      await insertActiveJob(pool, { jobId: 'j-a', type: 'submit-order', userId: 'user-A', entityId: 'e1', entityName: 'A' });
      await insertActiveJob(pool, { jobId: 'j-b', type: 'send-to-verona', userId: 'user-B', entityId: 'e2', entityName: 'B' });

      const jobsA = await getActiveJobsByUserId(pool, 'user-A');
      expect(jobsA).toEqual([expect.objectContaining({ jobId: 'j-a', userId: 'user-A' })]);

      const jobsB = await getActiveJobsByUserId(pool, 'user-B');
      expect(jobsB).toEqual([expect.objectContaining({ jobId: 'j-b', userId: 'user-B' })]);
    });

    test('restituisce array vuoto se non ci sono job', async () => {
      const jobs = await getActiveJobsByUserId(pool, 'user-nessuno');
      expect(jobs).toEqual([]);
    });
  });

  describe('deleteStaleActiveJobs', () => {
    test('elimina record più vecchi di N ms', async () => {
      await pool.query(`
        INSERT INTO system.active_jobs (job_id, type, user_id, entity_id, entity_name, started_at)
        VALUES ('job-old', 'edit-order', 'user-1', 'e1', 'Test', NOW() - INTERVAL '3 hours')
      `);
      await insertActiveJob(pool, { jobId: 'job-new', type: 'edit-order', userId: 'user-1', entityId: 'e2', entityName: 'Test' });

      const deleted = await deleteStaleActiveJobs(pool, 2 * 60 * 60 * 1000);

      expect(deleted).toBe(1);
      const remaining = await getActiveJobsByUserId(pool, 'user-1');
      expect(remaining).toEqual([expect.objectContaining({ jobId: 'job-new' })]);
    });
  });
});
