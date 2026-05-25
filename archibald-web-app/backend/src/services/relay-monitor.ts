import type { DbPool } from '../db/pool';
import { logger } from '../logger';

type BroadcastFn = (userId: string, msg: Record<string, unknown>) => void;

// Heartbeat in-memory: il Mac invia POST ogni 60s.
// Reset al riavvio del backend — il Mac re-sincronizza entro 60-90s.
let lastHeartbeatAt: number | null = null;
const HEARTBEAT_TIMEOUT_MS = 90_000;

export function recordRelayHeartbeat(): void {
  lastHeartbeatAt = Date.now();
}

export function isRelayLive(): boolean {
  if (!lastHeartbeatAt) return false;
  return Date.now() - lastHeartbeatAt < HEARTBEAT_TIMEOUT_MS;
}

async function getErpAgentUserIds(pool: DbPool): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM agents.users WHERE encrypted_password IS NOT NULL`,
  );
  return rows.map(r => r.id);
}

async function openRelaySession(pool: DbPool, userId: string, broadcast?: BroadcastFn): Promise<void> {
  await pool.query(
    `UPDATE system.agent_circuit_state
     SET state = 'closed', consecutive_erp_failures = 0, next_probe_at = NULL, updated_at = NOW()
     WHERE user_id = $1`,
    [userId],
  );
  await pool.query(`DELETE FROM system.sync_paused_users WHERE user_id = $1`, [userId]);
  logger.info('[RelayMonitor] relay attivo — sessione auto-aperta', { userId });
  broadcast?.(userId, { type: 'RELAY_STATUS', payload: { status: 'active' }, timestamp: new Date().toISOString() });
}

async function closeRelaySession(pool: DbPool, userId: string, broadcast?: BroadcastFn): Promise<void> {
  await pool.query(
    `UPDATE system.agent_circuit_state
     SET state = 'open', consecutive_erp_failures = 99,
         next_probe_at = NOW() + INTERVAL '999 days', updated_at = NOW()
     WHERE user_id = $1`,
    [userId],
  );
  await pool.query(
    `INSERT INTO system.sync_paused_users (user_id, reason)
     VALUES ($1, 'erp_blocked_offline_mode')
     ON CONFLICT (user_id) DO UPDATE SET reason = EXCLUDED.reason`,
    [userId],
  );
  await pool.query(
    `UPDATE system.agent_operation_queue
     SET status = 'cancelled', cancelled_at = NOW(), cancelled_reason = 'relay_offline'
     WHERE status = 'enqueued' AND user_id = $1 AND (priority >= 200 OR task_type = 'submit-order')`,
    [userId],
  );
  logger.info('[RelayMonitor] relay perso — sessione auto-chiusa', { userId });
  broadcast?.(userId, { type: 'RELAY_STATUS', payload: { status: 'inactive' }, timestamp: new Date().toISOString() });
}

export function createRelayMonitor(pool: DbPool, broadcast?: BroadcastFn): { stop: () => void } {
  // null = stato sconosciuto (primo tick dopo avvio backend)
  let previouslyLive: boolean | null = null;

  const tick = async (): Promise<void> => {
    const currentlyLive = isRelayLive();
    if (currentlyLive === previouslyLive) return;

    try {
      const userIds = await getErpAgentUserIds(pool);
      await Promise.all(
        userIds.map(userId =>
          currentlyLive
            ? openRelaySession(pool, userId, broadcast)
            : closeRelaySession(pool, userId, broadcast),
        ),
      );
      previouslyLive = currentlyLive;
    } catch (err) {
      logger.warn('[RelayMonitor] errore transizione stato', { err, currentlyLive });
    }
  };

  const interval = setInterval(() => tick().catch(err => logger.warn('[RelayMonitor] tick uncaught', { err })), 30_000);
  logger.info('[RelayMonitor] avviato (poll 30s, heartbeat timeout 90s)');

  return { stop: () => clearInterval(interval) };
}
