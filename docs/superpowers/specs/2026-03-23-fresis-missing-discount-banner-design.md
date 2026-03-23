# Design: Banner Articoli Senza Sconto Fresis

**Data:** 2026-03-23
**Utente target:** ikiA0930 (Formicola Biagio / Fresis)

## Problema

La pagina Articoli non segnala quando un articolo del catalogo non ha uno sconto personale Fresis associato. Gli sconti vengono caricati tramite file Excel nella pagina admin e salvati in `agents.fresis_discounts`, ma non esiste un indicatore visivo per i gap.

## Soluzione

Aggiungere un banner + pulsante filtro nella pagina ArticoliList, visibile solo all'utente `ikiA0930`, che segnala e permette di filtrare gli articoli privi di sconto Fresis personale. Il pattern replica esattamente quello già esistente per "Prezzo = 0" e "IVA mancante".

## Architettura

### Backend — `products.ts`

**1. Nuova funzione repository** `getMissingFresisDiscountCount(pool, userId)`:
```sql
SELECT COUNT(*)::int AS count
FROM shared.products p
WHERE p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM agents.fresis_discounts fd
    WHERE fd.article_code = p.code
      AND fd.user_id = $1
  )
```

**2. Nuovo endpoint** `GET /api/products/missing-fresis-discount-count`:
- Autenticazione richiesta (middleware esistente)
- Chiama `getMissingFresisDiscountCount(pool, req.user.userId)`
- Risposta: `{ success: true, data: { count: number } }`

**3. Estensione endpoint** `GET /api/products`:
- Nuovo query param opzionale: `discountFilter=missing`
- Quando presente, aggiunge alla query esistente:
  ```sql
  AND NOT EXISTS (
    SELECT 1 FROM agents.fresis_discounts fd
    WHERE fd.article_code = p.code
      AND fd.user_id = $1
  )
  ```
- Il `user_id` viene preso da `req.user.userId`

### Frontend — `ArticoliList.tsx`

**Nuovo stato** (solo se l'utente è `ikiA0930`):
```typescript
const [missingDiscountCount, setMissingDiscountCount] = useState(0);
const [discountFilterActive, setDiscountFilterActive] = useState(false);
```

**useEffect al mount** — carica il count solo per `ikiA0930`:
```typescript
if (userId === 'ikiA0930') {
  getMissingFresisDiscountCount(token)
    .then(r => setMissingDiscountCount(r.count))
    .catch(() => {});
}
```

**Banner** — inserito sotto il banner "Prezzo = 0", stile identico (sfondo rosa, bordo rosso), visibile solo se `userId === 'ikiA0930' && missingDiscountCount > 0`:
- Testo: `"{N} articolo/i senza sconto Fresis personale. Clicca per visualizzarli."`
- Click: attiva `discountFilterActive = true`, disattiva `priceFilterActive` e `vatFilterActive`

**Pulsante filtro** — inserito dopo i pulsanti esistenti, stile identico, visibile solo a `ikiA0930`:
- Etichetta: `"Sconto Fresis ({N})"`
- Colori: rosso scuro attivo, bordo rosso inattivo (stesso schema degli altri filtri)
- Toggle: attivazione disattiva gli altri filtri attivi

**Integrazione `getProducts`** — quando `discountFilterActive` è true:
```typescript
const response = await getProducts(
  token,
  isFilterMode ? undefined : debouncedSearch,
  200,
  !isFilterMode,
  vatFilterActive ? "missing" : undefined,
  priceFilterActive ? "zero" : undefined,
  discountFilterActive ? "missing" : undefined,  // nuovo parametro
);
```

### Frontend — `products.ts` (API layer)

- Aggiunge funzione `getMissingFresisDiscountCount(token): Promise<{ count: number }>`
- Aggiunge parametro opzionale `discountFilter?: "missing"` a `getProducts`, passato come query param `discountFilter`

## Testing

- **Unit test backend**: `getMissingFresisDiscountCount` con prodotti che hanno/non hanno sconti associati
- **Integration test**: endpoint `GET /api/products/missing-fresis-discount-count` restituisce count corretto
- **Integration test**: `GET /api/products?discountFilter=missing` filtra correttamente
- **Frontend**: il banner appare solo per `ikiA0930` e solo quando `count > 0`

## Vincoli

- Il banner è esclusivamente per `ikiA0930` — nessun altro utente lo vede
- Non modifica dati — solo lettura
- La logica di confronto usa `article_code` come chiave di join tra `shared.products.code` e `agents.fresis_discounts.article_code`
