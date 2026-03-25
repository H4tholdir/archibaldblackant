# Design: Importa cliente in ANAGRAFE + Fix polling articoli

**Data**: 2026-03-25
**Stato**: Approvato

---

## Contesto

Durante la sync bidirezionale con ArcaPro, il sistema genera documenti KT per gli ordini PWA. Se l'ordine appartiene a un cliente creato solo nella PWA (non ancora presente nell'ANAGRAFE di ArcaPro), la modale di matching non trova nessun sottocliente corrispondente. L'utente non ha alternative: può solo abbinare a un sottocliente esistente oppure saltare. Saltare causa un secondo problema: il polling degli articoli si blocca indefinitamente.

---

## Problema 1: Polling articoli infinito (Bug)

### Causa radice

`getKtSyncStatus` conta come `articlesPending` **tutti** i KT senza `articlesSyncedAt`, inclusi quelli senza subclient match. Se un ordine non ha match, il bot non può scaricare il PDF degli articoli per quell'ordine. Il contatore non scende mai a zero e il frontend rimane bloccato nel loop di polling.

### Fix

Modificare `getKtSyncStatus` in `arca-sync-service.ts`: `articlesPending` e `articlesReady` vengono incrementati **solo** sugli ordini che hanno un subclient abbinato (`hasMatch = true`).

**Semantica post-fix dei campi `KtSyncStatus`**:
- `total`: tutti i KT eligible (invariato, include anche non-matchati)
- `articlesReady`: KT **con match** e con `articlesSyncedAt` valorizzato
- `articlesPending`: KT **con match** e senza `articlesSyncedAt`
- `matched`: KT con subclient abbinato (invariato)
- `unmatched`: KT senza subclient abbinato (invariato)
- `readyToExport`: KT con match e con articoli pronti (invariato)

Il frontend usa `articlesPending === 0` per uscire dal polling: con la nuova semantica, gli ordini non-matchati non bloccano questa condizione.

**Comportamento post-fix**: premendo "Salta" nella modale, il polling si sblocca immediatamente perché l'ordine saltato non contribuisce al conteggio. L'ordine rimane in DB e verrà ripreso al prossimo sync quando il cliente sarà stato importato e abbinato.

---

## Problema 2: Feature — Importa nuovo cliente in ANAGRAFE

### Flusso utente

1. La sync bidirezionale individua un KT il cui `customerProfileId` non ha subclient abbinato
2. Appare la modale `InlineMatcher` con tre azioni per ogni item:
   - **Abbina** (comportamento esistente: cerca sottocliente esistente)
   - **Importa in Arca** (nuovo)
   - **Salta** (comportamento esistente)
3. Premendo "Importa in Arca":
   - Mostra un mini-form con nome cliente (read-only) e campo CODICE
   - Il campo CODICE ha il primo carattere bloccato su `C` (maiuscolo fisso), 5 cifre libere
   - Pre-compilato con il prossimo codice C disponibile (da API `GET /suggest-codice`)
   - Validazione real-time (debounce 300ms): controlla se il codice esiste già in `shared.sub_clients` via `GET /check-codice?code=...`
   - Indicatore verde (disponibile) / rosso (già usato)
   - Pulsante Conferma disabilitato finché il codice non è valido e disponibile
4. Alla conferma (`POST /import-customer`):
   - Il backend valida il formato (`^C[0-9]{5}$`) e inserisce atomicamente: se il codice è già occupato (race condition), risponde 409 e il frontend mostra un errore invitando a scegliere un altro codice
   - Crea record in `shared.sub_clients` con i dati del cliente, `matched_customer_profile_id = customerProfileId` e `arca_synced_at = NULL`
   - `importCustomerAsSubclient` usa un INSERT diretto (non `upsertSubclients`): `upsertSubclients` omette `matched_customer_profile_id` dalla clausola `DO UPDATE SET`, il che causerebbe regressione se riusato qui
   - L'item avanza al successivo nel matcher: grazie a `matched_customer_profile_id` appena impostato, il KT risulta abbinato senza ulteriori chiamate
5. Al `finalizeKtExport` (endpoint `/api/arca-sync/finalize-kt`, funzione `generateKtExportVbs`):
   - Il VBS include **prima** i nuovi record ANAGRAFE, **poi** i documenti FT/KT — ordine obbligatorio perché ArcaPro non accetta documenti per clienti non presenti in ANAGRAFE
   - Il meccanismo esistente (`arca_synced_at IS NULL`) raccoglie automaticamente i nuovi subclient
   - Nota: `arca_synced_at` viene aggiornato a `NOW()` nel DB prima che il VBS venga eseguito sul PC Windows (comportamento pre-esistente, invariato dal nuovo flusso)

### Mapping dati `agents.customers` → `shared.sub_clients` → ANAGRAFE

| Campo `agents.customers` | Colonna DB `shared.sub_clients` | Campo TypeScript `Subclient` | Campo ANAGRAFE | Tipo ANAGRAFE |
|---|---|---|---|---|
| `name` | `ragione_sociale` | `ragioneSociale` | `DESCRIZION` | C(40), truncato |
| `vat_number` | `partita_iva` | `partitaIva` | `PARTIVA` | C(17) |
| `fiscal_code` | `cod_fiscale` | `codFiscale` | `CODFISCALE` | C(16) |
| `phone` | `telefono` | `telefono` | `TELEFONO` | C(20) |
| `mobile` | `telefono2` | `telefono2` | `TELEFONO2` | C(20) |
| `email` | `email` | `email` | `EMAIL` | C(50) |
| `pec` | `email_amministraz` | `emailAmministraz` | `EMAILAMM` | C(50) |
| `url` | `url` | `url` | `URL` | C(100) |
| `street` | `indirizzo` | `indirizzo` | `INDIRIZZO` | C(60) |
| `postal_code` | `cap` | `cap` | `CAP` | C(10) |
| `city` | `localita` | `localita` | `LOCALITA` | C(30) |
| `attention_to` | `pers_da_contattare` | `persDaContattare` | `PERSDACONT` | C(30) |
| *(fisso: `'I'`)* | `cod_nazione` | `codNazione` | `CODNAZIONE` | C(3) |
| *(fisso: `'I'`)* | `cb_nazione` | `cbNazione` | `CB_NAZIONE` | C(2) |
| *(user-provided)* | `codice` | `codice` | `CODICE` | C(6) |
| *(da request)* | `matched_customer_profile_id` | `matchedCustomerProfileId` | — | — |
| *(fisso: `NULL`)* | `arca_synced_at` | `arcaSyncedAt` | — | — |

**Note critiche**:
- `cod_nazione` e `cb_nazione` devono essere entrambi `'I'` (una sola lettera). I record ArcaPro esistenti usano `'I'`. La migrazione 020 ha default `'IT'` per `cod_nazione` ma va forzato a `'I'` in questo flusso.
- `PROV` (provincia) non è disponibile in `agents.customers` → campo ANAGRAFE lasciato vuoto.
- Tutti i campi commerciali (`agente`, `settore`, `pag`, `listino`, ecc.) vengono lasciati `NULL`: l'utente potrà completarli direttamente in ArcaPro dopo l'importazione.

### Note implementative

`importCustomerAsSubclient` usa un INSERT diretto su `shared.sub_clients`, non `upsertSubclients`. La funzione `upsertSubclients` esistente omette `matched_customer_profile_id` dalla clausola `DO UPDATE SET` e non può essere riusata senza modifiche; l'INSERT diretto è più sicuro e più esplicito.

La query `SELECT MAX(codice) FROM shared.sub_clients WHERE codice ~ '^C[0-9]{5}$'` opera su ~1865 record senza indice parziale. La scansione completa è accettabile per questo volume; non viene aggiunto un indice dedicato.

### Generazione e validazione CODICE

- Formato obbligatorio: `C` + esattamente 5 cifre (`^C[0-9]{5}$`)
- Il primo carattere `C` è obbligatorio e bloccato nell'UI
- Backend suggerisce il prossimo codice: `SELECT MAX(codice) FROM shared.sub_clients WHERE codice ~ '^C[0-9]{5}$'` → incrementa di 1 → fallback `C00001` se assente
- Se MAX è `C99999`, il backend restituisce errore esplicito (overflow): i codici disponibili sono esauriti
- `POST /import-customer` valida il formato server-side prima dell'INSERT; usa `INSERT ... WHERE NOT EXISTS` per gestire la race condition atomicamente; restituisce 409 se il codice è già occupato

### Fix critico: ordine sezioni nel VBS

`generateSyncVbs` attualmente genera le sezioni nell'ordine: **FT/KT → ANAGRAFE**. Va invertito: **ANAGRAFE → FT/KT**.

Questo è obbligatorio perché ArcaPro valida che `CODICECF` in DOCTES esista in ANAGRAFE al momento dell'inserimento. Un KT per un cliente non ancora in ANAGRAFE verrebbe rifiutato da VFP OLE DB. La modifica consiste nello spostare il blocco ANAGRAFE di `generateSyncVbs` prima del loop `for (const record of records)`.

---

## Componenti modificati

### Backend

| File | Modifica |
|---|---|
| `src/services/arca-sync-service.ts` | Fix `getKtSyncStatus`: `articlesReady`/`articlesPending` solo per ordini con match |
| `src/services/arca-sync-service.ts` | Fix `generateSyncVbs`: blocco ANAGRAFE spostato prima del loop FT/KT |
| `src/services/arca-sync-service.ts` | Nuova funzione `importCustomerAsSubclient(pool, userId, customerProfileId, codice)` |
| `src/routes/arca-sync.ts` | 3 nuovi endpoint: `GET /suggest-codice`, `GET /check-codice`, `POST /import-customer` |

### Frontend

| File | Modifica |
|---|---|
| `src/components/ArcaSyncButton.tsx` | `InlineMatcher`: terza azione "Importa in Arca", mini-form CODICE, validazione real-time, gestione errore 409 |

---

## Nuovi endpoint API

### `GET /api/arca-sync/suggest-codice`
Restituisce il prossimo codice C disponibile. Risponde 422 se overflow (`C99999` occupato).
```json
{ "suggestedCode": "C00042" }
```

### `GET /api/arca-sync/check-codice?code=C00042`
Verifica se il codice esiste già in `shared.sub_clients`.
```json
{ "exists": false }
```

### `POST /api/arca-sync/import-customer`
Crea un nuovo subclient da un profilo cliente PWA. Valida il formato `^C[0-9]{5}$` server-side. Inserimento atomico (gestisce race condition). Risponde 409 se codice già occupato.

**Request**:
```json
{
  "customerProfileId": "C01273",
  "codice": "C00042"
}
```

**Response** (successo):
```json
{ "success": true, "codice": "C00042" }
```

**Response** (409 - codice occupato):
```json
{ "error": "Codice già in uso" }
```

**Response** (422 - formato non valido):
```json
{ "error": "Formato codice non valido: deve essere C seguito da 5 cifre" }
```

---

## Test

### Unit
- `importCustomerAsSubclient`: verifica mapping tutti i campi, `cod_nazione = 'I'`, `cb_nazione = 'I'`, `arca_synced_at = NULL`
- `getKtSyncStatus`: ordini senza match non contribuiscono ad `articlesPending`; semantica `total` invariata
- `generateSyncVbs`: ANAGRAFE precede sempre FT/KT nell'output generato

### Integration
- `POST /import-customer` → record creato correttamente in `shared.sub_clients`
- `POST /import-customer` con codice già esistente → 409
- `POST /import-customer` con formato non valido (es. `P00001`, `CTEST`, `C1234`) → 422
- `GET /check-codice` → `true` su codice esistente, `false` su codice libero
- `GET /suggest-codice` → restituisce codice non ancora presente in `shared.sub_clients`
