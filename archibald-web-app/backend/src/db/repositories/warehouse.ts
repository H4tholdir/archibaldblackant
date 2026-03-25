import type { DbPool } from '../pool';

type WarehouseBox = {
  name: string;
  createdAt: number;
  updatedAt: number;
  itemsCount: number;
  totalQuantity: number;
  availableCount: number;
};

type WarehouseItem = {
  id: number;
  userId: string;
  articleCode: string;
  description: string;
  quantity: number;
  boxName: string;
  reservedForOrder: string | null;
  soldInOrder: string | null;
  uploadedAt: number;
  deviceId: string;
  customerName: string | null;
  subClientName: string | null;
  orderDate: string | null;
  orderNumber: string | null;
  returnReason: string | null;
};

type WarehouseBoxRow = {
  name: string;
  created_at: number;
  updated_at: number;
  items_count: number;
  total_quantity: number;
  available_count: number;
};

type WarehouseBoxDetail = {
  id: number;
  userId: string;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: number;
  updatedAt: number;
};

type WarehouseBoxDetailRow = {
  id: number;
  user_id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: number;
  updated_at: number;
};

type WarehouseItemRow = {
  id: number;
  user_id: string;
  article_code: string;
  description: string;
  quantity: number;
  box_name: string;
  reserved_for_order: string | null;
  sold_in_order: string | null;
  uploaded_at: number;
  device_id: string;
  customer_name: string | null;
  sub_client_name: string | null;
  order_date: string | null;
  order_number: string | null;
  return_reason: string | null;
};

function mapRowToBox(row: WarehouseBoxRow): WarehouseBox {
  return {
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itemsCount: row.items_count,
    totalQuantity: row.total_quantity,
    availableCount: row.available_count,
  };
}

function mapRowToBoxDetail(row: WarehouseBoxDetailRow): WarehouseBoxDetail {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToItem(row: WarehouseItemRow): WarehouseItem {
  return {
    id: row.id,
    userId: row.user_id,
    articleCode: row.article_code,
    description: row.description,
    quantity: row.quantity,
    boxName: row.box_name,
    reservedForOrder: row.reserved_for_order,
    soldInOrder: row.sold_in_order,
    uploadedAt: row.uploaded_at,
    deviceId: row.device_id,
    customerName: row.customer_name,
    subClientName: row.sub_client_name,
    orderDate: row.order_date,
    orderNumber: row.order_number,
    returnReason: row.return_reason,
  };
}

async function getBoxes(pool: DbPool, userId: string): Promise<WarehouseBox[]> {
  const { rows } = await pool.query<WarehouseBoxRow>(
    `SELECT
      b.name,
      b.created_at,
      b.updated_at,
      COUNT(i.id)::int AS items_count,
      COALESCE(SUM(i.quantity), 0)::int AS total_quantity,
      COUNT(i.id) FILTER (WHERE i.reserved_for_order IS NULL AND i.sold_in_order IS NULL)::int AS available_count
    FROM agents.warehouse_boxes b
    LEFT JOIN agents.warehouse_items i ON i.user_id = b.user_id AND i.box_name = b.name
    WHERE b.user_id = $1
    GROUP BY b.name, b.created_at, b.updated_at
    ORDER BY b.name`,
    [userId],
  );
  return rows.map(mapRowToBox);
}

async function createBox(
  pool: DbPool,
  userId: string,
  name: string,
  description?: string,
  color?: string,
): Promise<WarehouseBoxDetail> {
  const now = Date.now();
  const { rows: [row] } = await pool.query<WarehouseBoxDetailRow>(
    `INSERT INTO agents.warehouse_boxes (user_id, name, description, color, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [userId, name, description ?? null, color ?? null, now, now],
  );
  return mapRowToBoxDetail(row);
}

async function renameBox(
  pool: DbPool,
  userId: string,
  oldName: string,
  newName: string,
): Promise<void> {
  await pool.withTransaction(async (tx) => {
    await tx.query(
      `UPDATE agents.warehouse_boxes SET name = $1, updated_at = $2
      WHERE user_id = $3 AND name = $4`,
      [newName, Date.now(), userId, oldName],
    );
    await tx.query(
      `UPDATE agents.warehouse_items SET box_name = $1
      WHERE user_id = $2 AND box_name = $3`,
      [newName, userId, oldName],
    );
  });
}

async function deleteBox(pool: DbPool, userId: string, name: string): Promise<boolean> {
  const { rows: [countRow] } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM agents.warehouse_items
    WHERE user_id = $1 AND box_name = $2`,
    [userId, name],
  );

  if (parseInt(countRow.count, 10) > 0) {
    return false;
  }

  const { rowCount } = await pool.query(
    `DELETE FROM agents.warehouse_boxes WHERE user_id = $1 AND name = $2`,
    [userId, name],
  );
  return (rowCount ?? 0) > 0;
}

async function ensureBoxExists(pool: DbPool, userId: string, boxName: string): Promise<void> {
  const now = Date.now();
  await pool.query(
    `INSERT INTO agents.warehouse_boxes (user_id, name, created_at, updated_at)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, name) DO NOTHING`,
    [userId, boxName, now, now],
  );
}

async function getItemsByBox(pool: DbPool, userId: string, boxName: string): Promise<WarehouseItem[]> {
  const { rows } = await pool.query<WarehouseItemRow>(
    `SELECT * FROM agents.warehouse_items
    WHERE user_id = $1 AND box_name = $2
    ORDER BY uploaded_at DESC`,
    [userId, boxName],
  );
  return rows.map(mapRowToItem);
}

async function addItem(
  pool: DbPool,
  userId: string,
  articleCode: string,
  description: string,
  quantity: number,
  boxName: string,
  deviceId: string,
): Promise<WarehouseItem> {
  const now = Date.now();
  const { rows: [row] } = await pool.query<WarehouseItemRow>(
    `INSERT INTO agents.warehouse_items (user_id, article_code, description, quantity, box_name, uploaded_at, device_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *`,
    [userId, articleCode, description, quantity, boxName, now, deviceId],
  );
  return mapRowToItem(row);
}

async function updateItemQuantity(
  pool: DbPool,
  userId: string,
  itemId: number,
  quantity: number,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE agents.warehouse_items SET quantity = $1
    WHERE id = $2 AND user_id = $3
      AND reserved_for_order IS NULL AND sold_in_order IS NULL`,
    [quantity, itemId, userId],
  );
  return (rowCount ?? 0) > 0;
}

async function deleteItem(pool: DbPool, userId: string, itemId: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM agents.warehouse_items
    WHERE id = $1 AND user_id = $2
      AND reserved_for_order IS NULL AND sold_in_order IS NULL`,
    [itemId, userId],
  );
  return (rowCount ?? 0) > 0;
}

async function moveItems(
  pool: DbPool,
  userId: string,
  itemIds: number[],
  destinationBox: string,
): Promise<number> {
  if (itemIds.length === 0) return 0;

  const placeholders = itemIds.map((_, i) => `$${i + 3}`).join(', ');
  const { rowCount } = await pool.query(
    `UPDATE agents.warehouse_items SET box_name = $1
    WHERE user_id = $2 AND id IN (${placeholders})
      AND reserved_for_order IS NULL AND sold_in_order IS NULL`,
    [destinationBox, userId, ...itemIds],
  );
  return rowCount ?? 0;
}

async function clearAllItems(pool: DbPool, userId: string): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM agents.warehouse_items
     WHERE user_id = $1 AND reserved_for_order IS NULL AND sold_in_order IS NULL`,
    [userId],
  );
  return rowCount ?? 0;
}

async function getItemById(pool: DbPool, userId: string, itemId: number): Promise<WarehouseItem | null> {
  const { rows: [row] } = await pool.query<WarehouseItemRow>(
    `SELECT * FROM agents.warehouse_items WHERE id = $1 AND user_id = $2`,
    [itemId, userId],
  );
  return row ? mapRowToItem(row) : null;
}

async function getAllItems(pool: DbPool, userId: string): Promise<WarehouseItem[]> {
  const { rows } = await pool.query<WarehouseItemRow>(
    `SELECT * FROM agents.warehouse_items WHERE user_id = $1 ORDER BY uploaded_at DESC`,
    [userId],
  );
  return rows.map(mapRowToItem);
}

async function bulkStoreItems(
  pool: DbPool,
  userId: string,
  items: Array<{ articleCode: string; description: string; quantity: number; boxName: string; deviceId: string }>,
  clearExisting: boolean,
): Promise<number> {
  return pool.withTransaction(async (tx) => {
    if (clearExisting) {
      await tx.query(
        `DELETE FROM agents.warehouse_items
         WHERE user_id = $1 AND reserved_for_order IS NULL AND sold_in_order IS NULL`,
        [userId],
      );
    }
    const now = Date.now();
    let inserted = 0;
    for (const item of items) {
      await tx.query(
        `INSERT INTO agents.warehouse_boxes (user_id, name, created_at, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, name) DO NOTHING`,
        [userId, item.boxName, now, now],
      );
      await tx.query(
        `INSERT INTO agents.warehouse_items (user_id, article_code, description, quantity, box_name, uploaded_at, device_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, item.articleCode, item.description, item.quantity, item.boxName, now, item.deviceId],
      );
      inserted++;
    }
    return inserted;
  });
}

type BatchReserveResult = {
  reserved: number;
  skipped: number;
  totalRequestedQty: number;
  totalReservedQty: number;
  warnings: string[];
};

async function batchReserve(
  pool: DbPool,
  userId: string,
  items: Array<{ itemId: number; quantity: number }>,
  orderId: string,
  tracking?: { customerName?: string; subClientName?: string; orderDate?: string; orderNumber?: string },
): Promise<BatchReserveResult> {
  if (items.length === 0) return { reserved: 0, skipped: 0, totalRequestedQty: 0, totalReservedQty: 0, warnings: [] };

  let reserved = 0;
  let skipped = 0;
  let totalRequestedQty = 0;
  let totalReservedQty = 0;
  const warnings: string[] = [];

  for (const { itemId, quantity: requestedQty } of items) {
    totalRequestedQty += requestedQty;

    const { rows: [item] } = await pool.query<WarehouseItemRow>(
      `SELECT * FROM agents.warehouse_items
       WHERE id = $1 AND user_id = $2
         AND reserved_for_order IS NULL AND sold_in_order IS NULL`,
      [itemId, userId],
    );

    if (!item) {
      skipped++;
      warnings.push(`Item ${itemId}: non trovato o già riservato/venduto (richiesti ${requestedQty} pz)`);
      continue;
    }

    if (requestedQty > item.quantity) {
      warnings.push(
        `Item ${itemId} (${item.article_code}): richiesti ${requestedQty} pz ma disponibili solo ${item.quantity} pz — riservati ${item.quantity} pz`,
      );
    }

    if (requestedQty >= item.quantity) {
      await pool.query(
        `UPDATE agents.warehouse_items
         SET reserved_for_order = $1,
             customer_name = $3, sub_client_name = $4, order_date = $5, order_number = $6
         WHERE id = $7 AND user_id = $2`,
        [orderId, userId, tracking?.customerName ?? null, tracking?.subClientName ?? null, tracking?.orderDate ?? null, tracking?.orderNumber ?? null, itemId],
      );
      totalReservedQty += item.quantity;
    } else {
      await pool.query(
        `UPDATE agents.warehouse_items SET quantity = quantity - $1 WHERE id = $2 AND user_id = $3`,
        [requestedQty, itemId, userId],
      );
      await pool.query(
        `INSERT INTO agents.warehouse_items
           (user_id, article_code, description, quantity, box_name, reserved_for_order,
            uploaded_at, device_id, customer_name, sub_client_name, order_date, order_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [userId, item.article_code, item.description, requestedQty, item.box_name, orderId,
         item.uploaded_at, item.device_id, tracking?.customerName ?? null, tracking?.subClientName ?? null, tracking?.orderDate ?? null, tracking?.orderNumber ?? null],
      );
      totalReservedQty += requestedQty;
    }
    reserved++;
  }

  return { reserved, skipped, totalRequestedQty, totalReservedQty, warnings };
}

async function batchRelease(pool: DbPool, userId: string, orderId: string): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE agents.warehouse_items
     SET reserved_for_order = NULL, customer_name = NULL, sub_client_name = NULL, order_date = NULL, order_number = NULL
     WHERE user_id = $1 AND reserved_for_order = $2`,
    [userId, orderId],
  );
  return rowCount ?? 0;
}

async function batchMarkSold(
  pool: DbPool,
  userId: string,
  orderId: string,
  tracking?: { customerName?: string; subClientName?: string; orderDate?: string; orderNumber?: string },
): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE agents.warehouse_items
     SET sold_in_order = $1,
         reserved_for_order = NULL,
         customer_name = COALESCE($3, customer_name),
         sub_client_name = COALESCE($4, sub_client_name),
         order_date = COALESCE($5, order_date),
         order_number = COALESCE($6, order_number)
     WHERE user_id = $2 AND reserved_for_order = $1 AND sold_in_order IS NULL`,
    [orderId, userId, tracking?.customerName ?? null, tracking?.subClientName ?? null, tracking?.orderDate ?? null, tracking?.orderNumber ?? null],
  );
  return rowCount ?? 0;
}

async function batchTransfer(pool: DbPool, userId: string, fromOrderIds: string[], toOrderId: string): Promise<number> {
  if (fromOrderIds.length === 0) return 0;
  const placeholders = fromOrderIds.map((_, i) => `$${i + 3}`).join(', ');
  const { rowCount } = await pool.query(
    `UPDATE agents.warehouse_items
     SET reserved_for_order = $1
     WHERE user_id = $2 AND reserved_for_order IN (${placeholders}) AND sold_in_order IS NULL`,
    [toOrderId, userId, ...fromOrderIds],
  );
  return rowCount ?? 0;
}

async function batchReturnSold(pool: DbPool, userId: string, orderId: string, reason?: string): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE agents.warehouse_items
     SET sold_in_order = NULL, reserved_for_order = NULL,
         customer_name = NULL, sub_client_name = NULL, order_date = NULL, order_number = NULL,
         return_reason = $3
     WHERE user_id = $1 AND sold_in_order = $2`,
    [userId, orderId, reason ?? null],
  );
  return rowCount ?? 0;
}

async function getMetadata(pool: DbPool, userId: string): Promise<{ totalItems: number; totalQuantity: number; boxesCount: number; reservedCount: number; soldCount: number }> {
  const { rows: [row] } = await pool.query<{ total_items: string; total_quantity: string; boxes_count: string; reserved_count: string; sold_count: string }>(
    `SELECT
      COUNT(*)::text AS total_items,
      COALESCE(SUM(quantity), 0)::text AS total_quantity,
      COUNT(DISTINCT box_name)::text AS boxes_count,
      COUNT(*) FILTER (WHERE reserved_for_order IS NOT NULL)::text AS reserved_count,
      COUNT(*) FILTER (WHERE sold_in_order IS NOT NULL)::text AS sold_count
    FROM agents.warehouse_items WHERE user_id = $1`,
    [userId],
  );
  return {
    totalItems: parseInt(row.total_items, 10),
    totalQuantity: parseInt(row.total_quantity, 10),
    boxesCount: parseInt(row.boxes_count, 10),
    reservedCount: parseInt(row.reserved_count, 10),
    soldCount: parseInt(row.sold_count, 10),
  };
}

export {
  getBoxes,
  createBox,
  renameBox,
  deleteBox,
  ensureBoxExists,
  getItemsByBox,
  addItem,
  updateItemQuantity,
  deleteItem,
  moveItems,
  clearAllItems,
  getItemById,
  getAllItems,
  bulkStoreItems,
  batchReserve,
  batchRelease,
  batchMarkSold,
  batchTransfer,
  batchReturnSold,
  getMetadata,
  mapRowToBox,
  mapRowToBoxDetail,
  mapRowToItem,
  type WarehouseBox,
  type WarehouseBoxDetail,
  type WarehouseItem,
  type WarehouseBoxRow,
  type WarehouseBoxDetailRow,
  type WarehouseItemRow,
  type BatchReserveResult,
};
