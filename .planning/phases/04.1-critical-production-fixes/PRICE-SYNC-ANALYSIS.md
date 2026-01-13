# Analisi Completa Price Sync Service

**Data:** 2026-01-13
**Issue:** Verifica processo sync prezzi

---

## 🔍 Problema Identificato

### Checkpoint System Bug

**Comportamento problematico:**
```typescript
for (let currentPage = resumePoint; currentPage <= totalPages; currentPage++)
```

Se `resumePoint = 150`, il sync:
- ✅ Riprende da pagina 150
- ❌ **PERDE pagine 1-149!**

### Quando si Verifica

1. **Sync interrotto** a pagina 150
2. **Restart del server**
3. **Nuovo sync** riprende da pagina 150
4. **Risultato**: Prezzi da pagine 1-149 mai processati!

---

## ✅ Soluzione Implementata

### 1. Parametro `forceFullSync`

```typescript
async syncPrices(forceFullSync: boolean = false): Promise<void>
```

**Logica:**
- `forceFullSync = false` → Sync incrementale (resume da checkpoint)
- `forceFullSync = true` → Sync completo da pagina 1 (reset checkpoint)

### 2. API Endpoint Aggiornato

**Endpoint:** `POST /api/sync/prices`

**Query parameter:** `?full=true`

```bash
# Sync incrementale (resume da checkpoint)
curl -X POST http://localhost:3001/api/sync/prices

# Full sync da pagina 1 (reset checkpoint)
curl -X POST 'http://localhost:3001/api/sync/prices?full=true'
```

### 3. Sync Automatici

**Sync giornaliero (ore 12:00):**
```typescript
await priceSyncService.syncPrices(true); // Force full sync
```

**Sync completo endpoint (`/api/sync/full`):**
```typescript
await priceSyncService.syncPrices(true); // Force full sync
```

---

## 📊 Flusso Corretto del Sync

### Full Sync (`forceFullSync = true`)

```
1. Check if sync already in progress → Skip if true
2. Check if paused → Skip if paused
3. Get resumePoint from checkpoint
4. IF forceFullSync AND resumePoint != -1:
   → Reset checkpoint
   → Set resumePoint = 1
5. IF resumePoint == -1 (recent completed sync):
   → Skip sync
6. Acquire browser from pool
7. Navigate to /PRICEDISCTABLE_ListView/
8. FOR page = resumePoint TO totalPages:
   a. Wait for table to load
   b. Extract: itemSelection, itemDescription, price
   c. Multi-level matching:
      - Level 1: Match by ID (itemSelection → products.id)
      - Level 2: Match by exact name (itemDescription → products.name)
      - Level 3: Match by normalized name (remove dots/spaces/dashes)
   d. Log match statistics
   e. Save checkpoint after each page
   f. Navigate to next page
9. Mark sync complete
10. Release browser
```

### Incremental Sync (`forceFullSync = false`)

```
1-3. Same as full sync
4. Use checkpoint resumePoint as-is (no reset)
5-10. Same as full sync
```

---

## 🎯 Quando Usare Full vs Incremental

### Full Sync (`?full=true`)
- **Primo sync dopo deploy**
- **Dopo cambio logica matching** (come multi-level matching)
- **Dopo modifiche database schema**
- **Sync giornaliero automatico** (per massima accuratezza)
- **Quando si sospetta checkpoint corrotto**

### Incremental Sync (default)
- **Sync manuali durante il giorno**
- **Update rapidi di pochi prezzi**
- **Quando si sa che checkpoint è valido**

---

## 🧪 Test del Sync

### 1. Verifica Stato Checkpoint

```bash
sqlite3 data/sync-checkpoints.db "SELECT * FROM sync_checkpoints WHERE sync_type = 'prices';"
```

### 2. Reset Checkpoint Manuale

```bash
curl -X POST http://localhost:3001/api/sync/reset/prices
```

### 3. Avvia Full Sync

```bash
curl -X POST 'http://localhost:3001/api/sync/prices?full=true'
```

### 4. Monitora Logs

Cerca nei logs:
```
DEBUG - Sample price entries: { itemSelection, itemDescription, price }
Pagina X: Y prezzi → Z matched (ID: A, Name exact: B, Name normalized: C) | D unmatched
```

### 5. Verifica Risultati

```sql
-- Check price coverage
SELECT
  COUNT(*) as total,
  COUNT(price) as with_price,
  ROUND(COUNT(price) * 100.0 / COUNT(*), 1) as percentage
FROM products;

-- Check match examples
SELECT id, name, price
FROM products
WHERE name LIKE '%XTD%' OR name LIKE '%354TL%'
LIMIT 10;
```

---

## 📈 Statistiche Attese

### Prima del Multi-Level Matching
- **Match rate:** ~59.8% (2,721/4,545)
- **Match method:** Solo exact name
- **Problemi:** Variazioni formattazione bloccavano match

### Dopo Multi-Level Matching + Default Pricing
- **Match rate teorico:** ~85% (dal listino Archibald)
- **Coverage totale:** 100% (4,541/4,541 con default pricing)
- **Match methods:** ID + exact name + normalized name
- **Vantaggi:** Cattura variazioni formattazione

### Log Esempio Atteso

```
Pagina 1: 20 prezzi → 18 matched (ID: 12, Name exact: 4, Name normalized: 2) | 2 unmatched
Pagina 2: 20 prezzi → 19 matched (ID: 10, Name exact: 6, Name normalized: 3) | 1 unmatched
...
✅ Sync prezzi completato: 2500 prezzi aggiornati
```

---

## 🐛 Troubleshooting

### Sync Non Parte

**Check 1:** Sync già in corso?
```bash
curl http://localhost:3001/api/sync/stats | jq .
```

**Check 2:** Checkpoint dice "recent"?
```sql
SELECT * FROM sync_checkpoints WHERE sync_type = 'prices';
```
Se `status = 'completed'` e timestamp recente → reset checkpoint

**Check 3:** Browser pool disponibile?
Logs dovrebbero mostrare: `Acquire browser from pool`

### Sync Si Ferma a Metà

**Check 1:** Timeout error?
Aumenta timeout in `price-sync-service.ts` (attualmente 60000ms)

**Check 2:** DevExpress table non trovata?
Logs: `no matches found` → problema navigazione

**Check 3:** Checkpoint corrotto?
Reset checkpoint e riprova con full sync

### Match Rate Basso

**Check 1:** Logs mostrano item extraction?
```
DEBUG - Sample price entries: { itemSelection: "...", itemDescription: "...", price: X }
```

**Check 2:** Regex patterns corretti?
- `itemSelection`: `/^[0-9A-Z]{7,10}$/i` senza `./-`
- `itemDescription`: `/^[A-Z0-9]{2,}[0-9./-]{2,}$/i` con `./-`

**Check 3:** Database naming matches?
```sql
SELECT id, name FROM products WHERE name LIKE '%pattern%';
```

---

## 🔄 Commit History

1. `5d26ef3` - feat: add price display to product autocomplete
2. `e6ebd58` - feat: implement robust multi-level price matching
3. `8134ed9` - feat: add script to assign default prices
4. `7e4b4c8` - docs: complete price sync investigation & fix plan
5. `f22bac0` - **fix: add forceFullSync parameter to ensure complete price sync**

---

## ✅ Next Steps

1. **Restart backend** con nuova logica
2. **Esegui full sync**: `POST /api/sync/prices?full=true`
3. **Monitora logs** per match statistics
4. **Verifica frontend** visualizza prezzi
5. **Testa search prodotti** per confermare prezzi visibili

---

**Prepared by:** Claude Sonnet 4.5
**Status:** ✅ Ready for testing
