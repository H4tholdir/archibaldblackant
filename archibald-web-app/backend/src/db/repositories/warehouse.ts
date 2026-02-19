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
  };
}

async function getBoxes(pool: DbPool, userId: string): Promise<WarehouseBox[]> {
  const { rows } = await pool.query<WarehouseBoxRow>(
    `SELECT
      i.box_name AS name,
      COALESCE(b.created_at, 0) AS created_at,
      COALESCE(b.updated_at, 0) AS updated_at,
      COUNT(*)::int AS items_count,
      COALESCE(SUM(i.quantity), 0)::int AS total_quantity,
      COUNT(*) FILTER (WHERE i.reserved_for_order IS NULL AND i.sold_in_order IS NULL)::int AS available_count
    FROM agents.warehouse_items i
    LEFT JOIN agents.warehouse_boxes b ON b.user_id = i.user_id AND b.name = i.box_name
    WHERE i.user_id = $1
    GROUP BY i.box_name, b.created_at, b.updated_at
    ORDER BY i.box_name`,
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
  await pool.query('BEGIN', []);
  try {
    await pool.query(
      `UPDATE agents.warehouse_boxes SET name = $1, updated_at = $2
      WHERE user_id = $3 AND name = $4`,
      [newName, Date.now(), userId, oldName],
    );
    await pool.query(
      `UPDATE agents.warehouse_items SET box_name = $1
      WHERE user_id = $2 AND box_name = $3`,
      [newName, userId, oldName],
    );
    await pool.query('COMMIT', []);
  } catch (error) {
    await pool.query('ROLLBACK', []);
    throw error;
  }
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
    `DELETE FROM agents.warehouse_items WHERE user_id = $1`,
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
  mapRowToBox,
  mapRowToBoxDetail,
  mapRowToItem,
  type WarehouseBox,
  type WarehouseBoxDetail,
  type WarehouseItem,
  type WarehouseBoxRow,
  type WarehouseBoxDetailRow,
  type WarehouseItemRow,
};
