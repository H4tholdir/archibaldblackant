import type Database from "better-sqlite3";

export function ensureFtCounterTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ft_counter (
      esercizio TEXT NOT NULL,
      user_id TEXT NOT NULL,
      last_number INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (esercizio, user_id)
    )
  `);
}

export function getNextFtNumber(
  db: Database.Database,
  esercizio: string,
  userId: string,
): number {
  const upsert = db.prepare(`
    INSERT INTO ft_counter (esercizio, user_id, last_number)
    VALUES (?, ?, 1)
    ON CONFLICT (esercizio, user_id)
    DO UPDATE SET last_number = last_number + 1
    RETURNING last_number
  `);
  const row = upsert.get(esercizio, userId) as { last_number: number };
  return row.last_number;
}

export function initializeCounterFromImport(
  db: Database.Database,
  esercizio: string,
  userId: string,
  maxNumber: number,
): void {
  db.prepare(`
    INSERT INTO ft_counter (esercizio, user_id, last_number)
    VALUES (?, ?, ?)
    ON CONFLICT (esercizio, user_id)
    DO UPDATE SET last_number = MAX(last_number, excluded.last_number)
  `).run(esercizio, userId, maxNumber);
}

export function getCurrentFtNumber(
  db: Database.Database,
  esercizio: string,
  userId: string,
): number {
  const row = db
    .prepare(
      "SELECT last_number FROM ft_counter WHERE esercizio = ? AND user_id = ?",
    )
    .get(esercizio, userId) as { last_number: number } | undefined;
  return row?.last_number ?? 0;
}
