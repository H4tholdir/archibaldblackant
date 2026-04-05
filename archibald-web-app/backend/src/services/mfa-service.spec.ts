import { describe, it, expect } from 'vitest';
import { generateTotpSecret, verifyTotpCode, generateRecoveryCodes, verifyRecoveryCode } from './mfa-service';
import * as OTPAuth from 'otpauth';

describe('generateTotpSecret', () => {
  it('returns a base32 secret of reasonable length', () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThanOrEqual(16);
    expect(/^[A-Z2-7]+=*$/.test(secret)).toBe(true);
  });

  it('generates unique secrets each call', () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });
});

describe('verifyTotpCode', () => {
  it('accepts a valid TOTP code for the secret', () => {
    const secret = generateTotpSecret();
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 });
    const validCode = totp.generate();
    expect(verifyTotpCode(secret, validCode)).toBe(true);
  });

  it('rejects an invalid code', () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, '000000')).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(verifyTotpCode(generateTotpSecret(), '12345')).toBe(false);
  });
});

describe('generateRecoveryCodes', () => {
  it('returns exactly 8 codes', async () => {
    const codes = await generateRecoveryCodes();
    expect(codes.plaintext).toHaveLength(8);
    expect(codes.hashed).toHaveLength(8);
  });

  it('codes are 16 hex chars each', async () => {
    const { plaintext } = await generateRecoveryCodes();
    plaintext.forEach((c) => expect(/^[0-9a-f]{16}$/.test(c)).toBe(true));
  });
});

describe('verifyRecoveryCode', () => {
  it('accepts matching plaintext against hash', async () => {
    const { plaintext, hashed } = await generateRecoveryCodes();
    const result = await verifyRecoveryCode(plaintext[0], hashed[0]);
    expect(result).toBe(true);
  });

  it('rejects wrong code', async () => {
    const { hashed } = await generateRecoveryCodes();
    expect(await verifyRecoveryCode('0000000000000000', hashed[0])).toBe(false);
  });
});
