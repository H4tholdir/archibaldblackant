# Archibald Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correggere 4 bug identificati tramite analisi Codex nel codebase Archibald.

**Architecture:** Fix chirurgici, nessun refactor. TDD dove applicabile. Ogni task è indipendente e committabile separatamente.

**Tech Stack:** TypeScript, Express, PostgreSQL (`pg` pool), Vitest

---

## File coinvolti

| File | Task | Tipo |
|---|---|---|
| `archibald-web-app/backend/src/db/repositories/warehouse.ts` | T1 | Modifica |
| `archibald-web-app/backend/src/db/repositories/warehouse.spec.ts` | T1 | Test |
| `archibald-web-app/frontend/src/api/operations.ts` | T2 | Modifica (1 riga) |
| `archibald-web-app/backend/src/routes/auth.ts` | T3 | Modifica |
| `archibald-web-app/backend/src/operations/handlers/submit-order.ts` | T4 | Modifica |
| `archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts` | T4 | Test |

---

## Task 1: batchReserve — row lock su split concorrenti

**File:**
- Modifica: `archibald-web-app/backend/src/db/repositories/warehouse.ts` — funzione `batchReserve`
- Test: `archibald-web-app/backend/src/db/repositories/warehouse.spec.ts`

Il problema: `batchReserve` esegue `SELECT` + `UPDATE/INSERT` separati senza lock sulla riga. Due chiamate concorrenti per lo stesso `itemId` possono entrambe superare il SELECT (entrambe vedono `reserved_for_order IS NULL`) prima che una delle due faccia l'UPDATE.

La fix: wrappare ogni iterazione dell'item in `pool.withTransaction` con `SELECT ... FOR UPDATE` per serializzare accessi allo stesso item.

- [ ] **Step 1: Scrivi test fallente (race condition scenario)**

```typescript
// In warehouse.spec.ts — aggiungi a describe('batchReserve')
it('serializza richieste concorrenti per lo stesso item (non doppia-riserva)', async () => {
  // Setup: un item con quantità 10
  const { rows: [item] } = await pool.query<{ id: number }>(
    `INSERT INTO agents.warehouse_items (user_id, article_code, description, quantity, box_name, uploaded_at, device_id)
     VALUES ($1, 'ART-CONCURRENT', 'Test Concurrent', 10, 'BOX1', NOW(), 'DEV1') RETURNING id`,
    [TEST_USER_ID],
  );

  // Simula due richieste concorrenti per lo stesso item
  const [result1, result2] = await Promise.all([
    batchReserve(pool, TEST_USER_ID, [{ itemId: item.id, quantity: 5 }], 'ORDER-A'),
    batchReserve(pool, TEST_USER_ID, [{ itemId: item.id, quantity: 5 }], 'ORDER-B'),
  ]);

  // Solo una delle due deve aver prenotato; l'altra deve aver skippato
  const totalReserved = result1.reserved + result2.reserved;
  const totalSkipped = result1.skipped + result2.skipped;
  expect(totalReserved).toBe(1);
  expect(totalSkipped).toBe(1);

  // Verifica DB: un solo item riservato per ORDER-A o ORDER-B
  const { rows: reservedItems } = await pool.query(
    `SELECT COUNT(*) FROM agents.warehouse_items WHERE (reserved_for_order = 'ORDER-A' OR reserved_for_order = 'ORDER-B') AND user_id = $1`,
    [TEST_USER_ID],
  );
  expect(Number(reservedItems[0].count)).toBe(1);
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- --testPathPattern="warehouse.spec" --run 2>&1 | tail -20
```

Expected: FAIL — il test potrebbe passare sporadicamente (race condition non deterministica) o fallire con doppia reserva.

- [ ] **Step 3: Implementa la fix in batchReserve**

Sostituisci il loop di `batchReserve` in `warehouse.ts`. Il corpo di ogni iterazione item va wrappato in `pool.withTransaction`:

```typescript
for (const { itemId, quantity: requestedQty } of items) {
  totalRequestedQty += requestedQty;

  const itemResult = await pool.withTransaction(async (tx) => {
    const { rows: [item] } = await tx.query<WarehouseItemRow>(
      `SELECT * FROM agents.warehouse_items
       WHERE id = $1 AND user_id = $2
         AND reserved_for_order IS NULL AND sold_in_order IS NULL
       FOR UPDATE`,                             // ← aggiunto FOR UPDATE
      [itemId, userId],
    );

    if (!item) return { status: 'skipped' as const, message: `Item ${itemId}: non trovato o già riservato/venduto (richiesti ${requestedQty} pz)` };

    let actualReservedQty: number;

    if (requestedQty >= item.quantity) {
      if (requestedQty > item.quantity) {
        // warning will be appended after
      }
      await tx.query(
        `UPDATE agents.warehouse_items
         SET reserved_for_order = $1,
             customer_name = $3, sub_client_name = $4, order_date = $5, order_number = $6
         WHERE id = $7 AND user_id = $2`,
        [orderId, userId, tracking?.customerName ?? null, tracking?.subClientName ?? null, tracking?.orderDate ?? null, tracking?.orderNumber ?? null, itemId],
      );
      actualReservedQty = item.quantity;
    } else {
      await tx.query(
        `UPDATE agents.warehouse_items
         SET quantity = $1, reserved_for_order = $2,
             customer_name = $3, sub_client_name = $4, order_date = $5, order_number = $6
         WHERE id = $7 AND user_id = $8`,
        [requestedQty, orderId, tracking?.customerName ?? null, tracking?.subClientName ?? null, tracking?.orderDate ?? null, tracking?.orderNumber ?? null, itemId, userId],
      );
      await tx.query(
        `INSERT INTO agents.warehouse_items
           (user_id, article_code, description, quantity, box_name, uploaded_at, device_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, item.article_code, item.description, item.quantity - requestedQty, item.box_name, item.uploaded_at, item.device_id],
      );
      actualReservedQty = requestedQty;
    }

    return {
      status: 'reserved' as const,
      qty: actualReservedQty,
      warn: requestedQty > item.quantity
        ? `Item ${itemId} (${item.article_code}): richiesti ${requestedQty} pz ma disponibili solo ${item.quantity} pz — riservati ${item.quantity} pz`
        : null,
    };
  });

  if (itemResult.status === 'skipped') {
    skipped++;
    warnings.push(itemResult.message);
  } else {
    reserved++;
    totalReservedQty += itemResult.qty;
    if (itemResult.warn) warnings.push(itemResult.warn);
  }
}
```

- [ ] **Step 4: Esegui i test warehouse**

```bash
npm test --prefix archibald-web-app/backend -- --testPathPattern="warehouse.spec" --run 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 5: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

Expected: nessun errore TypeScript

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/warehouse.ts archibald-web-app/backend/src/db/repositories/warehouse.spec.ts
git commit -m "fix(warehouse): serializza batchReserve con SELECT FOR UPDATE per prevenire doppia-allocazione concorrente"
```

---

## Task 2: CONDUCTOR_OPERATIONS — aggiunta recognition-feedback nel frontend

**File:**
- Modifica: `archibald-web-app/frontend/src/api/operations.ts` (1 riga)

Il tipo `recognition-feedback` è presente nel backend `queue-router.ts` ma assente dal frontend `CONDUCTOR_OPERATIONS` Set. Risultato: le richieste di recognition-feedback usano il path legacy senza priority.

- [ ] **Step 1: Verifica che il tipo esista nel backend**

```bash
grep "recognition-feedback" archibald-web-app/backend/src/operations/queue-router.ts
```

Expected: output con `'recognition-feedback'`

- [ ] **Step 2: Aggiungi al Set frontend**

In `archibald-web-app/frontend/src/api/operations.ts`, trova `CONDUCTOR_OPERATIONS` e aggiungi `'recognition-feedback'` dopo `'sync-customer-addresses'`:

```typescript
const CONDUCTOR_OPERATIONS: ReadonlySet<OperationType> = new Set([
  // ... (tutto il contenuto attuale) ...
  'sync-customer-addresses',
  'recognition-feedback',   // ← aggiunta
]);
```

- [ ] **Step 3: Verifica type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
```

Expected: 0 errori

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/api/operations.ts
git commit -m "fix(frontend): aggiunge recognition-feedback a CONDUCTOR_OPERATIONS per preservare priority routing"
```

---

## Task 3: refresh-credentials — persistenza su DB

**File:**
- Modifica: `archibald-web-app/backend/src/routes/auth.ts`

Il problema: `POST /refresh-credentials` aggiorna solo `passwordCache` in-memory. Dopo riavvio del backend, `getPassword` ricarica la password stale da DB — la credenziale aggiornata va persa.

La fix: dopo `passwordCache.set`, cifrare la nuova password e aggiornarla anche in `agents.users`.

- [ ] **Step 1: Identifica il password encryption service**

```bash
grep -n "encryptPassword\|encrypt\|PasswordEncryption" archibald-web-app/backend/src/services/password-encryption-service.ts | head -10
```

Nota il nome della funzione di cifratura (tipicamente `encryptPassword` o simile) e il tipo di ritorno.

- [ ] **Step 2: Scrivi test fallente**

```typescript
// In archibald-web-app/backend/src/routes/auth.spec.ts o file di test esistente
it('POST /refresh-credentials persiste la password nel DB', async () => {
  // Prima richiesta: aggiorna
  await request(app)
    .post('/api/auth/refresh-credentials')
    .set('Authorization', `Bearer ${TEST_JWT}`)
    .send({ password: 'NewPassword123!' })
    .expect(200);

  // Simula riavvio: svuota la cache in-memory
  passwordCache.clear();  // o equivalente

  // La password deve essere recuperabile dal DB anche dopo riavvio
  const { rows: [user] } = await pool.query(
    'SELECT encrypted_password FROM agents.users WHERE user_id = $1',
    [TEST_USER_ID],
  );
  expect(user.encrypted_password).toBeTruthy();

  // Verifica che la password decriptata sia quella aggiornata
  const decrypted = await decryptPassword(user, TEST_USER_ID);
  expect(decrypted).toBe('NewPassword123!');
});
```

- [ ] **Step 3: Implementa la fix in auth.ts**

```typescript
import { encryptPassword } from '../services/password-encryption-service';

router.post('/refresh-credentials', authenticateWithRevocation, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const parsed = z.object({ password: z.string().min(1, 'Password richiesta') }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? 'Password richiesta' });
    }

    // Aggiorna cache in-memory
    passwordCache.set(userId, parsed.data.password);

    // Persiste la credenziale cifrata nel DB (sopravvive al riavvio del backend)
    const encrypted = await encryptPassword(parsed.data.password, userId);
    await pool.query(
      `UPDATE agents.users
       SET encrypted_password = $1, encryption_iv = $2, encryption_auth_tag = $3
       WHERE user_id = $4`,
      [encrypted.ciphertext, encrypted.iv, encrypted.authTag, userId],
    );

    res.json({ success: true, data: { message: 'Credenziali aggiornate' } });
  } catch (error) {
    logger.error('Error refreshing credentials', { error });
    res.status(500).json({ success: false, error: 'Errore interno del server' });
  }
});
```

**ATTENZIONE:** Prima di implementare, leggere `password-encryption-service.ts` per verificare la firma esatta di `encryptPassword` e la struttura del risultato. Adattare `encrypted.ciphertext`, `encrypted.iv`, `encrypted.authTag` ai nomi reali.

- [ ] **Step 4: Build e test**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
npm test --prefix archibald-web-app/backend -- --testPathPattern="auth" --run 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/routes/auth.ts
git commit -m "fix(auth): refresh-credentials persiste la password cifrata nel DB per sopravvivere al riavvio"
```

---

## Task 4: Anti-duplicate — firma calcolata sul payload ERP effettivo

**File:**
- Modifica: `archibald-web-app/backend/src/operations/handlers/submit-order.ts`

Il problema: `checkRecentDuplicateOnErp` usa `data.items.length` (payload originale) per la firma. Se il bot di creazione ordine filtra o modifica articoli (es. articoli non trovati su ERP), il conteggio nella firma non corrisponde all'ordine realmente creato.

Priorità: **bassa** (il bot non filtra items in modo silenzioso oggi, ma è fragile per future modifiche).

La fix: calcolare la firma DOPO aver determinato gli articoli effettivi da inviare.

- [ ] **Step 1: Localizza il punto di chiamata**

```bash
grep -n "checkRecentDuplicateOnErp\|calculateAmounts\|data.items.length" archibald-web-app/backend/src/operations/handlers/submit-order.ts
```

Identifica le righe esatte. La struttura attuale è circa:
```typescript
const { grossAmount } = calculateAmounts(data.items, data.discountPercent);
const candidate = await checkRecentDuplicateOnErp(bot, data.customerId, data.items.length, grossAmount);
```

- [ ] **Step 2: Sposta il check DOPO la preparazione degli articoli ERP**

Se esiste una funzione di "preparazione items" prima di `createOrder`, calcola la firma su quegli items. In assenza, aggiungi un commento che documenta il rischio residuo:

```typescript
// items inviati all'ERP: data.items non viene filtrato dal bot
// Firma anti-duplicato usa data.items.length — aggiornare se il bot aggiunge filtri futuri
const erpItemCount = data.items.length;
const { grossAmount } = calculateAmounts(data.items, data.discountPercent);
const candidate = await checkRecentDuplicateOnErp(bot, data.customerId, erpItemCount, grossAmount);
```

Se la funzione `createOrder` restituisce l'elenco effettivo di items inviati, usarlo nella firma. Altrimenti il commento è sufficiente per documentare il rischio.

- [ ] **Step 3: Build**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/submit-order.ts
git commit -m "fix(submit-order): documenta firma anti-duplicato su payload ERP effettivo"
```

---

## Verifica finale

- [ ] **Build completo backend + frontend**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
```

- [ ] **Test suite completa**

```bash
npm test --prefix archibald-web-app/backend --run 2>&1 | tail -5
npm test --prefix archibald-web-app/frontend --run 2>&1 | tail -5
```

- [ ] **Push**

```bash
git push origin master
```
