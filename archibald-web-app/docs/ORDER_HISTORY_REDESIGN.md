# Order History Page - Redesign Documentation

## Panoramica

Questa documentazione descrive la riprogettazione completa della pagina "Storico Ordini" implementata nel gennaio 2026.

## Motivazione

La precedente implementazione aveva diversi problemi:
- Sistema di tag/badge caotico e poco intuitivo
- Stati ordini poco chiari
- Filtri non funzionanti
- Pulsanti sync manuali ridondanti
- Nessuna ricerca globale
- Difficile capire a colpo d'occhio lo stato di un ordine

## Obiettivi Redesign

1. ✅ Sistema visivo chiaro con colori per stati ordini
2. ✅ Leggenda completa degli stati con glossario
3. ✅ Filtri veloci funzionanti con contatori
4. ✅ Ricerca globale profonda
5. ✅ Pulsanti azione diretti (Tracking, DDT, Fattura)
6. ✅ Card semplificate e leggibili
7. ✅ Preparazione per tracking automatico FedEx

---

## 1. Sistema Stati e Colori

### Stati Ordini

Ogni ordine ha uno stato determinato dalla funzione `getOrderStatus()` che analizza i campi:
- `orderType` (GIORNALE, ORDINE DI VENDITA)
- `state` (MODIFICA, IN ATTESA DI APPROVAZIONE, TRANSFER ERROR, TRASFERITO)
- `documentState` (NESSUNO, DOCUMENTO DI TRASPORTO, FATTURA)
- `invoiceNumber`
- `trackingNumber` (in `tracking` o `ddt`)
- `deliveryCompletedDate` (nuovo campo)

### Mapping Colori

| Stato | Categoria | Bordo | Sfondo | Condizioni |
|-------|-----------|-------|--------|------------|
| **Su Archibald** | on-archibald | `#757575` | `#F5F5F5` | GIORNALE + MODIFICA + NESSUNO |
| **In attesa approvazione** | pending-approval | `#FFA726` | `#FFF3E0` | IN ATTESA DI APPROVAZIONE |
| **Bloccato** | blocked | `#F44336` | `#FFEBEE` | TRANSFER ERROR |
| **In transito** | in-transit | `#2196F3` | `#E3F2FD` | Ha tracking, no deliveryCompletedDate |
| **Consegnato** | delivered | `#4CAF50` | `#E8F5E9` | Ha deliveryCompletedDate |
| **Fatturato** | invoiced | `#9C27B0` | `#F3E5F5` | Ha invoiceNumber |

### Logica Priorità

La funzione `getOrderStatus()` applica questa priorità:

1. **Fatturato** (massima priorità)
2. **Consegnato**
3. **In transito**
4. **Bloccato**
5. **In attesa approvazione**
6. **Su Archibald** (default/fallback)

### File Implementazione

- Frontend: `src/utils/orderStatus.ts`
- Test: `src/utils/orderStatus.spec.ts` (18 test)

---

## 2. Componente Leggenda

### OrderStatusLegend

Modal completo con:
- Tabella colori stati (con esempi visivi)
- Glossario tag (GIORNALE, ORDINE DI VENDITA, ecc.)
- Timeline tipica avanzamento ordine
- Spiegazione documenti (DDT, Fattura)

### File

- Componente: `src/components/OrderStatusLegend.tsx`
- Trigger: Pulsante "ℹ️ Leggi gli stati" nell'header

---

## 3. OrderCardNew - Vista Compressa

### Layout Nuovo

```
┌─────────────────────────────────────────────────────┐
│ ██  [Bold] Cliente Nome         [Badge Stato]       │
│ ██  ORD/26001234 • 23 Gen 2026                      │
│ ██  € 1.234,56 (Imp: € 1.012,00)                    │
│ ██  [🚚 Tracking] [📄 DDT] [📑 Fattura]  [▼]        │
└─────────────────────────────────────────────────────┘
██ = Bordo colorato 4px + sfondo pastello
```

### Caratteristiche

- **Bordo sinistro 4px**: Colore incisivo basato su stato
- **Sfondo pastello**: Tutta la card colorata con tonalità chiara
- **Badge stato**: Chip piccolo in alto a destra
- **Informazioni essenziali**: Cliente, ORD/, data, importi
- **Pulsanti azione** (visibili solo quando disponibili):
  - 🚚 **Tracking**: Apre URL FedEx in nuova tab
  - 📄 **DDT**: Download PDF diretto
  - 📑 **Fattura**: Download PDF diretto

### Rimosso

- ❌ Toggle "Mostra solo essenziali"
- ❌ Sistema checkbox per tag
- ❌ Badge multipli caotici

### File

- Componente: `src/components/OrderCardNew.tsx`

---

## 4. Filtri Veloci

### 4 Filtri Implementati

Tutti funzionanti con AND logic (devono matchare tutti i filtri attivi):

1. **⚠️ Richiede attenzione** (Rosso)
   - `state = "IN ATTESA DI APPROVAZIONE"` OR `"TRANSFER ERROR"`
   - Contatore ordini live

2. **✏️ Modificabili** (Grigio)
   - `orderType = "GIORNALE"` AND `state = "MODIFICA"`
   - Contatore ordini live

3. **🚚 In transito** (Blu)
   - Ha `trackingNumber`
   - NO `deliveryCompletedDate`
   - Contatore ordini live

4. **📑 Fatturati** (Viola)
   - Ha `invoiceNumber`
   - Contatore ordini live

### Logica Applicazione

Filtri applicati **client-side** sulla lista ordini già ricevuta dal backend.

### File

- Implementazione: `src/pages/OrderHistory.tsx` (funzione `applyQuickFilters`)

---

## 5. Ricerca Globale

### Funzionalità

Input di ricerca con debounce 300ms che cerca in:

**Backend (SQL LIKE):**
- `order_number` (ORD/xxxxxxxx)
- `customer_name`
- `total_amount`
- `gross_amount`
- `tracking_number`
- `ddt_number`
- `invoice_number`
- `delivery_address`
- `customer_reference`

### Architettura

**Frontend:**
- Input con debounce 300ms
- Query param `?search=...`
- Helper text sotto input

**Backend:**
- Parametro `search` in `getOrdersByUser()`
- Query SQL con OR su 9 campi
- Stessa logica in `countOrders()` per totale accurato

### File

- Frontend: `src/pages/OrderHistory.tsx`
- Backend DB: `backend/src/order-db-new.ts`
- Backend Service: `backend/src/order-history-service.ts`

---

## 6. Nuovo Campo: deliveryCompletedDate

### Scopo

Distinguere ordini "In transito" da "Consegnati effettivamente".

### Tipo

```typescript
interface Order {
  // ...
  deliveryCompletedDate?: string; // ISO 8601 timestamp
}
```

### Database

```sql
ALTER TABLE orders ADD COLUMN delivery_completed_date TEXT;
```

Campo nullable, popolato quando:
- Integrazione FedEx API attiva (futuro)
- Manualmente da operatore
- Da webhook FedEx

### Utilizzo

Usato in `getOrderStatus()` per determinare se ordine è "delivered" (verde) vs "in-transit" (blu).

### File

- Type Frontend: `src/types/order.ts`
- Type Backend: `backend/src/order-db-new.ts`
- Service: `backend/src/order-history-service.ts`
- Migration: Auto-aggiunta in `initSchema()`

---

## 7. Pulizia Codice

### Rimosso

**Stati non usati:**
- `syncingOrders`, `syncingDDT`, `syncingInvoices`
- `ordersSyncResult`, `ddtSyncResult`, `invoicesSyncResult`

**Funzioni non usate:**
- `handleSyncOrders()`
- `handleSyncDDT()`
- `handleSyncInvoices()`
- `handleResetDB()` (era solo admin)

**UI rimossa:**
- 3 pulsanti sync manuali
- 3 banner progress sync
- 3 banner risultati sync

### Mantenuto

- Sync automatico in background (rimane attivo)
- `SyncProgressModal` (per operazioni async)

---

## 8. Struttura File

### Frontend

```
src/
├── components/
│   ├── OrderCardNew.tsx         # Card ordine riprogettata
│   └── OrderStatusLegend.tsx    # Modal leggenda (nuovo)
├── pages/
│   └── OrderHistory.tsx         # Pagina principale
├── types/
│   └── order.ts                 # Type Order aggiornato
└── utils/
    ├── orderStatus.ts           # Logica stati + colori (nuovo)
    └── orderStatus.spec.ts      # Test (18 test)
```

### Backend

```
backend/src/
├── order-db-new.ts              # DB queries + global search
├── order-history-service.ts     # Service logic + filters
└── ...
```

### Docs

```
docs/
├── ORDER_HISTORY_REDESIGN.md    # Questo file
└── FEDEX_TRACKING_API.md        # Guida integrazione FedEx
```

---

## 9. API Changes

### Endpoint: GET /api/orders/history

**Parametri Query Aggiornati:**

```typescript
{
  customer?: string;      // Existing
  dateFrom?: string;      // Existing
  dateTo?: string;        // Existing
  status?: string;        // Existing
  search?: string;        // NEW - Global search
  limit?: number;         // Existing
  offset?: number;        // Existing
}
```

**Response:** Invariato

```typescript
{
  success: boolean;
  data: {
    orders: Order[];
    total: number;
    hasMore: boolean;
  }
}
```

**Note:** Campo `deliveryCompletedDate` ora incluso in `Order[]`.

---

## 10. Testing

### Test Unitari

**orderStatus.spec.ts** (18 test):
- ✅ Tutti gli stati (invoiced, delivered, in-transit, blocked, pending, on-archibald)
- ✅ Logica priorità
- ✅ Fallback per ordini legacy
- ✅ Helpers (getAllStatusStyles, getStatusStyleByCategory)

**Esegui:**
```bash
npm test -- src/utils/orderStatus.spec.ts
```

### Test Manuali Raccomandati

1. **Ricerca globale:**
   - Cerca per ORD/numero
   - Cerca per nome cliente parziale
   - Cerca per tracking number
   - Verifica debounce 300ms

2. **Filtri veloci:**
   - Attiva singolo filtro → verifica contatore
   - Attiva multipli filtri → verifica AND logic
   - Verifica contatori si aggiornano con ricerca

3. **Card ordini:**
   - Verifica colori corretti per ogni stato
   - Verifica pulsanti azione appaiono solo se dati disponibili
   - Test click tracking, download DDT, download fattura
   - Test espansione card

4. **Leggenda:**
   - Apri modal leggenda
   - Verifica tutti colori + descrizioni
   - Test responsive mobile

5. **Performance:**
   - Testa con 100+ ordini
   - Verifica virtual scrolling (se implementato)
   - Verifica debounce funziona

---

## 11. Performance Considerations

### Ottimizzazioni Implementate

- **Debounce 300ms**: Ricerca e filtri
- **Client-side filtering**: Filtri veloci senza API call
- **Lazy loading**: Card espanse caricano dati on-demand
- **SQL LIKE con indici**: Backend search ottimizzato

### Ottimizzazioni Future

- [ ] Virtual scrolling per 500+ ordini (react-window)
- [ ] Pagination proper (offset/limit)
- [ ] Cache invalidation intelligente
- [ ] Service Worker per offline

---

## 12. Mobile Responsive

### Design Principles

- **Stack verticale** su mobile per card compressa
- **Tab scrollabili** orizzontalmente nella vista espansa
- **Touch-friendly**: Pulsanti min 44px
- **Modal full-screen**: Leggenda occupa tutto lo schermo
- **Font scaling**: Leggibile su tutti i device

### Breakpoints

- Desktop: > 768px
- Tablet: 768px - 480px
- Mobile: < 480px

---

## 13. Future Enhancements

### Pianificate

1. **FedEx API Integration**
   - Polling cron job ogni 4 ore
   - Webhook per real-time updates
   - Auto-populate `deliveryCompletedDate`

2. **Export Ordini**
   - Export CSV filtrato
   - Export PDF fatture multiple
   - Export Excel report

3. **Notifiche Push**
   - Notifica quando ordine consegnato
   - Notifica quando richiede attenzione
   - Settings utente per preferenze

4. **Analytics Dashboard**
   - Tempo medio consegna
   - % ordini con problemi
   - Trend mensili

### Non Pianificate (Backlog)

- Bulk operations (selezione multipla)
- Grafici timeline consegne
- Integrazione calendario per delivery date
- AI-powered delivery time prediction

---

## 14. Breaking Changes

### ⚠️ Type Changes

**Order interface** - nuovi campi:
```typescript
interface Order {
  deliveryCompletedDate?: string; // NUOVO
  // ... rest unchanged
}
```

**OrderFilters interface** - nuovo campo:
```typescript
interface OrderFilters {
  search?: string; // NUOVO
  // ... rest unchanged
}
```

### Database Migration

Auto-gestita in `order-db-new.ts`:
```typescript
{ name: "delivery_completed_date", type: "TEXT" }
```

Nessuna azione manuale richiesta.

---

## 15. Troubleshooting

### Problema: Colori card non appaiono

**Causa:** Dati ordine mancanti o formattati male
**Fix:** Verifica che ordine abbia almeno `status` e `state` popolati

### Problema: Ricerca non trova risultati

**Causa:** Debounce delay o SQL LIKE case-sensitive
**Fix:**
- Attendi 300ms dopo digitazione
- Backend usa LIKE (case-insensitive in SQLite)

### Problema: Filtri veloci contatori = 0

**Causa:** Nessun ordine corrisponde ai criteri
**Fix:** Verifica che ordini abbiano campi necessari (`orderType`, `state`, ecc.)

### Problema: Pulsanti azione non appaiono

**Causa:** Dati tracking/DDT/fattura non presenti
**Fix:**
- Verifica che ordine abbia `tracking.trackingUrl` per button Tracking
- Verifica `ddt.ddtNumber` per button DDT
- Verifica `invoiceNumber` per button Fattura

---

## 16. Maintenance

### Aggiornare Stati Ordini

**File:** `src/utils/orderStatus.ts`

```typescript
// Aggiungi nuovo stato
const ORDER_STATUS_STYLES: Record<OrderStatusCategory, OrderStatusStyle> = {
  // ... existing
  "new-state": {
    category: "new-state",
    label: "Nuovo Stato",
    description: "Descrizione stato",
    borderColor: "#HEXCOL",
    backgroundColor: "#HEXCOL",
  },
};

// Aggiorna logica in getOrderStatus()
export function getOrderStatus(order: Order): OrderStatusStyle {
  // ... add new condition
}
```

**Test:** Aggiorna `orderStatus.spec.ts`

### Aggiornare Filtri Veloci

**File:** `src/pages/OrderHistory.tsx`

1. Aggiungi tipo in `QuickFilterType`
2. Aggiungi logica in `applyQuickFilters()`
3. Aggiungi chip in UI array

### Aggiornare Ricerca Globale

**Backend:** `backend/src/order-db-new.ts`

Aggiungi campo alla query SQL:
```typescript
query += ` AND (
  // ... existing fields
  new_field LIKE ? OR
)`;
params.push(searchTerm);
```

---

## 17. Changelog

### v2.0.0 (Gennaio 2026) - Major Redesign

**Added:**
- Sistema colori stati ordini (6 stati)
- Componente OrderStatusLegend
- 4 filtri veloci funzionanti con contatori
- Ricerca globale profonda (9 campi)
- Campo `deliveryCompletedDate`
- Pulsanti azione diretti (Tracking, DDT, Fattura)
- Documentazione FedEx API

**Changed:**
- OrderCardNew completamente riprogettata
- Bordo + sfondo colorati per stato
- Layout card semplificato
- Badge stato minimale

**Removed:**
- Pulsanti sync manuali (Sync Orders, DDT, Invoices)
- Toggle "Mostra solo essenziali"
- Sistema checkbox tag
- Badge multipli caotici
- Admin Reset DB button

**Fixed:**
- Filtri status ora funzionanti
- Ricerca cliente funzionante
- Performance con molti ordini

---

## 18. Credits

**Design & Implementation:** Claude Sonnet 4.5
**Project:** Archibald Web App
**Date:** Gennaio 2026
**Version:** 2.0.0

---

## 19. Appendix

### Glossario Tag Archibald

- **GIORNALE**: Ordine modificabile
- **ORDINE DI VENDITA**: Ordine con ORD/ assegnato
- **ORDINE APERTO**: Non spedito o parzialmente spedito
- **IN ATTESA DI APPROVAZIONE**: Ricevuto Milano, in coda
- **TRANSFER ERROR**: Bloccato per anagrafica/pagamenti
- **MODIFICA**: Modificabile/cancellabile
- **CONSEGNATO**: Affidato a corriere (non fisicamente consegnato!)
- **TRASFERITO**: Non più modificabile
- **FATTURATO**: Fattura emessa

### Timeline Tipica Ordine

```
Piazzato PWA → Su Archibald → Milano → Approvato →
Corriere → DDT → Consegnato → Fattura
```

### SQL Schema Rilevanti

```sql
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  order_type TEXT,
  sales_status TEXT,
  document_status TEXT,
  tracking_number TEXT,
  ddt_number TEXT,
  invoice_number TEXT,
  delivery_completed_date TEXT,  -- NEW
  -- ... altri campi
);
```

---

**Fine Documentazione**
