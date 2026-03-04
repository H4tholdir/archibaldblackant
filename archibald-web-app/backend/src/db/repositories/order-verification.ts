import type { DbPool, TxClient } from '../pool';

type SnapshotItem = {
  articleCode: string;
  articleDescription: string | null;
  quantity: number;
  unitPrice: number;
  lineDiscountPercent: number | null;
  expectedLineAmount: number;
};

type SnapshotData = {
  globalDiscountPercent?: number;
  expectedGrossAmount: number;
  expectedTotalAmount: number;
  items: SnapshotItem[];
};

type SnapshotRow = {
  id: number;
  order_id: string;
  user_id: string;
  global_discount_percent: number | null;
  expected_gross_amount: number;
  expected_total_amount: number;
  verification_status: string;
  verified_at: string | null;
  verification_notes: string | null;
  created_at: string;
};

type SnapshotItemRow = {
  id: number;
  snapshot_id: number;
  article_code: string;
  article_description: string | null;
  quantity: number;
  unit_price: number;
  line_discount_percent: number | null;
  expected_line_amount: number;
  created_at: string;
};

type OrderVerificationSnapshot = {
  id: number;
  orderId: string;
  userId: string;
  globalDiscountPercent: number | null;
  expectedGrossAmount: number;
  expectedTotalAmount: number;
  verificationStatus: string;
  verifiedAt: string | null;
  verificationNotes: string | null;
  createdAt: string;
  items: Array<{
    id: number;
    articleCode: string;
    articleDescription: string | null;
    quantity: number;
    unitPrice: number;
    lineDiscountPercent: number | null;
    expectedLineAmount: number;
    createdAt: string;
  }>;
};

async function saveOrderVerificationSnapshot(
  tx: TxClient,
  orderId: string,
  userId: string,
  data: SnapshotData,
): Promise<number> {
  const { rows: [row] } = await tx.query<{ id: number }>(
    `INSERT INTO agents.order_verification_snapshots (
      order_id, user_id, global_discount_percent,
      expected_gross_amount, expected_total_amount
    ) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (order_id, user_id) DO UPDATE SET
      global_discount_percent = EXCLUDED.global_discount_percent,
      expected_gross_amount = EXCLUDED.expected_gross_amount,
      expected_total_amount = EXCLUDED.expected_total_amount,
      verification_status = 'pending_verification',
      verified_at = NULL,
      verification_notes = NULL,
      created_at = NOW()
    RETURNING id`,
    [orderId, userId, data.globalDiscountPercent ?? null, data.expectedGrossAmount, data.expectedTotalAmount],
  );

  const snapshotId = row.id;

  await tx.query(
    'DELETE FROM agents.order_verification_snapshot_items WHERE snapshot_id = $1',
    [snapshotId],
  );

  if (data.items.length > 0) {
    const values: unknown[] = [];
    const placeholders: string[] = [];
    const columnsPerRow = 7;

    for (let i = 0; i < data.items.length; i++) {
      const base = i * columnsPerRow;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`,
      );
      const item = data.items[i];
      values.push(
        snapshotId,
        item.articleCode,
        item.articleDescription,
        item.quantity,
        item.unitPrice,
        item.lineDiscountPercent,
        item.expectedLineAmount,
      );
    }

    await tx.query(
      `INSERT INTO agents.order_verification_snapshot_items (
        snapshot_id, article_code, article_description, quantity,
        unit_price, line_discount_percent, expected_line_amount
      ) VALUES ${placeholders.join(', ')}`,
      values,
    );
  }

  return snapshotId;
}

async function getOrderVerificationSnapshot(
  pool: DbPool,
  orderId: string,
  userId: string,
): Promise<OrderVerificationSnapshot | null> {
  const { rows: [snapshot] } = await pool.query<SnapshotRow>(
    `SELECT id, order_id, user_id, global_discount_percent,
      expected_gross_amount, expected_total_amount, verification_status,
      verified_at, verification_notes, created_at
    FROM agents.order_verification_snapshots
    WHERE order_id = $1 AND user_id = $2`,
    [orderId, userId],
  );

  if (!snapshot) return null;

  const { rows: itemRows } = await pool.query<SnapshotItemRow>(
    `SELECT id, snapshot_id, article_code, article_description, quantity,
      unit_price, line_discount_percent, expected_line_amount, created_at
    FROM agents.order_verification_snapshot_items
    WHERE snapshot_id = $1
    ORDER BY id`,
    [snapshot.id],
  );

  return {
    id: snapshot.id,
    orderId: snapshot.order_id,
    userId: snapshot.user_id,
    globalDiscountPercent: snapshot.global_discount_percent,
    expectedGrossAmount: snapshot.expected_gross_amount,
    expectedTotalAmount: snapshot.expected_total_amount,
    verificationStatus: snapshot.verification_status,
    verifiedAt: snapshot.verified_at,
    verificationNotes: snapshot.verification_notes,
    createdAt: snapshot.created_at,
    items: itemRows.map((r) => ({
      id: r.id,
      articleCode: r.article_code,
      articleDescription: r.article_description,
      quantity: r.quantity,
      unitPrice: r.unit_price,
      lineDiscountPercent: r.line_discount_percent,
      expectedLineAmount: r.expected_line_amount,
      createdAt: r.created_at,
    })),
  };
}

export {
  saveOrderVerificationSnapshot,
  getOrderVerificationSnapshot,
  type SnapshotData,
  type SnapshotItem,
  type OrderVerificationSnapshot,
};
