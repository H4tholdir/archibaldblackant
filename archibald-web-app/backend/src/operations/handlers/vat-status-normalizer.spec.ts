import { describe, it, expect } from 'vitest';
import { normalizeVatStatus } from './vat-status-normalizer';

describe('normalizeVatStatus', () => {
  it.each(['Sì', 'Si', 'si', 'sì', 'SI', 'YES', 'yes', 'TRUE', 'true', '1'])(
    'normalizza "%s" come validated',
    (raw) => expect(normalizeVatStatus(raw)).toBe('validated'),
  );

  it.each(['No', 'no', 'NO', 'FALSE', 'false', '0'])(
    'normalizza "%s" come invalid',
    (raw) => expect(normalizeVatStatus(raw)).toBe('invalid'),
  );

  it.each([null, undefined, '', '   ', 'sconosciuto', 'N/A'])(
    'normalizza "%s" come unknown',
    (raw) => expect(normalizeVatStatus(raw)).toBe('unknown'),
  );
});
