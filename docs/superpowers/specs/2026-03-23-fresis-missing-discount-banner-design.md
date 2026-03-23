# Design: Banner Articoli Senza Sconto Fresis

**Data:** 2026-03-23
**Utente target:** ikiA0930 (Formicola Biagio / Fresis)

## Problema

La pagina Articoli non segnala quando un articolo del catalogo non ha uno sconto personale Fresis associato. Gli sconti vengono caricati tramite file Excel nella pagina admin e salvati in `agents.fresis_discounts`, ma non esiste un indicatore visivo per i gap.

## Soluzione

Aggiungere un banner + pulsante filtro nella pagina ArticoliList, visibile solo all'utente `ikiA0930`, che segnala e permette di filtrare gli articoli privi di sconto Fresis personale. Il pattern replica esattamente quello già esistente per "Prezzo = 0" e "IVA mancante".

## Architettura

### Backend — `backend/src/db/repositories/products.ts`

**0. Aggiornamento tipo `ProductFilters`** — aggiungere i nuovi campi:
```typescript
type ProductFilters = {
  searchQuery?: string;
  vatFilter?: 'missing';
  priceFilter?: 'zero';
  discountFilter?: 'missing';  // nuovo
  userId?: string;             // necessario per discountFilter
  limit?: number;
};
```

**1. Nuova funzione repository** `getMissingFresisDiscountCount(pool, userId)`:
```sql
SELECT COUNT(*)::int AS count
FROM shared.products p
WHERE p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM agents.fresis_discounts fd
    WHERE fd.article_code = p.id
      AND fd.user_id = $1
  )
```
- `shared.products.id` è la colonna PK del prodotto (non `code`)
- `agents.fresis_discounts.article_code` è la FK verso `shared.products.id`

### Backend — `backend/src/routes/products.ts`

**2. Aggiornamento tipo `ProductsRouterDeps`**:
```typescript
type ProductsRouterDeps = {
  // ... campi esistenti ...
  getMissingFresisDiscountCount: (userId: string) => Promise<number>;
  getProducts: (filters?: {
    searchQuery?: string;
    vatFilter?: 'missing';
    priceFilter?: 'zero';
    discountFilter?: 'missing';  // nuovo
    userId?: string;             // necessario per discountFilter
    limit?: number;
  }) => Promise<ProductRow[]>;
};
```

**3. Nuovo endpoint** `GET /api/products/missing-fresis-discount-count`:
- Autenticazione richiesta (middleware esistente)
- Chiama `getMissingFresisDiscountCount(req.user.userId)`
- Risposta: `{ success: true, data: { count: number } }`
- Nota: endpoint non ha guard server-side per `ikiA0930`; un altro utente otterrebbe count basato sui propri (probabilmente zero) sconti — isolamento garantito da `req.user.userId` nella SQL

**4. Estensione endpoint** `GET /api/products`:
- Nuovo query param opzionale: `discountFilter=missing`
- Quando presente, aggiunge alla query:
  ```sql
  AND NOT EXISTS (
    SELECT 1 FROM agents.fresis_discounts fd
    WHERE fd.article_code = p.id
      AND fd.user_id = $2
  )
  ```
- `$2` = `userId` da `req.user.userId`, passato come parametro aggiuntivo a `getProducts`
- **Incompatibilità con `grouped=true`**: quando `discountFilter` è presente, il router deve seguire il percorso `getProducts` (non `getDistinctProductNames`). Il frontend garantisce questo perché `isFilterMode` sarà `true` quando il filtro è attivo, e `grouped = !isFilterMode = false`. Esplicitare nella route: se `discountFilter` è presente e `grouped` è anche `true`, ignorare `grouped`.

### Frontend — `frontend/src/pages/ArticoliList.tsx`

**5. Ottenere `userId`** — usare `useAuth` (pattern da `FresisHistoryPage.tsx`):
```typescript
import { useAuth } from "../hooks/useAuth";
// ...
const auth = useAuth();
const isFresis = auth.user?.username === 'ikiA0930';
```
Nota: `auth.user.id` è la PK del DB (UUID), mentre `auth.user.username` è il login handle (`ikiA0930`). Usare `username`.

**6. Nuovo stato** (aggiunto senza condizioni, ma usato solo se `isFresis`):
```typescript
const [missingDiscountCount, setMissingDiscountCount] = useState(0);
const [discountFilterActive, setDiscountFilterActive] = useState(false);
```

**7. `useEffect` al mount** — carica il count solo per Fresis:
```typescript
useEffect(() => {
  if (!isFresis) return;
  const token = localStorage.getItem("archibald_jwt");
  if (!token) return;
  getMissingFresisDiscountCount(token)
    .then(r => setMissingDiscountCount(r.count))
    .catch(() => {});
}, [isFresis]);
```

**8. `isFilterMode`** — aggiornato per includere il nuovo filtro:
```typescript
const isFilterMode = vatFilterActive || priceFilterActive || discountFilterActive;
```
Questo garantisce che quando `discountFilterActive` è `true`, `grouped = !isFilterMode = false`, evitando il percorso `getDistinctProductNames` nel backend.

**8b. Early-return guard in `fetchProducts`** — la guard a riga 60 deve includere il nuovo filtro, altrimenti attivare solo il filtro sconto azzera la lista:
```typescript
if (!debouncedSearch && !vatFilterActive && !priceFilterActive && !discountFilterActive) {
  // reset e return early
}
```

**8c. Dep array di `useCallback`** — aggiungere `discountFilterActive`:
```typescript
}, [debouncedSearch, vatFilterActive, priceFilterActive, discountFilterActive]);
```

**9. `handleClearFilters`** — aggiornato:
```typescript
const handleClearFilters = () => {
  setFilters({ search: "" });
  setVatFilterActive(false);
  setPriceFilterActive(false);
  setDiscountFilterActive(false);  // nuovo
  setHasSearched(false);
};
```

**10. `hasActiveFilters`** — aggiornato:
```typescript
const hasActiveFilters = filters.search || vatFilterActive || priceFilterActive || discountFilterActive;
```

**11. Banner** — inserito sotto il banner "Prezzo = 0", stile identico (sfondo rosa, bordo rosso), visibile solo se `isFresis && missingDiscountCount > 0 && !discountFilterActive`:
```tsx
{isFresis && missingDiscountCount > 0 && !discountFilterActive && (
  <div style={{ /* stesso stile banner prezzo=0 */ }} onClick={handleToggleDiscountFilter}>
    💸 {missingDiscountCount} articol{missingDiscountCount !== 1 ? 'i' : 'o'} senza sconto Fresis personale. Clicca per visualizzarli.
  </div>
)}
```

**12. Pulsante filtro** — visibile solo a `isFresis`, etichetta `"Sconto Fresis ({missingDiscountCount})"`, stile identico agli altri pulsanti filtro. Toggle disattiva gli altri filtri:
```typescript
const handleToggleDiscountFilter = () => {
  const next = !discountFilterActive;
  setDiscountFilterActive(next);
  if (next) {
    setFilters({ search: "" });
    setVatFilterActive(false);
    setPriceFilterActive(false);
  }
};
```

**13. `getProducts` call** — aggiunto parametro:
```typescript
const response = await getProducts(
  token,
  isFilterMode ? undefined : debouncedSearch,
  200,
  !isFilterMode,
  vatFilterActive ? "missing" : undefined,
  priceFilterActive ? "zero" : undefined,
  discountFilterActive ? "missing" : undefined,  // nuovo
);
```

### Frontend — `frontend/src/api/products.ts`

**14. Nuova funzione** `getMissingFresisDiscountCount(token)`:
```typescript
export async function getMissingFresisDiscountCount(token: string): Promise<{ count: number }> {
  // GET /api/products/missing-fresis-discount-count
  // Risposta: { success: true, data: { count: number } }
}
```

**15. `getProducts`** — nuovo parametro opzionale `discountFilter?: "missing"`, passato come query param `discountFilter=missing`.

## Testing

**Unit test backend** (`products.spec.ts`):
- `getMissingFresisDiscountCount` con 0 sconti → restituisce count totale prodotti attivi
- `getMissingFresisDiscountCount` con tutti gli sconti presenti → restituisce 0
- `getMissingFresisDiscountCount` con sconti parziali → restituisce count corretto

**Integration test backend**:
- `GET /api/products/missing-fresis-discount-count` → `{ count: N }` per utente autenticato
- `GET /api/products?discountFilter=missing` filtra correttamente
- `GET /api/products?discountFilter=missing&grouped=true` ignora `grouped`

**Frontend** (test manuale / E2E):
- Banner non appare per utenti diversi da `ikiA0930`
- Banner appare se `missingDiscountCount > 0` e il filtro non è attivo
- Banner scompare quando il filtro è attivo
- Pulsante "Cancella filtri" azzera anche `discountFilterActive`
- `hasActiveFilters` è `true` quando solo il filtro sconto è attivo

## Vincoli

- Il banner è esclusivamente per `ikiA0930` — nessun altro utente lo vede (guard frontend su `user.username`)
- Non modifica dati — solo lettura
- La logica di confronto usa `p.id` (PK di `shared.products`) == `fd.article_code` (FK in `agents.fresis_discounts`)
- Backend non ha guard hardcoded su `ikiA0930`: l'isolamento è garantito da `req.user.userId` nella SQL
