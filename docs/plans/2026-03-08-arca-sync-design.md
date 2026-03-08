# Design: Arca Sync — Sincronizzazione bidirezionale PWA - ArcaPro

**Data**: 2026-03-08
**Stato**: Approvato

## Obiettivo

Sincronizzazione bidirezionale tra la PWA (fresis_history) e ArcaPro (doctes.dbf/docrig.dbf) tramite File System Access API del browser. L'utente preme un bottone nella pagina Storico Fresis e il sync parte automaticamente.

## Contesto

- ArcaPro gira su Windows 7 Pro, Chrome 109
- Path: `C:\Programmi (x86)\ArcaPro\Ditte\COOP16\`
- File chiave: `doctes.dbf` (~10MB, 15.153 record), `docrig.dbf` (~20MB, 52.348 righe)
- Arca viene aperto all'occorrenza (non sempre in esecuzione)
- Prima sync: importare TUTTI gli storici di COOP16
- Sync successive: solo delta (nuovi/modificati)

## Architettura

```
Chrome 109 (PC con ArcaPro)
  PWA Frontend
  |-- File System Access API
  |   |-- Legge doctes.dbf, docrig.dbf, ANAGRAFE.DBF
  |   |-- Scrive doctes.dbf, docrig.dbf (dopo backup)
  |   +-- Backup automatico in _backup/
  |
  +-- POST /api/arca-sync
       |-- Upload: DBF binari come ArrayBuffer
       +-- Download: DBF aggiornati + report sync

VPS Backend
  POST /api/arca-sync
  |-- Parse DBF ricevuti (doctes, docrig, anagrafe)
  |-- Delta sync con agents.fresis_history
  |   |-- Nuove FT in Arca non in PWA -> importa
  |   +-- Nuove FT in PWA non in Arca -> genera DBF records
  |-- Genera DBF aggiornati da scrivere su PC
  +-- Ritorna { importedCount, exportedCount, updatedDbfBuffers, report }
```

## Flusso utente

1. Apre Storico Fresis nella PWA dal PC con ArcaPro
2. Clicca bottone "Sincronizza con Arca"
3. Prima volta: Chrome chiede permesso cartella -> seleziona `COOP16`
4. Volte successive: Chrome ricorda il permesso
5. Frontend legge doctes.dbf + docrig.dbf + ANAGRAFE.DBF
6. Li invia al backend via POST /api/arca-sync
7. Backend processa il delta sync
8. Backend ritorna:
   - Report sync (N importati, N esportati, errori)
   - DBF aggiornati (se ci sono FT da esportare verso Arca)
9. Frontend scrive i DBF aggiornati sul disco locale (dopo backup)
10. Mostra riepilogo: "Importati 5 nuovi documenti, esportati 3 FT verso Arca"

## Delta sync — Logica

### Arca -> PWA (import nuove FT)

Per ogni record FT in doctes.dbf:
1. Calcola ID deterministico: `sha256(userId + esercizio + numerodoc + codicecf)`
2. Cerca in `agents.fresis_history` per ID
3. Se non esiste -> importa (come fa gia parseArcaExport)
4. Se esiste e `arca_data` e diverso -> aggiorna (merge conservativo)

### PWA -> Arca (export nuove FT)

Per ogni record in `fresis_history` con:
- `arca_data IS NOT NULL`
- `source = 'app'`
- Non presente in doctes.dbf (confronto ESERCIZIO + NUMERODOC)

Genera nuovi record DBF e li appende a doctes.dbf e docrig.dbf.

### Conflitti

Se una FT esiste in entrambi con dati diversi:
- **Arca vince** per i campi contabili (stato pagamento, scadenze)
- **PWA vince** per i campi operativi (stato ordine, tracking, DDT)
- Log del conflitto nel report sync

## Backup intelligente

Prima di ogni scrittura DBF:
1. Crea `_backup/` nella cartella COOP16 se non esiste
2. Copia `doctes.dbf` -> `_backup/doctes_YYYYMMDD_HHMMSS.dbf`
3. Copia `docrig.dbf` -> `_backup/docrig_YYYYMMDD_HHMMSS.dbf`
4. Copia anche i .CDX e .FPT corrispondenti
5. Mantiene gli ultimi 30 backup, elimina i piu vecchi
6. Se la scrittura fallisce -> ripristino automatico dal backup

## Vincoli Chrome 109

- File System Access API disponibile (`showDirectoryPicker`, `getFileHandle`, `createWritable`)
- Evitare: `structuredClone`, `Array.at()`, `Object.hasOwn()`
- OK usare: optional chaining `?.`, nullish coalescing `??`, async/await
- Max file read in memoria: ~30MB totali (doctes + docrig) — OK per 4GB RAM

## API Endpoint

### POST /api/arca-sync

**Request**: multipart/form-data
- `doctes`: Buffer del file doctes.dbf
- `docrig`: Buffer del file docrig.dbf
- `anagrafe`: Buffer del file ANAGRAFE.DBF (opzionale, per mapping clienti)

**Response**:
```json
{
  "success": true,
  "sync": {
    "imported": 5,
    "exported": 3,
    "updated": 1,
    "skipped": 0,
    "errors": []
  },
  "exportDbf": {
    "doctes": "<base64 del DBF aggiornato>",
    "docrig": "<base64 del DBF aggiornato>"
  }
}
```

Se `exportDbf` e presente, il frontend scrive i file aggiornati sul disco.

## File coinvolti

### Backend (nuovo)
- `src/services/arca-sync-service.ts` — logica delta sync
- `src/routes/arca-sync.ts` — route POST /api/arca-sync
- `src/services/arca-sync-service.spec.ts` — test

### Backend (riusa)
- `src/arca-import-service.ts` — parsing DBF (gia esistente)
- `src/arca-export-service.ts` — generazione DBF (gia esistente)
- `src/db/repositories/fresis-history.ts` — query DB

### Frontend (nuovo)
- `src/services/arca-sync-browser.ts` — File System Access API wrapper
- `src/components/ArcaSyncButton.tsx` — bottone + progress + report modal

### Frontend (modifica)
- `src/pages/FresisHistoryPage.tsx` — aggiungere il bottone sync

## Cosa NON fa (per ora)

- Non sincronizza SCADENZE.DBF (pagamenti) — Fase 2
- Non sincronizza TESTE/RIGHE.DBF (contabilita) — Fase 2
- Non sincronizza MAGMOV.DBF (movimenti magazzino) — Fase 2
- Non gestisce multi-utente simultaneo sugli stessi DBF
- Non fa sync automatico in background (solo su richiesta)
