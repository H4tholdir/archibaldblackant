# Fresis Missing Discount Banner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere un banner + pulsante filtro nella pagina ArticoliList visibile solo all'utente `ikiA0930`, che segnala e permette di filtrare gli articoli del catalogo privi di sconto Fresis personale.

**Architecture:** Il pattern replica quello già esistente per "Prezzo = 0": una funzione repository conta i prodotti senza match in `agents.fresis_discounts`, un endpoint REST lo espone, e il frontend mostra banner + pulsante filtro con lo stesso stile degli alert esistenti. La feature è visibile esclusivamente a `ikiA0930` tramite guard su `auth.user.username`.

**Tech Stack:** TypeScript, Express, PostgreSQL (pg pool), React 19, Vitest, supertest

---

## File map

| Azione | File | Responsabilità |
|--------|------|---------------|
| Modify | `backend/src/db/repositories/products.ts` | Aggiunge `getMissingFresisDiscountCount`, estende `ProductFilters`, aggiunge all'export |
| Modify | `backend/src/routes/products.ts` | Aggiorna `ProductsRouterDeps`, aggiunge endpoint `missing-fresis-discount-count`, estende `GET /` con `discountFilter` |
| Modify | `backend/src/routes/products.spec.ts` | Aggiunge mock dep + test per nuovo endpoint e nuovo filtro |
| Modify | `backend/src/server.ts` | Inietta `getMissingFresisDiscountCount` nel blocco DI |
| Modify | `frontend/src/api/products.ts` | Aggiunge `getMissingFresisDiscountCount`, estende `getProducts` con `discountFilter` |
| Modify | `frontend/src/pages/ArticoliList.tsx` | Aggiunge stato, useAuth, useEffect, banner, pulsante filtro, aggiorna guard/callbacks |

---

## Task 1 — Repository: `getMissingFresisDiscountCount`

**Files:**
- Modify: `backend/src/db/repositories/products.ts`

- [ ] **Step 1: Aggiungere `discountFilter` e `userId` a `ProductFilters`**

  Nel file `backend/src/db/repositories/products.ts`, aggiornare il tipo `ProductFilters` (riga ~93):

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

- [ ] **Step 2: Aggiungere la clausola `discountFilter` nella funzione `getProducts`**

  Subito dopo il blocco `if (filters.priceFilter === 'zero')` in `getProducts` (riga ~133):

  ```typescript
  if (filters.discountFilter === 'missing' && filters.userId) {
    conditions.push(
      `NOT EXISTS (
        SELECT 1 FROM agents.fresis_discounts fd
        WHERE fd.article_code = p.id
          AND fd.user_id = $${paramIndex}
      )`
    );
    params.push(filters.userId);
    paramIndex += 1;
  }
  ```

- [ ] **Step 3: Aggiungere la funzione `getMissingFresisDiscountCount`**

  Subito dopo `getNoVatCount` (riga ~421):

  ```typescript
  async function getMissingFresisDiscountCount(pool: DbPool, userId: string): Promise<number> {
    const { rows } = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM shared.products p
       WHERE p.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM agents.fresis_discounts fd
           WHERE fd.article_code = p.id
             AND fd.user_id = $1
         )`,
      [userId],
    );
    return rows[0].count;
  }
  ```

- [ ] **Step 4: Aggiungere all'export block**

  Nel blocco `export { ... }` a fondo file, aggiungere `getMissingFresisDiscountCount` dopo `getNoVatCount`:

  ```typescript
  getNoVatCount,
  getMissingFresisDiscountCount,  // nuovo
  ```

- [ ] **Step 5: Verificare che il build TypeScript passi**

  ```bash
  npm run build --prefix archibald-web-app/backend
  ```
  Expected: build OK, nessun errore TypeScript.

- [ ] **Step 6: Commit**

  ```bash
  git add archibald-web-app/backend/src/db/repositories/products.ts
  git commit -m "feat(products): add getMissingFresisDiscountCount and discountFilter support"
  ```

---

## Task 2 — Route: endpoint + `ProductsRouterDeps` (TDD)

**Files:**
- Modify: `backend/src/routes/products.ts`
- Modify: `backend/src/routes/products.spec.ts`

- [ ] **Step 1: Scrivere il test failing per il nuovo endpoint**

  In `backend/src/routes/products.spec.ts`, nel `createMockDeps()` aggiungere il mock (riga ~65, dopo `getNoVatCount`):

  ```typescript
  getMissingFresisDiscountCount: vi.fn().mockResolvedValue(7),
  ```

  Poi aggiungere il gruppo di test dopo `describe('GET /api/products/no-vat-count', ...)`:

  ```typescript
  describe('GET /api/products/missing-fresis-discount-count', () => {
    test('returns count of products without Fresis discount for current user', async () => {
      const res = await request(app).get('/api/products/missing-fresis-discount-count');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { count: 7 } });
      expect(deps.getMissingFresisDiscountCount).toHaveBeenCalledWith('user-1');
    });
  });
  ```

  Nota: `'user-1'` è il `userId` impostato nel middleware mock di `createApp` (riga 74 del spec: `(req as any).user = { userId: 'user-1', ... }`).

- [ ] **Step 2: Eseguire il test per verificare che fallisca**

  ```bash
  npm test --prefix archibald-web-app/backend -- --reporter=verbose products.spec
  ```
  Expected: FAIL — `getMissingFresisDiscountCount` non esiste in `ProductsRouterDeps`.

- [ ] **Step 3: Aggiornare `ProductsRouterDeps` in `products.ts`**

  In `backend/src/routes/products.ts`, aggiornare il tipo `ProductsRouterDeps` (riga ~78):

  ```typescript
  type ProductsRouterDeps = {
    // ... campi esistenti invariati ...
    getZeroPriceCount: () => Promise<number>;
    getNoVatCount: () => Promise<number>;
    getMissingFresisDiscountCount: (userId: string) => Promise<number>;  // nuovo
    getProducts: (filters?: string | {
      searchQuery?: string;
      vatFilter?: 'missing';
      priceFilter?: 'zero';
      discountFilter?: 'missing';  // nuovo
      userId?: string;             // nuovo
      limit?: number;
    }) => Promise<ProductRow[]>;
    // ... resto invariato ...
  };
  ```

- [ ] **Step 4: Aggiungere `getMissingFresisDiscountCount` al destructuring in `createProductsRouter`**

  Nella riga ~108 (dopo `getNoVatCount`):

  ```typescript
  const {
    queue, getProducts, getProductById, getProductCount,
    getZeroPriceCount, getNoVatCount, getMissingFresisDiscountCount,  // aggiunto
    getProductVariants,
    // ... resto invariato
  } = deps;
  ```

- [ ] **Step 5: Aggiungere il nuovo endpoint nella route**

  Subito dopo `router.get('/no-vat-count', ...)` (riga ~243):

  ```typescript
  router.get('/missing-fresis-discount-count', async (req: AuthRequest, res) => {
    try {
      const count = await getMissingFresisDiscountCount(req.user!.userId);
      res.json({ success: true, data: { count } });
    } catch (error) {
      logger.error('Error fetching missing Fresis discount count', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero conteggio sconti mancanti' });
    }
  });
  ```

- [ ] **Step 6: Eseguire il test per verificare che passi**

  ```bash
  npm test --prefix archibald-web-app/backend -- --reporter=verbose products.spec
  ```
  Expected: PASS per `GET /api/products/missing-fresis-discount-count`.

- [ ] **Step 7: Commit**

  ```bash
  git add archibald-web-app/backend/src/routes/products.ts archibald-web-app/backend/src/routes/products.spec.ts
  git commit -m "feat(products): add missing-fresis-discount-count endpoint"
  ```

---

## Task 3 — Route: supporto `discountFilter` in `GET /api/products` (TDD)

**Files:**
- Modify: `backend/src/routes/products.ts`
- Modify: `backend/src/routes/products.spec.ts`

- [ ] **Step 1: Scrivere il test failing per `discountFilter=missing`**

  In `products.spec.ts`, nel gruppo `describe('GET /api/products', ...)`, aggiungere:

  ```typescript
  test('passes discountFilter=missing and userId to getProducts', async () => {
    const res = await request(app).get('/api/products?discountFilter=missing');

    expect(res.status).toBe(200);
    expect(deps.getProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        discountFilter: 'missing',
        userId: 'user-1',
      }),
    );
  });
  ```

- [ ] **Step 2: Eseguire il test per verificare che fallisca**

  ```bash
  npm test --prefix archibald-web-app/backend -- --reporter=verbose products.spec
  ```
  Expected: FAIL — `discountFilter` non viene passato a `getProducts`.

- [ ] **Step 3: Estendere il handler `GET /api/products` nel router**

  Nel handler `router.get('/', ...)`, dopo `const priceFilter = ...` (riga ~121):

  ```typescript
  const discountFilter = req.query.discountFilter === 'missing' ? 'missing' as const : undefined;
  ```

  Aggiornare la condizione `grouped` per ignorare il branch grouped quando `discountFilter` è presente:

  ```typescript
  if (grouped && !vatFilter && !priceFilter && !discountFilter) {
  ```

  Aggiornare la chiamata `getProducts`:

  ```typescript
  const products = await getProducts({
    searchQuery: search,
    vatFilter,
    priceFilter,
    discountFilter,           // nuovo
    userId: discountFilter ? req.user!.userId : undefined,  // nuovo
    limit,
  });
  ```

- [ ] **Step 4: Eseguire tutti i test per verificare che passino**

  ```bash
  npm test --prefix archibald-web-app/backend -- --reporter=verbose products.spec
  ```
  Expected: tutti PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add archibald-web-app/backend/src/routes/products.ts archibald-web-app/backend/src/routes/products.spec.ts
  git commit -m "feat(products): support discountFilter=missing query param"
  ```

---

## Task 4 — Backend DI wiring in `server.ts`

**Files:**
- Modify: `backend/src/server.ts`

- [ ] **Step 1: Iniettare `getMissingFresisDiscountCount` nel blocco DI**

  In `backend/src/server.ts`, nel blocco `createProductsRouter({ ... })` (riga ~444), aggiungere dopo `getNoVatCount`:

  ```typescript
  getNoVatCount: () => productsRepo.getNoVatCount(pool),
  getMissingFresisDiscountCount: (userId) => productsRepo.getMissingFresisDiscountCount(pool, userId),  // nuovo
  ```

- [ ] **Step 2: Verificare build**

  ```bash
  npm run build --prefix archibald-web-app/backend
  ```
  Expected: build OK.

- [ ] **Step 3: Eseguire tutti i test backend**

  ```bash
  npm test --prefix archibald-web-app/backend
  ```
  Expected: tutti PASS.

- [ ] **Step 4: Commit**

  ```bash
  git add archibald-web-app/backend/src/server.ts
  git commit -m "feat(products): wire getMissingFresisDiscountCount into DI container"
  ```

---

## Task 5 — Frontend API layer

**Files:**
- Modify: `frontend/src/api/products.ts`

- [ ] **Step 1: Aggiungere `getMissingFresisDiscountCount` in `products.ts`**

  Subito dopo `getProductsWithZeroPriceCount` (riga ~205):

  ```typescript
  export async function getMissingFresisDiscountCount(
    token: string,
  ): Promise<{ count: number }> {
    const response = await fetchWithRetry(`${API_BASE_URL}/api/products/missing-fresis-discount-count`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data;
  }
  ```

- [ ] **Step 2: Estendere la firma di `getProducts` con `discountFilter`**

  Aggiungere il parametro opzionale dopo `priceFilter` (riga ~140):

  ```typescript
  export async function getProducts(
    token: string,
    searchQuery?: string,
    limit: number = 100,
    grouped: boolean = false,
    vatFilter?: "missing",
    priceFilter?: "zero",
    discountFilter?: "missing",  // nuovo
  ): Promise<ProductsResponse> {
  ```

  Aggiungere la logica di append dei params subito dopo il blocco `priceFilter` (riga ~155):

  ```typescript
  if (discountFilter) {
    params.append("discountFilter", discountFilter);
  }
  ```

- [ ] **Step 3: Verificare type-check frontend**

  ```bash
  npm run type-check --prefix archibald-web-app/frontend
  ```
  Expected: nessun errore TypeScript.

- [ ] **Step 4: Commit**

  ```bash
  git add archibald-web-app/frontend/src/api/products.ts
  git commit -m "feat(products): add getMissingFresisDiscountCount and discountFilter to API layer"
  ```

---

## Task 6 — Frontend: ArticoliList component

**Files:**
- Modify: `frontend/src/pages/ArticoliList.tsx`

- [ ] **Step 1: Aggiungere import `useAuth` e `getMissingFresisDiscountCount`**

  In testa al file, aggiornare la riga degli import esistenti:

  ```typescript
  import { useState, useEffect, useCallback } from "react";
  import { useAuth } from "../hooks/useAuth";                                    // nuovo
  import { getProducts, getProductsWithoutVatCount, getProductsWithZeroPriceCount, getMissingFresisDiscountCount, type Product } from "../api/products";  // aggiunto getMissingFresisDiscountCount
  ```

- [ ] **Step 2: Aggiungere `useAuth` e stati del nuovo filtro**

  All'inizio del corpo di `ArticoliList()`, subito dopo `const { scrollFieldIntoView, keyboardPaddingStyle } = useKeyboardScroll();`:

  ```typescript
  const auth = useAuth();
  const isFresis = auth.user?.username === 'ikiA0930';
  ```

  Subito dopo `const [priceFilterActive, setPriceFilterActive] = useState(false);`:

  ```typescript
  const [missingDiscountCount, setMissingDiscountCount] = useState(0);
  const [discountFilterActive, setDiscountFilterActive] = useState(false);
  ```

- [ ] **Step 3: Aggiornare `useEffect` al mount per caricare `missingDiscountCount`**

  Nel `useEffect` esistente che carica `noVatCount` e `zeroPriceCount` (riga ~37), aggiungere la chiamata Fresis:

  ```typescript
  useEffect(() => {
    const token = localStorage.getItem("archibald_jwt");
    if (!token) return;
    getProductsWithoutVatCount(token)
      .then((result) => setNoVatCount(result.count))
      .catch(() => {});
    getProductsWithZeroPriceCount(token)
      .then((result) => setZeroPriceCount(result.count))
      .catch(() => {});
    if (isFresis) {
      getMissingFresisDiscountCount(token)
        .then((result) => setMissingDiscountCount(result.count))
        .catch(() => {});
    }
  }, [isFresis]);
  ```

- [ ] **Step 4: Aggiornare `isFilterMode`, early-return guard e dep array di `fetchProducts`**

  In `fetchProducts` (riga ~59):

  1. Early-return guard (riga ~60) → aggiungere `!discountFilterActive`:
  ```typescript
  if (!debouncedSearch && !vatFilterActive && !priceFilterActive && !discountFilterActive) {
  ```

  2. `isFilterMode` (riga ~81) → aggiungere `discountFilterActive`:
  ```typescript
  const isFilterMode = vatFilterActive || priceFilterActive || discountFilterActive;
  ```

  3. Chiamata a `getProducts` (riga ~82) → aggiungere settimo parametro:
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

  4. Dep array `useCallback` (riga ~115) → aggiungere `discountFilterActive`:
  ```typescript
  }, [debouncedSearch, vatFilterActive, priceFilterActive, discountFilterActive]);
  ```

- [ ] **Step 5: Aggiungere `handleToggleDiscountFilter` e aggiornare `handleClearFilters` + `hasActiveFilters`**

  Dopo `handleTogglePriceFilter`:

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

  `handleClearFilters` (riga ~131) → aggiungere reset:
  ```typescript
  const handleClearFilters = () => {
    setFilters({ search: "" });
    setVatFilterActive(false);
    setPriceFilterActive(false);
    setDiscountFilterActive(false);  // nuovo
    setHasSearched(false);
  };
  ```

  `hasActiveFilters` (riga ~156) → aggiungere:
  ```typescript
  const hasActiveFilters = filters.search || vatFilterActive || priceFilterActive || discountFilterActive;
  ```

- [ ] **Step 6: Aggiungere il banner Fresis nel JSX**

  Subito dopo il `{/* Zero-Price Banner */}` block (riga ~202), inserire:

  ```tsx
  {/* Missing Fresis Discount Banner */}
  {isFresis && missingDiscountCount > 0 && !discountFilterActive && (
    <div
      onClick={handleToggleDiscountFilter}
      style={{
        backgroundColor: "#fce4ec",
        border: "1px solid #e57373",
        borderRadius: "12px",
        padding: "12px 20px",
        marginBottom: "16px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        transition: "background-color 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "#ffcdd2";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "#fce4ec";
      }}
    >
      <span style={{ fontSize: "20px" }}>💸</span>
      <span style={{ fontSize: "14px", color: "#c62828", fontWeight: 600 }}>
        {missingDiscountCount} articol{missingDiscountCount !== 1 ? "i" : "o"} senza sconto Fresis personale. Clicca per visualizzarl{missingDiscountCount !== 1 ? "i" : "o"}.
      </span>
    </div>
  )}
  ```

- [ ] **Step 7: Aggiungere il pulsante filtro nel JSX**

  Subito dopo il bottone `{/* Zero-Price filter button */}` (riga ~436), inserire:

  ```tsx
  {/* Missing Fresis Discount filter button */}
  {isFresis && missingDiscountCount > 0 && (
    <button
      onClick={handleToggleDiscountFilter}
      style={{
        padding: "8px 16px",
        fontSize: "14px",
        fontWeight: 600,
        border: `1px solid ${discountFilterActive ? "#fff" : "#c62828"}`,
        borderRadius: "8px",
        backgroundColor: discountFilterActive ? "#c62828" : "#fff",
        color: discountFilterActive ? "#fff" : "#c62828",
        cursor: "pointer",
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        if (!discountFilterActive) {
          e.currentTarget.style.backgroundColor = "#c62828";
          e.currentTarget.style.color = "#fff";
        }
      }}
      onMouseLeave={(e) => {
        if (!discountFilterActive) {
          e.currentTarget.style.backgroundColor = "#fff";
          e.currentTarget.style.color = "#c62828";
        }
      }}
    >
      Sconto Fresis ({missingDiscountCount})
    </button>
  )}
  ```

- [ ] **Step 8: Verificare type-check frontend**

  ```bash
  npm run type-check --prefix archibald-web-app/frontend
  ```
  Expected: nessun errore TypeScript.

- [ ] **Step 9: Eseguire i test frontend**

  ```bash
  npm test --prefix archibald-web-app/frontend
  ```
  Expected: tutti PASS.

- [ ] **Step 10: Commit finale**

  ```bash
  git add archibald-web-app/frontend/src/pages/ArticoliList.tsx
  git commit -m "feat(articoli): add missing Fresis discount banner and filter for ikiA0930"
  ```

---

## Verifica finale

- [ ] **Build completo backend + frontend**

  ```bash
  npm run build --prefix archibald-web-app/backend && npm run type-check --prefix archibald-web-app/frontend
  ```
  Expected: entrambi OK.

- [ ] **Test completi**

  ```bash
  npm test --prefix archibald-web-app/backend && npm test --prefix archibald-web-app/frontend
  ```
  Expected: tutti PASS.

- [ ] **Checklist manuale (accedendo come `ikiA0930`)**
  - [ ] Banner rosa "💸 N articoli senza sconto Fresis" appare se ci sono articoli senza sconto
  - [ ] Click sul banner attiva il filtro e nasconde il banner
  - [ ] Pulsante "Sconto Fresis (N)" appare nei filtri
  - [ ] Click sul pulsante alterna il filtro (attivo = sfondo rosso)
  - [ ] Quando filtro attivo, la lista mostra solo articoli senza sconto
  - [ ] "Cancella filtri" azzera anche il filtro sconto
  - [ ] Accedendo come altro utente, banner e pulsante non appaiono
