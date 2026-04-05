import { randomBytes, createHash } from 'crypto';
import type { DbPool } from '../pool';

export async function createTrustToken(
  pool: DbPool,
  userId: string,
  deviceId: string,
): Promise<string> {
  const raw = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(raw).digest('hex');
  await pool.withTransaction(async (tx) => {
    await tx.query(
      'DELETE FROM agents.mfa_trusted_devices WHERE user_id = $1 AND device_id = $2',
      [userId, deviceId],
    );
    await tx.query(
      'INSERT INTO agents.mfa_trusted_devices (user_id, device_id, trust_token_hash) VALUES ($1, $2, $3)',
      [userId, deviceId, hash],
    );
  });
  return raw;
}

export async function verifyTrustToken(
  pool: DbPool,
  userId: string,
  deviceId: string,
  rawToken: string,
): Promise<boolean> {
  const hash = createHash('sha256').update(rawToken).digest('hex');
  const result = await pool.query(
    'SELECT id FROM agents.mfa_trusted_devices WHERE user_id = $1 AND device_id = $2 AND trust_token_hash = $3 AND expires_at > NOW()',
    [userId, deviceId, hash],
  );
  return result.rows.length > 0;
}

export async function revokeAllTrustTokens(
  pool: DbPool,
  userId: string,
): Promise<void> {
  await pool.query(
    'DELETE FROM agents.mfa_trusted_devices WHERE user_id = $1',
    [userId],
  );
}
