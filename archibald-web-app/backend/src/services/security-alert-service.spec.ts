import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAudit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../db/repositories/audit-log', () => ({ audit: mockAudit }));

import { createSecurityAlertService, buildMailtoLink } from './security-alert-service';
import type { SecurityAlertEvent } from './security-alert-service';
import type { DbPool } from '../db/pool';

const mockPool = {} as DbPool;

describe('createSecurityAlertService', () => {
  beforeEach(() => mockAudit.mockClear());

  it('calls audit with action security.alert and actorRole system', () => {
    const svc = createSecurityAlertService(mockPool);
    svc.send('circuit_breaker_triggered', { userId: 'user1', syncType: 'agent-sync' });
    expect(mockAudit).toHaveBeenCalledOnce();
    expect(mockAudit).toHaveBeenCalledWith(mockPool, {
      action: 'security.alert',
      actorRole: 'system',
      metadata: { event: 'circuit_breaker_triggered', userId: 'user1', syncType: 'agent-sync' },
    });
  });

  it('spreads details into metadata alongside event', () => {
    const svc = createSecurityAlertService(mockPool);
    svc.send('backup_failed', { reason: 'timeout', attempt: 3 });
    const call = mockAudit.mock.calls[0][1];
    expect(call.metadata).toEqual({ event: 'backup_failed', reason: 'timeout', attempt: 3 });
  });

  it('calls audit even when details is empty', () => {
    const svc = createSecurityAlertService(mockPool);
    svc.send('high_error_rate', {});
    expect(mockAudit).toHaveBeenCalledOnce();
    expect(mockAudit.mock.calls[0][1].metadata).toEqual({ event: 'high_error_rate' });
  });
});

describe('buildMailtoLink', () => {
  const alertEmail = 'admin@example.com';
  const event: SecurityAlertEvent = 'login_failed_admin';
  const details = { ip: '1.2.3.4', username: 'frankie' };

  it('produces a mailto: URL with the encoded email address', () => {
    const link = buildMailtoLink(alertEmail, event, details);
    expect(link).toMatch(/^mailto:/);
    expect(link).toContain(encodeURIComponent(alertEmail));
  });

  it('encodes the event name in the subject', () => {
    const link = buildMailtoLink(alertEmail, event, details);
    expect(decodeURIComponent(link)).toContain('login_failed_admin');
  });

  it('encodes the details JSON in the body', () => {
    const link = buildMailtoLink(alertEmail, event, details);
    const decoded = decodeURIComponent(link);
    expect(decoded).toContain('1.2.3.4');
    expect(decoded).toContain('frankie');
  });

  it('includes both subject and body query params', () => {
    const link = buildMailtoLink(alertEmail, event, details);
    expect(link).toContain('subject=');
    expect(link).toContain('&body=');
  });
});
