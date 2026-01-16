# Campi Scrapati - Analisi Completa

## SCRAPER 1: Order List (`SALESTABLE_ListView_Agent`)

### Campi Estratti dalla Tabella
```typescript
interface Order {
  id: string;                    // ✅ Colonna 0 - ID interno (es. "70.686")
  orderNumber: string;           // ✅ Colonna 1 - Numero ordine (es. "ORD/26000552")
  customerProfileId: string;     // ✅ Colonna 2 - ID cliente (es. "1002209")
  customerName: string;          // ✅ Colonna 3 - Nome venditore
  deliveryName: string;          // ✅ Colonna 4 - Nome destinatario consegna
  deliveryAddress: string;       // ✅ Colonna 5 - Indirizzo completo
  creationDate: string;          // ✅ Colonna 6 - Data creazione (ISO 8601)
  deliveryDate: string;          // ✅ Colonna 7 - Data consegna (ISO 8601)
  customerReference: string;     // ✅ Colonna 8 - Riferimento cliente
  status: string;                // ✅ Colonna 9 - Stato (es. "Ordine aperto")
}
```

### Stored in DB
**Tabella:** `orders`
**Campi mappati:**
- ✅ `id` → `id`
- ✅ `orderNumber` → `orderNumber`
- ✅ `customerProfileId` → `customerProfileId`
- ✅ `customerName` → `customerName`
- ✅ `deliveryName` → `deliveryName`
- ✅ `deliveryAddress` → `deliveryAddress`
- ✅ `creationDate` → `creationDate`
- ✅ `deliveryDate` → `deliveryDate`
- ✅ `customerReference` → `customerReference`
- ✅ `status` → `status`

**Metadata aggiunti:**
- ✅ `lastScraped` → timestamp corrente
- ✅ `lastUpdated` → timestamp corrente
- ✅ `isOpen` → boolean calcolato da `status.includes("aperto")`
- ✅ `userId` → user ID corrente

---

## SCRAPER 2: DDT Data (`CUSTPACKINGSLIPJOUR_ListView`)

### Campi Estratti dalla Tabella
```typescript
interface DDTData {
  ddtNumber: string;           // ✅ Colonna "DOCUMENTO DI TRASPORTO"
  orderId: string;             // ✅ Colonna "ID DI VENDITA" (match key!)
  customerAccountId: string;   // ✅ Colonna "CONTO DELL'ORDINE"
  deliveryDate: string;        // ✅ Colonna "DATA DI CONSEGNA"
  deliveryMethod: string;      // ✅ Colonna "MODALITÀ DI CONSEGNA"
  deliveryCity: string;        // ✅ Colonna "CITTÀ DI CONSEGNA"
  trackingNumber?: string;     // ✅ Colonna "TRACCIABILITÀ" (parsed)
  trackingUrl?: string;        // ✅ href del link tracciabilità
  trackingCourier?: string;    // ✅ Parsed da tracking text (fedex/ups/dhl)
}
```

### Stored in DB
**Tabella:** `orders` (matched tramite `orderNumber`)
**Campi mappati:**
- ✅ `ddtNumber` → `ddtNumber`
- ✅ `trackingNumber` → `trackingNumber`
- ✅ `trackingUrl` → `trackingUrl`
- ✅ `trackingCourier` → `trackingCourier`

**NON STORED (perduti):**
- ❌ `customerAccountId` (DDT) - Non salvato (ma potrebbe essere utile per verifica match)
- ❌ `deliveryDate` (DDT) - Non salvato (duplicato, già in Order)
- ❌ `deliveryMethod` (DDT) - Non salvato (potrebbe servire!)
- ❌ `deliveryCity` (DDT) - Non salvato (potrebbe servire!)

---

## SCRAPER 3: Order Detail (`SALESTABLE_DetailViewAgent/{id}`)

### Campi Estratti dalla Pagina Dettaglio
```typescript
interface OrderDetail {
  // Base fields (same as order list)
  id: string;
  orderNumber: string;
  customerName: string;
  deliveryName: string;
  creationDate: string;
  deliveryDate: string;
  status: string;

  // Additional detail fields
  customerAddress?: string;         // ✅ Indirizzo cliente
  customerEmail?: string;           // ✅ Email cliente
  customerReference?: string;       // ✅ Riferimento
  documentStatus?: string;          // ✅ Stato documento
  transferStatus?: string;          // ✅ Stato trasferimento
  transferDate?: string;            // ✅ Data trasferimento
  completionDate?: string;          // ✅ Data completamento

  // Items array
  items: Array<{
    articleCode: string;            // ✅ Codice articolo
    productName?: string;           // ✅ Nome prodotto
    description: string;            // ✅ Descrizione
    quantity: number;               // ✅ Quantità
    price: number;                  // ✅ Prezzo
    discount?: number;              // ✅ Sconto
  }>;

  // Status timeline
  statusTimeline: Array<{
    status: string;                 // ✅ Stato
    timestamp: string;              // ✅ Data/ora
    note?: string;                  // ✅ Note
  }>;

  // Tracking (from separate section)
  tracking?: {
    carrier?: string;               // ✅ Corriere
    trackingNumber?: string;        // ✅ Numero tracking
    estimatedDelivery?: string;     // ✅ Consegna stimata
  };

  // Documents
  documents?: Array<{
    type: string;                   // ✅ Tipo documento
    name: string;                   // ✅ Nome
    url: string;                    // ✅ URL download
  }>;
}
```

### Stored in DB
**Tabella:** `orders`
**Campo:** `detailJson` (stringified JSON)

**Tutta la struttura OrderDetail viene salvata come JSON!** ✅

---

## CAMPI NON SCRAPATI (ma potrebbero essere disponibili)

### Order List - Colonne Potenzialmente Mancanti
- ❌ **Totale ordine** (importo) - Non estratto
- ❌ **Valuta** - Non estratta
- ❌ **Metodo pagamento** - Non estratto
- ❌ **Note** - Non estratte

### DDT Table - Campi Disponibili ma Non Salvati
- ❌ `deliveryMethod` (es. "FedEx", "UPS Italia") - PERSO
- ❌ `deliveryCity` - PERSO
- ❌ `customerAccountId` (per double-check match) - PERSO

### Order Detail - Sezioni Potenzialmente Non Scrapate
- ❌ **Dati fiscali** (P.IVA, Codice Fiscale)
- ❌ **Condizioni pagamento**
- ❌ **Note interne**
- ❌ **Allegati/Documenti aggiuntivi**

---

## SCHEMA DB ATTUALE vs DATI DISPONIBILI

### Tabella `orders` - 20 colonne

| Colonna | Popolata | Source | Note |
|---------|----------|--------|------|
| `id` | ✅ | Order List | PK |
| `userId` | ✅ | Metadata | Chi possiede l'ordine |
| `orderNumber` | ✅ | Order List | Display number |
| `customerProfileId` | ✅ | Order List | ID cliente |
| `customerName` | ✅ | Order List | Nome venditore |
| `deliveryName` | ✅ | Order List | Destinatario |
| `deliveryAddress` | ✅ | Order List | Indirizzo |
| `creationDate` | ✅ | Order List | ISO 8601 |
| `deliveryDate` | ✅ | Order List | ISO 8601 |
| `status` | ✅ | Order List | Stato testuale |
| `customerReference` | ✅ | Order List | Riferimento |
| `lastScraped` | ✅ | Metadata | Timestamp sync |
| `lastUpdated` | ✅ | Metadata | Timestamp update |
| `isOpen` | ✅ | Computed | Boolean |
| `detailJson` | ✅ | Order Detail | JSON completo |
| `sentToMilanoAt` | ⚠️ | Manual | Null fino a invio |
| `currentState` | ⚠️ | Manual | "unknown" dopo sync |
| `ddtNumber` | ✅ | DDT Scraper | Numero DDT |
| `trackingNumber` | ✅ | DDT Scraper | Numero tracking |
| `trackingUrl` | ✅ | DDT Scraper | Link corriere |
| `trackingCourier` | ✅ | DDT Scraper | fedex/ups/dhl |

---

## CAMPI CHE DOVREMMO AGGIUNGERE

### Nuove Colonne Suggerite

1. **`deliveryMethod`** (da DDT)
   - Tipo: `TEXT`
   - Esempio: "FedEx", "UPS Italia", "DHL"
   - Perché: Utile mostrare metodo spedizione

2. **`deliveryCity`** (da DDT)
   - Tipo: `TEXT`
   - Esempio: "Milano", "Roma"
   - Perché: Verifica destinazione

3. **`orderTotal`** (da Order Detail)
   - Tipo: `TEXT` o `REAL`
   - Esempio: "1250.50"
   - Perché: Importo ordine importante!

4. **`currency`** (da Order Detail)
   - Tipo: `TEXT`
   - Esempio: "EUR"
   - Perché: Valuta

5. **`itemsCount`** (computed da detailJson)
   - Tipo: `INTEGER`
   - Esempio: 5
   - Perché: Numero articoli ordinati (per filtri/sort)

### Frontend - Campi da Mostrare

**OrderCard (collapsed):**
- ✅ `orderNumber`
- ✅ `customerName`
- ✅ `deliveryName`
- ✅ `creationDate`
- ✅ `status`
- ⭐ **NEW:** `orderTotal` (importo)
- ⭐ **NEW:** `itemsCount` (es. "5 articoli")

**OrderCard (expanded):**
- ✅ `OrderTimeline` (stati)
- ✅ `OrderTracking` (DDT + tracking)
- ⭐ **NEW:** `deliveryMethod` (es. "📦 Spedito via FedEx")
- ⭐ **NEW:** `deliveryCity` (es. "🏙️ Milano")
- ✅ `OrderActions` (pulsanti)
- ✅ Items list (da `detailJson`)
- ✅ Documents (da `detailJson`)

---

## AZIONI RACCOMANDATE

### 1. Aggiungere Colonne DB
```sql
ALTER TABLE orders ADD COLUMN deliveryMethod TEXT;
ALTER TABLE orders ADD COLUMN deliveryCity TEXT;
ALTER TABLE orders ADD COLUMN orderTotal TEXT;
ALTER TABLE orders ADD COLUMN currency TEXT DEFAULT 'EUR';
ALTER TABLE orders ADD COLUMN itemsCount INTEGER;
```

### 2. Modificare Scraper DDT
Salvare anche `deliveryMethod` e `deliveryCity` oltre a tracking:
```typescript
{
  ...order,
  ddtNumber: ddt?.ddtNumber || null,
  trackingNumber: ddt?.trackingNumber || null,
  trackingUrl: ddt?.trackingUrl || null,
  trackingCourier: ddt?.trackingCourier || null,
  deliveryMethod: ddt?.deliveryMethod || null,  // ⭐ NEW
  deliveryCity: ddt?.deliveryCity || null,      // ⭐ NEW
}
```

### 3. Estrarre Totale da Order Detail
Aggiungere scraping del totale ordine:
```typescript
// Nel metodo extractOrderDetail
const orderTotal = findByLabel("Totale");
const currency = findByLabel("Valuta") || "EUR";
```

### 4. Calcolare itemsCount
```typescript
const itemsCount = detail?.items?.length || 0;
```

### 5. Frontend - Nuovi Componenti
- `OrderSummary` component per mostrare totale + items count
- `DeliveryInfo` component per metodo spedizione + città

---

## RIEPILOGO SICUREZZA STORAGE

### ✅ Stored Correttamente
- Tutti i campi Order List (10 campi)
- DDT tracking (ddtNumber, trackingNumber, trackingUrl, trackingCourier)
- Order Detail completo in `detailJson` (items, timeline, documents)
- Metadata (lastScraped, isOpen, etc.)

### ⚠️ Stored ma Non Usati
- `currentState` = "unknown" (non gestito workflow)
- `sentToMilanoAt` = null (non ancora inviato)

### ❌ Non Stored (PERSI)
- DDT: `deliveryMethod`, `deliveryCity`, `customerAccountId`
- Order: `orderTotal`, `currency`, altri campi fiscali

### 🎯 Priorità Fix
1. **Alta:** Salvare `deliveryMethod` e `deliveryCity` da DDT
2. **Alta:** Estrarre e salvare `orderTotal` da Order Detail
3. **Media:** Mostrare nel frontend i nuovi campi
4. **Bassa:** Aggiungere campi fiscali se necessari
