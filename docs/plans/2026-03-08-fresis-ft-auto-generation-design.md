# Design: Generazione automatica FT nello Storico Fresis

**Data**: 2026-03-08
**Stato**: Approvato

## Problema

Quando un ordine a sottocliente viene inviato a Verona (Komet via Fresis), il record `fresis_history` viene creato con `arcaData: null`. L'utente deve poi ricreare manualmente la FT in Arca e ricopiarla nella PWA. Questo design elimina quel passaggio manuale generando automaticamente il documento FT compatibile con ArcaPro.

## Contesto strategico

- **Fase 1 (questo design)**: interoperabilita perfetta FT/KT tra PWA e ArcaPro
- **Fase 2**: integrare contabilita completa (piano conti, scadenzario, registri IVA)
- **Fase 3**: dismissione ArcaPro in favore completo della PWA
- FT = ordini sotto Fresis (sottoclienti). KT = ordini diretti Komet (futuro)
- Il flow e sempre PWA -> storico Fresis, mai viceversa. I dati PWA comandano.

## Flusso ordine (stato attuale + aggiunta)

```
1. Crea ordine sottocliente in PWA
2. Merge (opzionale) -> archiveOrders() -> fresis_history con arcaData: null
3. Submit to Archibald -> stato "piazzato" -> ordine ancora modificabile
   (utente puo fare edit-order, modifiche intermedie)
4. "Invia a Verona" -> send-to-verona handler -> stato "inviato_milano"
   ======================================================================
   >>> QUI: generare arcaData + assegnare numero FT                   <<<
   ======================================================================
```

### Perche questo trigger

- L'ordine e definitivo (non piu modificabile su Archibald)
- Tutti i dati sono consolidati (articoli, prezzi, sconti)
- I collegamenti ordine madre sono presenti (`archibald_order_id`)
- Non si "bruciano" numeri FT per ordini mai inviati
- L'utente puo fare modifiche intermedie tra piazzamento e invio

### Dati preservati dal punto 2 al punto 4

Nel record `fresis_history` si mantengono:
- `items` (articoli con prezzi sottocliente originali)
- `subClientCodice`, `subClientName`, `subClientData`
- `mergedIntoOrderId` (collegamento ordine madre per merged)
- `archibaldOrderId` (collegato al punto 3)
- `discountPercent`, `targetTotalWithVAT`, `shippingCost`
- `notes`

## Trigger: handler `send-to-verona.ts`

Dopo il successo dell'invio (riga 53, `updateOrderState -> 'inviato_milano'`):

1. Trova i record `fresis_history` collegati tramite `archibald_order_id`
2. Per ognuno con `arcaData IS NULL`:
   a. Recupera items dal record
   b. Assegna numero FT via `getNextFtNumber(esercizio)`
   c. Genera `arcaData` JSON (testata + righe)
   d. Aggiorna record con `arcaData`, `invoiceNumber`, `state = 'inviato_milano'`
3. Propaga stato ai siblings

## Mapping PWA -> ArcaData Testata

| Campo Arca | Sorgente PWA | Note |
|------------|-------------|------|
| `ID` | Auto-increment locale | Intero sequenziale |
| `ESERCIZIO` | Anno corrente (es. `"2026"`) | Da data invio |
| `TIPODOC` | `"FT"` | Sempre per ordini Fresis |
| `NUMERODOC` | `getNextFtNumber()` | Sequenziale per esercizio |
| `DATADOC` | Data invio a Verona | Formato `YYYYMMDD` Arca |
| `CODICECF` | `subClientCodice` (es. `"C00966"`) | 1:1 con anagrafe Arca |
| `TOTMERCE` | Somma `PREZZOTOT` righe | |
| `TOTNETTO` | `TOTMERCE` - sconti testata | |
| `TOTIVA` | Calcolato da righe x aliquote | |
| `TOTDOC` | `TOTNETTO` + `TOTIVA` | |
| `TOTSCONTO` | Differenza `TOTMERCE` - `TOTNETTO` | |
| `SCONTI` | Sconto globale ordine (stringa) | Es. `"10+5"` |
| `SCONTIF` | Fattore sconto cascata | Es. `0.855` |
| `AGENTE` | Codice agente da `users` | |
| `MAGPARTENZ` | Default magazzino | |
| `MAGARRIVO` | Default magazzino | |
| `VALUTA` | `"EUR"` | |
| `CAMBIO` | `1` | |
| `ACCONTO` | `0` | Default |
| `ABBUONO` | `0` | Default |
| `SPESETR` / `SPESEIM` / `SPESEVA` | `0` | Spese accessorie |

## Mapping PWA -> ArcaData Righe

Per ogni articolo in `items`:

| Campo Arca | Sorgente PWA | Note |
|------------|-------------|------|
| `ID` | Auto-increment locale | |
| `ID_TESTA` | ID testata generato | FK |
| `ESERCIZIO` | Stesso della testata | |
| `TIPODOC` | `"FT"` | |
| `NUMERODOC` | Stesso della testata | |
| `DATADOC` | Stesso della testata | |
| `CODICECF` | Stesso della testata | |
| `NUMERORIGA` | Progressivo (1, 2, 3...) | |
| `CODICEARTI` | `item.articleCode` | |
| `DESCRIZION` | `item.description` o nome prodotto | |
| `QUANTITA` | `item.quantity` | |
| `PREZZOUN` | Prezzo unitario sottocliente | |
| `SCONTI` | Sconto riga (stringa) | Es. `"10"` |
| `PREZZOTOT` | `round2(qty * price * (1 - disc/100))` | Formula Archibald |
| `ALIIVA` | `item.vat` (es. `"22"`) | Dall'articolo PWA |
| `UNMISURA` | `item.unit` o `"PZ"` default | |
| `MAGPARTENZ` | Default | |
| `MAGARRIVO` | Default | |
| `AGENTE` | Stesso della testata | |
| `VALUTA` | `"EUR"` | |
| `CAMBIO` | `1` | |

Campi non rilevanti (LOTTO, MATRICOLA, COMMESSA, etc.) inizializzati a default vuoti/zero.

## Struttura ArcaData JSON

```typescript
{
  testata: { /* ArcaTestata fields */ },
  righe: [ /* ArcaRiga[] */ ],
  destinazione_diversa: null | { /* indirizzo diverso */ }
}
```

## Riferimento struttura ArcaPro

- Path COOP16: `/Users/hatholdir/Downloads/ArcaPro/Ditte/COOP16/`
- `doctes.dbf`: 15.153 record, 619 bytes/record, chiave `(ESERCIZIO, TIPODOC, NUMERODOC)`
- `docrig.dbf`: 52.348 record, 409 bytes/record, FK `ID_TESTA`
- Numerazione FT in COOP16 2026: 001-287 (al 2026-03-08)
- Codici cliente: `CODICECF` = `C0xxxx` (allineati 1:1 con `subClientCodice` PWA)

## Modifica manuale post-generazione

Dopo la generazione automatica, l'utente puo aprire il record nello storico Fresis e modificare la scheda completa (tab Testa/Righe/Piede/Riepilogo) con auto-save. Questo copre casistiche edge e correzioni manuali.

## Cosa NON fa (per ora)

- Non genera GL entries (TESTE/RIGHE contabilita) -> Fase 2
- Non genera scadenzario (SCADENZE) -> Fase 2
- Non gestisce KT (note di credito) -> futuro
- Non fa export automatico verso Arca -> resta manuale via "Esporta verso Arca"
- Non gestisce multi-ditta -> solo Fresis per ora

## File coinvolti

### Backend
- `src/operations/handlers/send-to-verona.ts` - Aggiungere generazione FT dopo invio
- `src/db/repositories/fresis-history.ts` - Query per trovare record collegati
- Nuova funzione pura: `generateArcaDataFromFresisRecord()` - mapping PWA -> ArcaData
- `src/db/repositories/ft-counter.ts` - `getNextFtNumber` (gia esistente)

### Tipi
- `frontend/src/types/arca-data.ts` - `ArcaTestata`, `ArcaRiga`, `ArcaData` (gia esistenti)
- Backend: importare/replicare i tipi necessari

### Test
- Unit test per `generateArcaDataFromFresisRecord()` (funzione pura, facilmente testabile)
- Integration test per il flusso completo send-to-verona -> arcaData generato

## Regressioni da risolvere in parallelo

| # | Bug | Priorita |
|---|-----|----------|
| 1 | Response 98MB senza paginazione | CRITICA |
| 2 | ~~arcaData JSONB non stringificato~~ | RISOLTO |
| 3 | ~~Crash su record senza testata~~ | RISOLTO |
| 4 | Backend WebSocket CRUD events non emessi | ALTA |
| 5 | Import ArcA: single file vs multi-file | MEDIA |
| 6 | Upload sconti non atomico | BASSA |
