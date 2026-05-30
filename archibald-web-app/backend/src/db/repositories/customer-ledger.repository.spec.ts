import { describe, it, expect } from 'vitest';
import { buildLedgerQuery } from './customer-ledger.repository';

describe('buildLedgerQuery', () => {
  it('filtra per remaining_amount non zero e non vuoto', () => {
    const { text } = buildLedgerQuery();
    expect(text).toContain("remaining_amount NOT IN ('0', '')");
  });

  it('esclude NC dalla somma da saldare e le mette in nc_total', () => {
    const { text } = buildLedgerQuery();
    expect(text).toContain('invoice_amount_num > 0');
    expect(text).toContain('invoice_amount_num < 0');
  });

  it('usa COALESCE per effective_email e effective_whatsapp', () => {
    const { text } = buildLedgerQuery();
    expect(text).toContain('COALESCE');
  });
});
