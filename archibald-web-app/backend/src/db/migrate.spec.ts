import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { DbPool } from './pool';

function createMockPool(): DbPool & { queryCalls: Array<{ text: string; params?: unknown[] }> } {
  const queryCalls: Array<{ text: string; params?: unknown[] }> = [];

  return {
    queryCalls,
    query: vi.fn(async (text: string, params?: unknown[]) => {
      queryCalls.push({ text, params });

      if (text.includes('SELECT name FROM system.migrations')) {
        return { rows: [], rowCount: 0 } as any;
      }
      if (text.includes('CREATE TABLE IF NOT EXISTS system.migrations')) {
        return { rows: [], rowCount: 0 } as any;
      }
      if (text.includes('CREATE SCHEMA IF NOT EXISTS system')) {
        return { rows: [], rowCount: 0 } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    }),
    end: vi.fn(async () => {}),
    getStats: vi.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
  };
}

describe('runMigrations', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('creates system.migrations tracking table on first run', async () => {
    const pool = createMockPool();

    const { runMigrations } = await import('./migrate');
    await runMigrations(pool, []);

    const createTableCall = pool.queryCalls.find(
      (c) => c.text.includes('CREATE TABLE IF NOT EXISTS system.migrations'),
    );
    expect(createTableCall).toBeDefined();
  });

  test('applies migration files in order', async () => {
    const pool = createMockPool();
    const migrations = [
      { name: '001-create-schemas.sql', sql: 'CREATE SCHEMA IF NOT EXISTS shared;' },
      { name: '002-shared-tables.sql', sql: 'CREATE TABLE IF NOT EXISTS shared.products (id TEXT);' },
    ];

    const { runMigrations } = await import('./migrate');
    const result = await runMigrations(pool, migrations);

    expect(result.applied).toEqual(['001-create-schemas.sql', '002-shared-tables.sql']);
    expect(result.skipped).toEqual([]);
  });

  test('skips already-applied migrations', async () => {
    const queryCalls: Array<{ text: string; params?: unknown[] }> = [];
    const pool: DbPool = {
      query: vi.fn(async (text: string, params?: unknown[]) => {
        queryCalls.push({ text, params });

        if (text.includes('SELECT name FROM system.migrations')) {
          return { rows: [{ name: '001-create-schemas.sql' }], rowCount: 1 } as any;
        }
        return { rows: [], rowCount: 0 } as any;
      }),
      end: vi.fn(async () => {}),
      getStats: vi.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
    };

    const migrations = [
      { name: '001-create-schemas.sql', sql: 'CREATE SCHEMA IF NOT EXISTS shared;' },
      { name: '002-shared-tables.sql', sql: 'CREATE TABLE IF NOT EXISTS shared.products (id TEXT);' },
    ];

    const { runMigrations } = await import('./migrate');
    const result = await runMigrations(pool, migrations);

    expect(result.applied).toEqual(['002-shared-tables.sql']);
    expect(result.skipped).toEqual(['001-create-schemas.sql']);
  });

  test('records each applied migration in tracking table', async () => {
    const pool = createMockPool();
    const migrations = [
      { name: '001-test.sql', sql: 'SELECT 1;' },
    ];

    const { runMigrations } = await import('./migrate');
    await runMigrations(pool, migrations);

    const insertCall = pool.queryCalls.find(
      (c) => c.text.includes('INSERT INTO system.migrations'),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall!.params).toEqual(expect.arrayContaining(['001-test.sql']));
  });
});
