import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' });
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  },
}));

import { createSecurityAlertService } from './security-alert-service';

const smtpConfig = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  user: 'alerts@example.com',
  pass: 'secret',
  from: 'alerts@example.com',
};

describe('createSecurityAlertService', () => {
  beforeEach(() => mockSendMail.mockClear());

  it('sends email with event type in subject', async () => {
    const svc = createSecurityAlertService(smtpConfig, 'admin@example.com');
    await svc.send('circuit_breaker_triggered', { userId: 'user1', syncType: 'agent-sync' });
    expect(mockSendMail).toHaveBeenCalledOnce();
    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toContain('circuit_breaker_triggered');
    expect(call.to).toBe('admin@example.com');
  });

  it('swallows errors silently', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP down'));
    const svc = createSecurityAlertService(smtpConfig, 'admin@example.com');
    await expect(svc.send('backup_failed', {})).resolves.toBeUndefined();
  });

  it('does nothing when SMTP not configured', async () => {
    const svc = createSecurityAlertService(
      { host: '', port: 587, secure: false, user: '', pass: '', from: '' },
      'admin@example.com',
    );
    await svc.send('backup_failed', {});
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});
