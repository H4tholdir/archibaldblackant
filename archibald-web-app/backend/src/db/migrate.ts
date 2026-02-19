import type { DbPool } from './pool';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

type MigrationFile = {
  name: string;
  sql: string;
};

type MigrationResult = {
  applied: string[];
  skipped: string[];
};

async function runMigrations(pool: DbPool, migrations: MigrationFile[]): Promise<MigrationResult> {
  await pool.query('CREATE SCHEMA IF NOT EXISTS system');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system.migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows: appliedRows } = await pool.query<{ name: string }>(
    'SELECT name FROM system.migrations ORDER BY id',
  );
  const appliedSet = new Set(appliedRows.map((r) => r.name));

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of migrations) {
    if (appliedSet.has(migration.name)) {
      skipped.push(migration.name);
      continue;
    }

    await pool.query(migration.sql);
    await pool.query(
      'INSERT INTO system.migrations (name) VALUES ($1)',
      [migration.name],
    );
    applied.push(migration.name);
  }

  return { applied, skipped };
}

function loadMigrationFiles(migrationsDir: string): MigrationFile[] {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  return files.map((name) => ({
    name,
    sql: readFileSync(path.join(migrationsDir, name), 'utf-8'),
  }));
}

export { runMigrations, loadMigrationFiles, type MigrationFile, type MigrationResult };
