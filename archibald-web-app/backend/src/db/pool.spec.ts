import { describe, expect, test, vi } from 'vitest';
import type { Pool } from 'pg';
import type { DatabaseConfig } from './pool';

vi.mock('pg', () => {
  const mockPool = {
    query: vi.fn().mockResolvedValue({ rows: [{ now: new Date() }] }),
    end: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    totalCount: 5,
    idleCount: 3,
    waitingCount: 0,
  };
  // vi.fn con function normale (non arrow) per supportare `new Pool()` in vitest 4.x
  return { Pool: vi.fn().mockImplementation(function() { return mockPool; }) };
});

describe('createPool', () => {
  test('creates pool with config and returns query + end + stats', async () => {
    const { createPool } = await import('./pool');
    const dbConfig: DatabaseConfig = {
      host: 'localhost',
      port: 5432,
      database: 'test',
      user: 'test',
      password: 'test',
      maxConnections: 10,
    };

    const pool = createPool(dbConfig);

    expect(pool.query).toBeDefined();
    expect(pool.end).toBeDefined();
    expect(pool.getStats()).toEqual({
      totalCount: 5,
      idleCount: 3,
      waitingCount: 0,
    });
  });

  test('passes correct config to pg Pool constructor', async () => {
    const { Pool } = await import('pg');
    const { createPool } = await import('./pool');
    const dbConfig: DatabaseConfig = {
      host: 'myhost',
      port: 5433,
      database: 'mydb',
      user: 'myuser',
      password: 'mypass',
      maxConnections: 15,
    };

    createPool(dbConfig);

    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'myhost',
        port: 5433,
        database: 'mydb',
        user: 'myuser',
        password: 'mypass',
        max: 15,
      }),
    );
  });

  test('registers error handler on pg Pool to prevent uncaught exception crash', async () => {
    const { Pool } = await import('pg');
    const { createPool } = await import('./pool');
    createPool({
      host: 'localhost', port: 5432, database: 'test',
      user: 'test', password: 'test', maxConnections: 10,
    });

    const mockPool = (Pool as ReturnType<typeof vi.fn>).mock.results[0].value as Pool;
    expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  test('query delegates to underlying pg pool', async () => {
    const { createPool } = await import('./pool');
    const pool = createPool({
      host: 'localhost',
      port: 5432,
      database: 'test',
      user: 'test',
      password: 'test',
      maxConnections: 10,
    });

    const result = await pool.query('SELECT NOW()');

    expect(result.rows).toHaveLength(1);
  });
});
