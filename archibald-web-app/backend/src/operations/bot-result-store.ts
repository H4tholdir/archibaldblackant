import type { DbPool } from '../db/pool';

async function checkBotResult(
  pool: DbPool,
  userId: string,
  operationType: string,
  operationKey: string,
): Promise<Record<string, unknown> | null> {
  const result = await pool.query<{ result_data: Record<string, unknown> }>(
    `SELECT result_data FROM agents.bot_results
     WHERE user_id = $1 AND operation_type = $2 AND operation_key = $3`,
    [userId, operationType, operationKey],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].result_data;
}

async function saveBotResult(
  pool: DbPool,
  userId: string,
  operationType: string,
  operationKey: string,
  resultData: Record<string, unknown>,
): Promise<void> {
  await pool.query(
    `INSERT INTO agents.bot_results (user_id, operation_type, operation_key, result_data)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, operation_type, operation_key)
     DO UPDATE SET result_data = EXCLUDED.result_data, created_at = NOW()`,
    [userId, operationType, operationKey, JSON.stringify(resultData)],
  );
}

async function clearBotResult(
  pool: DbPool,
  userId: string,
  operationType: string,
  operationKey: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM agents.bot_results
     WHERE user_id = $1 AND operation_type = $2 AND operation_key = $3`,
    [userId, operationType, operationKey],
  );
}

export { checkBotResult, saveBotResult, clearBotResult };
