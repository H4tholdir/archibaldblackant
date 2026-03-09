# Design: Import Listino Komet Unificato (IVA + Sconti Fresis)

**Data:** 2026-03-09
**Stato:** Approvato

## Obiettivo

Unificare le due sezioni admin "Carica Listino Excel (Solo IVA)" e "Sconti Articolo Fresis" in un unico punto di import. L'utente carica il file Excel fornito da Komet e la PWA aggiorna automaticamente sia i valori IVA che le percentuali di sconto Fresis, calcolando queste ultime direttamente dai prezzi listino/KP presenti nel file.

## Struttura file Excel atteso

File: `Listino 2026 vendita e acquisto.xlsx`
Sheet: primo foglio
Righe dati: ~4.300

Colonne rilevanti:
| Colonna | Uso |
|---------|-----|
| `ID` | chiave di match con `shared.products` |
| `Codice Articolo` | riferimento secondario |
| `Descrizione` | solo per log "non abbinati" |
| `Prezzo di listino unit.` | prezzo vendita (base calcolo sconto) |
| `Prezzo KP unit. ` | prezzo acquisto Fresis (trailing space nel header) |
| `IVA` | aliquota IVA (valori presenti: 4, 22) |

## Logica calcolo sconto

```
discountPercent = round((1 - prezzoKP / prezzoListino) * 100)
```

Arrotondamento a intero (decisione approvata).
Distribuzione attesa: 11 fasce (25, 30, 35, 45, 50, 53, 55, 60, 62, 63, 65%).
Fascia dominante: 63% (87.5% degli articoli = `FRESIS_DEFAULT_DISCOUNT`).

Edge cases:
- `prezzoListino = 0` o mancante → articolo skippato, loggato come non abbinato
- `prezzoKP` mancante → articolo skippato, loggato come non abbinato

## Comportamento import

- **Struttura prodotti:** gestita dalle sync Archibald, mai modificata da questo import
- **IVA:** upsert su `shared.products.iva_rate` per articoli trovati per ID
- **Sconti Fresis:** upsert su `agents.fresis_discounts.discount_percent` + `kp_price_unit`
- **Articoli non trovati nel DB:** loggati come "non abbinati", nessun errore bloccante
- **Articoli nel DB non presenti nell'Excel:** invariati (non toccati)
- **Sovrascrittura:** sempre — il listino Komet è fonte di verità, nessuna eccezione per sconti manuali

## Backend

### Nuovo endpoint
`POST /api/admin/import-komet-listino`
Auth: JWT richiesto
Content-type: `multipart/form-data` (campo `file`)

### Flusso
1. Parse Excel con `xlsx` — legge primo sheet
2. Normalizza headers (trim spazi, case-insensitive)
3. Per ogni riga:
   - Cerca prodotto in `shared.products` per ID (match primario)
   - Se trovato: aggiorna `iva_rate` via funzione esistente da `excel-vat-importer.ts`
   - Se trovato e `prezzoListino > 0` e `prezzoKP` valido: calcola sconto, upsert in `agents.fresis_discounts`
   - Se non trovato: aggiungi a `unmatched[]`
4. Propaga aggiornamenti IVA a varianti collegate (logica già presente in `excel-vat-importer.ts`)
5. Salva record import in tabella esistente
6. Restituisce risultato

### Response
```json
{
  "success": true,
  "data": {
    "totalRows": 4308,
    "ivaUpdated": 4250,
    "scontiUpdated": 4299,
    "unmatched": 58,
    "unmatchedProducts": [
      { "excelId": "001234K0", "excelCodiceArticolo": "1.204.005", "reason": "not found" }
    ]
  }
}
```

### File da creare/modificare
- **Nuovo:** `backend/src/routes/admin.ts` (o aggiungere a route esistente admin)
- **Nuovo:** `backend/src/services/komet-listino-importer.ts` — logica unificata parse+IVA+sconti
- **Riusato:** funzioni IVA da `excel-vat-importer.ts` (importate, non duplicate)
- **Invariato:** `POST /api/prices/import-excel` — rimane nel backend ma rimosso dall'UI admin

## Frontend

### Nuovo componente
`frontend/src/components/KometListinoImporter.tsx`

### Sostituisce in AdminPage
- `<ExcelPriceManager />` → rimosso
- `<FresisDiscountManager />` → rimosso
- `<KometListinoImporter />` → aggiunto al loro posto

### UI — sezioni
1. **Header** con titolo e descrizione chiara
2. **Box info formato file** — colonne richieste con esempio valori
3. **Upload zone** — drag & drop + click, accept `.xlsx,.xls`
4. **Progress bar** durante upload
5. **Risultato post-import** con tre badge:
   - IVA aggiornata: N prodotti
   - Sconti Fresis: N articoli (con breakdown fasce se utile)
   - Non abbinati: N (espandibile con lista)

### File da creare/modificare
- **Nuovo:** `frontend/src/components/KometListinoImporter.tsx`
- **Modificato:** `frontend/src/pages/AdminPage.tsx` — sostituisce i due componenti vecchi
- **Nuovo:** `frontend/src/api/komet-listino.ts` — funzione `importKometListino(file)`
- **Invariati:** `ExcelPriceManager.tsx`, `FresisDiscountManager.tsx` — rimossi dall'UI ma i file restano (non eliminati per ora)

## Test

### Backend (integration)
- POST con file Excel valido → verifica `ivaUpdated > 0` e `scontiUpdated > 0`
- POST con file senza colonna KP → verifica `scontiUpdated = 0`, nessun crash
- POST con articolo non in DB → verifica appare in `unmatchedProducts`
- POST senza file → 400

### Frontend (unit)
- Calcolo sconto: `round((1 - 0.72409 / 1.957) * 100) = 63`
- Edge case: `listino = 0` → skip
- Edge case: `kp` mancante → skip

## Non incluso in questo scope
- Modifica struttura tabella `fresis_discounts` (nessuna migrazione necessaria)
- Eliminazione fisica di `ExcelPriceManager.tsx` e `FresisDiscountManager.tsx`
- Modifica logica sync prezzi Archibald
