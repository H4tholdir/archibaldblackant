import path from 'path';
import { createPool, type DbPool } from '../pool';
import { runMigrations, loadMigrationFiles } from '../migrate';

const DEFAULT_TEST_DATABASE_URL = 'postgresql://localhost:5432/archibald_test';

function parseConnectionString(url: string): {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
} {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '5432', 10),
    database: parsed.pathname.replace(/^\//, ''),
    user: parsed.username || process.env.USER || 'postgres',
    password: parsed.password || '',
  };
}

async function setupTestDb(): Promise<DbPool> {
  const connectionUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  const config = parseConnectionString(connectionUrl);

  const pool = createPool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    maxConnections: 5,
  });

  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const migrations = loadMigrationFiles(migrationsDir);
  await runMigrations(pool, migrations);

  return pool;
}

async function truncateAllTables(pool: DbPool): Promise<void> {
  const { rows: sharedTables } = await pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'shared'",
  );
  for (const { tablename } of sharedTables) {
    await pool.query(`TRUNCATE TABLE shared."${tablename}" CASCADE`);
  }

  const { rows: agentTables } = await pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'agents'",
  );
  for (const { tablename } of agentTables) {
    await pool.query(`TRUNCATE TABLE agents."${tablename}" CASCADE`);
  }

  const { rows: systemTables } = await pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'system' AND tablename != 'migrations'",
  );
  for (const { tablename } of systemTables) {
    await pool.query(`TRUNCATE TABLE system."${tablename}" CASCADE`);
  }
}

async function destroyTestDb(pool: DbPool): Promise<void> {
  await pool.end();
}

export { setupTestDb, truncateAllTables, destroyTestDb };
