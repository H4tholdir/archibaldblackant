import type { DbPool } from '../pool';

type DraftPayload = Record<string, unknown>;

type ScalarField = 'customer' | 'subClient' | 'globalDiscountPercent' | 'notes' | 'deliveryAddressId' | 'noShipping';

type OrderDraft = {
  id: string;
  userId: string;
  payload: DraftPayload;
  createdAt: string;
  updatedAt: string;
};

async function getDraftByUserId(pool: DbPool, userId: string): Promise<OrderDraft | null> {
  const result = await pool.query<{
    id: string;
    user_id: string;
    payload: DraftPayload;
    created_at: Date;
    updated_at: Date;
  }>(
    'SELECT id, user_id, payload, created_at, updated_at FROM agents.order_drafts WHERE user_id = $1',
    [userId],
  );
  if (result.rows.length === 0) return null;
  return rowToDraft(result.rows[0]);
}

async function createDraft(pool: DbPool, userId: string, payload: DraftPayload): Promise<OrderDraft> {
  const result = await pool.query<{
    id: string;
    user_id: string;
    payload: DraftPayload;
    created_at: Date;
    updated_at: Date;
  }>(
    `INSERT INTO agents.order_drafts (user_id, payload)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (user_id) DO UPDATE
       SET payload = EXCLUDED.payload, updated_at = NOW()
     RETURNING id, user_id, payload, created_at, updated_at`,
    [userId, JSON.stringify(payload)],
  );
  return rowToDraft(result.rows[0]);
}

async function applyItemDelta(
  pool: DbPool,
  draftId: string,
  userId: string,
  op: 'item:add' | 'item:remove' | 'item:edit',
  payload: unknown,
): Promise<void> {
  if (op === 'item:add') {
    await pool.query(
      `UPDATE agents.order_drafts
       SET payload = jsonb_set(
         payload,
         '{items}',
         COALESCE(
           (SELECT jsonb_agg(item)
            FROM jsonb_array_elements(COALESCE(payload->'items', '[]'::jsonb)) item
            WHERE item->>'id' != ($1::jsonb)->>'id'),
           '[]'::jsonb
         ) || $1::jsonb
       ),
       updated_at = NOW()
       WHERE id = $2 AND user_id = $3`,
      [JSON.stringify(payload), draftId, userId],
    );
  } else if (op === 'item:remove') {
    const { itemId } = payload as { itemId: string };
    await pool.query(
      `UPDATE agents.order_drafts
       SET payload = jsonb_set(
         payload,
         '{items}',
         COALESCE(
           (SELECT jsonb_agg(item)
            FROM jsonb_array_elements(COALESCE(payload->'items', '[]'::jsonb)) item
            WHERE item->>'id' != $1),
           '[]'::jsonb
         )
       ),
       updated_at = NOW()
       WHERE id = $2 AND user_id = $3`,
      [itemId, draftId, userId],
    );
  } else if (op === 'item:edit') {
    const { itemId, changes } = payload as { itemId: string; changes: Record<string, unknown> };
    await pool.query(
      `UPDATE agents.order_drafts
       SET payload = jsonb_set(
         payload,
         '{items}',
         COALESCE(
           (SELECT jsonb_agg(
             CASE WHEN item->>'id' = $1
                  THEN item || $2::jsonb
                  ELSE item
             END)
            FROM jsonb_array_elements(COALESCE(payload->'items', '[]'::jsonb)) item),
           '[]'::jsonb
         )
       ),
       updated_at = NOW()
       WHERE id = $3 AND user_id = $4`,
      [itemId, JSON.stringify(changes), draftId, userId],
    );
  }
}

async function applyScalarUpdate(
  pool: DbPool,
  draftId: string,
  userId: string,
  field: ScalarField,
  value: unknown,
): Promise<void> {
  await pool.query(
    `UPDATE agents.order_drafts
     SET payload = payload || jsonb_build_object($1::text, $2::jsonb),
         updated_at = NOW()
     WHERE id = $3 AND user_id = $4`,
    [field, JSON.stringify(value), draftId, userId],
  );
}

async function deleteDraftByUserId(pool: DbPool, userId: string): Promise<void> {
  await pool.query('DELETE FROM agents.order_drafts WHERE user_id = $1', [userId]);
}

function rowToDraft(row: {
  id: string;
  user_id: string;
  payload: DraftPayload;
  created_at: Date;
  updated_at: Date;
}): OrderDraft {
  return {
    id: row.id,
    userId: row.user_id,
    payload: row.payload,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export {
  getDraftByUserId,
  createDraft,
  applyItemDelta,
  applyScalarUpdate,
  deleteDraftByUserId,
  type OrderDraft,
  type DraftPayload,
  type ScalarField,
};
