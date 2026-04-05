import type { DbPool } from '../pool';
import { logger } from '../../logger';

export type AuditEvent = {
  actorId?: string;
  actorRole?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
};

export async function audit(pool: DbPool, event: AuditEvent): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO system.audit_log
         (actor_id, actor_role, action, target_type, target_id, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::inet, $7, $8)`,
      [
        event.actorId ?? null,
        event.actorRole ?? null,
        event.action,
        event.targetType ?? null,
        event.targetId ?? null,
        event.ipAddress ?? null,
        event.userAgent ?? null,
        event.metadata ? JSON.stringify(event.metadata) : null,
      ],
    );
  } catch (err) {
    logger.warn('Audit log insert failed', { action: event.action, err });
  }
}
