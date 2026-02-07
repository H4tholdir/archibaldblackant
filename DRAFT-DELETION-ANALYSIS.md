# 🔍 ANALISI COMPLETA: Sistema di Eliminazione Draft Orders

**Data Analisi**: 2026-02-05
**Analista**: Senior Software Engineer
**Obiettivo**: Identificare e risolvere bug nel sistema di eliminazione delle draft orders

---

## 📋 EXECUTIVE SUMMARY

Il sistema di gestione delle draft orders presenta **5 bug critici/medi** che impediscono la corretta eliminazione delle bozze. Le draft riappaiono continuamente perché:

1. ❌ Il pulsante "Cancella bozza" NON elimina effettivamente la draft dal database
2. ❌ Il sistema processa tombstones già eliminati creando update inutili
3. ❌ I tombstones si accumulano nel database se la sincronizzazione fallisce
4. ⚠️ Edge cases dove `draftId` potrebbe essere null/undefined
5. ⚠️ Race condition teorica tra auto-save e reset form

---

## 🐛 BUG IDENTIFICATI (ORDINATI PER GRAVITÀ)

### 🔴 BUG CRITICO #1: Pulsante "Cancella bozza" NON Elimina la Draft

**Severità**: CRITICA 🔴
**Probabilità**: ALTA (100%) - Accade SEMPRE
**Impatto Utente**: ALTO - La draft riappare ogni volta

#### Dettagli Tecnici

**File**: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`
**Linea Pulsante**: 3150
**Handler Chiamato**: `handleResetForm` (linea 975)

#### Codice Problematico

```typescript
// Linea 3150: Pulsante "Cancella bozza"
<button onClick={handleResetForm}>
  🗑️ Cancella bozza
</button>

// Linea 975: Handler che NON elimina dal database
const handleResetForm = () => {
  // Reset customer
  setCustomerSearch("");
  setCustomerResults([]);
  setSelectedCustomer(null);
  setSearchingCustomer(false);

  // Reset product
  setProductSearch("");
  setProductResults([]);
  setSelectedProduct(null);
  setSearchingProduct(false);
  setHighlightedProductIndex(-1);
  setQuantity("");
  setItemDiscount("");
  setPackagingPreview(null);
  setCalculatingPackaging(false);
  setWarehouseSelection([]);
  setProductVariants([]);

  // Reset items
  setItems([]);
  setGlobalDiscountPercent("");
  setTargetTotal("");

  // Reset draft state (SOLO STATE LOCALE!)
  setHasDraft(false);      // ❌ Solo UI state
  setDraftId(null);        // ❌ Solo UI state
  setLastAutoSave(null);   // ❌ Solo UI state

  toastService.success("Ordine resettato");

  // ❌ MANCA: await orderService.deleteDraftOrder(draftId);
  // ❌ MANCA: Trigger sync per eliminare dal server
};
```

#### Perché Accade

`handleResetForm` resetta **SOLO lo stato locale React** del componente:
- `setHasDraft(false)` - nasconde il banner UI
- `setDraftId(null)` - rimuove il riferimento allo state
- `setLastAutoSave(null)` - resetta il timestamp UI

**NON elimina la draft da**:
- ❌ IndexedDB locale
- ❌ Database SQLite sul server
- ❌ Altri dispositivi dell'utente

#### Sequenza del Bug

1. Utente crea una draft (salvata in IndexedDB)
2. Utente preme "🗑️ Cancella bozza"
3. `handleResetForm()` resetta solo lo state React
4. La draft rimane in IndexedDB con tutti i dati
5. Utente naviga via e torna a "Nuovo Ordine"
6. `useEffect` (linea 781) carica draft da IndexedDB
7. ✅ Draft trovata → Banner "Bozza ordine disponibile" riappare
8. 🔄 Loop infinito

#### Fix Proposto

```typescript
const handleResetForm = async () => {
  // 1. PRIMA: Elimina draft dal database se esiste
  if (draftId) {
    try {
      await orderService.deleteDraftOrder(draftId);
      console.log("[OrderForm] Draft deleted:", draftId);

      // 2. Trigger sync per eliminare dal server
      if (navigator.onLine) {
        await unifiedSyncService.syncAll();
        console.log("[OrderForm] Draft deletion synced to server");
      }
    } catch (error) {
      console.error("[OrderForm] Failed to delete draft:", error);
      toastService.error("Errore durante l'eliminazione della bozza");
      return; // Non resettare il form se l'eliminazione fallisce
    }
  } else if (selectedCustomer) {
    // Fallback: se non c'è draftId ma c'è customer, elimina tutte le draft per quel customer
    try {
      await orderService.deleteAllDraftsForCustomer(selectedCustomer.id);
    } catch (error) {
      console.error("[OrderForm] Failed to delete customer drafts:", error);
    }
  }

  // 3. POI: Reset UI state
  setCustomerSearch("");
  setCustomerResults([]);
  setSelectedCustomer(null);
  setSearchingCustomer(false);

  setProductSearch("");
  setProductResults([]);
  setSelectedProduct(null);
  setSearchingProduct(false);
  setHighlightedProductIndex(-1);
  setQuantity("");
  setItemDiscount("");
  setPackagingPreview(null);
  setCalculatingPackaging(false);
  setWarehouseSelection([]);
  setProductVariants([]);

  setItems([]);
  setGlobalDiscountPercent("");
  setTargetTotal("");

  // Reset draft state
  setHasDraft(false);
  setDraftId(null);
  setLastAutoSave(null);

  toastService.success("Bozza eliminata e ordine resettato");
};
```

#### Test Plan

```typescript
// Test case 1: Delete draft with draftId
test("handleResetForm should delete draft from database when draftId exists", async () => {
  const mockDraftId = "draft-123";
  const mockDeleteDraftOrder = vi.fn().mockResolvedValue(undefined);

  // Arrange
  orderService.deleteDraftOrder = mockDeleteDraftOrder;
  render(<OrderFormSimple />);

  // Set draft state
  setDraftId(mockDraftId);
  setSelectedCustomer({ id: "cust-1", name: "Test Customer" });

  // Act
  await handleResetForm();

  // Assert
  expect(mockDeleteDraftOrder).toHaveBeenCalledWith(mockDraftId);
  expect(setDraftId).toHaveBeenCalledWith(null);
  expect(setHasDraft).toHaveBeenCalledWith(false);
});

// Test case 2: Fallback to deleteAllDraftsForCustomer
test("handleResetForm should delete all customer drafts when draftId is null", async () => {
  const mockCustomerId = "cust-1";
  const mockDeleteAllDrafts = vi.fn().mockResolvedValue(undefined);

  // Arrange
  orderService.deleteAllDraftsForCustomer = mockDeleteAllDrafts;
  render(<OrderFormSimple />);

  // Set state without draftId
  setDraftId(null);
  setSelectedCustomer({ id: mockCustomerId, name: "Test Customer" });

  // Act
  await handleResetForm();

  // Assert
  expect(mockDeleteAllDrafts).toHaveBeenCalledWith(mockCustomerId);
});

// Test case 3: Verify draft is removed from IndexedDB
test("deleted draft should not reappear on component remount", async () => {
  // Arrange
  const draftId = await orderService.saveDraftOrder({
    customerId: "cust-1",
    customerName: "Test Customer",
    items: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Act
  await handleResetForm();

  // Assert
  const drafts = await orderService.getDraftOrders();
  expect(drafts).toHaveLength(0);
});
```

---

### 🟠 BUG MEDIO #2: deleteAllDraftsForCustomer Processa Tombstones

**Severità**: MEDIA 🟠
**Probabilità**: ALTA - Accade quando ci sono tombstones pending
**Impatto Utente**: MEDIO - Performance degradation e log noise

#### Dettagli Tecnici

**File**: `archibald-web-app/frontend/src/services/orders.service.ts`
**Linea**: 132-149

#### Codice Problematico

```typescript
async deleteAllDraftsForCustomer(customerId: string): Promise<void> {
  try {
    // ❌ PROBLEMA: .toArray() ritorna TUTTE le draft, inclusi i tombstones
    const drafts = await this.db
      .table<DraftOrder, string>("draftOrders")
      .where("customerId")
      .equals(customerId)
      .toArray();  // ← Include draft con deleted: true!

    console.log(
      `[OrderService] Deleting all ${drafts.length} drafts for customer ${customerId}`,
    );

    // ❌ PROBLEMA: Chiama deleteDraftOrder anche sui tombstones
    for (const draft of drafts) {
      await this.deleteDraftOrder(draft.id);  // ← Update inutile su tombstones
    }

    console.log(
      `[OrderService] ✅ Deleted ${drafts.length} drafts for customer ${customerId}`,
    );
  } catch (error) {
    console.error(
      `[OrderService] Failed to delete drafts for customer ${customerId}:`,
      error,
    );
    // Swallow error - non-critical
  }
}
```

#### Perché È un Problema

1. **Query include tombstones**: `.toArray()` ritorna anche draft con `deleted: true`
2. **Update inutile**: `deleteDraftOrder` aggiorna il campo `updatedAt` e `needsSync` anche sui tombstones
3. **Performance**: Se ci sono 10 draft (di cui 7 tombstones), esegue 10 update invece di 3
4. **Race condition**: Modificare `updatedAt` su tombstones può interferire con la sincronizzazione

#### Scenario di Bug

```
IndexedDB State PRIMA:
┌─────────┬─────────────┬─────────┬───────────┐
│ ID      │ customerId  │ deleted │ needsSync │
├─────────┼─────────────┼─────────┼───────────┤
│ draft-1 │ customer-A  │ true    │ true      │  ← Tombstone vecchio
│ draft-2 │ customer-A  │ true    │ false     │  ← Tombstone sincronizzato
│ draft-3 │ customer-A  │ false   │ false     │  ← Draft attiva
│ draft-4 │ customer-B  │ false   │ false     │  ← Altro cliente
└─────────┴─────────────┴─────────┴───────────┘

Utente salva pending order per customer-A:
  ↓
deleteAllDraftsForCustomer("customer-A"):
  ↓
Query: .where("customerId").equals("customer-A").toArray()
Risultato: [draft-1, draft-2, draft-3]  ← Include tombstones!
  ↓
for (draft of [draft-1, draft-2, draft-3]):
  deleteDraftOrder(draft.id)  ← Update su 3 record

IndexedDB State DOPO:
┌─────────┬─────────────┬─────────┬───────────┐
│ ID      │ customerId  │ deleted │ needsSync │
├─────────┼─────────────┼─────────┼───────────┤
│ draft-1 │ customer-A  │ true    │ true      │  ← updatedAt modificato! 🔄
│ draft-2 │ customer-A  │ true    │ true      │  ← needsSync riattivato! 🔄
│ draft-3 │ customer-A  │ true    │ true      │  ← Corretto ✅
│ draft-4 │ customer-B  │ false   │ false     │
└─────────┴─────────────┴─────────┴───────────┘

Risultato:
- ❌ draft-1 e draft-2 marcati di nuovo needsSync: true
- ❌ updatedAt modificato → potrebbe vincere in LWW conflict
- ❌ Sync service proverà a eliminare di nuovo tombstones già eliminati
- ❌ 3 DELETE requests invece di 1
```

#### Fix Proposto

```typescript
async deleteAllDraftsForCustomer(customerId: string): Promise<void> {
  try {
    const allDrafts = await this.db
      .table<DraftOrder, string>("draftOrders")
      .where("customerId")
      .equals(customerId)
      .toArray();

    // ✅ FIX: Filtra tombstones (draft già eliminate)
    const activeDrafts = allDrafts.filter((draft) => !draft.deleted);

    if (activeDrafts.length === 0) {
      console.log(
        `[OrderService] No active drafts to delete for customer ${customerId}`,
      );
      return;
    }

    console.log(
      `[OrderService] Deleting ${activeDrafts.length} active drafts for customer ${customerId} (found ${allDrafts.length - activeDrafts.length} tombstones, skipping)`,
    );

    // Elimina solo draft attive
    for (const draft of activeDrafts) {
      await this.deleteDraftOrder(draft.id);
    }

    console.log(
      `[OrderService] ✅ Deleted ${activeDrafts.length} active drafts for customer ${customerId}`,
    );
  } catch (error) {
    console.error(
      `[OrderService] Failed to delete drafts for customer ${customerId}:`,
      error,
    );
    // Swallow error - non-critical
  }
}
```

#### Test Plan

```typescript
describe("deleteAllDraftsForCustomer", () => {
  test("should only delete active drafts, not tombstones", async () => {
    const customerId = "customer-A";

    // Arrange: Create 2 active drafts + 2 tombstones
    const draft1 = await orderService.saveDraftOrder({
      customerId,
      customerName: "Customer A",
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const draft2 = await orderService.saveDraftOrder({
      customerId,
      customerName: "Customer A",
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Create tombstones manually
    await db.draftOrders.add({
      id: "tombstone-1",
      customerId,
      customerName: "Customer A",
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deviceId: "device-1",
      needsSync: true,
      deleted: true,  // Tombstone
    });

    await db.draftOrders.add({
      id: "tombstone-2",
      customerId,
      customerName: "Customer A",
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deviceId: "device-1",
      needsSync: false,
      deleted: true,  // Tombstone
    });

    // Act
    await orderService.deleteAllDraftsForCustomer(customerId);

    // Assert
    const allDrafts = await db.draftOrders
      .where("customerId")
      .equals(customerId)
      .toArray();

    const activeDrafts = allDrafts.filter((d) => !d.deleted);
    const tombstones = allDrafts.filter((d) => d.deleted);

    // Should have marked active drafts as deleted
    expect(activeDrafts).toHaveLength(0);

    // Should NOT have modified tombstones
    expect(tombstones).toHaveLength(2);

    // Verify tombstones weren't modified
    const tombstone1 = await db.draftOrders.get("tombstone-1");
    const tombstone2 = await db.draftOrders.get("tombstone-2");

    expect(tombstone1!.needsSync).toBe(true);  // Not changed
    expect(tombstone2!.needsSync).toBe(false); // Not changed
  });

  test("should handle customer with only tombstones", async () => {
    const customerId = "customer-B";

    // Arrange: Only tombstones, no active drafts
    await db.draftOrders.add({
      id: "tombstone-only",
      customerId,
      customerName: "Customer B",
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deviceId: "device-1",
      needsSync: true,
      deleted: true,
    });

    // Act
    const consoleSpy = vi.spyOn(console, "log");
    await orderService.deleteAllDraftsForCustomer(customerId);

    // Assert
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("No active drafts to delete"),
    );
  });
});
```

---

### 🟠 BUG MEDIO #3: Tombstones Si Accumulano se Sync Fallisce

**Severità**: MEDIA 🟠
**Probabilità**: MEDIA - Accade se utente offline prolungato o sync fail
**Impatto Utente**: BASSO-MEDIO - Database bloat, possibile performance degradation

#### Dettagli Tecnici

**File**: `archibald-web-app/frontend/src/services/unified-sync-service.ts`
**Linea**: 501-538

#### Codice Problematico

```typescript
// Push tombstones (deletions)
if (tombstones.length > 0) {
  console.log(
    `[UnifiedSync] Processing ${tombstones.length} draft deletions`,
  );

  for (const tombstone of tombstones) {
    try {
      const response = await fetchWithRetry(
        `/api/sync/draft-orders/${tombstone.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      // ✅ Treat 404 as success (draft doesn't exist = goal achieved)
      if (response.ok || response.status === 404) {
        // Server delete successful → remove tombstone from local DB
        await db.draftOrders.delete(tombstone.id);
        console.log(
          `[UnifiedSync] ✅ Draft ${tombstone.id} deleted from server and tombstone removed`,
        );
      } else {
        // ❌ PROBLEMA: Keep tombstone for retry INDEFINITELY
        console.error(
          `[UnifiedSync] Failed to delete draft ${tombstone.id}: ${response.status}`,
        );
        // ❌ Nessuna strategia di cleanup per tombstones vecchi
        // ❌ Nessun limite di tentativi
        // ❌ Nessuna scadenza temporale
      }
    } catch (deleteError) {
      // ❌ PROBLEMA: Keep tombstone on network error
      console.error(
        `[UnifiedSync] Error deleting draft ${tombstone.id}:`,
        deleteError,
      );
      // ❌ Tombstone rimane nel database per sempre se offline
    }
  }
}
```

#### Perché È un Problema

**Scenario 1: Utente Offline Prolungato**

```
Timeline:
┌──────────────────────────────────────────────────────────┐
│ T=0: Utente elimina draft-1                              │
│   → Marcata deleted: true, needsSync: true               │
│   → Tombstone creato in IndexedDB                        │
│                                                           │
│ T=1min: Sync service tenta DELETE                        │
│   → navigator.onLine = false                             │
│   → Catch error, tombstone kept                          │
│                                                           │
│ T=16min: Periodic sync (15s interval)                    │
│   → Ancora offline                                       │
│   → Catch error, tombstone kept                          │
│                                                           │
│ T=2h: Utente torna online                                │
│   → Sync service tenta DELETE                            │
│   → Server: 404 (draft non esiste, già eliminata)       │
│   → ✅ Tombstone rimosso                                 │
│                                                           │
│ ✅ OK: Tombstone rimosso dopo 2h                         │
└──────────────────────────────────────────────────────────┘
```

**Scenario 2: Server Error Persistente**

```
Timeline:
┌──────────────────────────────────────────────────────────┐
│ T=0: Utente elimina 10 draft                             │
│   → 10 tombstones creati                                 │
│                                                           │
│ T=1min: Sync service tenta DELETE x10                    │
│   → Server: 503 Service Unavailable (x10)               │
│   → 10 tombstones kept                                   │
│                                                           │
│ T=15s: Periodic sync                                     │
│   → Server ancora 503 (x10)                              │
│   → 10 tombstones kept                                   │
│                                                           │
│ ... questo continua ogni 15 secondi per giorni ...       │
│                                                           │
│ T=7 giorni: Server torna online                          │
│   → Sync service tenta DELETE x10                        │
│   → ✅ Tombstones rimossi (finalmente)                   │
│                                                           │
│ ❌ PROBLEMA: 10 tombstones in IndexedDB per 7 giorni    │
│ ❌ 40,320 tentativi falliti (7 days * 4 sync/min * 10)  │
│ ❌ Log noise, network requests inutili                   │
└──────────────────────────────────────────────────────────┘
```

**Scenario 3: Token Scaduto (Edge Case)**

```
Timeline:
┌──────────────────────────────────────────────────────────┐
│ T=0: Utente elimina draft                                │
│   → Tombstone creato                                     │
│                                                           │
│ T=1min: Sync service tenta DELETE                        │
│   → Server: 401 Unauthorized (token scaduto)            │
│   → Catch error, tombstone kept                          │
│                                                           │
│ T=5min: User ri-autenticato                              │
│   → Nuovo token                                          │
│   → Sync service tenta DELETE con nuovo token            │
│   → ✅ Tombstone rimosso                                 │
│                                                           │
│ ✅ OK: Tombstone rimosso dopo re-auth                    │
└──────────────────────────────────────────────────────────┘
```

#### Impatto

**Database Bloat**:
- 1 tombstone ≈ 2-5 KB (customer info + items JSON)
- 100 tombstones ≈ 200-500 KB
- Non critico, ma evitabile

**Performance**:
- `getDraftOrders()` fa `.toArray()` su TUTTE le draft
- Filtra client-side con `.filter((d) => !d.deleted)`
- Con 1000 tombstones: query ~10-50ms (accettabile)

**Network & Logs**:
- Ogni sync (15s) → tentativi DELETE su tutti i tombstones
- Log noise: console spam
- Network requests inutili

#### Fix Proposto

**Opzione A: Cleanup Tombstones Vecchi (Raccomandato)**

```typescript
// unified-sync-service.ts - Aggiungi metodo di cleanup

/**
 * Remove tombstones older than maxAgeMs (default 7 days)
 * Called during sync to prevent database bloat
 */
private async cleanupOldTombstones(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  const now = new Date().getTime();
  const cutoffDate = new Date(now - maxAgeMs).toISOString();

  const oldTombstones = await db.draftOrders
    .filter((draft) => {
      return (
        draft.deleted === true &&
        draft.updatedAt < cutoffDate
      );
    })
    .toArray();

  if (oldTombstones.length === 0) return;

  console.log(
    `[UnifiedSync] Cleaning up ${oldTombstones.length} tombstones older than ${maxAgeMs}ms`,
  );

  for (const tombstone of oldTombstones) {
    await db.draftOrders.delete(tombstone.id);
    console.log(
      `[UnifiedSync] 🗑️ Removed old tombstone ${tombstone.id} (age: ${now - new Date(tombstone.updatedAt).getTime()}ms)`,
    );
  }
}

// Chiama durante syncDraftOrders
private async syncDraftOrders(): Promise<void> {
  await this.pushDraftOrders();
  await this.pullDraftOrders();

  // ✅ Cleanup tombstones vecchi dopo sync
  await this.cleanupOldTombstones();
}
```

**Opzione B: Tentativi Limitati**

```typescript
// schema.ts - Aggiungi campo deletionAttempts
export interface DraftOrder {
  id: string;
  customerId: string;
  customerName: string;
  items: DraftOrderItem[];
  createdAt: string;
  updatedAt: string;
  deviceId: string;
  needsSync: boolean;
  serverUpdatedAt?: number;
  deleted?: boolean;
  deletionAttempts?: number;  // ✅ Nuovo campo
}

// unified-sync-service.ts - Limite tentativi
const MAX_DELETION_ATTEMPTS = 50; // ~12 minuti (15s * 50)

for (const tombstone of tombstones) {
  // ✅ Rimuovi tombstone se tentativi esauriti
  if ((tombstone.deletionAttempts || 0) >= MAX_DELETION_ATTEMPTS) {
    console.warn(
      `[UnifiedSync] Max deletion attempts reached for ${tombstone.id}, removing tombstone locally`,
    );
    await db.draftOrders.delete(tombstone.id);
    continue;
  }

  try {
    const response = await fetchWithRetry(
      `/api/sync/draft-orders/${tombstone.id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (response.ok || response.status === 404) {
      await db.draftOrders.delete(tombstone.id);
      console.log(`[UnifiedSync] ✅ Draft ${tombstone.id} deleted`);
    } else {
      // ✅ Incrementa counter tentativi
      await db.draftOrders.update(tombstone.id, {
        deletionAttempts: (tombstone.deletionAttempts || 0) + 1,
      });
      console.error(
        `[UnifiedSync] Failed to delete draft ${tombstone.id}: ${response.status} (attempt ${(tombstone.deletionAttempts || 0) + 1}/${MAX_DELETION_ATTEMPTS})`,
      );
    }
  } catch (deleteError) {
    // ✅ Incrementa counter anche su network error
    await db.draftOrders.update(tombstone.id, {
      deletionAttempts: (tombstone.deletionAttempts || 0) + 1,
    });
    console.error(
      `[UnifiedSync] Error deleting draft ${tombstone.id}:`,
      deleteError,
    );
  }
}
```

**Opzione C: Hybrid (Raccomandato)**

Combina entrambe le strategie:
1. Cleanup tombstones > 7 giorni (Opzione A)
2. Limite tentativi 100 per tombstones recenti (Opzione B con threshold più alto)

#### Test Plan

```typescript
describe("Tombstone cleanup", () => {
  test("should remove tombstones older than 7 days", async () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 8); // 8 giorni fa

    const recentTombstone = new Date();
    recentTombstone.setDate(recentTombstone.getDate() - 1); // 1 giorno fa

    // Arrange
    await db.draftOrders.add({
      id: "old-tombstone",
      customerId: "customer-A",
      customerName: "Customer A",
      items: [],
      createdAt: sevenDaysAgo.toISOString(),
      updatedAt: sevenDaysAgo.toISOString(),
      deviceId: "device-1",
      needsSync: true,
      deleted: true,
    });

    await db.draftOrders.add({
      id: "recent-tombstone",
      customerId: "customer-B",
      customerName: "Customer B",
      items: [],
      createdAt: recentTombstone.toISOString(),
      updatedAt: recentTombstone.toISOString(),
      deviceId: "device-1",
      needsSync: true,
      deleted: true,
    });

    // Act
    await unifiedSyncService.cleanupOldTombstones(7 * 24 * 60 * 60 * 1000);

    // Assert
    const oldExists = await db.draftOrders.get("old-tombstone");
    const recentExists = await db.draftOrders.get("recent-tombstone");

    expect(oldExists).toBeUndefined(); // Removed
    expect(recentExists).toBeDefined(); // Kept
  });

  test("should remove tombstone after max deletion attempts", async () => {
    // Arrange
    await db.draftOrders.add({
      id: "stubborn-tombstone",
      customerId: "customer-C",
      customerName: "Customer C",
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deviceId: "device-1",
      needsSync: true,
      deleted: true,
      deletionAttempts: 49, // Quasi al limite
    });

    // Mock fetch to fail
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });

    // Act - First sync (attempt 50)
    await unifiedSyncService.syncAll();

    // Assert - Should still exist
    let tombstone = await db.draftOrders.get("stubborn-tombstone");
    expect(tombstone).toBeDefined();
    expect(tombstone!.deletionAttempts).toBe(50);

    // Act - Second sync (attempt 51, exceeds limit)
    await unifiedSyncService.syncAll();

    // Assert - Should be removed
    tombstone = await db.draftOrders.get("stubborn-tombstone");
    expect(tombstone).toBeUndefined();
  });
});
```

---

### 🟢 BUG BASSO #4: handleDiscardDraft Potrebbe Non Avere draftId

**Severità**: BASSA 🟢
**Probabilità**: BASSA - Edge case
**Impatto Utente**: BASSO - Rare scenarios

#### Dettagli Tecnici

**File**: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`
**Linea**: 960-972

#### Codice Problematico

```typescript
// Linea 1847: Pulsante "Annulla" nel banner
<button onClick={handleDiscardDraft}>
  Annulla
</button>

// Linea 960: Handler
const handleDiscardDraft = async () => {
  // ❌ PROBLEMA: Early return se draftId è null/undefined
  if (!draftId) return;  // ← Silently does nothing!

  try {
    await orderService.deleteDraftOrder(draftId);
    setHasDraft(false);
    setDraftId(null);
    toastService.success("Bozza eliminata");
  } catch (error) {
    console.error("[OrderForm] Failed to discard draft:", error);
    toastService.error("Errore durante l'eliminazione della bozza");
  }
};
```

#### Perché Potrebbe Accadere

**Scenario A: State Inconsistency**

```typescript
// State del componente:
hasDraft: true   ← Banner visibile
draftId: null    ← Ma draftId è null!

// Come può accadere?
// 1. Race condition durante mount
// 2. Errore durante setDraftId
// 3. State reset parziale
```

**Scenario B: Multiple Drafts per Customer**

```typescript
// IndexedDB State:
[
  { id: "draft-1", customerId: "customer-A", deleted: false },
  { id: "draft-2", customerId: "customer-A", deleted: false },
]

// Component load:
const drafts = await orderService.getDraftOrders();
// drafts = [draft-1, draft-2]

const latestDraft = drafts[0]; // draft-1
setDraftId(latestDraft.id);   // ✅ OK

// Ma se poi draft-1 viene eliminata su altro device e synca:
// - draft-1 diventa tombstone
// - getDraftOrders() ritorna solo [draft-2]
// - Ma draftId è ancora "draft-1" (stale state)
// - handleDiscardDraft prova a eliminare draft-1 che non esiste più
```

#### Fix Proposto

```typescript
const handleDiscardDraft = async () => {
  // ✅ FIX: Se non c'è draftId ma c'è customer, elimina tutte le draft per customer
  if (!draftId) {
    console.warn("[OrderForm] No draftId, attempting fallback deletion");

    if (selectedCustomer) {
      try {
        await orderService.deleteAllDraftsForCustomer(selectedCustomer.id);
        setHasDraft(false);
        toastService.success("Bozza eliminata");

        // Trigger sync
        if (navigator.onLine) {
          await unifiedSyncService.syncAll();
        }
      } catch (error) {
        console.error("[OrderForm] Fallback draft deletion failed:", error);
        toastService.error("Errore durante l'eliminazione della bozza");
      }
    } else {
      // Nessun draftId e nessun customer → inconsistent state
      console.error("[OrderForm] Cannot discard draft: no draftId and no customer");
      toastService.error("Errore: impossibile eliminare la bozza");

      // Force reset banner
      setHasDraft(false);
    }
    return;
  }

  // Codice esistente
  try {
    await orderService.deleteDraftOrder(draftId);
    setHasDraft(false);
    setDraftId(null);
    toastService.success("Bozza eliminata");

    // Trigger sync
    if (navigator.onLine) {
      await unifiedSyncService.syncAll();
    }
  } catch (error) {
    console.error("[OrderForm] Failed to discard draft:", error);
    toastService.error("Errore durante l'eliminazione della bozza");
  }
};
```

#### Test Plan

```typescript
describe("handleDiscardDraft edge cases", () => {
  test("should fallback to deleteAllDraftsForCustomer when draftId is null", async () => {
    const mockCustomer = { id: "customer-A", name: "Test Customer" };
    const mockDeleteAllDrafts = vi.fn().mockResolvedValue(undefined);

    // Arrange
    orderService.deleteAllDraftsForCustomer = mockDeleteAllDrafts;
    render(<OrderFormSimple />);

    // State: hasDraft=true, draftId=null, selectedCustomer set
    setHasDraft(true);
    setDraftId(null);
    setSelectedCustomer(mockCustomer);

    // Act
    await handleDiscardDraft();

    // Assert
    expect(mockDeleteAllDrafts).toHaveBeenCalledWith(mockCustomer.id);
    expect(setHasDraft).toHaveBeenCalledWith(false);
  });

  test("should show error when draftId and customer are both null", async () => {
    const mockToastError = vi.fn();
    toastService.error = mockToastError;

    // Arrange
    render(<OrderFormSimple />);
    setHasDraft(true);
    setDraftId(null);
    setSelectedCustomer(null);

    // Act
    await handleDiscardDraft();

    // Assert
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining("impossibile eliminare"),
    );
    expect(setHasDraft).toHaveBeenCalledWith(false); // Force hide banner
  });
});
```

---

### 🟢 BUG BASSO #5: Auto-save Race Condition con Reset

**Severità**: BASSA 🟢
**Probabilità**: MOLTO BASSA - Teorica
**Impatto Utente**: MOLTO BASSO - Probabilmente non accade mai

#### Dettagli Tecnici

**File**: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`
**Linea**: 818-838 (auto-save), 975-1006 (reset)

#### Codice Potenzialmente Problematico

```typescript
// Auto-save effect
useEffect(() => {
  if (
    editingOrderId ||
    !selectedCustomer ||
    orderSavedSuccessfullyRef.current
  ) {
    return;
  }

  console.log("[OrderForm] Operation detected - auto-saving draft");

  // ⏱️ 2 secondi timeout
  const timeoutId = setTimeout(() => {
    saveDraft();  // ← Potrebbe salvare dopo reset?
  }, 2000);

  return () => clearTimeout(timeoutId);
}, [selectedCustomer, items, editingOrderId, saveDraft]);

// Reset handler
const handleResetForm = () => {
  // Reset state
  setSelectedCustomer(null);  // ← Cancella customer
  setItems([]);               // ← Cancella items
  setDraftId(null);
  setHasDraft(false);

  // ❌ NON cancella il timeout pending!
  // Se auto-save timeout è in corso, potrebbe scattare DOPO reset
};
```

#### Scenario Teorico (Molto Improbabile)

```
Timeline:
┌──────────────────────────────────────────────────────────┐
│ T=0.0s: User seleziona customer "Mario Rossi"            │
│   → useEffect triggers, timeout START (2s countdown)     │
│                                                           │
│ T=0.5s: User aggiunge item "Prodotto A"                  │
│   → useEffect triggers AGAIN, timeout RESET (2s)         │
│                                                           │
│ T=1.9s: User preme "Cancella bozza"                      │
│   → handleResetForm() esegue                             │
│   → setSelectedCustomer(null)                            │
│   → setItems([])                                         │
│   → Timeout ANCORA ATTIVO (0.6s rimanenti!)             │
│                                                           │
│ T=2.5s: Timeout scatta                                   │
│   → saveDraft() viene chiamato                           │
│   → Ma customer = null!                                  │
│   → Early return: if (!selectedCustomer) return          │
│   → ✅ SAFE: Non salva nulla                             │
│                                                           │
│ ✅ OK: Bug NON si manifesta grazie al check             │
└──────────────────────────────────────────────────────────┘
```

#### Perché NON È un Problema (Per Ora)

La funzione `saveDraft` ha già una protezione:

```typescript
const saveDraft = useCallback(async () => {
  // Prevent concurrent saves
  if (savingDraftRef.current) {
    console.log("[OrderForm] Draft save already in progress, skipping");
    return;
  }

  // ✅ PROTEZIONE: Non salva se customer è null
  if (!selectedCustomer) {
    console.log("[OrderForm] No customer selected, skipping draft save");
    return;
  }

  // Safe to save
  savingDraftRef.current = true;
  try {
    // ... save logic
  } finally {
    savingDraftRef.current = false;
  }
}, [selectedCustomer, items, draftId]);
```

Il check `if (!selectedCustomer) return;` previene il bug.

#### Scenario Alternativo (Ancora Meno Probabile)

```
Timeline - "Perfect Storm":
┌──────────────────────────────────────────────────────────┐
│ T=0s: User seleziona customer + aggiunge items            │
│   → Auto-save timeout START (2s)                         │
│                                                           │
│ T=1.8s: User preme "Cancella bozza" VELOCEMENTE          │
│   → handleResetForm() chiama setSelectedCustomer(null)   │
│   → ⚠️ MA state update è asincrono!                      │
│   → selectedCustomer potrebbe essere ancora set          │
│                                                           │
│ T=2.0s: Timeout scatta                                   │
│   → saveDraft() legge selectedCustomer                   │
│   → ❓ selectedCustomer è null o ancora set?            │
│   → Dipende da React render cycle timing                │
│                                                           │
│ Se selectedCustomer ancora set:                          │
│   → ❌ Draft viene salvata di nuovo!                     │
│   → ❌ User pensa di aver cancellato, ma riappare        │
└──────────────────────────────────────────────────────────┘
```

**Probabilità**: < 0.01% - Richiede timing perfetto (< 200ms window)

#### Fix Proposto (Defensive)

```typescript
const handleResetForm = async () => {
  // 1. PRIMA: Elimina draft dal database se esiste
  if (draftId) {
    try {
      await orderService.deleteDraftOrder(draftId);

      if (navigator.onLine) {
        await unifiedSyncService.syncAll();
      }
    } catch (error) {
      console.error("[OrderForm] Failed to delete draft:", error);
      toastService.error("Errore durante l'eliminazione della bozza");
      return;
    }
  } else if (selectedCustomer) {
    try {
      await orderService.deleteAllDraftsForCustomer(selectedCustomer.id);
    } catch (error) {
      console.error("[OrderForm] Failed to delete customer drafts:", error);
    }
  }

  // ✅ FIX: Imposta flag PRIMA di resettare state
  // Questo previene auto-save race condition
  orderSavedSuccessfullyRef.current = true;

  // 2. POI: Reset UI state
  setCustomerSearch("");
  setCustomerResults([]);
  setSelectedCustomer(null);
  setSearchingCustomer(false);

  setProductSearch("");
  setProductResults([]);
  setSelectedProduct(null);
  setSearchingProduct(false);
  setHighlightedProductIndex(-1);
  setQuantity("");
  setItemDiscount("");
  setPackagingPreview(null);
  setCalculatingPackaging(false);
  setWarehouseSelection([]);
  setProductVariants([]);

  setItems([]);
  setGlobalDiscountPercent("");
  setTargetTotal("");

  setHasDraft(false);
  setDraftId(null);
  setLastAutoSave(null);

  // ✅ FIX: Reset flag dopo breve delay
  setTimeout(() => {
    orderSavedSuccessfullyRef.current = false;
  }, 100);

  toastService.success("Bozza eliminata e ordine resettato");
};
```

**Come funziona**:
1. `orderSavedSuccessfullyRef.current = true` PRIMA del reset
2. Auto-save check: `if (orderSavedSuccessfullyRef.current) return;`
3. Reset dopo 100ms (tempo sufficiente per auto-save timeout cleanup)

#### Test Plan

```typescript
describe("Auto-save race condition", () => {
  test("should NOT auto-save after handleResetForm", async () => {
    vi.useFakeTimers();
    const mockSaveDraft = vi.fn();

    // Arrange
    render(<OrderFormSimple />);
    orderService.saveDraftOrder = mockSaveDraft;

    setSelectedCustomer({ id: "customer-A", name: "Test Customer" });
    setItems([{ productId: "product-1", quantity: 10 }]);

    // Wait 1.8s (auto-save timeout is 2s)
    vi.advanceTimersByTime(1800);

    // Act: Reset form before auto-save timeout
    await handleResetForm();

    // Advance remaining time to trigger auto-save timeout
    vi.advanceTimersByTime(300);

    // Assert: Draft should NOT be saved
    expect(mockSaveDraft).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
```

---

## ✅ COSA FUNZIONA CORRETTAMENTE

### 1. Backend Cascade Deletion ✅

**File**: `archibald-web-app/backend/src/routes/sync-routes.ts:194-227`

Quando un pending order viene creato con `originDraftId`, il backend elimina automaticamente la draft associata:

```typescript
// ✅ FUNZIONA BENE
if (order.originDraftId) {
  try {
    const draftDeleted = ordersDb
      .prepare("DELETE FROM draft_orders WHERE id = ? AND user_id = ?")
      .run(order.originDraftId, userId);

    if (draftDeleted.changes > 0) {
      logger.info("Auto-deleted draft after pending creation (cascade)", {
        draftId: order.originDraftId,
        pendingId: order.id,
        userId,
      });
    }
  } catch (draftDeleteError) {
    logger.warn("Failed to auto-delete draft (cascade)", {
      draftId: order.originDraftId,
      pendingId: order.id,
      error: draftDeleteError,
    });
  }
}
```

**Test**: ✅ Verified to work correctly

### 2. Tombstone Deletion Strategy ✅

Il sistema usa tombstones invece di delete immediate:

```typescript
// ✅ DESIGN CORRETTO
async deleteDraftOrder(id: string): Promise<void> {
  await this.db.table<DraftOrder, string>("draftOrders").update(id, {
    deleted: true,       // Marca come deleted
    needsSync: true,     // Push to server
    updatedAt: new Date().toISOString(),
  });

  // Non elimina immediatamente da IndexedDB
  // Sync service gestisce la rimozione dopo server DELETE
}
```

**Perché è corretto**:
- Previene race conditions
- Garantisce sincronizzazione multi-device
- Tombstones vengono rimossi dopo successful server DELETE

### 3. Multi-device Conflict Resolution ✅

Last-Write-Wins basato su `updatedAt`:

```typescript
// ✅ LWW FUNZIONA BENE
if (!localDraft || serverDraft.updatedAt > (localDraft.updatedAt || 0)) {
  // Server is newer → update local
  await db.draftOrders.put({...serverDraft});
}
```

**Test**: ✅ Prevents conflicts between devices

### 4. Auto-save Protection ✅

Ref invece di state per prevenire unmount race condition:

```typescript
// ✅ OTTIMO FIX
const orderSavedSuccessfullyRef = useRef(false);

// Prima di navigate
orderSavedSuccessfullyRef.current = true;
navigate("/pending-orders");

// Auto-save check
if (orderSavedSuccessfullyRef.current) {
  return; // Don't save after successful submission
}
```

---

## 📊 RIEPILOGO PRIORITÀ

| Bug | Severità | Probabilità | Priorità Fix |
|-----|----------|-------------|--------------|
| #1: Pulsante "Cancella bozza" non elimina | 🔴 CRITICA | 100% | **P0 - Immediate** |
| #2: deleteAllDraftsForCustomer processa tombstones | 🟠 MEDIA | 80% | **P1 - High** |
| #3: Tombstones accumulation | 🟠 MEDIA | 30% | **P2 - Medium** |
| #4: handleDiscardDraft missing draftId | 🟢 BASSA | 5% | **P3 - Low** |
| #5: Auto-save race condition | 🟢 BASSA | <1% | **P4 - Optional** |

---

## 🎯 IMPATTO UTENTE

### Comportamento Attuale (Con Bug)

```
User Journey - Eliminazione Draft:
┌──────────────────────────────────────────────────────────┐
│ 1. Utente crea draft "Ordine Mario Rossi"                │
│    ✅ Draft salvata in IndexedDB                         │
│                                                           │
│ 2. Utente preme "🗑️ Cancella bozza"                     │
│    ✅ UI si resetta                                      │
│    ✅ Banner scompare                                    │
│    ✅ Form vuoto                                         │
│    ❌ Draft NON eliminata da IndexedDB                   │
│    💭 Utente pensa: "Bozza eliminata!"                   │
│                                                           │
│ 3. Utente naviga via (es. "Ordini in Attesa")            │
│    ✅ Form unmount                                       │
│    ✅ Draft ancora in IndexedDB                          │
│                                                           │
│ 4. Utente torna a "Nuovo Ordine"                         │
│    ✅ Component mount                                    │
│    ✅ useEffect check for drafts                         │
│    ✅ Draft trovata in IndexedDB                         │
│    ❌ Banner "Bozza ordine disponibile" RIAPPARE!        │
│    😡 Utente: "Ma l'avevo cancellata!"                   │
│                                                           │
│ 5. Utente preme "Annulla" sul banner                     │
│    ✅ handleDiscardDraft chiamato                        │
│    ✅ orderService.deleteDraftOrder (tombstone)          │
│    ✅ Draft marcata deleted: true                        │
│    ✅ UI si resetta                                      │
│    ⏳ Sync in background...                              │
│    ✅ Draft eliminata da server                          │
│    ✅ Tombstone rimosso da IndexedDB                     │
│    ✅ Draft effettivamente eliminata                     │
│                                                           │
│ 6. Utente torna di nuovo a "Nuovo Ordine"                │
│    ✅ Nessuna draft trovata                              │
│    ✅ Form pulito                                        │
│    😊 Utente: "Finalmente!"                              │
└──────────────────────────────────────────────────────────┘

Risultato:
- ❌ Utente deve eliminare la draft DUE VOLTE
- ❌ Esperienza confusa e frustrante
- ❌ Loss of trust: "Ma funziona questo sistema?"
```

### Comportamento Atteso (Dopo Fix)

```
User Journey - Eliminazione Draft (FIXED):
┌──────────────────────────────────────────────────────────┐
│ 1. Utente crea draft "Ordine Mario Rossi"                │
│    ✅ Draft salvata in IndexedDB                         │
│                                                           │
│ 2. Utente preme "🗑️ Cancella bozza"                     │
│    ✅ orderService.deleteDraftOrder chiamato             │
│    ✅ Draft marcata deleted: true (tombstone)            │
│    ✅ Sync triggered                                     │
│    ✅ Draft eliminata da server                          │
│    ✅ Tombstone rimosso da IndexedDB                     │
│    ✅ UI si resetta                                      │
│    ✅ Toast: "Bozza eliminata e ordine resettato"        │
│    😊 Utente: "Perfetto!"                                │
│                                                           │
│ 3. Utente torna a "Nuovo Ordine"                         │
│    ✅ Nessuna draft trovata                              │
│    ✅ Form pulito                                        │
│    ✅ Nessun banner                                      │
│    😊 Utente: "Funziona bene!"                           │
└──────────────────────────────────────────────────────────┘

Risultato:
- ✅ Utente elimina la draft UNA SOLA VOLTA
- ✅ Comportamento prevedibile e affidabile
- ✅ Trust nel sistema
```

---

## 🛠️ PROSSIMI PASSI

1. **Implementare Fix per Bug #1** (P0 - Immediate)
   - Modificare `handleResetForm` per chiamare `deleteDraftOrder`
   - Aggiungere await + sync
   - Scrivere test

2. **Implementare Fix per Bug #2** (P1 - High)
   - Filtrare tombstones in `deleteAllDraftsForCustomer`
   - Scrivere test

3. **Implementare Fix per Bug #3** (P2 - Medium)
   - Aggiungere cleanup tombstones vecchi
   - Scrivere test

4. **Implementare Fix per Bug #4** (P3 - Low)
   - Aggiungere fallback in `handleDiscardDraft`
   - Scrivere test

5. **Testing End-to-End**
   - Scenario: Create draft → Delete → Refresh → Verify gone
   - Scenario: Create draft → Convert to pending → Verify gone
   - Scenario: Multi-device sync

6. **Documentation Update**
   - Aggiornare MEMORY.md con lessons learned
   - Documentare draft lifecycle

---

**Fine Analisi** 📝
