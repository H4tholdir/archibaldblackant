import { describe, it, expect } from 'vitest';
import { classifyError } from './error-classifier';

describe('classifyError', () => {
  describe('erp_unreachable cases', () => {
    it.each([
      'ECONNREFUSED 4.231.124.90:443',
      'request to https://4.231.124.90/Archibald/Default.aspx failed, reason: ETIMEDOUT login validation',
      'self signed certificate in certificate chain',
      'HTTP error 503 Service Unavailable',
      'Got 502 Bad Gateway from upstream',
      'Request failed with status code 500',
    ])('classifies "%s" as erp_unreachable', (msg) => {
      expect(classifyError(new Error(msg))).toBe('erp_unreachable');
    });
  });

  describe('verification_mismatch cases', () => {
    it.each([
      'VERIFICA_PRE_SAVE: discrepanza articoli — mancanti: [H129FSQ.104.023 qty=3]',
      'VERIFICA_PRE_SAVE: 2 righe mancanti su ERP',
    ])('classifies "%s" as verification_mismatch', (msg) => {
      expect(classifyError(new Error(msg))).toBe('verification_mismatch');
    });

    it('non classifica come verification_mismatch messaggi che contengono ma non iniziano con VERIFICA_PRE_SAVE', () => {
      expect(classifyError(new Error('context: VERIFICA_PRE_SAVE: testo'))).toBe('application_error');
    });
  });

  describe('application_error cases', () => {
    it.each([
      'Article H123.314.012 not found in database',
      'Customer not found in ERP',
      'P.IVA validation failed: 12345',
      'Runtime.callFunctionOn timed out (CDP)',
      'Variant K2 not found in dropdown',
      'Discount input not found',
      'Navigation timeout of 30000 ms exceeded',
    ])('classifies "%s" as application_error', (msg) => {
      expect(classifyError(new Error(msg))).toBe('application_error');
    });
  });

  it('handles non-Error thrown values', () => {
    expect(classifyError('string error' as unknown as Error)).toBe('application_error');
  });

  it('handles undefined message', () => {
    const e = new Error();
    expect(classifyError(e)).toBe('application_error');
  });
});
