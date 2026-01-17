# 📊 Integrazione Listino Prezzi Excel

## 📋 Panoramica

Il sistema Archibald Mobile supporta l'importazione di prezzi e IVA da file Excel, con **priorità gerarchica**:

```
1️⃣ EXCEL (priorità MASSIMA)
   ↓ sovrascrive
2️⃣ ARCHIBALD (scraping web)
```

Quando carichi un file Excel, i dati contenuti **sovrascrivono sempre** quelli provenienti da Archibald, garantendo che il listino Excel sia sempre la fonte di verità.

---

## 🎯 Come Funziona

### Backend: ExcelVatImporter Service

**File**: `backend/src/excel-vat-importer.ts`

**Processo**:
1. **Upload file** via endpoint `/api/prices/import-excel` (admin only)
2. **Parsing Excel**: legge file .xlsx o .xls usando libreria `xlsx`
3. **Matching prodotti**: matcha per ID e Codice Articolo
4. **Update database**: aggiorna prezzi e IVA con source tracking
5. **Audit log**: traccia tutte le modifiche in `price_changes` table
6. **Report dettagliato**: ritorna statistiche + prodotti non matchati

**Matching Algorithm**:
```typescript
// 1. Match by ID (priorità)
if (product.id === excelRow.id) → MATCH

// 2. Match by Codice Articolo (fallback)
if (product.name === excelRow.codiceArticolo) → MATCH

// 3. No match
→ Add to unmatchedProducts array
```

**Database Updates**:
```sql
UPDATE products SET
  price = ?,
  priceSource = 'excel',
  priceUpdatedAt = ?,
  vat = ?,
  vatSource = 'excel',
  vatUpdatedAt = ?
WHERE id = ?
```

---

## 📄 Formato File Excel Richiesto

### Struttura Colonne

| Colonna | Nome | Tipo | Obbligatorio | Esempio |
|---------|------|------|--------------|---------|
| **A** | ID | Testo | ✅ Sì | `001627K0` |
| **B** | Codice Articolo | Testo | ✅ Sì | `1.204.005` |
| **C** | Descrizione | Testo | ❌ No | `Vite M6x20` |
| **D** | Nome Gruppi | Testo | ❌ No | `Viteria` |
| **E** | Conf. | Numero | ❌ No | `100` |
| **F** | Prezzo di listino unit. | Numero | ⚠️ Opzionale | `1.50` |
| **G** | Prezzo di listino conf. | Numero | ⚠️ Opzionale | `150.00` |
| **H** | IVA | Numero | ✅ Sì | `22` |

### File Esempio: `Listino_2026_vendita.xlsx`

```
| ID       | Codice Articolo | Descrizione    | Nome Gruppi | Conf. | Prezzo Unit. | Prezzo Conf. | IVA |
|----------|----------------|----------------|-------------|-------|--------------|--------------|-----|
| 001627K0 | 1.204.005      | Vite M6x20     | Viteria     | 100   | 1.50         | 150.00       | 22  |
| 002341A1 | 2.105.112      | Bullone M8x30  | Bulloneria  | 50    | 2.30         | 115.00       | 22  |
| 003892B2 | 3.201.008      | Rondella Ø8    | Rondelle    | 200   | 0.15         | 30.00        | 22  |
```

**Note importanti**:
- Prima riga = header (viene saltata)
- Se `Prezzo Unit.` e `Prezzo Conf.` sono entrambi presenti, viene usato `Prezzo Conf.` (più specifico)
- IVA in formato percentuale (22 = 22%)
- File max size: 10 MB

---

## 🖥️ Frontend: ExcelPriceManager Component

**File**: `frontend/src/components/ExcelPriceManager.tsx`

**Interfaccia Admin (/admin)**:

### 📤 Sezione Upload
- **File picker**: Selezione file .xlsx o .xls
- **Checkbox "Sovrascrivi prezzi"**: (default: true) Sovrascrive prezzi Archibald con Excel
- **Pulsante "Importa Listino"**: Avvia import
- **Progress bar**: Mostra avanzamento upload

### ✅ Risultati Ultimo Import
- **Statistiche**: totale righe, matchati, non matchati, prezzi aggiornati, IVA aggiornate
- **Tabella prodotti non matchati**: Mostra quali prodotti Excel non hanno trovato corrispondenza nel DB
  - ID Excel
  - Codice Articolo
  - Descrizione
  - Motivo (es: "Non trovato in DB")

### 📋 Storico Import
- Tabella con tutti gli import effettuati:
  - Data/ora
  - Nome file
  - Caricato da (userId)
  - Statistiche (righe, matchati, prezzi, IVA)
  - Stato (✓ Completato, ✗ Errore, ⏳ In corso)

### ❓ Sezione Help
- Istruzioni passo-passo
- Info priorità dati (Excel > Archibald)

---

## 🔌 API Endpoints

### POST /api/prices/import-excel
**Auth**: JWT + Admin role required

**Request**: `multipart/form-data`
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@Listino_2026_vendita.xlsx" \
  -F "overwritePrices=true" \
  http://localhost:3001/api/prices/import-excel
```

**Response**:
```json
{
  "success": true,
  "data": {
    "importId": 1,
    "totalRows": 150,
    "matchedRows": 147,
    "unmatchedRows": 3,
    "vatUpdatedCount": 147,
    "priceUpdatedCount": 142,
    "unmatchedProducts": [
      {
        "excelId": "999999XX",
        "excelCodiceArticolo": "9.999.999",
        "excelDescrizione": "Prodotto non trovato",
        "reason": "No match found in database"
      }
    ]
  },
  "message": "Import completato: 147 prodotti aggiornati"
}
```

### GET /api/prices/:productId/history
**Auth**: JWT required

**Response**: Storico modifiche prezzo per prodotto specifico
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "productId": "001627K0",
      "oldPrice": 1.40,
      "newPrice": 1.50,
      "oldVat": null,
      "newVat": 22,
      "source": "excel",
      "changedAt": 1704067200,
      "changedBy": "admin@example.com"
    }
  ]
}
```

### GET /api/prices/history/recent
**Auth**: JWT required

**Response**: Ultime modifiche prezzi (tutti i prodotti)

### GET /api/prices/imports
**Auth**: JWT + Admin required

**Response**: Storico import Excel
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "filename": "Listino_2026_vendita.xlsx",
      "uploadedAt": 1704067200,
      "uploadedBy": "admin@example.com",
      "totalRows": 150,
      "matchedRows": 147,
      "unmatchedRows": 3,
      "vatUpdatedCount": 147,
      "priceUpdatedCount": 142,
      "status": "completed"
    }
  ]
}
```

### GET /api/prices/unmatched?importId=1
**Auth**: JWT + Admin required

**Response**: Prodotti non matchati per import specifico

---

## 🔄 Flusso Completo

### 1. Preparazione File Excel
```bash
Admin prepara:
- Listino_2026_vendita.xlsx
- Colonne: ID, Codice Articolo, IVA (obbligatori)
- Prezzi opzionali (se presenti, vengono aggiornati)
```

### 2. Upload via Admin Page
```
Admin → /admin → Sezione "Gestione Listino Prezzi Excel"
  ↓
Seleziona file → Clicca "Importa Listino"
  ↓
Progress bar (0% → 100%)
```

### 3. Backend Processing
```
Backend riceve file:
  ↓
1. Parse Excel (XLSX library)
  ↓
2. Match prodotti (by ID, fallback Codice Articolo)
  ↓
3. Update database:
   - SET priceSource = 'excel'
   - SET vatSource = 'excel'
   - Log in price_changes table
  ↓
4. Return report (matched, unmatched, updated counts)
```

### 4. Frontend Display
```
Admin vede risultati:
  ✓ 147 matchati
  ✗ 3 non matchati
  💰 142 prezzi aggiornati
  🏷️ 147 IVA aggiornate

Click "Mostra prodotti non matchati":
  → Tabella con 3 righe (ID, Codice, Descrizione, Motivo)
```

### 5. Utilizzo App Mobile
```
Agente apre app → OrderForm:
  ↓
Seleziona prodotto "001627K0":
  → Prezzo mostrato: €1.50 (da Excel) 📊
  → Badge: "Excel" (blu)
  → Priorità visibile
```

---

## 📊 Priority System nel Database

### Tabella `products`:
```sql
-- Campi per tracking source
priceSource TEXT,           -- 'excel' | 'archibald'
priceUpdatedAt INTEGER,     -- timestamp ultimo update
vatSource TEXT,             -- 'excel' | 'archibald'
vatUpdatedAt INTEGER        -- timestamp ultimo update
```

### Tabella `price_changes` (Audit Log):
```sql
CREATE TABLE price_changes (
  id INTEGER PRIMARY KEY,
  productId TEXT,
  oldPrice REAL,
  newPrice REAL,
  oldVat REAL,
  newVat REAL,
  source TEXT,              -- 'excel' | 'archibald'
  changedAt INTEGER,
  changedBy TEXT,           -- userId admin
  importId INTEGER          -- FK to excel_vat_imports
);
```

### Tabella `excel_vat_imports` (Storico Import):
```sql
CREATE TABLE excel_vat_imports (
  id INTEGER PRIMARY KEY,
  filename TEXT,
  uploadedAt INTEGER,
  uploadedBy TEXT,
  totalRows INTEGER,
  matchedRows INTEGER,
  unmatchedRows INTEGER,
  vatUpdatedCount INTEGER,
  priceUpdatedCount INTEGER,
  status TEXT               -- 'completed' | 'failed' | 'processing'
);
```

---

## 🎨 UI/UX Details

### ProductCard Component
**File**: `frontend/src/components/ProductCard.tsx`

Mostra priorità prezzi:
```tsx
<div className="price-section">
  <strong>Prezzo:</strong> €1.50
  {product.priceSource && (
    <span className={`source-badge ${product.priceSource}`}>
      {product.priceSource === 'excel' ? '📊 Excel' : '🌐 Archibald'}
    </span>
  )}
</div>
```

**Styling**:
- Badge Excel: Blu (#1976d2)
- Badge Archibald: Arancione (#f57c00)
- Excel badge più visibile (priorità maggiore)

---

## ⚠️ Gestione Errori

### File Upload Errors
```javascript
// File troppo grande (>10MB)
Error: "File size exceeds 10MB limit"

// Formato non supportato
Error: "Only Excel files (.xlsx, .xls) are allowed"

// File corrotto
Error: "Failed to parse Excel file"
```

### Matching Errors
```javascript
// Prodotto non trovato
{
  excelId: "999999XX",
  reason: "No match found in database (ID and Codice Articolo)"
}

// ID duplicato in Excel
{
  excelId: "001627K0",
  reason: "Duplicate ID in Excel file (row 10, 45)"
}

// Dati mancanti
{
  excelId: "001627K0",
  reason: "Missing required field: IVA"
}
```

### Database Errors
```javascript
// Constraint violation
Error: "Failed to update product: database constraint"

// Transaction rollback
Error: "Import failed, all changes rolled back"
```

---

## 🔧 Maintenance

### Update Excel File
```bash
1. Admin scarica listino da ERP/gestionale
2. Converte in formato Excel (.xlsx)
3. Verifica colonne richieste (A-H)
4. Upload via Admin Page
5. Verifica risultati (matched/unmatched)
6. Se unmatched > 10%: controllare dati
```

### Risoluzione Unmatched Products
```bash
Caso 1: ID/Codice errato in Excel
  → Correggere Excel e re-import

Caso 2: Prodotto non ancora in Archibald
  → Sync prodotti da Archibald prima
  → Poi re-import Excel

Caso 3: Prodotto discontinued
  → Rimuovere da Excel o aggiungere flag
```

### Database Cleanup
```sql
-- Rimuovere import vecchi (> 90 giorni)
DELETE FROM excel_vat_imports
WHERE uploadedAt < strftime('%s', 'now') - (90 * 24 * 60 * 60);

-- Rimuovere audit log vecchio (> 180 giorni)
DELETE FROM price_changes
WHERE changedAt < strftime('%s', 'now') - (180 * 24 * 60 * 60);
```

---

## 📈 Statistics & Monitoring

### Import Success Rate
```sql
SELECT
  COUNT(*) as total_imports,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
  AVG(matchedRows * 100.0 / totalRows) as avg_match_rate
FROM excel_vat_imports;
```

### Most Updated Products
```sql
SELECT
  p.id,
  p.name,
  COUNT(pc.id) as update_count,
  MAX(pc.changedAt) as last_updated
FROM products p
JOIN price_changes pc ON p.id = pc.productId
WHERE pc.source = 'excel'
GROUP BY p.id
ORDER BY update_count DESC
LIMIT 20;
```

### Price Source Distribution
```sql
SELECT
  priceSource,
  COUNT(*) as product_count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM products), 2) as percentage
FROM products
WHERE price IS NOT NULL
GROUP BY priceSource;
```

**Expected Results** (after Excel import):
```
priceSource | product_count | percentage
------------|---------------|------------
excel       | 147           | 98.9%
archibald   | 2             | 1.1%
```

---

## 🚀 Quick Start Guide

### Per Admin

1. **Prima volta**:
   ```bash
   - Login come admin
   - Vai su /admin
   - Scroll a "Gestione Listino Prezzi Excel"
   ```

2. **Preparare Excel**:
   ```bash
   - Colonne A-H come da formato
   - Header in prima riga
   - Dati da riga 2 in poi
   - Salvare come .xlsx
   ```

3. **Upload**:
   ```bash
   - Click "Scegli file Excel"
   - Seleziona file
   - Lascia "Sovrascrivi prezzi" attivo
   - Click "Importa Listino"
   - Attendere progress bar (5-10 secondi)
   ```

4. **Verifica risultati**:
   ```bash
   - Controllare statistiche
   - Se unmatch > 0: Click "Mostra prodotti non matchati"
   - Verificare motivi
   - Correggere Excel se necessario
   - Re-import
   ```

### Per Sviluppatori

**Test locale**:
```bash
# Backend test
cd backend
npm run test -- excel-vat-importer.test.ts

# Upload test file
curl -X POST \
  -H "Authorization: Bearer YOUR_JWT" \
  -F "file=@test/fixtures/listino_test.xlsx" \
  -F "overwritePrices=true" \
  http://localhost:3001/api/prices/import-excel
```

**Debug**:
```bash
# Check logs
tail -f backend/logs/app.log | grep "Excel"

# Check database
sqlite3 backend/data/products.db "SELECT * FROM excel_vat_imports ORDER BY id DESC LIMIT 1;"
```

---

## 📝 Checklist Pre-Import

- [ ] File Excel formato .xlsx o .xls
- [ ] Colonne A, B, H compilate (ID, Codice Articolo, IVA)
- [ ] Prima riga = header
- [ ] File < 10 MB
- [ ] Backup database (opzionale ma raccomandato)
- [ ] Sync Archibald prodotti completato (per matching ottimale)
- [ ] Admin autenticato

## 📝 Checklist Post-Import

- [ ] Statistiche visualizzate correttamente
- [ ] Match rate > 90% (ideale: 98-99%)
- [ ] Prezzi visibili in ProductCard con badge "Excel"
- [ ] Storico import registrato
- [ ] Prodotti non matchati analizzati
- [ ] Agents notificati se cambiamenti significativi

---

## 🎯 Best Practices

1. **Frequenza Import**: Settimanale o quando ERP aggiorna listino
2. **Backup**: Sempre backup DB prima di import massivo
3. **Verifica**: Controllare sempre unmatched products
4. **Audit**: Monitorare price_changes per anomalie
5. **Communication**: Notificare agents se prezzi cambiano significativamente

---

## ✅ Summary

**Excel Integration Complete!** 🎉

✅ Backend: ExcelVatImporter service + API endpoints
✅ Frontend: ExcelPriceManager component integrato in Admin Page
✅ Database: Tables per audit log e import history
✅ Priority System: Excel > Archibald (tracciato con source fields)
✅ UI: Upload, progress, risultati, storico, unmatched products
✅ Error Handling: Validation, matching errors, rollback
✅ Documentation: Questa guida completa

**Pronto per l'uso!** 🚀
