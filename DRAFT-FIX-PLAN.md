# 🎯 PIANO DI FIX: Sistema Eliminazione Draft Orders

**Data**: 2026-02-05
**Obiettivo**: Semplificare e correggere il sistema di eliminazione delle draft orders
**Riferimento**: DRAFT-DELETION-ANALYSIS.md

---

## 📋 EXECUTIVE SUMMARY

Questo documento descrive il piano completo per risolvere i 5 bug identificati nel sistema di gestione delle draft orders. I fix sono organizzati per priorità e include modifiche ai file, test da scrivere e verifiche di regressione.

**Tempo Stimato**: N/A (per policy - no time estimates)
**Complessità**: Media
**Risk Level**: Basso (modifiche isolate con test coverage)

---

## 🎯 OBIETTIVI DEL PROGETTO

### Obiettivi Primari

1. ✅ Eliminare definitivamente le draft quando l'utente preme "Cancella bozza"
2. ✅ Eliminare draft quando vengono convertite in pending orders
3. ✅ Eliminare draft quando l'utente preme "Annulla" sul banner
4. ✅ Garantire che draft eliminate non riappaiano mai

### Obiettivi Secondari

1. ✅ Ottimizzare performance eliminando operazioni inutili su tombstones
2. ✅ Implementare cleanup automatico di tombstones vecchi
3. ✅ Gestire edge cases (draftId null, offline, sync failures)
4. ✅ Migliorare robustezza del sistema

### Non-Obiettivi

- ❌ Riscrivere completamente il sistema draft (manteniamo architettura esistente)
- ❌ Modificare il database schema (evitiamo migrazioni se possibile)
- ❌ Cambiare UI/UX (solo fix funzionali)

---

## 🔧 FIX DETTAGLIATI

## FIX #1: Pulsante "Cancella bozza" Elimina Effettivamente la Draft

**Priorità**: P0 - IMMEDIATE 🔴
**File**: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`
**Linee da Modificare**: 975-1006 (handleResetForm)

### Modifica Codice

**PRIMA** (linea 975-1006):

```typescript
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

  // Reset draft state
  setHasDraft(false);
  setDraftId(null);
  setLastAutoSave(null);

  toastService.success("Ordine resettato");
};
```

**DOPO**:

```typescript
const handleResetForm = async () => {
  // 🔧 FIX #1: Delete draft from database BEFORE resetting UI
  let draftDeleted = false;

  if (draftId) {
    // Primary path: Delete by draftId
    try {
      console.log("[OrderForm] Deleting draft by ID:", draftId);
      await orderService.deleteDraftOrder(draftId);
      draftDeleted = true;

      // Trigger immediate sync to delete from server
      if (navigator.onLine) {
        try {
          await unifiedSyncService.syncAll();
          console.log("[OrderForm] ✅ Draft deletion synced to server");
        } catch (syncError) {
          console.warn(
            "[OrderForm] ⚠️ Sync failed after draft deletion:",
            syncError,
          );
          // Non-blocking - sync will retry later
        }
      }
    } catch (error) {
      console.error("[OrderForm] Failed to delete draft:", error);
      toastService.error("Errore durante l'eliminazione della bozza");
      return; // Don't reset form if deletion fails
    }
  } else if (selectedCustomer) {
    // Fallback path: Delete all drafts for customer
    try {
      console.log(
        "[OrderForm] No draftId, deleting all drafts for customer:",
        selectedCustomer.id,
      );
      await orderService.deleteAllDraftsForCustomer(selectedCustomer.id);
      draftDeleted = true;

      if (navigator.onLine) {
        try {
          await unifiedSyncService.syncAll();
        } catch (syncError) {
          console.warn(
            "[OrderForm] ⚠️ Sync failed after customer drafts deletion:",
            syncError,
          );
        }
      }
    } catch (error) {
      console.error("[OrderForm] Failed to delete customer drafts:", error);
      // Non-critical - continue with form reset
    }
  }

  // 🔧 FIX #5: Set flag to prevent auto-save race condition
  orderSavedSuccessfullyRef.current = true;

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

  // Reset draft state
  setHasDraft(false);
  setDraftId(null);
  setLastAutoSave(null);

  // Reset flag after brief delay
  setTimeout(() => {
    orderSavedSuccessfullyRef.current = false;
  }, 100);

  // Show appropriate toast message
  if (draftDeleted) {
    toastService.success("Bozza eliminata e ordine resettato");
  } else {
    toastService.success("Ordine resettato");
  }
};
```

### Test da Aggiungere

**File**: `archibald-web-app/frontend/src/components/OrderFormSimple.spec.tsx` (nuovo file)

```typescript
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import OrderFormSimple from "./OrderFormSimple";
import { orderService } from "../services/orders.service";
import { unifiedSyncService } from "../services/unified-sync-service";
import { toastService } from "../services/toast.service";

describe("OrderFormSimple - Draft Deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("handleResetForm", () => {
    test("should delete draft by ID when draftId exists", async () => {
      // Arrange
      const mockDraftId = "draft-123";
      const mockDeleteDraftOrder = vi
        .fn()
        .mockResolvedValue(undefined);
      const mockSyncAll = vi.fn().mockResolvedValue(undefined);

      orderService.deleteDraftOrder = mockDeleteDraftOrder;
      unifiedSyncService.syncAll = mockSyncAll;

      const { getByText } = render(<OrderFormSimple />);

      // Set draft state (via internal component state)
      // Note: In real test, you'd need to populate form first
      // This is a simplified example

      // Act
      const resetButton = getByText("🗑️ Cancella bozza");
      fireEvent.click(resetButton);

      // Wait for async operations
      await waitFor(() => {
        expect(mockDeleteDraftOrder).toHaveBeenCalledWith(mockDraftId);
      });

      // Assert
      expect(mockSyncAll).toHaveBeenCalled();
      expect(mockDeleteDraftOrder).toHaveBeenCalledTimes(1);
    });

    test("should fallback to deleteAllDraftsForCustomer when draftId is null", async () => {
      // Arrange
      const mockCustomerId = "customer-123";
      const mockDeleteAllDrafts = vi
        .fn()
        .mockResolvedValue(undefined);

      orderService.deleteAllDraftsForCustomer = mockDeleteAllDrafts;

      const { getByText } = render(<OrderFormSimple />);

      // Set customer but no draftId
      // (simulate state where draftId is null but customer selected)

      // Act
      const resetButton = getByText("🗑️ Cancella bozza");
      fireEvent.click(resetButton);

      // Wait for async operations
      await waitFor(() => {
        expect(mockDeleteAllDrafts).toHaveBeenCalledWith(mockCustomerId);
      });

      // Assert
      expect(mockDeleteAllDrafts).toHaveBeenCalledTimes(1);
    });

    test("should not reset form if draft deletion fails", async () => {
      // Arrange
      const mockDraftId = "draft-123";
      const mockDeleteDraftOrder = vi
        .fn()
        .mockRejectedValue(new Error("Delete failed"));
      const mockToastError = vi.fn();

      orderService.deleteDraftOrder = mockDeleteDraftOrder;
      toastService.error = mockToastError;

      const { getByText } = render(<OrderFormSimple />);

      // Act
      const resetButton = getByText("🗑️ Cancella bozza");
      fireEvent.click(resetButton);

      // Wait for error handling
      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith(
          expect.stringContaining("Errore durante l'eliminazione"),
        );
      });

      // Assert - Form should NOT be reset
      // (verify by checking state - implementation depends on your test setup)
    });

    test("should prevent auto-save race condition", async () => {
      vi.useFakeTimers();

      // Arrange
      const mockDraftId = "draft-123";
      const mockDeleteDraftOrder = vi
        .fn()
        .mockResolvedValue(undefined);
      const mockSaveDraft = vi.fn();

      orderService.deleteDraftOrder = mockDeleteDraftOrder;
      orderService.saveDraftOrder = mockSaveDraft;

      const { getByText } = render(<OrderFormSimple />);

      // Simulate form with data (auto-save pending)
      // ... set customer and items ...

      // Act: Reset form before auto-save timeout (2s)
      vi.advanceTimersByTime(1800); // 1.8s
      const resetButton = getByText("🗑️ Cancella bozza");
      fireEvent.click(resetButton);

      // Advance time to trigger auto-save timeout
      vi.advanceTimersByTime(300); // 0.3s more = 2.1s total

      // Wait for all operations
      await waitFor(() => {
        expect(mockDeleteDraftOrder).toHaveBeenCalled();
      });

      // Assert: saveDraft should NOT have been called
      expect(mockSaveDraft).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
```

### Verifiche di Regressione

1. **Scenario: Delete draft con draftId**
   - Crea draft → Preme "Cancella bozza" → Refresh page → Verifica nessun banner

2. **Scenario: Delete draft senza draftId**
   - Crea draft manualmente in IndexedDB senza impostare draftId state → Preme "Cancella bozza" → Verifica eliminata

3. **Scenario: Delete draft offline**
   - Crea draft → Vai offline → Preme "Cancella bozza" → Torna online → Verifica sincronizzata

4. **Scenario: Auto-save race**
   - Popola form → Aspetta 1.9s → Preme "Cancella bozza" → Verifica nessuna draft salvata

---

## FIX #2: Filtra Tombstones in deleteAllDraftsForCustomer

**Priorità**: P1 - HIGH 🟠
**File**: `archibald-web-app/frontend/src/services/orders.service.ts`
**Linee da Modificare**: 132-149

### Modifica Codice

**PRIMA** (linea 132-149):

```typescript
async deleteAllDraftsForCustomer(customerId: string): Promise<void> {
  try {
    const drafts = await this.db
      .table<DraftOrder, string>("draftOrders")
      .where("customerId")
      .equals(customerId)
      .toArray();

    console.log(
      `[OrderService] Deleting all ${drafts.length} drafts for customer ${customerId}`,
    );

    // Delete each draft
    for (const draft of drafts) {
      await this.deleteDraftOrder(draft.id);
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

**DOPO**:

```typescript
async deleteAllDraftsForCustomer(customerId: string): Promise<void> {
  try {
    const allDrafts = await this.db
      .table<DraftOrder, string>("draftOrders")
      .where("customerId")
      .equals(customerId)
      .toArray();

    // 🔧 FIX #2: Filter out tombstones (already deleted drafts)
    // Only delete active drafts, skip tombstones to avoid unnecessary updates
    const activeDrafts = allDrafts.filter((draft) => !draft.deleted);

    if (activeDrafts.length === 0) {
      console.log(
        `[OrderService] No active drafts to delete for customer ${customerId}` +
          (allDrafts.length > 0
            ? ` (found ${allDrafts.length} tombstones, skipping)`
            : ""),
      );
      return;
    }

    console.log(
      `[OrderService] Deleting ${activeDrafts.length} active drafts for customer ${customerId}` +
        (allDrafts.length - activeDrafts.length > 0
          ? ` (found ${allDrafts.length - activeDrafts.length} tombstones, skipping)`
          : ""),
    );

    // Delete only active drafts
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

### Test da Aggiungere

**File**: `archibald-web-app/frontend/src/services/orders.service.spec.ts` (già esiste)

```typescript
describe("deleteAllDraftsForCustomer", () => {
  test("should only delete active drafts, not tombstones", async () => {
    const customerId = "customer-A";

    // Arrange: Create 2 active drafts
    const draft1Id = await orderService.saveDraftOrder({
      customerId,
      customerName: "Customer A",
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const draft2Id = await orderService.saveDraftOrder({
      customerId,
      customerName: "Customer A",
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Create 2 tombstones manually
    await db.draftOrders.add({
      id: "tombstone-1",
      customerId,
      customerName: "Customer A",
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date(Date.now() - 1000).toISOString(), // 1s ago
      deviceId: getDeviceId(),
      needsSync: true,
      deleted: true,
    });

    await db.draftOrders.add({
      id: "tombstone-2",
      customerId,
      customerName: "Customer A",
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date(Date.now() - 2000).toISOString(), // 2s ago
      deviceId: getDeviceId(),
      needsSync: false,
      deleted: true,
    });

    // Store original updatedAt for tombstones
    const tombstone1Before = await db.draftOrders.get("tombstone-1");
    const tombstone2Before = await db.draftOrders.get("tombstone-2");

    // Act
    await orderService.deleteAllDraftsForCustomer(customerId);

    // Assert
    const allDrafts = await db.draftOrders
      .where("customerId")
      .equals(customerId)
      .toArray();

    const activeDrafts = allDrafts.filter((d) => !d.deleted);
    const tombstones = allDrafts.filter((d) => d.deleted);

    // Active drafts should be marked as deleted
    expect(activeDrafts).toHaveLength(0);

    // Tombstones should still exist
    expect(tombstones).toHaveLength(4); // 2 original + 2 newly deleted

    // Original tombstones should NOT have been modified
    const tombstone1After = await db.draftOrders.get("tombstone-1");
    const tombstone2After = await db.draftOrders.get("tombstone-2");

    expect(tombstone1After!.updatedAt).toBe(tombstone1Before!.updatedAt);
    expect(tombstone2After!.updatedAt).toBe(tombstone2Before!.updatedAt);
    expect(tombstone1After!.needsSync).toBe(tombstone1Before!.needsSync);
    expect(tombstone2After!.needsSync).toBe(tombstone2Before!.needsSync);
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
      deviceId: getDeviceId(),
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
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("found 1 tombstones, skipping"),
    );
  });

  test("should handle customer with no drafts at all", async () => {
    const customerId = "customer-C";

    // Act
    const consoleSpy = vi.spyOn(console, "log");
    await orderService.deleteAllDraftsForCustomer(customerId);

    // Assert
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("No active drafts to delete for customer customer-C"),
    );
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("tombstones"),
    );
  });
});
```

### Verifiche di Regressione

1. **Scenario: Delete con tombstones esistenti**
   - Crea 2 draft → Elimina 1 (crea tombstone) → Crea pending order → Verifica solo 1 active draft eliminata

2. **Scenario: Performance con molti tombstones**
   - Crea 100 tombstones manuali → Crea 1 active draft → Delete customer → Verifica tempo <100ms

---

## FIX #3: Cleanup Tombstones Vecchi

**Priorità**: P2 - MEDIUM 🟠
**File**: `archibald-web-app/frontend/src/services/unified-sync-service.ts`
**Linee da Aggiungere**: Dopo linea 538 (nuovo metodo)

### Modifica Codice

**NUOVO METODO** (aggiungere dopo `pushDraftOrders`):

```typescript
/**
 * Clean up tombstones older than maxAgeMs to prevent database bloat
 * Default: 7 days (604800000ms)
 *
 * Rationale:
 * - Tombstones are deleted records waiting for server sync
 * - If sync fails repeatedly (offline, server error), tombstones accumulate
 * - After 7 days, it's safe to assume sync won't succeed or isn't needed
 * - Removes tombstones locally to free up space
 *
 * @param maxAgeMs - Maximum age in milliseconds (default: 7 days)
 */
private async cleanupOldTombstones(
  maxAgeMs: number = 7 * 24 * 60 * 60 * 1000,
): Promise<void> {
  try {
    const now = new Date().getTime();
    const cutoffDate = new Date(now - maxAgeMs).toISOString();

    // Find tombstones older than cutoff
    const oldTombstones = await db.draftOrders
      .filter((draft) => {
        return draft.deleted === true && draft.updatedAt < cutoffDate;
      })
      .toArray();

    if (oldTombstones.length === 0) {
      return; // No cleanup needed
    }

    console.log(
      `[UnifiedSync] 🧹 Cleaning up ${oldTombstones.length} tombstones older than ${maxAgeMs}ms (${Math.floor(maxAgeMs / (24 * 60 * 60 * 1000))} days)`,
    );

    for (const tombstone of oldTombstones) {
      const age = now - new Date(tombstone.updatedAt).getTime();
      await db.draftOrders.delete(tombstone.id);
      console.log(
        `[UnifiedSync] 🗑️ Removed old tombstone ${tombstone.id} (age: ${Math.floor(age / (24 * 60 * 60 * 1000))} days)`,
      );
    }

    console.log(
      `[UnifiedSync] ✅ Tombstone cleanup completed (${oldTombstones.length} removed)`,
    );
  } catch (error) {
    console.error("[UnifiedSync] Tombstone cleanup failed:", error);
    // Non-critical - don't throw
  }
}
```

**MODIFICA ESISTENTE** (linea ~345):

```typescript
private async syncDraftOrders(): Promise<void> {
  await this.pushDraftOrders();
  await this.pullDraftOrders();

  // 🔧 FIX #3: Cleanup old tombstones after sync
  // Run after push/pull to ensure we don't delete tombstones that are being synced
  await this.cleanupOldTombstones();
}
```

### Test da Aggiungere

**File**: `archibald-web-app/frontend/src/services/unified-sync-service.spec.ts` (nuovo file)

```typescript
import { describe, test, expect, vi, beforeEach } from "vitest";
import { UnifiedSyncService } from "./unified-sync-service";
import { db } from "../db/schema";
import { getDeviceId } from "../utils/device-id";

describe("UnifiedSyncService - Tombstone Cleanup", () => {
  let syncService: UnifiedSyncService;

  beforeEach(async () => {
    // Clear database
    await db.draftOrders.clear();
    syncService = new UnifiedSyncService();
  });

  describe("cleanupOldTombstones", () => {
    test("should remove tombstones older than 7 days", async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 8);

      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 1);

      // Arrange
      await db.draftOrders.add({
        id: "old-tombstone",
        customerId: "customer-A",
        customerName: "Customer A",
        items: [],
        createdAt: sevenDaysAgo.toISOString(),
        updatedAt: sevenDaysAgo.toISOString(),
        deviceId: getDeviceId(),
        needsSync: true,
        deleted: true,
      });

      await db.draftOrders.add({
        id: "recent-tombstone",
        customerId: "customer-B",
        customerName: "Customer B",
        items: [],
        createdAt: recentDate.toISOString(),
        updatedAt: recentDate.toISOString(),
        deviceId: getDeviceId(),
        needsSync: true,
        deleted: true,
      });

      // Act
      await (syncService as any).cleanupOldTombstones(
        7 * 24 * 60 * 60 * 1000,
      );

      // Assert
      const oldExists = await db.draftOrders.get("old-tombstone");
      const recentExists = await db.draftOrders.get("recent-tombstone");

      expect(oldExists).toBeUndefined(); // Removed
      expect(recentExists).toBeDefined(); // Kept
    });

    test("should not remove active drafts", async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 30); // 30 days ago

      // Arrange
      await db.draftOrders.add({
        id: "old-active-draft",
        customerId: "customer-C",
        customerName: "Customer C",
        items: [],
        createdAt: oldDate.toISOString(),
        updatedAt: oldDate.toISOString(),
        deviceId: getDeviceId(),
        needsSync: false,
        deleted: false, // Active, not deleted
      });

      await db.draftOrders.add({
        id: "old-tombstone",
        customerId: "customer-D",
        customerName: "Customer D",
        items: [],
        createdAt: oldDate.toISOString(),
        updatedAt: oldDate.toISOString(),
        deviceId: getDeviceId(),
        needsSync: true,
        deleted: true, // Tombstone
      });

      // Act
      await (syncService as any).cleanupOldTombstones(
        7 * 24 * 60 * 60 * 1000,
      );

      // Assert
      const activeDraft = await db.draftOrders.get("old-active-draft");
      const tombstone = await db.draftOrders.get("old-tombstone");

      expect(activeDraft).toBeDefined(); // Active draft kept
      expect(tombstone).toBeUndefined(); // Tombstone removed
    });

    test("should handle custom maxAge parameter", async () => {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 3);

      // Arrange
      await db.draftOrders.add({
        id: "two-day-old-tombstone",
        customerId: "customer-E",
        customerName: "Customer E",
        items: [],
        createdAt: twoDaysAgo.toISOString(),
        updatedAt: twoDaysAgo.toISOString(),
        deviceId: getDeviceId(),
        needsSync: true,
        deleted: true,
      });

      // Act - Cleanup tombstones older than 2 days
      await (syncService as any).cleanupOldTombstones(
        2 * 24 * 60 * 60 * 1000,
      );

      // Assert
      const tombstone = await db.draftOrders.get("two-day-old-tombstone");
      expect(tombstone).toBeUndefined(); // Removed
    });

    test("should handle empty database", async () => {
      // Act & Assert - Should not throw
      await expect(
        (syncService as any).cleanupOldTombstones(),
      ).resolves.toBeUndefined();
    });

    test("should log cleanup activity", async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);

      // Arrange
      await db.draftOrders.add({
        id: "tombstone-to-log",
        customerId: "customer-F",
        customerName: "Customer F",
        items: [],
        createdAt: oldDate.toISOString(),
        updatedAt: oldDate.toISOString(),
        deviceId: getDeviceId(),
        needsSync: true,
        deleted: true,
      });

      // Act
      const consoleSpy = vi.spyOn(console, "log");
      await (syncService as any).cleanupOldTombstones(
        7 * 24 * 60 * 60 * 1000,
      );

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("🧹 Cleaning up 1 tombstones"),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("🗑️ Removed old tombstone tombstone-to-log"),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("✅ Tombstone cleanup completed (1 removed)"),
      );
    });
  });
});
```

### Verifiche di Regressione

1. **Scenario: Cleanup dopo 7 giorni**
   - Crea tombstone → Modifica updatedAt a 8 giorni fa manualmente → Sync → Verifica tombstone rimosso

2. **Scenario: Keep recent tombstones**
   - Crea tombstone → Sync → Verifica tombstone ancora presente

3. **Scenario: Don't delete active drafts**
   - Crea active draft con updatedAt vecchio → Sync → Verifica draft ancora presente

---

## FIX #4: Fallback in handleDiscardDraft

**Priorità**: P3 - LOW 🟢
**File**: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`
**Linee da Modificare**: 960-972

### Modifica Codice

**PRIMA** (linea 960-972):

```typescript
const handleDiscardDraft = async () => {
  if (!draftId) return;

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

**DOPO**:

```typescript
const handleDiscardDraft = async () => {
  // 🔧 FIX #4: Fallback if draftId is missing
  if (!draftId) {
    console.warn(
      "[OrderForm] No draftId, attempting fallback deletion by customer",
    );

    if (selectedCustomer) {
      // Fallback: Delete all drafts for customer
      try {
        await orderService.deleteAllDraftsForCustomer(selectedCustomer.id);
        setHasDraft(false);
        toastService.success("Bozza eliminata");

        // Trigger sync
        if (navigator.onLine) {
          try {
            await unifiedSyncService.syncAll();
          } catch (syncError) {
            console.warn(
              "[OrderForm] ⚠️ Sync failed after fallback deletion:",
              syncError,
            );
          }
        }
      } catch (error) {
        console.error(
          "[OrderForm] Fallback draft deletion failed:",
          error,
        );
        toastService.error("Errore durante l'eliminazione della bozza");
      }
    } else {
      // No draftId and no customer - inconsistent state
      console.error(
        "[OrderForm] Cannot discard draft: no draftId and no customer",
      );
      toastService.error("Errore: impossibile eliminare la bozza");

      // Force hide banner to prevent UI inconsistency
      setHasDraft(false);
    }
    return;
  }

  // Primary path: Delete by draftId
  try {
    await orderService.deleteDraftOrder(draftId);
    setHasDraft(false);
    setDraftId(null);
    toastService.success("Bozza eliminata");

    // Trigger sync
    if (navigator.onLine) {
      try {
        await unifiedSyncService.syncAll();
      } catch (syncError) {
        console.warn(
          "[OrderForm] ⚠️ Sync failed after discard:",
          syncError,
        );
      }
    }
  } catch (error) {
    console.error("[OrderForm] Failed to discard draft:", error);
    toastService.error("Errore durante l'eliminazione della bozza");
  }
};
```

### Test da Aggiungere

**File**: `archibald-web-app/frontend/src/components/OrderFormSimple.spec.tsx`

```typescript
describe("handleDiscardDraft edge cases", () => {
  test("should fallback to deleteAllDraftsForCustomer when draftId is null", async () => {
    const mockCustomer = { id: "customer-A", name: "Test Customer" };
    const mockDeleteAllDrafts = vi.fn().mockResolvedValue(undefined);

    // Arrange
    orderService.deleteAllDraftsForCustomer = mockDeleteAllDrafts;

    const { getByText } = render(<OrderFormSimple />);

    // Simulate state: hasDraft=true, draftId=null, customer selected
    // (implementation depends on how you set component state in tests)

    // Act
    const discardButton = getByText("Annulla");
    fireEvent.click(discardButton);

    // Wait for async operations
    await waitFor(() => {
      expect(mockDeleteAllDrafts).toHaveBeenCalledWith(mockCustomer.id);
    });

    // Assert
    expect(mockDeleteAllDrafts).toHaveBeenCalledTimes(1);
  });

  test("should show error and hide banner when draftId and customer are both null", async () => {
    const mockToastError = vi.fn();
    toastService.error = mockToastError;

    // Arrange
    const { getByText } = render(<OrderFormSimple />);

    // Simulate state: hasDraft=true, draftId=null, customer=null

    // Act
    const discardButton = getByText("Annulla");
    fireEvent.click(discardButton);

    // Wait for error handling
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringContaining("impossibile eliminare"),
      );
    });

    // Assert - Banner should be hidden
    // (verify setHasDraft(false) was called)
  });

  test("should trigger sync after successful fallback deletion", async () => {
    const mockCustomer = { id: "customer-B", name: "Test Customer" };
    const mockDeleteAllDrafts = vi.fn().mockResolvedValue(undefined);
    const mockSyncAll = vi.fn().mockResolvedValue(undefined);

    // Arrange
    orderService.deleteAllDraftsForCustomer = mockDeleteAllDrafts;
    unifiedSyncService.syncAll = mockSyncAll;

    const { getByText } = render(<OrderFormSimple />);

    // Act
    const discardButton = getByText("Annulla");
    fireEvent.click(discardButton);

    // Wait for async operations
    await waitFor(() => {
      expect(mockDeleteAllDrafts).toHaveBeenCalled();
    });

    // Assert
    expect(mockSyncAll).toHaveBeenCalled();
  });
});
```

---

## 📝 CHECKLIST DI IMPLEMENTAZIONE

### Pre-Implementation

- [ ] Review completo di DRAFT-DELETION-ANALYSIS.md
- [ ] Review completo di questo piano
- [ ] Setup environment di test
- [ ] Backup database locale (se necessario)

### Implementation - FIX #1 (P0)

- [ ] Modificare `handleResetForm` in OrderFormSimple.tsx
- [ ] Aggiungere chiamata a `deleteDraftOrder`
- [ ] Aggiungere sync dopo deletion
- [ ] Implementare fallback per `deleteAllDraftsForCustomer`
- [ ] Aggiungere flag anti-race-condition
- [ ] Scrivere test unitari
- [ ] Scrivere test integration
- [ ] Eseguire verifiche di regressione
- [ ] Code review
- [ ] Prettier + lint check

### Implementation - FIX #2 (P1)

- [ ] Modificare `deleteAllDraftsForCustomer` in orders.service.ts
- [ ] Aggiungere filtro per tombstones
- [ ] Aggiungere logging migliorato
- [ ] Scrivere test unitari (3 scenari)
- [ ] Eseguire verifiche di regressione
- [ ] Performance test con 100+ tombstones
- [ ] Code review
- [ ] Prettier + lint check

### Implementation - FIX #3 (P2)

- [ ] Aggiungere metodo `cleanupOldTombstones` in unified-sync-service.ts
- [ ] Integrare chiamata in `syncDraftOrders`
- [ ] Configurare maxAge (default 7 giorni)
- [ ] Aggiungere logging dettagliato
- [ ] Scrivere test unitari (5 scenari)
- [ ] Eseguire verifiche di regressione
- [ ] Test con tombstones di diverse età
- [ ] Code review
- [ ] Prettier + lint check

### Implementation - FIX #4 (P3)

- [ ] Modificare `handleDiscardDraft` in OrderFormSimple.tsx
- [ ] Aggiungere fallback logic
- [ ] Aggiungere error handling robusto
- [ ] Aggiungere sync dopo deletion
- [ ] Scrivere test unitari (3 scenari)
- [ ] Eseguire verifiche di regressione
- [ ] Code review
- [ ] Prettier + lint check

### Post-Implementation

- [ ] Eseguire tutti i test (`turbo test`)
- [ ] Eseguire typecheck (`turbo typecheck`)
- [ ] Eseguire lint (`turbo lint`)
- [ ] Eseguire prettier (`prettier --check`)
- [ ] Test E2E completi
- [ ] Test multi-device sync
- [ ] Test offline scenarios
- [ ] Performance benchmarks
- [ ] Update MEMORY.md con lessons learned
- [ ] Create commit con Conventional Commits
- [ ] Push to remote

---

## 🧪 TESTING STRATEGY

### Unit Tests

**Coverage Target**: ≥ 90% per file modificati

**File da Testare**:
1. `OrderFormSimple.tsx` - handleResetForm, handleDiscardDraft
2. `orders.service.ts` - deleteAllDraftsForCustomer
3. `unified-sync-service.ts` - cleanupOldTombstones

### Integration Tests

**Scenari Critici**:
1. Create draft → Delete → Refresh → Verify gone
2. Create draft → Convert to pending → Verify gone
3. Multiple drafts → Delete all for customer → Verify all gone
4. Offline delete → Go online → Verify synced
5. Old tombstones → Sync → Verify cleaned up

### E2E Tests (Manual)

**Test Suite**:

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| E2E-1: Delete draft by button | 1. Crea draft<br>2. Preme "Cancella bozza"<br>3. Refresh page | Nessun banner, form vuoto |
| E2E-2: Delete draft by banner | 1. Crea draft<br>2. Navigate away<br>3. Return<br>4. Preme "Annulla" | Banner scompare, draft eliminata |
| E2E-3: Draft to pending | 1. Crea draft<br>2. Completa ordine<br>3. Salva pending<br>4. Return to form | Nessun banner |
| E2E-4: Multi-device sync | 1. Device A: Crea draft<br>2. Device B: Load form<br>3. Device B: Vede banner<br>4. Device A: Elimina draft<br>5. Device B: Refresh | Banner scompare su device B |
| E2E-5: Offline delete | 1. Crea draft<br>2. Go offline<br>3. Preme "Cancella bozza"<br>4. Go online<br>5. Wait sync | Draft eliminata da server |
| E2E-6: Tombstone cleanup | 1. Crea tombstone manuale (8 giorni vecchio)<br>2. Trigger sync<br>3. Check IndexedDB | Tombstone rimosso |

### Performance Tests

**Benchmarks**:

| Operation | Target | Current (estimated) |
|-----------|--------|---------------------|
| `deleteDraftOrder` | <50ms | ~20ms |
| `deleteAllDraftsForCustomer` (10 drafts) | <100ms | ~50ms |
| `cleanupOldTombstones` (100 tombstones) | <500ms | ~200ms |
| `getDraftOrders` (1000 records, 100 tombstones) | <100ms | ~50ms |

---

## 🔄 ROLLBACK PLAN

### Se Fix #1 Causa Problemi

**Sintomi**: Draft non si salvano più, form si resetta inaspettatamente

**Rollback**:
```bash
git revert <commit-hash-fix-1>
```

**Hotfix Alternativo**:
```typescript
// Rimuovi async da handleResetForm
// Commenta chiamata a deleteDraftOrder
// Keep solo UI reset
```

### Se Fix #2 Causa Problemi

**Sintomi**: Draft non si eliminano quando si crea pending order

**Rollback**:
```bash
git revert <commit-hash-fix-2>
```

**Hotfix Alternativo**:
```typescript
// Rimuovi filtro .filter((draft) => !draft.deleted)
// Torna a query originale
```

### Se Fix #3 Causa Problemi

**Sintomi**: Draft vengono eliminate prematuramente

**Rollback**:
```bash
git revert <commit-hash-fix-3>
```

**Hotfix Alternativo**:
```typescript
// Commenta chiamata a cleanupOldTombstones in syncDraftOrders
```

### Emergency Rollback

**Worst Case**: Rollback completo di tutti i fix

```bash
# Trova commit prima dei fix
git log --oneline

# Rollback a commit stabile
git reset --hard <commit-hash-before-fixes>

# Force push (solo se necessario)
git push --force origin master
```

---

## 📊 METRICHE DI SUCCESSO

### Obiettivi Quantificabili

1. **Bug Resolution**: 5/5 bug risolti (100%)
2. **Test Coverage**: ≥90% sui file modificati
3. **Performance**: Tutte le operazioni <500ms
4. **Regression**: 0 nuovi bug introdotti

### Obiettivi Qualitativi

1. ✅ Utente elimina draft con 1 solo click (non 2)
2. ✅ Draft eliminate non riappaiono mai
3. ✅ Sistema funziona offline e online
4. ✅ Multi-device sync robusto
5. ✅ Codice pulito e manutenibile

### KPIs Post-Deploy

- [ ] 0 segnalazioni utente su "draft riappare"
- [ ] 0 accumulo di tombstones in IndexedDB
- [ ] Performance stabile (<100ms per operazioni draft)
- [ ] Log puliti (no spam di errori sync)

---

## 📚 DOCUMENTAZIONE DA AGGIORNARE

### MEMORY.md

Aggiungere:
```markdown
## Draft Deletion System

### Key Learnings

1. **Tombstone Pattern**: Don't delete immediately from IndexedDB
   - Mark as `deleted: true` first
   - Sync to server
   - Remove after successful server DELETE
   - Prevents race conditions in multi-device sync

2. **UI State vs Database State**: Resetting UI state ≠ deleting from DB
   - Always call `deleteDraftOrder` before resetting form
   - Verify sync completed before showing success message

3. **Cleanup Strategy**: Old tombstones accumulate if sync fails
   - Implemented 7-day cleanup policy
   - Runs automatically during sync
   - Prevents database bloat

4. **Edge Cases Handled**:
   - No draftId: Fallback to deleteAllDraftsForCustomer
   - Offline: Tombstones persist until online
   - Race conditions: Use refs instead of state for critical flags

### Common Pitfalls

❌ **BAD**: Reset UI state without deleting from database
✅ **GOOD**: Delete from database first, then reset UI

❌ **BAD**: Delete immediately from IndexedDB
✅ **GOOD**: Use tombstone pattern for multi-device sync

❌ **BAD**: Process tombstones in deleteAllDraftsForCustomer
✅ **GOOD**: Filter tombstones before processing
```

### README.md (se necessario)

Nessuna modifica necessaria - sistema interno

---

## 🎉 COMPLETAMENTO

### Definition of Done

- [x] Tutti i bug identificati hanno un fix implementato
- [ ] Tutti i test passano (unit + integration)
- [ ] Code review completato e approvato
- [ ] Prettier + lint pass
- [ ] E2E tests manuali completati
- [ ] Performance benchmarks entro target
- [ ] Documentazione aggiornata
- [ ] Commit creato con Conventional Commits
- [ ] Push to remote completato
- [ ] Verificato in staging (se disponibile)
- [ ] Monitoraggio post-deploy (0 regressioni per 48h)

### Next Steps

1. Review questo piano con stakeholder
2. Approval per procedere con implementation
3. Implementare fix in ordine di priorità (P0 → P4)
4. Testing incrementale dopo ogni fix
5. Deploy e monitoring

---

**Fine Piano di Fix** 🎯
