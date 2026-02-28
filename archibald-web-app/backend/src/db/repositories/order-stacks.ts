import type { DbPool } from '../pool';

type OrderStack = {
  id: number;
  stackId: string;
  reason: string;
  orderIds: string[];
  createdAt: number;
};

type OrderStackRow = {
  id: number;
  user_id: string;
  stack_id: string;
  reason: string;
  created_at: number;
  order_ids: string[] | null;
};

type OrderStackMemberRow = {
  id: number;
  stack_id: number;
  order_id: string;
  position: number;
};

function mapRowToStack(row: OrderStackRow): OrderStack {
  return {
    id: row.id,
    stackId: row.stack_id,
    reason: row.reason,
    orderIds: (row.order_ids ?? []).filter((id) => id !== null),
    createdAt: row.created_at,
  };
}

async function getStacks(pool: DbPool, userId: string): Promise<OrderStack[]> {
  const { rows } = await pool.query<OrderStackRow>(
    `SELECT s.id, s.user_id, s.stack_id, s.reason, s.created_at,
            array_agg(m.order_id ORDER BY m.position) AS order_ids
     FROM agents.order_stacks s
     LEFT JOIN agents.order_stack_members m ON m.stack_id = s.id
     WHERE s.user_id = $1
     GROUP BY s.id
     ORDER BY s.created_at DESC`,
    [userId],
  );
  return rows.map(mapRowToStack);
}

async function createStack(
  pool: DbPool,
  userId: string,
  stackId: string,
  orderIds: string[],
  reason: string,
): Promise<OrderStack> {
  return pool.withTransaction(async (tx) => {
    const { rows: [stackRow] } = await tx.query<{ id: number; created_at: number }>(
      `INSERT INTO agents.order_stacks (user_id, stack_id, reason)
       VALUES ($1, $2, $3)
       RETURNING id, created_at`,
      [userId, stackId, reason],
    );

    for (let i = 0; i < orderIds.length; i++) {
      await tx.query(
        `INSERT INTO agents.order_stack_members (stack_id, order_id, position)
         VALUES ($1, $2, $3)`,
        [stackRow.id, orderIds[i], i],
      );
    }

    return {
      id: stackRow.id,
      stackId,
      reason,
      orderIds,
      createdAt: stackRow.created_at,
    };
  });
}

async function dissolveStack(pool: DbPool, userId: string, stackId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM agents.order_stacks WHERE user_id = $1 AND stack_id = $2`,
    [userId, stackId],
  );
  return (rowCount ?? 0) > 0;
}

async function removeMember(
  pool: DbPool,
  userId: string,
  stackId: string,
  orderId: string,
): Promise<boolean> {
  return pool.withTransaction(async (tx) => {
    const { rows: [stack] } = await tx.query<{ id: number }>(
      `SELECT id FROM agents.order_stacks WHERE user_id = $1 AND stack_id = $2`,
      [userId, stackId],
    );
    if (!stack) return false;

    await tx.query(
      `DELETE FROM agents.order_stack_members WHERE stack_id = $1 AND order_id = $2`,
      [stack.id, orderId],
    );

    const { rows: [countRow] } = await tx.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM agents.order_stack_members WHERE stack_id = $1`,
      [stack.id],
    );

    if (parseInt(countRow.count, 10) < 2) {
      await tx.query(`DELETE FROM agents.order_stacks WHERE id = $1`, [stack.id]);
    }

    return true;
  });
}

export {
  getStacks,
  createStack,
  dissolveStack,
  removeMember,
  mapRowToStack,
  type OrderStack,
  type OrderStackRow,
  type OrderStackMemberRow,
};
