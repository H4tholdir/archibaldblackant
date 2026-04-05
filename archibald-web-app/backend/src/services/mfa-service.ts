import * as OTPAuth from 'otpauth';
import * as bcrypt from 'bcryptjs';
import crypto from 'crypto';

export function generateTotpSecret(): string {
  const secret = new OTPAuth.Secret({ size: 20 });
  return secret.base32;
}

export function getTotpUri(secret: string, username: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: 'Archibald',
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.toString();
}

export function verifyTotpCode(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const totp = new OTPAuth.TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

export async function generateRecoveryCodes(): Promise<{ plaintext: string[]; hashed: string[] }> {
  const plaintexts = Array.from({ length: 8 }, () =>
    crypto.randomBytes(8).toString('hex'),
  );
  const hashed = await Promise.all(
    plaintexts.map((code) => bcrypt.hash(code, 10)),
  );
  return { plaintext: plaintexts, hashed };
}

export async function verifyRecoveryCode(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
