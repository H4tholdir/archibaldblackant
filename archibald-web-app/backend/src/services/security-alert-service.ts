import nodemailer from 'nodemailer';
import { logger } from '../logger';

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

export type SecurityAlertEvent =
  | 'login_failed_admin'
  | 'login_failed_agent'
  | 'circuit_breaker_triggered'
  | 'backup_failed'
  | 'backup_completed'
  | 'rate_limit_triggered_admin'
  | 'high_error_rate';

type SecurityAlertService = {
  send: (event: SecurityAlertEvent, details: Record<string, unknown>) => Promise<void>;
};

export function createSecurityAlertService(
  smtp: SmtpConfig,
  alertRecipient: string,
): SecurityAlertService {
  async function send(event: SecurityAlertEvent, details: Record<string, unknown>): Promise<void> {
    if (!smtp.host || !smtp.user) return;
    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user: smtp.user, pass: smtp.pass },
      });
      const timestamp = new Date().toISOString();
      await transporter.sendMail({
        from: smtp.from || smtp.user,
        to: alertRecipient,
        subject: `[ARCHIBALD SECURITY] ${event} — ${timestamp}`,
        text: `Evento: ${event}\nTimestamp: ${timestamp}\n\nDettagli:\n${JSON.stringify(details, null, 2)}`,
      });
    } catch (err) {
      logger.warn('Security alert email failed', { event, err });
    }
  }

  return { send };
}
