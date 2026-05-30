import { describe, it, expect } from 'vitest';
import { getApplicableStep, dominantTone } from './escalation';

const gentileSteps = [
  { days_after_due: 15, tone: 'cordiale', channels: ['email', 'whatsapp'] },
  { days_after_due: 45, tone: 'formale',  channels: ['email', 'whatsapp'] },
  { days_after_due: 90, tone: 'urgente',  channels: ['email'] },
];

describe('getApplicableStep', () => {
  it('restituisce step +15 se la fattura è scaduta da 20 giorni e lo step 0 non è stato inviato', () => {
    const result = getApplicableStep(20, gentileSteps, new Set());
    expect(result).toMatchObject({ index: 0, tone: 'cordiale' });
  });

  it('restituisce step +45 se lo step 0 è già stato inviato e la fattura è scaduta da 50 giorni', () => {
    const result = getApplicableStep(50, gentileSteps, new Set([0]));
    expect(result).toMatchObject({ index: 1, tone: 'formale' });
  });

  it('restituisce null se tutti gli step sono stati inviati', () => {
    const result = getApplicableStep(100, gentileSteps, new Set([0, 1, 2]));
    expect(result).toBeNull();
  });

  it('restituisce null se la fattura è scaduta da meno del primo threshold', () => {
    const result = getApplicableStep(10, gentileSteps, new Set());
    expect(result).toBeNull();
  });
});

describe('dominantTone', () => {
  it('restituisce il tono più severo tra più step', () => {
    expect(dominantTone(['cordiale', 'urgente', 'formale'])).toBe('urgente');
    expect(dominantTone(['cordiale', 'formale'])).toBe('formale');
    expect(dominantTone(['cordiale'])).toBe('cordiale');
  });
});
