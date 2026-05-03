import { describe, it, expect } from 'vitest';
import { getRecoveryLabels } from './OperationTrackingContext';

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
