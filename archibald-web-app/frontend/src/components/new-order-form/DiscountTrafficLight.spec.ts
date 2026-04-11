import { describe, test, expect } from 'vitest';
import { calculateEffectiveDiscount } from './DiscountTrafficLight';

describe('calculateEffectiveDiscount', () => {
  test('ritorna 0 se la lista è vuota', () => {
    expect(calculateEffectiveDiscount([], 0)).toBe(0);
  });

  test('ritorna 0 se listTotal è zero', () => {
    const items = [{ quantity: 1, unitPrice: 0, originalListPrice: 0 }];
    expect(calculateEffectiveDiscount(items, 0)).toBe(0);
  });

  test("ritorna 0 se non c'è sconto", () => {
    const items = [{ quantity: 2, unitPrice: 100, originalListPrice: 100 }];
    expect(calculateEffectiveDiscount(items, 0)).toBe(0);
  });

  test('calcola sconto solo da originalListPrice vs unitPrice (senza globalDiscount)', () => {
    const items = [{ quantity: 1, unitPrice: 80, originalListPrice: 100 }];
    // listTotal=100, netTotal=80*1=80, discount=(1-80/100)*100=20
    expect(calculateEffectiveDiscount(items, 0)).toBeCloseTo(20);
  });

  test('calcola sconto da globalDiscount quando originalListPrice == unitPrice', () => {
    const items = [{ quantity: 1, unitPrice: 100, originalListPrice: 100 }];
    // listTotal=100, netTotal=100*(1-0.25)=75, discount=25
    expect(calculateEffectiveDiscount(items, 25)).toBeCloseTo(25);
  });

  test('calcola sconto composto: originalListPrice + globalDiscount', () => {
    const items = [{ quantity: 1, unitPrice: 80, originalListPrice: 100 }];
    // listTotal=100, netTotal=80*(1-0.10)=72, discount=(1-72/100)*100=28
    expect(calculateEffectiveDiscount(items, 10)).toBeCloseTo(28);
  });

  test('usa unitPrice come fallback se originalListPrice non disponibile (articolo ghost)', () => {
    const items = [{ quantity: 1, unitPrice: 50 }];
    // listTotal=50, netTotal=50*(1-0)*(1-0.10)=45, discount=(1-45/50)*100=10
    expect(calculateEffectiveDiscount(items, 10)).toBeCloseTo(10);
  });

  test('media ponderata su più righe con unitPrice diversi', () => {
    const items = [
      { quantity: 1, unitPrice: 100, originalListPrice: 100 },
      { quantity: 2, unitPrice: 60, originalListPrice: 100 },
    ];
    // listTotal=100+200=300, netTotal=(100*(1-0)*(1-0.05))+(60*2*(1-0)*(1-0.05))=95+114=209
    // discount=(1-209/300)*100≈30.33
    expect(calculateEffectiveDiscount(items, 5)).toBeCloseTo(30.33, 1);
  });

  // Scenari per sconto per-riga (Modifica Totale / Modifica Imponibile)
  test('cattura sconto per-riga (discount) con globalDiscountPercent = 0', () => {
    const items = [{ quantity: 100, unitPrice: 16.25, originalListPrice: 16.25, discount: 24.33 }];
    // listTotal=1625, netTotal=100*16.25*(1-0.2433)*(1-0)=100*16.25*0.7567=1229.46
    // effectiveDiscount=(1-1229.46/1625)*100≈24.33
    expect(calculateEffectiveDiscount(items, 0)).toBeCloseTo(24.33, 1);
  });

  test('compone sconto per-riga e globalDiscount', () => {
    const items = [{ quantity: 1, unitPrice: 100, originalListPrice: 100, discount: 20 }];
    // listTotal=100, netTotal=100*(1-0.20)*(1-0.10)=72
    // effectiveDiscount=(1-72/100)*100=28
    expect(calculateEffectiveDiscount(items, 10)).toBeCloseTo(28);
  });

  test('più righe con sconti per-riga diversi e globalDiscount', () => {
    const items = [
      { quantity: 1, unitPrice: 100, originalListPrice: 100, discount: 20 },
      { quantity: 2, unitPrice: 50, originalListPrice: 50, discount: 10 },
    ];
    // listTotal=100+100=200
    // netTotal=(100*0.80*0.95)+(2*50*0.90*0.95)=76+85.5=161.5
    // effectiveDiscount=(1-161.5/200)*100=19.25
    expect(calculateEffectiveDiscount(items, 5)).toBeCloseTo(19.25, 1);
  });
});
