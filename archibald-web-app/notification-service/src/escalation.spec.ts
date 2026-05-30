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

// Test critico: profilo Aggressivo — step 0 WA-only non deve bloccare email
const aggressivoSteps = [
  { days_after_due: 0,  tone: 'cordiale', channels: ['whatsapp'] },
  { days_after_due: 3,  tone: 'formale',  channels: ['email', 'whatsapp'] },
  { days_after_due: 7,  tone: 'urgente',  channels: ['email', 'whatsapp'] },
  { days_after_due: 15, tone: 'urgente',  channels: ['email'] },
];

describe('getApplicableStep con filtro canale (prevenzione deadlock Aggressivo)', () => {
  it('email: salta step 0 WA-only e restituisce step 1 per fattura a 5gg', () => {
    const result = getApplicableStep(5, aggressivoSteps, new Set(), 'email');
    expect(result).toMatchObject({ index: 1, tone: 'formale' });
  });

  it('whatsapp: restituisce step 0 per fattura a 5gg', () => {
    const result = getApplicableStep(5, aggressivoSteps, new Set(), 'whatsapp');
    expect(result).toMatchObject({ index: 0, tone: 'cordiale' });
  });

  it('email: dopo step 1 inviato, restituisce step 2', () => {
    const result = getApplicableStep(10, aggressivoSteps, new Set([1]), 'email');
    expect(result).toMatchObject({ index: 2, tone: 'urgente' });
  });

  it('senza canale: comportamento precedente invariato (retrocompat)', () => {
    const result = getApplicableStep(5, aggressivoSteps, new Set());
    expect(result).toMatchObject({ index: 0, tone: 'cordiale' });
  });
});

describe('dominantTone', () => {
  it('restituisce il tono più severo tra più step', () => {
    expect(dominantTone(['cordiale', 'urgente', 'formale'])).toBe('urgente');
    expect(dominantTone(['cordiale', 'formale'])).toBe('formale');
    expect(dominantTone(['cordiale'])).toBe('cordiale');
  });
});
