# Notification System Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correggere 4 gap nel sistema notifiche: UI incompleta per alcuni tipi, split `product_change` in 3 sottotipi, fix WebSocket per `customer_reminder`, cleanup dead code prezzi/prodotti.

**Architecture:** Cambio minimo e chirurgico su 8 file esistenti + cancellazione di 3 file morti. Nessuna nuova astrazione. Le notifiche `product_change` passano da 1 generica a 3 specifiche (new/modified/removed), ciascuna con icona distinta. Il click su price/product change apre la modale già esistente in `/products` tramite query param URL.

**Tech Stack:** TypeScript, React 19, Express, Vitest, BullMQ, PostgreSQL (pg pool)

---

## File Map

| File | Operazione | Motivo |
|---|---|---|
| `backend/src/sync/services/product-sync.ts` | Modify L49, L169–170 | Aggiunge `updatedProducts` alla callback `onProductsChanged` |
| `backend/src/operations/handlers/sync-products.ts` | Modify L20 | Aggiorna tipo callback (same change) |
| `backend/src/main.ts` | Modify L342–351, L1078–1089 | Fix customer_reminder broadcast + split product notifications |
| `frontend/src/services/notifications.service.ts` | Modify | Nuove route: customer_inactive→profilo, price/product→modal param, customer_reminder |
| `frontend/src/services/notifications.service.spec.ts` | Modify | Aggiorna test route + aggiunge test nuovi tipi |
| `frontend/src/components/NotificationBell.tsx` | Modify L11–18, L88–97 | getCategory + getRowInfo per 5 tipi nuovi |
| `frontend/src/pages/NotificationsPage.tsx` | Modify L10–18, L96–104 | getCategory + getTableMeta per 5 tipi nuovi |
| `frontend/src/pages/ArticoliList.tsx` | Modify L1–3, L31–34 area | useSearchParams + useEffect auto-open modali |
| `frontend/src/AppRouter.tsx` | Modify | Rimuove route e import morti |
| `frontend/src/components/PriceSyncNotification.tsx` | **Delete** | Refuso: zero import in tutta la codebase |
| `frontend/src/pages/PriceVariationsPage.tsx` | **Delete** | Sostituita da modale in /products |
| `frontend/src/pages/ProductVariationsPage.tsx` | **Delete** | Sostituita da modale in /products |

---

## Task 1: Backend — Estendi `onProductsChanged` con `updatedProducts`

**Files:**
- Modify: `archibald-web-app/backend/src/sync/services/product-sync.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/sync-products.ts`

- [ ] **Step 1: Aggiorna il tipo `onProductsChanged` in `product-sync.ts`**

  Riga 49, cambia la firma della callback:

  ```typescript
  // PRIMA (riga 49):
  onProductsChanged?: (newProducts: number, ghostsDeleted: number) => Promise<void>;

  // DOPO:
  onProductsChanged?: (newProducts: number, updatedProducts: number, ghostsDeleted: number) => Promise<void>;
  ```

- [ ] **Step 2: Aggiorna la condizione trigger e la chiamata in `product-sync.ts`**

  Righe 169–170, aggiungi `updatedProducts` alla condizione e alla chiamata:

  ```typescript
  // PRIMA (righe 169–170):
  if ((newProducts > 0 || ghostsDeleted > 0) && deps.onProductsChanged) {
    await deps.onProductsChanged(newProducts, ghostsDeleted).catch(() => {});
  }

  // DOPO:
  if ((newProducts > 0 || updatedProducts > 0 || ghostsDeleted > 0) && deps.onProductsChanged) {
    await deps.onProductsChanged(newProducts, updatedProducts, ghostsDeleted).catch(() => {});
  }
  ```

- [ ] **Step 3: Aggiorna il tipo in `sync-products.ts` handler (riga 20)**

  ```typescript
  // PRIMA (riga 20):
  onProductsChanged?: (newProducts: number, ghostsDeleted: number) => Promise<void>,

  // DOPO:
  onProductsChanged?: (newProducts: number, updatedProducts: number, ghostsDeleted: number) => Promise<void>,
  ```

- [ ] **Step 4: Verifica build backend (nessun test ancora)**

  ```bash
  npm run build --prefix archibald-web-app/backend
  ```
  Expected: build OK, nessun errore TypeScript.

- [ ] **Step 5: Commit**

  ```bash
  git add archibald-web-app/backend/src/sync/services/product-sync.ts \
          archibald-web-app/backend/src/operations/handlers/sync-products.ts
  git commit -m "feat(notifications): aggiungi updatedProducts alla callback onProductsChanged"
  ```

---

## Task 2: Backend — Emetti 3 notifiche product_change separate + fix customer_reminder WebSocket

**Files:**
- Modify: `archibald-web-app/backend/src/main.ts`

- [ ] **Step 1: Scrivi test failing per la callback product_change**

  Non è facilmente unit-testabile in isolamento (è una closure inline in main.ts). Salta i test unitari per questa callback — è verificata dal build TypeScript + test di integrazione esistenti. Passa al passo 2.

- [ ] **Step 2: Aggiorna la callback `onProductsChanged` in `main.ts` (righe 1078–1090)**

  Cerca il blocco:
  ```typescript
  async (newProducts, ghostsDeleted) => {
    const parts: string[] = [];
    if (newProducts > 0) parts.push(`${newProducts} nuovo/i`);
    if (ghostsDeleted > 0) parts.push(`${ghostsDeleted} rimosso/i dal catalogo`);
    await createNotification(notificationDeps, {
      target: 'all',
      type: 'product_change',
      severity: 'info',
      title: 'Catalogo prodotti aggiornato',
      body: `Variazioni catalogo: ${parts.join(', ')}.`,
      data: { newProducts, ghostsDeleted },
    });
  },
  ```

  Sostituisci con:
  ```typescript
  async (newProducts, updatedProducts, ghostsDeleted) => {
    if (newProducts > 0) {
      await createNotification(notificationDeps, {
        target: 'all',
        type: 'product_change',
        severity: 'info',
        title: 'Nuovi prodotti nel catalogo',
        body: `${newProducts} prodotto/i aggiunto/i al catalogo.`,
        data: { changeType: 'new', count: newProducts },
      });
    }
    if (updatedProducts > 0) {
      await createNotification(notificationDeps, {
        target: 'all',
        type: 'product_change',
        severity: 'info',
        title: 'Prodotti aggiornati nel catalogo',
        body: `${updatedProducts} prodotto/i modificato/i nel catalogo.`,
        data: { changeType: 'modified', count: updatedProducts },
      });
    }
    if (ghostsDeleted > 0) {
      await createNotification(notificationDeps, {
        target: 'all',
        type: 'product_change',
        severity: 'info',
        title: 'Prodotti rimossi dal catalogo',
        body: `${ghostsDeleted} prodotto/i rimosso/i dal catalogo.`,
        data: { changeType: 'removed', count: ghostsDeleted },
      });
    }
  },
  ```

- [ ] **Step 3: Fix `customer_reminder` — sostituisci `insertNotificationRepo` con `createNotification`**

  Cerca il blocco a riga ~342:
  ```typescript
  await insertNotificationRepo(pool, {
    userId,
    type: 'customer_reminder',
    severity: r.priority === 'urgent' ? 'warning' : 'info',
    title: `🔔 ${TYPE_LABELS[r.type] ?? r.type}: ${r.customerName}`,
    body: r.note ?? 'Promemoria in scadenza',
    data: { customerErpId: r.customerErpId, reminderId: r.id, action_url: `/customers/${r.customerErpId}` },
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
  });
  ```

  Sostituisci con (nota: `createNotification` gestisce il TTL 7gg internamente, non serve `expiresAt`):
  ```typescript
  await createNotification(notificationDeps, {
    target: 'user',
    userId,
    type: 'customer_reminder',
    severity: r.priority === 'urgent' ? 'warning' : 'info',
    title: `🔔 ${TYPE_LABELS[r.type] ?? r.type}: ${r.customerName}`,
    body: r.note ?? 'Promemoria in scadenza',
    data: { customerErpId: r.customerErpId, reminderId: r.id, action_url: `/customers/${r.customerErpId}` },
  });
  ```

  **Nota:** `notificationDeps` è dichiarato a riga 618, DOPO questa closure (riga ~342). È sicuro perché questa callback viene eseguita solo alle 08:00 tramite timer, quando l'intera startup è completata e `notificationDeps` è già inizializzato. TypeScript non genererà errori poiché i closure catturano la variabile per riferimento.

- [ ] **Step 4: Verifica build backend**

  ```bash
  npm run build --prefix archibald-web-app/backend
  ```
  Expected: build OK.

- [ ] **Step 5: Esegui test backend**

  ```bash
  npm test --prefix archibald-web-app/backend
  ```
  Expected: tutti i test passano.

- [ ] **Step 6: Commit**

  ```bash
  git add archibald-web-app/backend/src/main.ts
  git commit -m "feat(notifications): split product_change in 3 tipi e fix customer_reminder broadcast"
  ```

---

## Task 3: Frontend — Aggiorna route notifiche

**Files:**
- Modify: `archibald-web-app/frontend/src/services/notifications.service.ts`
- Modify: `archibald-web-app/frontend/src/services/notifications.service.spec.ts`

- [ ] **Step 1: Scrivi i test failing in `notifications.service.spec.ts`**

  Aggiungi questi test alla suite `describe('getNotificationRoute'` esistente:

  ```typescript
  test('customer_inactive con erpId naviga al profilo diretto', () => {
    const n = makeNotif('customer_inactive', { erpId: '55.261', customerName: 'Acme Srl' });
    expect(getNotificationRoute(n)).toBe('/customers/55.261');
  });

  test('customer_inactive senza data fallback a /customers', () => {
    const n = makeNotif('customer_inactive', null);
    expect(getNotificationRoute(n)).toBe('/customers');
  });

  test('price_change naviga a /products con param openPriceVariations', () => {
    const n = makeNotif('price_change', null);
    expect(getNotificationRoute(n)).toBe('/products?openPriceVariations=true');
  });

  test('product_change naviga a /products con param openVariations', () => {
    const n = makeNotif('product_change', { changeType: 'new', count: 3 });
    expect(getNotificationRoute(n)).toBe('/products?openVariations=true');
  });

  test('product_change modified naviga a /products con param openVariations', () => {
    const n = makeNotif('product_change', { changeType: 'modified', count: 5 });
    expect(getNotificationRoute(n)).toBe('/products?openVariations=true');
  });

  test('product_change removed naviga a /products con param openVariations', () => {
    const n = makeNotif('product_change', { changeType: 'removed', count: 1 });
    expect(getNotificationRoute(n)).toBe('/products?openVariations=true');
  });

  test('customer_reminder naviga al profilo cliente', () => {
    const n = makeNotif('customer_reminder', { customerErpId: '42.001', reminderId: 7, action_url: '/customers/42.001' });
    expect(getNotificationRoute(n)).toBe('/customers/42.001');
  });

  test('customer_reminder senza action_url fallback a /notifications', () => {
    const n = makeNotif('customer_reminder', null);
    expect(getNotificationRoute(n)).toBe('/notifications');
  });
  ```

  Aggiorna anche il test esistente per `customer_inactive` (riga ~40) che ora si aspetta `/customers/55.261`:
  ```typescript
  // Vecchio test (da rimuovere o aggiornare):
  // test('customer_inactive con erpId e customerName', ...) → '/customers?highlight=...'

  // Il test aggiornato è già incluso sopra. Rimuovi quello vecchio.
  ```

  Aggiorna il test esistente per `price_change` (riga ~58):
  ```typescript
  // Vecchio:
  // expect(getNotificationRoute(n)).toBe('/prezzi-variazioni');
  // Nuovo (già nei test sopra, rimuovi quello vecchio)
  ```

- [ ] **Step 2: Esegui test per verificare che falliscano**

  ```bash
  npm test --prefix archibald-web-app/frontend -- --reporter=verbose notifications.service.spec
  ```
  Expected: i nuovi test falliscono, i vecchi `customer_inactive` e `price_change` falliscono.

- [ ] **Step 3: Aggiorna `getNotificationRoute` in `notifications.service.ts`**

  Sostituisci la funzione `getNotificationRoute` con:

  ```typescript
  export function getNotificationRoute(notification: Notification): string {
    const data = notification.data ?? {};
    switch (notification.type) {
      case 'fedex_exception':
      case 'fedex_delivered':
        return data.orderNumber
          ? `/orders?highlight=${String(data.orderNumber)}`
          : '/orders';
      case 'erp_customer_deleted':
      case 'erp_customer_restored':
        return '/customers';
      case 'customer_inactive':
        return data.erpId ? `/customers/${String(data.erpId)}` : '/customers';
      case 'customer_reminder':
        return data.action_url ? String(data.action_url) : '/notifications';
      case 'price_change':
        return '/products?openPriceVariations=true';
      case 'product_change':
        return '/products?openVariations=true';
      case 'product_missing_vat':
      case 'sync_anomaly':
        return '/admin';
      case 'order_expiring':
      case 'order_documents_missing':
        return data.orderNumber
          ? `/orders?highlight=${String(data.orderNumber)}`
          : '/orders';
      case 'budget_milestone':
        return '/revenue-report';
      default:
        return '/notifications';
    }
  }
  ```

- [ ] **Step 4: Esegui i test e verifica che passino**

  ```bash
  npm test --prefix archibald-web-app/frontend -- --reporter=verbose notifications.service.spec
  ```
  Expected: tutti i test passano.

- [ ] **Step 5: Commit**

  ```bash
  git add archibald-web-app/frontend/src/services/notifications.service.ts \
          archibald-web-app/frontend/src/services/notifications.service.spec.ts
  git commit -m "feat(notifications): aggiorna route per customer_inactive, price_change, product_change, customer_reminder"
  ```

---

## Task 4: Frontend — NotificationBell UI (getCategory + getRowInfo)

**Files:**
- Modify: `archibald-web-app/frontend/src/components/NotificationBell.tsx`

- [ ] **Step 1: Aggiorna `getCategory` (riga 11–18)**

  ```typescript
  // PRIMA:
  function getCategory(type: string): 'fedex' | 'sync' | 'delivered' | 'clients' | 'payments' | 'other' {
    if (type === 'fedex_exception') return 'fedex';
    if (type === 'fedex_delivered') return 'delivered';
    if (type === 'sync_anomaly' || type === 'product_missing_vat') return 'sync';
    if (type === 'customer_inactive') return 'clients';
    if (type === 'order_expiring') return 'payments';
    return 'other';
  }

  // DOPO:
  function getCategory(type: string): 'fedex' | 'sync' | 'delivered' | 'clients' | 'payments' | 'other' {
    if (type === 'fedex_exception') return 'fedex';
    if (type === 'fedex_delivered') return 'delivered';
    if (type === 'sync_anomaly' || type === 'product_missing_vat' || type === 'product_change') return 'sync';
    if (type === 'customer_inactive' || type === 'erp_customer_deleted' || type === 'erp_customer_restored' || type === 'customer_reminder') return 'clients';
    if (type === 'order_expiring' || type === 'budget_milestone') return 'payments';
    return 'other';
  }
  ```

- [ ] **Step 2: Aggiungi i nuovi case in `getRowInfo` (inserisci PRIMA del `default`, dopo il case `order_expiring`)**

  Dopo il blocco `case 'order_expiring': { ... }` (che termina con `}` a riga ~89), aggiungi:

  ```typescript
  case 'erp_customer_deleted':
    return {
      icon: '🗑️', iconBg: 'rgba(239,68,68,0.18)',
      title: n.title,
      subtitle: data.customerName as string | undefined,
      description: n.body,
      tag: 'Cancellato ERP', tagColor: '#f87171', tagBg: 'rgba(239,68,68,0.18)',
    };
  case 'erp_customer_restored':
    return {
      icon: '🔄', iconBg: 'rgba(46,125,50,0.18)',
      title: n.title,
      subtitle: data.customerName as string | undefined,
      description: n.body,
      tag: 'Ripristinato ERP', tagColor: '#66bb6a', tagBg: 'rgba(46,125,50,0.18)',
    };
  case 'budget_milestone':
    return {
      icon: '🏆', iconBg: 'rgba(250,204,21,0.18)',
      title: n.title,
      subtitle: data.conditionTitle as string | undefined,
      description: n.body,
      tag: 'Traguardo', tagColor: '#facc15', tagBg: 'rgba(250,204,21,0.18)',
    };
  case 'customer_reminder':
    return {
      icon: '🔔', iconBg: 'rgba(96,165,250,0.18)',
      title: n.title,
      subtitle: data.customerErpId as string | undefined,
      description: n.body,
      tag: 'Promemoria', tagColor: '#60a5fa', tagBg: 'rgba(96,165,250,0.18)',
    };
  case 'product_change': {
    const changeType = data.changeType as string | undefined;
    if (changeType === 'new') return {
      icon: '🆕', iconBg: 'rgba(46,125,50,0.18)',
      title: n.title, subtitle: undefined, description: n.body,
      tag: 'Nuovi prodotti', tagColor: '#66bb6a', tagBg: 'rgba(46,125,50,0.18)',
    };
    if (changeType === 'removed') return {
      icon: '🗑️', iconBg: 'rgba(239,68,68,0.18)',
      title: n.title, subtitle: undefined, description: n.body,
      tag: 'Rimossi', tagColor: '#f87171', tagBg: 'rgba(239,68,68,0.18)',
    };
    return {
      icon: '✏️', iconBg: 'rgba(96,165,250,0.18)',
      title: n.title, subtitle: undefined, description: n.body,
      tag: 'Aggiornati', tagColor: '#60a5fa', tagBg: 'rgba(96,165,250,0.18)',
    };
  }
  ```

- [ ] **Step 3: Verifica type-check frontend**

  ```bash
  npm run type-check --prefix archibald-web-app/frontend
  ```
  Expected: nessun errore TypeScript.

- [ ] **Step 4: Commit**

  ```bash
  git add archibald-web-app/frontend/src/components/NotificationBell.tsx
  git commit -m "feat(notifications): NotificationBell — categoria e rendering per 5 nuovi tipi"
  ```

---

## Task 5: Frontend — NotificationsPage UI (getCategory + getTableMeta)

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/NotificationsPage.tsx`

- [ ] **Step 1: Aggiorna `getCategory` (righe 10–18)**

  ```typescript
  // PRIMA:
  function getCategory(type: string): 'fedex' | 'sync' | 'delivered' | 'clients' | 'payments' | 'documents' | 'other' {
    if (type === 'fedex_exception') return 'fedex';
    if (type === 'fedex_delivered') return 'delivered';
    if (type === 'sync_anomaly' || type === 'product_missing_vat') return 'sync';
    if (type === 'customer_inactive') return 'clients';
    if (type === 'order_expiring') return 'payments';
    if (type === 'order_documents_missing') return 'documents';
    return 'other';
  }

  // DOPO:
  function getCategory(type: string): 'fedex' | 'sync' | 'delivered' | 'clients' | 'payments' | 'documents' | 'other' {
    if (type === 'fedex_exception') return 'fedex';
    if (type === 'fedex_delivered') return 'delivered';
    if (type === 'sync_anomaly' || type === 'product_missing_vat' || type === 'product_change') return 'sync';
    if (type === 'customer_inactive' || type === 'erp_customer_deleted' || type === 'erp_customer_restored' || type === 'customer_reminder') return 'clients';
    if (type === 'order_expiring' || type === 'budget_milestone') return 'payments';
    if (type === 'order_documents_missing') return 'documents';
    return 'other';
  }
  ```

- [ ] **Step 2: Aggiungi nuovi case in `getTableMeta` (inserisci PRIMA del `default`, dopo `order_documents_missing`)**

  Dopo il blocco `case 'order_documents_missing': { ... }` (che termina a riga ~96), aggiungi:

  ```typescript
  case 'erp_customer_deleted':
    return {
      tag: '🗑️ Cancellato ERP', tagColor: '#ef4444', tagBg: 'rgba(239,68,68,0.15)',
      ordine: '—',
      cliente: customerName ?? '—',
      dettaglio: n.body,
      codice: '',
    };
  case 'erp_customer_restored':
    return {
      tag: '🔄 Ripristinato ERP', tagColor: '#2e7d32', tagBg: 'rgba(46,125,50,0.15)',
      ordine: '—',
      cliente: customerName ?? '—',
      dettaglio: n.body,
      codice: '',
    };
  case 'budget_milestone':
    return {
      tag: '🏆 Traguardo', tagColor: '#ca8a04', tagBg: 'rgba(250,204,21,0.15)',
      ordine: '—',
      cliente: '—',
      dettaglio: n.body,
      codice: (data.conditionTitle as string | undefined) ?? '',
    };
  case 'customer_reminder':
    return {
      tag: '🔔 Promemoria', tagColor: '#3b82f6', tagBg: 'rgba(96,165,250,0.15)',
      ordine: '—',
      cliente: (data.customerErpId as string | undefined) ?? '—',
      dettaglio: n.body,
      codice: '',
    };
  case 'product_change': {
    const changeType = data.changeType as string | undefined;
    const tag = changeType === 'new' ? '🆕 Nuovi prodotti'
      : changeType === 'removed' ? '🗑️ Prodotti rimossi'
      : '✏️ Prodotti aggiornati';
    const tagColor = changeType === 'new' ? '#2e7d32'
      : changeType === 'removed' ? '#ef4444'
      : '#3b82f6';
    const tagBg = changeType === 'new' ? 'rgba(46,125,50,0.15)'
      : changeType === 'removed' ? 'rgba(239,68,68,0.15)'
      : 'rgba(96,165,250,0.15)';
    return {
      tag, tagColor, tagBg,
      ordine: '—', cliente: 'Catalogo',
      dettaglio: n.body, codice: '',
    };
  }
  ```

- [ ] **Step 3: Verifica type-check frontend**

  ```bash
  npm run type-check --prefix archibald-web-app/frontend
  ```
  Expected: nessun errore TypeScript.

- [ ] **Step 4: Commit**

  ```bash
  git add archibald-web-app/frontend/src/pages/NotificationsPage.tsx
  git commit -m "feat(notifications): NotificationsPage — categoria e rendering per 5 nuovi tipi"
  ```

---

## Task 6: Frontend — ArticoliList auto-apre modali da URL params

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/ArticoliList.tsx`

- [ ] **Step 1: Aggiungi `useSearchParams` all'import di react-router-dom**

  In cima al file, nell'import di react-router-dom (che già contiene `useNavigate`), aggiungi `useSearchParams`:

  ```typescript
  // Cerca la riga con useNavigate e aggiungi useSearchParams:
  import { useNavigate, useSearchParams } from 'react-router-dom';
  ```

- [ ] **Step 2: Aggiungi `useSearchParams` e `useEffect` per auto-open modali**

  Dopo la riga con `const [showProductVariationsModal, setShowProductVariationsModal] = useState(false);` (riga ~33), aggiungi:

  ```typescript
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('openPriceVariations') === 'true') {
      setShowPriceVariationsModal(true);
      setSearchParams(new URLSearchParams(), { replace: true });
    }
    if (searchParams.get('openVariations') === 'true') {
      setShowProductVariationsModal(true);
      setSearchParams(new URLSearchParams(), { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  ```

  **Nota:** `eslint-disable-line` è necessario perché `searchParams` e `setSearchParams` nei deps causerebbero un loop infinito (pattern `feedback_usecallback_in_useeffect_deps.md`). L'effect deve girare solo al mount.

- [ ] **Step 3: Verifica type-check**

  ```bash
  npm run type-check --prefix archibald-web-app/frontend
  ```
  Expected: nessun errore TypeScript.

- [ ] **Step 4: Commit**

  ```bash
  git add archibald-web-app/frontend/src/pages/ArticoliList.tsx
  git commit -m "feat(notifications): ArticoliList apre modali prezzi/prodotti da URL params"
  ```

---

## Task 7: Cleanup — Rimuovi dead code e route morte

**Files:**
- Modify: `archibald-web-app/frontend/src/AppRouter.tsx`
- Delete: `PriceSyncNotification.tsx`, `PriceVariationsPage.tsx`, `ProductVariationsPage.tsx`

- [ ] **Step 1: Rimuovi le 3 route da `AppRouter.tsx`**

  Cerca e rimuovi il blocco route `/prezzi-variazioni` (circa righe 576–596):
  ```tsx
  {/* Price Variations route */}
  <Route
    path="/prezzi-variazioni"
    element={
      <div className="app">
        <main className="app-main" style={{ padding: "0" }}>
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
          <div style={{ flexGrow: 1 }}>
          <PriceVariationsPage />
          </div>
          <footer className="app-footer">
            <p>
              v1.0.0 • Formicanera by Francesco Formicola
              {/* TODO: Add live sync progress bar here */}
            </p>
          </footer>
          </div>
        </main>
      </div>
    }
  />
  ```

  Cerca e rimuovi il blocco route `/prodotti-variazioni` (circa righe 598–616) — stessa struttura con `<ProductVariationsPage />`.

  Rimuovi anche i relativi import in cima al file (cerca `PriceVariationsPage` e `ProductVariationsPage`).

- [ ] **Step 2: Elimina i 3 file morti**

  ```bash
  rm archibald-web-app/frontend/src/components/PriceSyncNotification.tsx
  rm archibald-web-app/frontend/src/pages/PriceVariationsPage.tsx
  rm archibald-web-app/frontend/src/pages/ProductVariationsPage.tsx
  ```

- [ ] **Step 3: Verifica type-check e test frontend**

  ```bash
  npm run type-check --prefix archibald-web-app/frontend
  npm test --prefix archibald-web-app/frontend
  ```
  Expected: nessun errore TypeScript, tutti i test passano.

- [ ] **Step 4: Verifica build backend**

  ```bash
  npm run build --prefix archibald-web-app/backend
  npm test --prefix archibald-web-app/backend
  ```
  Expected: build OK, tutti i test passano.

- [ ] **Step 5: Commit**

  ```bash
  git add archibald-web-app/frontend/src/AppRouter.tsx
  git rm archibald-web-app/frontend/src/components/PriceSyncNotification.tsx \
         archibald-web-app/frontend/src/pages/PriceVariationsPage.tsx \
         archibald-web-app/frontend/src/pages/ProductVariationsPage.tsx
  git commit -m "refactor(notifications): rimuovi pagine variazioni dead code, consolida in modali /products"
  ```

---

## Self-Review

### Spec coverage

| Requisito | Task |
|---|---|
| P1: erp_customer_deleted/restored → tab Clienti | Task 4 + 5 |
| P1: budget_milestone → tab Pagamenti | Task 4 + 5 |
| P1-extra: customer_inactive → apre profilo diretto | Task 3 |
| P2: product_change → 3 notifiche separate (new/modified/removed) | Task 1 + 2 |
| P2: click → apre ProductVariationsModal in /products | Task 3 + 6 |
| P2: 3 icone distinte (🆕/✏️/🗑️) | Task 4 + 5 |
| P3: customer_reminder → broadcast WebSocket | Task 2 |
| P4: rimuovi PriceSyncNotification (refuso) | Task 7 |
| P4: click price_change → apre PriceVariationsModal in /products | Task 3 + 6 |
| P4: rimuovi PriceVariationsPage + ProductVariationsPage | Task 7 |

### Placeholder scan — Nessun placeholder trovato ✅

### Type consistency — Verificata: `changeType`, `customerErpId`, `conditionTitle` usati consistentemente nei task 2/3/4/5 ✅
