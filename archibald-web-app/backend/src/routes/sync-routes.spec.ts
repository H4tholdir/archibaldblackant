import { describe, test, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";

const testDbPath = `/tmp/test-warehouse-batch-${Date.now()}.db`;
let db: Database.Database;

function setupDb() {
  db = new Database(testDbPath);
  db.exec(`
    CREATE TABLE warehouse_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      article_code TEXT NOT NULL,
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      box_name TEXT NOT NULL,
      reserved_for_order TEXT,
      sold_in_order TEXT,
      uploaded_at INTEGER NOT NULL,
      device_id TEXT NOT NULL,
      customer_name TEXT,
      sub_client_name TEXT,
      order_date TEXT,
      order_number TEXT
    );
  `);
}

function insertItem(overrides: Record<string, unknown> = {}): number {
  const defaults = {
    user_id: "user-1",
    article_code: "ART-001",
    description: "Test Article",
    quantity: 5,
    box_name: "BOX-1",
    reserved_for_order: null,
    sold_in_order: null,
    uploaded_at: Date.now(),
    device_id: "dev-1",
    customer_name: null,
    sub_client_name: null,
    order_date: null,
    order_number: null,
  };
  const row = { ...defaults, ...overrides };
  const result = db
    .prepare(
      `INSERT INTO warehouse_items
       (user_id, article_code, description, quantity, box_name,
        reserved_for_order, sold_in_order, uploaded_at, device_id,
        customer_name, sub_client_name, order_date, order_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.user_id,
      row.article_code,
      row.description,
      row.quantity,
      row.box_name,
      row.reserved_for_order,
      row.sold_in_order,
      row.uploaded_at,
      row.device_id,
      row.customer_name,
      row.sub_client_name,
      row.order_date,
      row.order_number,
    );
  return Number(result.lastInsertRowid);
}

function getItem(id: number) {
  return db.prepare("SELECT * FROM warehouse_items WHERE id = ?").get(id) as Record<string, unknown>;
}

beforeAll(() => {
  setupDb();
});

beforeEach(() => {
  db.exec("DELETE FROM warehouse_items");
});

afterAll(() => {
  db.close();
  for (const suffix of ["", "-shm", "-wal"]) {
    const p = testDbPath + suffix;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

describe("batch-reserve", () => {
  test("reserves multiple items and sets tracking fields", () => {
    const userId = "user-1";
    const id1 = insertItem();
    const id2 = insertItem({ article_code: "ART-002" });

    const orderId = "pending-order-abc";
    const tracking = {
      customerName: "Mario Rossi",
      subClientName: "Sub SRL",
      orderDate: "2026-02-19",
      orderNumber: "ORD/001",
    };

    const stmt = db.prepare(`
      UPDATE warehouse_items
      SET reserved_for_order = ?,
          customer_name = ?,
          sub_client_name = ?,
          order_date = ?,
          order_number = ?
      WHERE id = ? AND user_id = ? AND reserved_for_order IS NULL
    `);

    let reserved = 0;
    const runBatch = db.transaction(() => {
      for (const itemId of [id1, id2]) {
        const result = stmt.run(
          orderId,
          tracking.customerName,
          tracking.subClientName,
          tracking.orderDate,
          tracking.orderNumber,
          itemId,
          userId,
        );
        if (result.changes > 0) reserved++;
      }
    });
    runBatch();

    expect(reserved).toBe(2);

    const item1 = getItem(id1);
    expect(item1).toMatchObject({
      reserved_for_order: orderId,
      customer_name: "Mario Rossi",
      sub_client_name: "Sub SRL",
      order_date: "2026-02-19",
      order_number: "ORD/001",
    });

    const item2 = getItem(id2);
    expect(item2.reserved_for_order).toBe(orderId);
  });

  test("skips items already reserved by another order", () => {
    const userId = "user-1";
    const id1 = insertItem({ reserved_for_order: "other-order" });
    const id2 = insertItem();

    const stmt = db.prepare(`
      UPDATE warehouse_items
      SET reserved_for_order = ?
      WHERE id = ? AND user_id = ? AND reserved_for_order IS NULL
    `);

    let reserved = 0;
    const skipped: number[] = [];
    for (const itemId of [id1, id2]) {
      const result = stmt.run("pending-new", itemId, userId);
      if (result.changes > 0) {
        reserved++;
      } else {
        skipped.push(itemId);
      }
    }

    expect(reserved).toBe(1);
    expect(skipped).toEqual([id1]);

    expect(getItem(id1).reserved_for_order).toBe("other-order");
    expect(getItem(id2).reserved_for_order).toBe("pending-new");
  });

  test("does not reserve items belonging to a different user", () => {
    const id1 = insertItem({ user_id: "user-2" });

    const result = db
      .prepare(
        `UPDATE warehouse_items
         SET reserved_for_order = ?
         WHERE id = ? AND user_id = ? AND reserved_for_order IS NULL`,
      )
      .run("pending-x", id1, "user-1");

    expect(result.changes).toBe(0);
    expect(getItem(id1).reserved_for_order).toBeNull();
  });
});

describe("batch-release", () => {
  test("releases all items reserved for an orderId", () => {
    const orderId = "pending-order-abc";
    const id1 = insertItem({
      reserved_for_order: orderId,
      customer_name: "Mario",
      order_date: "2026-01-01",
    });
    const id2 = insertItem({ reserved_for_order: orderId });
    const id3 = insertItem({ reserved_for_order: "other-order" });

    const result = db
      .prepare(
        `UPDATE warehouse_items
         SET reserved_for_order = NULL,
             customer_name = NULL,
             sub_client_name = NULL,
             order_date = NULL,
             order_number = NULL
         WHERE user_id = ? AND reserved_for_order = ?`,
      )
      .run("user-1", orderId);

    expect(result.changes).toBe(2);

    expect(getItem(id1).reserved_for_order).toBeNull();
    expect(getItem(id1).customer_name).toBeNull();
    expect(getItem(id2).reserved_for_order).toBeNull();
    expect(getItem(id3).reserved_for_order).toBe("other-order");
  });

  test("returns 0 changes when no items match", () => {
    insertItem({ reserved_for_order: "other" });

    const result = db
      .prepare(
        `UPDATE warehouse_items
         SET reserved_for_order = NULL
         WHERE user_id = ? AND reserved_for_order = ?`,
      )
      .run("user-1", "nonexistent");

    expect(result.changes).toBe(0);
  });
});

describe("batch-mark-sold", () => {
  test("marks reserved items as sold and clears reservation", () => {
    const orderId = "pending-order-abc";
    const jobId = "72.999";
    const id1 = insertItem({
      reserved_for_order: orderId,
      customer_name: "Mario",
    });
    const id2 = insertItem({ reserved_for_order: orderId });

    const tracking = {
      customerName: "Luigi",
      orderDate: "2026-02-19",
    };

    const result = db
      .prepare(
        `UPDATE warehouse_items
         SET sold_in_order = ?,
             reserved_for_order = NULL,
             customer_name = COALESCE(?, customer_name),
             sub_client_name = COALESCE(?, sub_client_name),
             order_date = COALESCE(?, order_date),
             order_number = COALESCE(?, order_number)
         WHERE user_id = ? AND reserved_for_order = ?`,
      )
      .run(
        jobId,
        tracking.customerName,
        null,
        tracking.orderDate,
        null,
        "user-1",
        orderId,
      );

    expect(result.changes).toBe(2);

    const item1 = getItem(id1);
    expect(item1).toMatchObject({
      sold_in_order: jobId,
      reserved_for_order: null,
      customer_name: "Luigi",
      order_date: "2026-02-19",
    });

    const item2 = getItem(id2);
    expect(item2.sold_in_order).toBe(jobId);
    expect(item2.reserved_for_order).toBeNull();
  });

  test("does not affect items reserved for a different order", () => {
    const id1 = insertItem({ reserved_for_order: "other-order" });

    const result = db
      .prepare(
        `UPDATE warehouse_items
         SET sold_in_order = ?, reserved_for_order = NULL
         WHERE user_id = ? AND reserved_for_order = ?`,
      )
      .run("72.100", "user-1", "pending-nonexistent");

    expect(result.changes).toBe(0);
    expect(getItem(id1).reserved_for_order).toBe("other-order");
    expect(getItem(id1).sold_in_order).toBeNull();
  });
});

describe("batch-transfer", () => {
  test("transfers reservations from multiple source orders to destination", () => {
    const from1 = "pending-order-1";
    const from2 = "pending-order-2";
    const to = "pending-merged";

    const id1 = insertItem({ reserved_for_order: from1 });
    const id2 = insertItem({ reserved_for_order: from1 });
    const id3 = insertItem({ reserved_for_order: from2 });
    const id4 = insertItem({ reserved_for_order: "unrelated" });

    const stmt = db.prepare(`
      UPDATE warehouse_items
      SET reserved_for_order = ?
      WHERE user_id = ? AND reserved_for_order = ?
    `);

    let transferred = 0;
    const runBatch = db.transaction(() => {
      for (const fromId of [from1, from2]) {
        const result = stmt.run(to, "user-1", fromId);
        transferred += result.changes;
      }
    });
    runBatch();

    expect(transferred).toBe(3);

    expect(getItem(id1).reserved_for_order).toBe(to);
    expect(getItem(id2).reserved_for_order).toBe(to);
    expect(getItem(id3).reserved_for_order).toBe(to);
    expect(getItem(id4).reserved_for_order).toBe("unrelated");
  });

  test("returns 0 when no source items match", () => {
    insertItem({ reserved_for_order: "other" });

    const result = db
      .prepare(
        `UPDATE warehouse_items
         SET reserved_for_order = ?
         WHERE user_id = ? AND reserved_for_order = ?`,
      )
      .run("pending-dest", "user-1", "nonexistent");

    expect(result.changes).toBe(0);
  });
});
