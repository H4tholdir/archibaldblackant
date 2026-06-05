import { describe, test, expect } from 'vitest';
import {
  normalizeId,
  calcValoreCliente,
  calcProbabilitaRiordino,
  calcScoreTotal,
  SCORE_WEIGHTS,
} from './visit-scoring-service';
import type { VisitMode } from '../db/repositories/visit-planning-types';

describe('normalizeId', () => {
  test('rimuove il punto da 52.424 → 52424', () => {
    expect(normalizeId('52.424')).toBe('52424');
  });
  test('lascia invariato 52452 (già senza punto)', () => {
    expect(normalizeId('52452')).toBe('52452');
  });
  test('gestisce null come stringa vuota', () => {
    expect(normalizeId(null)).toBe('');
  });
  test('gestisce undefined come stringa vuota', () => {
    expect(normalizeId(undefined)).toBe('');
  });
});

describe('calcValoreCliente', () => {
  test('somma FT puri senza doppio conteggio', () => {
    const fresisRecords = [
      { archibaldOrderId: null, targetTotalWithVat: 122.0 },
      { archibaldOrderId: null, targetTotalWithVat: 244.0 },
    ];
    const archRecords: Array<{ orderId: string; totalAmount: string }> = [];
    const result = calcValoreCliente(fresisRecords, archRecords);
    // (122 + 244) / 1.22 ≈ 300
    expect(result).toBeCloseTo(300, 0);
  });

  test('evita doppio conteggio KT con archibald_order_id valorizzato', () => {
    const fresisRecords = [
      { archibaldOrderId: '52.424', targetTotalWithVat: 150.0 },
    ];
    const archRecords = [
      { orderId: '52424', totalAmount: '122.95' },
    ];
    // Si usa SOLO fresis (150/1.22 ≈ 122.95), NON sommato con archRecords
    const result = calcValoreCliente(fresisRecords, archRecords);
    expect(result).toBeCloseTo(122.95, 1);
  });

  test('include ordini Archibald diretti se non coperti da fresis', () => {
    const fresisRecords: Array<{ archibaldOrderId: string | null; targetTotalWithVat: number }> = [];
    const archRecords = [
      { orderId: '55997', totalAmount: '122.95' },
    ];
    const result = calcValoreCliente(fresisRecords, archRecords);
    expect(result).toBeCloseTo(122.95, 1);
  });

  test('scarta total_amount non numerici', () => {
    const fresisRecords: Array<{ archibaldOrderId: string | null; targetTotalWithVat: number }> = [];
    const archRecords = [
      { orderId: '55997', totalAmount: '' },
      { orderId: '55998', totalAmount: 'N/A' },
      { orderId: '55999', totalAmount: '200.00' },
    ];
    const result = calcValoreCliente(fresisRecords, archRecords);
    expect(result).toBeCloseTo(200, 1);
  });
});

describe('calcProbabilitaRiordino', () => {
  test('alta se giorni_da_ultimo ≈ ciclo_medio ± 20%', () => {
    const result = calcProbabilitaRiordino({ daysSinceLastOrder: 60, avgCycleDays: 60 });
    expect(result).toBeGreaterThanOrEqual(0.7);
  });

  test('bassa se cliente dormiente (giorni >> ciclo)', () => {
    const result = calcProbabilitaRiordino({ daysSinceLastOrder: 300, avgCycleDays: 60 });
    expect(result).toBeLessThanOrEqual(0.4);
  });

  test('media se nessun ciclo stimabile', () => {
    const result = calcProbabilitaRiordino({ daysSinceLastOrder: 90, avgCycleDays: null });
    expect(result).toBeCloseTo(0.5, 1);
  });
});

describe('calcScoreTotal', () => {
  test('somma i componenti pesati per modalità balanced', () => {
    const breakdown = {
      valore: 0.8, riordino: 0.6, urgenza: 0.5, zona: 0.7,
      crossSell: 0.4, promozioni: 0.3, rischioClosure: 0, penalitaDati: 0,
    };
    const total = calcScoreTotal(breakdown, 'balanced' as VisitMode);
    const expected =
      0.8 * SCORE_WEIGHTS.balanced.valore +
      0.6 * SCORE_WEIGHTS.balanced.riordino +
      0.5 * SCORE_WEIGHTS.balanced.urgenza +
      0.7 * SCORE_WEIGHTS.balanced.zona +
      0.4 * SCORE_WEIGHTS.balanced.crossSell +
      0.3 * SCORE_WEIGHTS.balanced.promozioni;
    expect(total).toBeCloseTo(expected, 3);
  });
});
