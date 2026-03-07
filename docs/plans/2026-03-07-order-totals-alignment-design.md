# Order Totals Alignment — Replicare la logica Archibald ERP

**Data:** 2026-03-07
**Stato:** Approvato

## Problema

I totali ordine differiscono tra 3 punti della PWA e Archibald ERP, con scarti di centesimi che impattano la fatturazione.

### Root cause

Tre implementazioni diverse della stessa formula:

| Contesto | File | Arrotonda per riga? |
|----------|------|---------------------|
| Creazione ordine | `order-calculations.ts` | Si, ma con design VAT-first separato |
| Scheda pending | `PendingOrdersPage.tsx` | No — accumula float |
| Backend submission | `submit-order.ts` | No — `toFixed(2)` solo sul totale finale |

Archibald ERP usa: `round2(qty * price * (1 - disc/100))` per riga, poi somma.

### Evidenza

Analisi su 5 ordini reali (20 righe), confrontando snapshot (nostri valori) vs PDF Archibald:

- **Ipotesi A** (round sul totale riga): 16/16 match
- **Ipotesi B** (round sul prezzo unitario netto, poi moltiplica): 8/16 match
- **Totale ordine**: somma semplice delle righe arrotondate, 5/5 match

### Problema aggiuntivo: sconti nel PDF

Il PDF parser ricostruisce lo sconto dall'importo riga arrotondato:
`disc = round((1 - lineAmount / gross) * 100, 2)`

Questo produce differenze di 0.01-0.02% rispetto allo sconto reale inserito (es. 34.85% diventa 34.84%). Se esiste uno snapshot dell'ordine, lo sconto originale e noto deve prevalere.

## Soluzione

### 1. Funzione canonica `archibaldLineAmount`

Nuova funzione che replica esattamente la logica ERP:

```typescript
function archibaldLineAmount(qty: number, price: number, discountPercent: number): number {
  return Math.round(qty * price * (1 - discountPercent / 100) * 100) / 100;
}
```

Posizionamento: file shared (usato da frontend e backend).

### 2. Frontend — `order-calculations.ts`

- `calculateItemTotals`: usa `archibaldLineAmount` come base per `subtotalAfterDiscount`
- IVA calcolata sul valore gia arrotondato per riga
- `calculateOrderTotals`: somma righe gia arrotondate

### 3. Frontend — `PendingOrdersPage.tsx`

- Eliminare `itemSubtotal()` locale (riga 22-27)
- Eliminare l'IIFE di calcolo recap (riga 1646-1836)
- Usare la funzione unificata da `order-calculations.ts`

### 4. Backend — `submit-order.ts`

- `calculateAmounts()`: usa `archibaldLineAmount` per ogni riga
- Rimuovere `toFixed(2)` sul totale — il risultato e gia coerente
- `expectedLineAmount` nello snapshot usa la stessa formula

### 5. Frontend — `OrderCardNew.tsx`

- `recalcLineAmounts` (riga 602-607): allineare a `archibaldLineAmount`

### 6. Frontend — `arca-totals.ts`

- `calculateRowTotal` gia arrotonda correttamente — verificare allineamento formula

### 7. Sync — `sync-order-articles.ts`

- Dopo il parsing del PDF, se esiste uno snapshot per l'ordine, usare `snapshot_items.line_discount_percent` invece del discount reverse-engineered dal PDF
- Il `line_amount` resta quello del PDF (verita di Archibald)
- Per ordini senza snapshot (sync storico), il reverse-engineering resta l'unica fonte

### 8. Backend — `edit-order.ts`

- Allineare i calcoli degli importi riga alla stessa formula canonica

## Cosa NON cambia

- Logica IVA (resta nostra, Archibald non la gestisce)
- Sconti a cascata (funzionano correttamente)
- Format di display (`formatCurrency`)
- Logica spedizioni (`calculateShippingCosts`)
- Schema database

## Rischio

Basso — la formula di arrotondamento e identica (`Math.round(x*100)/100`), cambia solo DOVE viene applicata. Nessuna modifica al database schema. Test esistenti da aggiornare per riflettere i nuovi valori arrotondati.
