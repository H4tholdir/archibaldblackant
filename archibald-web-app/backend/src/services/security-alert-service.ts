import type { DbPool } from '../db/pool';
import { audit } from '../db/repositories/audit-log';

export type SecurityAlertEvent =
  | 'login_failed_admin'
  | 'login_failed_agent'
  | 'circuit_breaker_triggered'
  | 'backup_failed'
  | 'backup_completed'
  | 'rate_limit_triggered_admin'
  | 'high_error_rate';

export function createSecurityAlertService(pool: DbPool): { send: (event: SecurityAlertEvent, details: Record<string, unknown>) => void } {
  function send(event: SecurityAlertEvent, details: Record<string, unknown>): void {
    void audit(pool, { action: 'security.alert', actorRole: 'system', metadata: { event, ...details } });
  }

  return { send };
}

export function buildMailtoLink(alertEmail: string, event: SecurityAlertEvent, details: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const subject = encodeURIComponent(`[ARCHIBALD SECURITY] ${event} — ${timestamp}`);
  const body = encodeURIComponent(`Evento: ${event}\nTimestamp: ${timestamp}\n\nDettagli:\n${JSON.stringify(details, null, 2)}`);
  return `mailto:${alertEmail}?subject=${subject}&body=${body}`;
}
