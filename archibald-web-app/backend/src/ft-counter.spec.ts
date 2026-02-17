import Database from "better-sqlite3";
import { describe, expect, test, beforeEach } from "vitest";
import {
  ensureFtCounterTable,
  getNextFtNumber,
  initializeCounterFromImport,
  getCurrentFtNumber,
} from "./ft-counter";

describe("ensureFtCounterTable", () => {
  test("creates table and is idempotent", () => {
    const db = new Database(":memory:");
    ensureFtCounterTable(db);
    ensureFtCounterTable(db);
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='ft_counter'",
      )
      .all();
    expect(tables).toEqual([{ name: "ft_counter" }]);
    db.close();
  });
});

describe("getNextFtNumber", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    ensureFtCounterTable(db);
  });

  test("starts at 1 for new esercizio/user pair", () => {
    const result = getNextFtNumber(db, "2026", "user-1");
    expect(result).toBe(1);
    db.close();
  });

  test("increments sequentially", () => {
    const results = [
      getNextFtNumber(db, "2026", "user-1"),
      getNextFtNumber(db, "2026", "user-1"),
      getNextFtNumber(db, "2026", "user-1"),
    ];
    expect(results).toEqual([1, 2, 3]);
    db.close();
  });

  test("separate counters per esercizio", () => {
    getNextFtNumber(db, "2025", "user-1");
    getNextFtNumber(db, "2025", "user-1");
    const n2025 = getNextFtNumber(db, "2025", "user-1");
    const n2026 = getNextFtNumber(db, "2026", "user-1");
    expect(n2025).toBe(3);
    expect(n2026).toBe(1);
    db.close();
  });

  test("separate counters per user", () => {
    getNextFtNumber(db, "2026", "user-1");
    getNextFtNumber(db, "2026", "user-1");
    const nUser1 = getNextFtNumber(db, "2026", "user-1");
    const nUser2 = getNextFtNumber(db, "2026", "user-2");
    expect(nUser1).toBe(3);
    expect(nUser2).toBe(1);
    db.close();
  });
});

describe("initializeCounterFromImport", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    ensureFtCounterTable(db);
  });

  test("sets counter when no previous value exists", () => {
    initializeCounterFromImport(db, "2025", "user-1", 177);
    expect(getCurrentFtNumber(db, "2025", "user-1")).toBe(177);
    db.close();
  });

  test("updates to higher value", () => {
    initializeCounterFromImport(db, "2025", "user-1", 100);
    initializeCounterFromImport(db, "2025", "user-1", 177);
    expect(getCurrentFtNumber(db, "2025", "user-1")).toBe(177);
    db.close();
  });

  test("does not decrease counter", () => {
    initializeCounterFromImport(db, "2025", "user-1", 177);
    initializeCounterFromImport(db, "2025", "user-1", 50);
    expect(getCurrentFtNumber(db, "2025", "user-1")).toBe(177);
    db.close();
  });

  test("getNextFtNumber continues from initialized value", () => {
    initializeCounterFromImport(db, "2026", "user-1", 10);
    const next = getNextFtNumber(db, "2026", "user-1");
    expect(next).toBe(11);
    db.close();
  });
});

describe("getCurrentFtNumber", () => {
  test("returns 0 for non-existent pair", () => {
    const db = new Database(":memory:");
    ensureFtCounterTable(db);
    expect(getCurrentFtNumber(db, "2026", "user-1")).toBe(0);
    db.close();
  });
});
