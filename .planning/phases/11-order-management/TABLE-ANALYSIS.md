# Analisi Tabelle Archibald - Mapping Colonne Esatto

## TABELLA 1: SALESTABLE_ListView_Agent
**URL:** https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/

### 20 Colonne TASSATIVE (in ordine):
1. **ID** - Colonna 0
2. **ID di vendita** (Order Number) - Colonna 1
3. **Profilo cliente** - Colonna 2
4. **Nome vendite** (Customer Name) - Colonna 3
5. **Nome di consegna** - Colonna 4
6. **Indirizzo di consegna** - Colonna 5
7. **Data di creazione** - Colonna 6
8. **Data di consegna** - Colonna 7
9. **Rimani vendite finanziarie** - Colonna 8
10. **Riferimento cliente** - Colonna 9
11. **Stato delle vendite** (Status) - Colonna 10
12. **Tipo di ordine** - Colonna 11
13. **Stato del documento** - Colonna 12
14. **Origine vendite** - Colonna 13
15. **Stato del trasferimento** - Colonna 14
16. **Data di trasferimento** - Colonna 15
17. **Data di completamento** - Colonna 16
18. **Applica sconto %** - Colonna 17
19. **Importo lordo** - Colonna 18
20. **Importo totale** - Colonna 19

---

## TABELLA 2: CUSTPACKINGSLIPJOUR_ListView
**URL:** https://4.231.124.90/Archibald/CUSTPACKINGSLIPJOUR_ListView/

### 11 Colonne TASSATIVE (in ordine):
1. **ID** - Colonna 0
2. **Documento di trasporto** (DDT Number) - Colonna 1
3. **Data di consegna** - Colonna 2
4. **ID di vendita** (Order Number - CHIAVE MATCH!) - Colonna 3
5. **Conto dell'ordine** (Customer Account) - Colonna 4
6. **Nome vendite** - Colonna 5
7. **Nome di consegna** - Colonna 6
8. **Numero di tracciabilità** (Tracking) - Colonna 7
9. **Termini di consegna** - Colonna 8
10. **Modalità di consegna** - Colonna 9
11. **Città di consegna** - Colonna 10

---

## MATCHING KEY
**Campo comune:** `ID di vendita` (Order Number)
- TABELLA 1: Colonna 1
- TABELLA 2: Colonna 3

Formato: "ORD/26000552"

---

## NUOVO SCHEMA DB

### Tabella `orders` - Schema Completo

```sql
CREATE TABLE IF NOT EXISTS orders (
  -- Primary Keys
  id TEXT PRIMARY KEY,                    -- Colonna 0 TABELLA 1
  userId TEXT NOT NULL,                   -- Metadata (user owner)

  -- TABELLA 1: Order List (20 colonne)
  orderNumber TEXT NOT NULL,              -- Col 1: ID di vendita
  customerProfileId TEXT,                 -- Col 2: Profilo cliente
  customerName TEXT,                      -- Col 3: Nome vendite
  deliveryName TEXT,                      -- Col 4: Nome di consegna
  deliveryAddress TEXT,                   -- Col 5: Indirizzo di consegna
  creationDate TEXT,                      -- Col 6: Data di creazione
  deliveryDate TEXT,                      -- Col 7: Data di consegna
  remainingSalesFinancial TEXT,           -- Col 8: Rimani vendite finanziarie
  customerReference TEXT,                 -- Col 9: Riferimento cliente
  salesStatus TEXT,                       -- Col 10: Stato delle vendite
  orderType TEXT,                         -- Col 11: Tipo di ordine
  documentStatus TEXT,                    -- Col 12: Stato del documento
  salesOrigin TEXT,                       -- Col 13: Origine vendite
  transferStatus TEXT,                    -- Col 14: Stato del trasferimento
  transferDate TEXT,                      -- Col 15: Data di trasferimento
  completionDate TEXT,                    -- Col 16: Data di completamento
  discountPercent TEXT,                   -- Col 17: Applica sconto %
  grossAmount TEXT,                       -- Col 18: Importo lordo
  totalAmount TEXT,                       -- Col 19: Importo totale

  -- TABELLA 2: DDT Data (11 colonne, matchate per orderNumber)
  ddtId TEXT,                             -- Col 0: ID (DDT)
  ddtNumber TEXT,                         -- Col 1: Documento di trasporto
  ddtDeliveryDate TEXT,                   -- Col 2: Data di consegna (DDT)
  ddtOrderNumber TEXT,                    -- Col 3: ID di vendita (per match)
  ddtCustomerAccount TEXT,                -- Col 4: Conto dell'ordine
  ddtSalesName TEXT,                      -- Col 5: Nome vendite
  ddtDeliveryName TEXT,                   -- Col 6: Nome di consegna
  trackingNumber TEXT,                    -- Col 7: Numero di tracciabilità
  deliveryTerms TEXT,                     -- Col 8: Termini di consegna
  deliveryMethod TEXT,                    -- Col 9: Modalità di consegna
  deliveryCity TEXT,                      -- Col 10: Città di consegna

  -- Metadata
  lastScraped TEXT,                       -- Timestamp ultimo scraping
  lastUpdated TEXT,                       -- Timestamp ultimo aggiornamento
  isOpen BOOLEAN,                         -- Calcolato da salesStatus

  -- Order Detail (JSON)
  detailJson TEXT,                        -- JSON completo da detail scraping

  -- Order Management
  sentToMilanoAt TEXT,                    -- Timestamp invio Milano
  currentState TEXT,                      -- Stato workflow (creato/piazzato/etc)

  -- Additional fields
  trackingUrl TEXT,                       -- URL tracking (computed)
  trackingCourier TEXT                    -- Corriere (parsed da tracking)
);

CREATE INDEX IF NOT EXISTS idx_orders_userId ON orders(userId);
CREATE INDEX IF NOT EXISTS idx_orders_orderNumber ON orders(orderNumber);
```

---

## MAPPING COMPLETO

### TABELLA 1 → DB
| Colonna | Nome IT | Campo DB | Tipo |
|---------|---------|----------|------|
| 0 | ID | id | TEXT PK |
| 1 | ID di vendita | orderNumber | TEXT |
| 2 | Profilo cliente | customerProfileId | TEXT |
| 3 | Nome vendite | customerName | TEXT |
| 4 | Nome di consegna | deliveryName | TEXT |
| 5 | Indirizzo di consegna | deliveryAddress | TEXT |
| 6 | Data di creazione | creationDate | TEXT |
| 7 | Data di consegna | deliveryDate | TEXT |
| 8 | Rimani vendite finanziarie | remainingSalesFinancial | TEXT |
| 9 | Riferimento cliente | customerReference | TEXT |
| 10 | Stato delle vendite | salesStatus | TEXT |
| 11 | Tipo di ordine | orderType | TEXT |
| 12 | Stato del documento | documentStatus | TEXT |
| 13 | Origine vendite | salesOrigin | TEXT |
| 14 | Stato del trasferimento | transferStatus | TEXT |
| 15 | Data di trasferimento | transferDate | TEXT |
| 16 | Data di completamento | completionDate | TEXT |
| 17 | Applica sconto % | discountPercent | TEXT |
| 18 | Importo lordo | grossAmount | TEXT |
| 19 | Importo totale | totalAmount | TEXT |

### TABELLA 2 → DB
| Colonna | Nome IT | Campo DB | Tipo |
|---------|---------|----------|------|
| 0 | ID | ddtId | TEXT |
| 1 | Documento di trasporto | ddtNumber | TEXT |
| 2 | Data di consegna | ddtDeliveryDate | TEXT |
| 3 | ID di vendita | ddtOrderNumber | TEXT |
| 4 | Conto dell'ordine | ddtCustomerAccount | TEXT |
| 5 | Nome vendite | ddtSalesName | TEXT |
| 6 | Nome di consegna | ddtDeliveryName | TEXT |
| 7 | Numero di tracciabilità | trackingNumber | TEXT |
| 8 | Termini di consegna | deliveryTerms | TEXT |
| 9 | Modalità di consegna | deliveryMethod | TEXT |
| 10 | Città di consegna | deliveryCity | TEXT |

---

## FRONTEND MAPPING

### OrderCard CHIUSA (da TABELLA 1)
- ✅ orderNumber (ID di vendita)
- ✅ customerName (Nome vendite)
- ✅ deliveryName (Nome di consegna)
- ✅ creationDate (Data di creazione)
- ✅ salesStatus (Stato delle vendite)
- ⭐ **NEW:** totalAmount (Importo totale)
- ⭐ **NEW:** orderType (Tipo di ordine)

### OrderCard ESPANSA (da TABELLA 2)
- ✅ ddtNumber (Documento di trasporto)
- ✅ trackingNumber (Numero di tracciabilità)
- ✅ deliveryMethod (Modalità di consegna)
- ✅ deliveryCity (Città di consegna)
- ⭐ **NEW:** deliveryTerms (Termini di consegna)
- ⭐ **NEW:** ddtDeliveryDate (Data consegna DDT)

### OrderTimeline
- ✅ salesStatus + documentStatus + transferStatus

### OrderActions
- ✅ currentState (per workflow)

---

## NEXT STEPS

1. ✅ Analisi colonne completata
2. ⏳ Creare migration SQL per nuovi campi
3. ⏳ Aggiornare OrderDatabase con nuovo schema
4. ⏳ Riscrivere scrapeOrderPage per 20 colonne
5. ⏳ Riscrivere scrapeDDTPage per 11 colonne
6. ⏳ Verificare matching via orderNumber
7. ⏳ Aggiornare frontend per mostrare nuovi campi
