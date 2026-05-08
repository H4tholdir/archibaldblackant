import { describe, it, expect, test } from 'vitest';
import { getRecoveryLabels, BACKGROUND_OP_TYPES, isBackgroundOperation } from './OperationTrackingContext';

describe('getRecoveryLabels', () => {
  it('ritorna label contestuale per submit-order completato', () => {
    const { label, completedLabel } = getRecoveryLabels('submit-order', 'completed');
    expect(label).toBe('Ordine inviato');
    expect(completedLabel).toBe('Ordine inviato');
  });

  it('ritorna label in-progress per submit-order attivo', () => {
    const { label } = getRecoveryLabels('submit-order', 'active');
    expect(label).toBe('Invio ordine...');
  });

  it('ritorna label di errore per qualsiasi tipo fallito', () => {
    const { label } = getRecoveryLabels('delete-order', 'failed');
    expect(label).toBe('Errore');
  });

  it('completedLabel è sempre il completato-corretto anche per status failed', () => {
    const { completedLabel } = getRecoveryLabels('delete-order', 'failed');
    expect(completedLabel).toBe('Ordine eliminato');
  });

  it('fallback generico per tipo sconosciuto attivo', () => {
    const { label } = getRecoveryLabels('unknown-type', 'active');
    expect(label).toBe('In corso...');
  });

  it('fallback generico per tipo sconosciuto completato', () => {
    const { label } = getRecoveryLabels('unknown-type', 'completed');
    expect(label).toBe('Operazione completata');
  });
});

describe('BACKGROUND_OP_TYPES', () => {
  test('include tutti i tipi di sync automatico', () => {
    const expected = [
      'sync-customers', 'sync-orders', 'sync-ddt', 'sync-invoices',
      'sync-products', 'sync-prices', 'sync-customer-addresses', 'sync-order-articles',
    ];
    for (const t of expected) {
      expect(BACKGROUND_OP_TYPES.has(t)).toBe(true);
    }
  });

  test('non include operazioni utente', () => {
    const userOps = [
      'submit-order', 'delete-order', 'edit-order', 'send-to-verona',
      'create-customer', 'update-customer', 'read-vat-status', 'refresh-customer',
      'download-ddt-pdf', 'download-invoice-pdf', 'batch-delete-orders', 'batch-send-to-verona',
    ];
    for (const t of userOps) {
      expect(BACKGROUND_OP_TYPES.has(t)).toBe(false);
    }
  });
});

describe('isBackgroundOperation', () => {
  test('sync-prices → isBackground: true', () => {
    expect(isBackgroundOperation('sync-prices')).toBe(true);
  });

  test('submit-order → isBackground: false', () => {
    expect(isBackgroundOperation('submit-order')).toBe(false);
  });

  test('tipo sconosciuto → isBackground: false', () => {
    expect(isBackgroundOperation('unknown-type')).toBe(false);
  });

  test('undefined → isBackground: false', () => {
    expect(isBackgroundOperation(undefined)).toBe(false);
  });
});
