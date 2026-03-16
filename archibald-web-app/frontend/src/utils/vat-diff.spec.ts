import { describe, expect, test } from 'vitest';
import { buildVatDiff } from './vat-diff';
import type { CustomerFormData } from '../types/customer-form-data';
import type { VatLookupResult } from '../types/vat-lookup-result';

const baseForm: CustomerFormData = {
  name: 'Rossi Mario',
  deliveryMode: 'FedEx',
  vatNumber: '01806980650',
  paymentTerms: '206',
  pec: 'mario@pec.it',
  sdi: 'ABC1234',
  street: 'Via Roma 1',
  postalCode: '80100',
  phone: '+39123',
  mobile: '+39456',
  email: 'mario@email.it',
  url: '',
  postalCodeCity: 'Napoli',
  postalCodeCountry: 'IT',
};

const baseVatResult: VatLookupResult = {
  lastVatCheck: '13/01/2026',
  vatValidated: 'Sì',
  vatAddress: 'Via Roma 1, 80100 Napoli',
  parsed: {
    companyName: 'Rossi Mario',
    street: 'Via Roma 1',
    postalCode: '80100',
    city: 'Napoli',
    vatStatus: 'Sì',
    internalId: '55.123',
  },
  pec: 'mario@pec.it',
  sdi: 'ABC1234',
};

describe('buildVatDiff', () => {
  test('campo identico → preSelected true', () => {
    const diff = buildVatDiff(baseForm, baseVatResult);
    const name = diff.find(d => d.key === 'name')!;
    expect(name).toEqual({
      key: 'name',
      label: 'Nome',
      current: 'Rossi Mario',
      archibald: 'Rossi Mario',
      preSelected: true,
    });
  });

  test('campo diverso → preSelected false', () => {
    const form = { ...baseForm, street: 'Via Vecchia 99' };
    const diff = buildVatDiff(form, baseVatResult);
    const street = diff.find(d => d.key === 'street')!;
    expect(street.preSelected).toBe(false);
    expect(street.current).toBe('Via Vecchia 99');
    expect(street.archibald).toBe('Via Roma 1');
  });

  test('campo vuoto nel current → preSelected true', () => {
    const form = { ...baseForm, pec: '' };
    const diff = buildVatDiff(form, baseVatResult);
    const pec = diff.find(d => d.key === 'pec')!;
    expect(pec.preSelected).toBe(true);
  });

  test('tutti campi diversi → nessuno preSelected', () => {
    // Tutti e 6 i campi del diff (name, street, postalCode, postalCodeCity, pec, sdi) diversi
    const form = {
      ...baseForm,
      name: 'Altro Nome',
      street: 'Via X 99',
      postalCode: '10100',
      postalCodeCity: 'Torino',
      pec: 'x@pec.it',
      sdi: 'ZZZ9999',
    };
    const vatResult = {
      ...baseVatResult,
      parsed: { ...baseVatResult.parsed, companyName: 'Diverso', street: 'Via Y', postalCode: '00100', city: 'Roma' },
      pec: 'y@pec.it',
      sdi: 'WWW1111',
    };
    const diff = buildVatDiff(form, vatResult);
    // Nessun campo deve essere pre-selezionato perché tutti sono diversi e non vuoti
    expect(diff.every(d => !d.preSelected)).toBe(true);
  });

  test('campo archibald null/undefined → archibald stringa vuota', () => {
    const vatResult = {
      ...baseVatResult,
      parsed: { ...baseVatResult.parsed, companyName: undefined as unknown as string },
    };
    const diff = buildVatDiff(baseForm, vatResult);
    const name = diff.find(d => d.key === 'name')!;
    expect(name.archibald).toBe('');
  });

  test('ritorna esattamente i 6 campi: name, street, postalCode, postalCodeCity, pec, sdi', () => {
    const diff = buildVatDiff(baseForm, baseVatResult);
    expect(diff.map(d => d.key)).toEqual(['name', 'street', 'postalCode', 'postalCodeCity', 'pec', 'sdi']);
  });
});
