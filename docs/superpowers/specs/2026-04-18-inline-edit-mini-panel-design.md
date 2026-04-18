# Inline Edit Mini-Panel — Articoli

**Data:** 2026-04-18  
**Scope:** Frontend only  
**File coinvolti:** `ProductCard.tsx`, `ArticoliList.tsx`, `api/fresis-discounts.ts`

---

## Obiettivo

Quando un filtro di anomalia è attivo nella pagina Articoli (`/products`), ogni card prodotto mostra automaticamente una mini-banda colorata sotto l'header con il campo mancante da compilare. L'utente compila e salva senza espandere la card; dopo il salvataggio la card sparisce dalla lista filtrata.

---

## Filtri e Mini-Panel

| Filtro attivo       | Colore banda     | Campo input       | API call                                     |
|---------------------|-----------------|-------------------|----------------------------------------------|
| `vatFilterActive`   | Giallo `#fff8e1` | `%` IVA (0–100)  | `PATCH /api/products/:id/vat`                |
| `priceFilterActive` | Rosa `#fce4ec`   | `EUR` prezzo (≥0) | `PATCH /api/products/:id/price`              |
| `discountFilterActive` | Viola `#f3e5f5` | `%` sconto (0–100) | `POST /api/fresis-history/discounts`       |

---

## Comportamento dopo il salvataggio

- La card viene rimossa immediatamente da `products` nello state di `ArticoliList`.
- Il contatore del filtro attivo viene decrementato di 1 (es. `noVatCount`, `zeroPriceCount`, `missingDiscountCount`).
- Se il contatore scende a 0, il banner di allerta in cima alla pagina scompare naturalmente (già condizionato su `count > 0`).

---

## Dettagli implementativi

### `ProductCard.tsx`

Nuove props:
```ts
inlineEditMode?: 'vat' | 'price' | 'discount'
onSaveSuccess?: () => void
```

Comportamento:
- Quando `inlineEditMode` è impostato, appare una `<div>` sotto il card header con la banda colorata, label, input e pulsante "Salva".
- La logica di validazione e salvataggio riusa i medesimi handler già presenti nella sezione espansa (`savingVat`/`savingPrice`/`savingDiscount`, error state).
- Dopo salvataggio OK: chiama `onSaveSuccess()`.
- Lo state interno (`vatInput`, `priceInput`, `discountInput`) è locale alla card.

Etichette mini-panel:
- vat: `"IVA mancante"` + `placeholder="es. 22"`
- price: `"Prezzo mancante"` + `placeholder="es. 285.00"`
- discount: `"Sconto Fresis"` + `placeholder="es. 63"`

### `ArticoliList.tsx`

- Passa `inlineEditMode` alle `<ProductCard>` in base al filtro attivo:
  - `vatFilterActive` → `inlineEditMode="vat"`
  - `priceFilterActive` → `inlineEditMode="price"`
  - `discountFilterActive` → `inlineEditMode="discount"`
- `onSaveSuccess` rimuove il prodotto per `product.id` da `products` e chiama il setter del contatore corrispondente con `prev - 1`.

### `api/fresis-discounts.ts`

Nuova funzione:
```ts
export async function addFresisDiscountForProduct(
  token: string,
  productId: string,
  discountPercent: number,
): Promise<void>
```

Chiama `POST /api/fresis-history/discounts` con:
```json
{
  "id": "<productId>",
  "articleCode": "<productId>",
  "discountPercent": <number>
}
```

Usare `productId` come `id` garantisce idempotenza (ON CONFLICT DO UPDATE nel backend).

---

## Gestione errori

- Errore di validazione (valore fuori range, NaN): messaggio inline sotto il panel, no submit.
- Errore di rete/API: messaggio inline `"Errore salvataggio"`, pulsante riabilitato per riprovare.
- Nessun `window.confirm` (bloccato iOS Safari standalone).

---

## Testing

- Unit test `ProductCard`: mini-panel render condizionale per ciascun `inlineEditMode`; validazione; callback `onSaveSuccess` chiamata dopo mock API.
- Integration test `ArticoliList`: quando filtro attivo, card ricevono prop corretta; dopo save card rimossa da state.
