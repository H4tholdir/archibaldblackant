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
    // listTotal=100, netTotal=80*(1-0)=80, discount=(1-80/100)*100=20
    expect(calculateEffectiveDiscount(items, 0)).toBeCloseTo(20);
  });

  test('calcola sconto da globalDiscount quando item.discount non è impostato', () => {
    const items = [{ quantity: 1, unitPrice: 100, originalListPrice: 100 }];
    // rowDisc=0 → fallback a globalDiscountPercent=25
    // listTotal=100, netTotal=100*(1-0.25)=75, discount=25
    expect(calculateEffectiveDiscount(items, 25)).toBeCloseTo(25);
  });

  test('usa unitPrice come fallback se originalListPrice non disponibile (articolo ghost)', () => {
    const items = [{ quantity: 1, unitPrice: 50 }];
    // listTotal=50, rowDisc=0 → fallback globalDisc=10, netTotal=50*(1-0.10)=45
    // discount=(1-45/50)*100=10
    expect(calculateEffectiveDiscount(items, 10)).toBeCloseTo(10);
  });

  test('media ponderata su più righe senza item.discount (solo globalDiscount)', () => {
    const items = [
      { quantity: 1, unitPrice: 100, originalListPrice: 100 },
      { quantity: 2, unitPrice: 60, originalListPrice: 100 },
    ];
    // listTotal=100+200=300
    // rowDisc=0 per entrambe → fallback globalDisc=5
    // netTotal=(100*0.95)+(60*2*0.95)=95+114=209
    // discount=(1-209/300)*100≈30.33
    expect(calculateEffectiveDiscount(items, 5)).toBeCloseTo(30.33, 1);
  });

  // Scenari per sconto per-riga (Modifica Totale / Modifica Imponibile)
  test('cattura sconto per-riga (discount) con globalDiscountPercent = 0', () => {
    const items = [{ quantity: 100, unitPrice: 16.25, originalListPrice: 16.25, discount: 24.33 }];
    // rowDisc=24.33 > 0: effectiveDisc=24.33
    // listTotal=1625, netTotal=100*16.25*(1-0.2433)=1229.46
    // effectiveDiscount≈24.33
    expect(calculateEffectiveDiscount(items, 0)).toBeCloseTo(24.33, 1);
  });

  test('item.discount > 0 prevale su globalDiscount (non si compongono)', () => {
    const items = [{ quantity: 1, unitPrice: 100, originalListPrice: 100, discount: 20 }];
    // rowDisc=20 > 0: effectiveDisc=20, globalDiscountPercent=10 ignorato
    // netTotal=100*(1-0.20)=80, effectiveDiscount=20
    expect(calculateEffectiveDiscount(items, 10)).toBeCloseTo(20);
  });

  test('più righe: item.discount per-riga prevale su globalDiscount', () => {
    const items = [
      { quantity: 1, unitPrice: 100, originalListPrice: 100, discount: 20 },
      { quantity: 2, unitPrice: 50, originalListPrice: 50, discount: 10 },
    ];
    // Entrambe le righe hanno rowDisc > 0: effectiveDisc[0]=20, effectiveDisc[1]=10
    // netTotal = 100*(1-0.20) + 2*50*(1-0.10) = 80+90 = 170
    // listTotal = 100+100 = 200
    // effectiveDiscount = (1-170/200)*100 = 15
    expect(calculateEffectiveDiscount(items, 5)).toBeCloseTo(15);
  });

  test('usa globalDiscount come fallback per righe aggiunte senza item.discount', () => {
    const items = [
      { quantity: 1, unitPrice: 100, originalListPrice: 100, discount: 50 },
      { quantity: 1, unitPrice: 100, originalListPrice: 100 }, // aggiunta dopo, discount non ancora settato
    ];
    // Riga 1: rowDisc=50 → effectiveDisc=50
    // Riga 2: rowDisc=0 → fallback globalDisc=50
    // netTotal=100*0.5+100*0.5=100, listTotal=200, effectiveDiscount=50
    expect(calculateEffectiveDiscount(items, 50)).toBeCloseTo(50);
  });

  test('regression: "sconto su tutte le righe" al 50% non raddoppia lo sconto in 75%', () => {
    // Il handler setta item.discount=50 E globalDiscountPercent=50 per tutti gli articoli.
    // Il calcolo deve restituire 50, non 75 (che sarebbe (1-0.5)*(1-0.5)=0.25).
    const items = [{ quantity: 5, unitPrice: 179.6, originalListPrice: 179.6, discount: 50 }];
    expect(calculateEffectiveDiscount(items, 50)).toBeCloseTo(50);
  });
});
