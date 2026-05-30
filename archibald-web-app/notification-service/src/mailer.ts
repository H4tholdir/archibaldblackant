import nodemailer from 'nodemailer';
import { config } from './config';

export const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
});

export async function sendEmail(opts: {
  to: string;
  replyTo: string;
  fromName: string;
  subject: string;
  html: string;
}): Promise<void> {
  await transporter.sendMail({
    from: `"${opts.fromName}" <${config.smtp.from}>`,
    replyTo: opts.replyTo,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}
