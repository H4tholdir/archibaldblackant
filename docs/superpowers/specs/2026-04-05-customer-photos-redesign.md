# Customer Photos Redesign — Spec

**Data:** 2026-04-05  
**Stato:** Approvato  
**Migration:** 051

---

## Contesto

Il sistema attuale salva le foto dei clienti come base64 TEXT in PostgreSQL. Questo causa:
- Bloat del DB (+33% dimensioni rispetto a bytea binario)
- Nessun HTTP caching (ogni visita alla lista scarica tutte le foto)
- `fetchWithRetry` ritenta i 503 di nginx → amplifica il carico
- GDPR: la cancellazione di una foto lascia copie nei backup PostgreSQL
- Nessuna validazione MIME lato backend

---

## Obiettivo

Sistema foto snello, performante, GDPR-compliant e usabile da tutti gli agenti futuri:

- **Storage:** Hetzner Object Storage (S3-compatible, UE, già pianificato nel roadmap compliance)
- **Performance:** ETag + Cache-Control → 0 richieste al server dopo la prima visita (< 24h)
- **GDPR:** lifecycle del file separato dal DB, cascade delete certa
- **Mobile:** compressione server-side con Sharp, `capture` su input file

---

## Architettura

```
[Browser]
  │
  │ POST multipart (file originale, max 10MB)
  ▼
[Express Backend]
  ├─ Validazione MIME (jpeg/png/webp/gif)
  ├─ Sharp: resize max 512px, WebP qualità 80
  ├─ photo-storage.ts → Hetzner PutObject
  │   Key: "agents/{userId}/{erpId}.webp"
  ├─ ETag = SHA-256(buffer).hex
  └─ DB: photo_key, photo_etag aggiornati

[Browser → GET /api/customers/:erpId/photo]
  │
  ▼
[Express Backend]
  ├─ Verifica JWT
  ├─ SELECT photo_key, photo_etag FROM DB
  ├─ Se NULL → 204
  ├─ Se If-None-Match === photo_etag → 304 (zero bytes, zero fetch Hetzner)
  └─ Altrimenti → getPhoto da Hetzner + 200 + ETag + Cache-Control

[Browser]
  ├─ IntersectionObserver: carica foto solo quando la riga entra nel viewport
  ├─ Browser HTTP cache: 0 richieste nelle 24h successive
  └─ Dopo 24h: 304 Not Modified se foto invariata
```

---

## Data Model

### Migration 051

```sql
-- Rinomina colonna photo → photo_key
ALTER TABLE agents.customers
  RENAME COLUMN photo TO photo_key;

-- Azzera valori base64 esistenti (gli agenti ricaricoranno le foto)
UPDATE agents.customers SET photo_key = NULL;

-- Aggiunge colonna ETag per rispondere 304 senza fetch Hetzner
ALTER TABLE agents.customers
  ADD COLUMN photo_etag TEXT;
```

**Schema risultante:**

| Colonna | Tipo | Descrizione |
|---|---|---|
| `photo_key` | `TEXT` | Path relativo su Hetzner: `"agents/{userId}/{erpId}.webp"` oppure `NULL` |
| `photo_etag` | `TEXT` | SHA-256 hex del blob WebP, usato per rispondere 304 |

---

## Backend

### Nuovo service: `src/services/photo-storage.ts`

```ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// Configurazione via ENV:
// HETZNER_S3_ENDPOINT, HETZNER_S3_KEY, HETZNER_S3_SECRET, HETZNER_S3_BUCKET

export function createPhotoStorage(client: S3Client, bucket: string): PhotoStorage

type PhotoStorage = {
  putPhoto(key: string, buffer: Buffer): Promise<void>
  getPhoto(key: string): Promise<Buffer>
  deletePhoto(key: string): Promise<void>
}
```

Il client S3 è configurato con `forcePathStyle: true` (obbligatorio per Hetzner).

### Route `POST /api/customers/:erpId/photo`

```
1. Multer memoryStorage, limit: 10MB
2. Validazione MIME: accetta solo image/jpeg, image/png, image/webp, image/gif → 400 se non valido
3. Sharp pipeline:
   resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
   .webp({ quality: 80 })
   → Buffer WebP ≤ ~50KB tipicamente
4. ETag = crypto.createHash('sha256').update(buffer).digest('hex')
5. photoStorage.putPhoto("agents/{userId}/{erpId}.webp", buffer)
6. DB: UPDATE agents.customers SET photo_key = $1, photo_etag = $2 WHERE erp_id = $3 AND user_id = $4
7. → { success: true }

Errori:
- Hetzner irraggiungibile → 503, DB non aggiornato
- MIME non valido → 400
- File > 10MB → 413 (multer)
```

### Route `GET /api/customers/:erpId/photo`

```
1. Verifica JWT (userId)
2. SELECT photo_key, photo_etag FROM agents.customers WHERE erp_id=$1 AND user_id=$2
3. Se photo_key IS NULL → 204 No Content
4. Se req.headers['if-none-match'] === photo_etag → 304 Not Modified
5. photoStorage.getPhoto(photo_key) → buffer (~10-20ms)
6. res.set('Content-Type', 'image/webp')
   res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
   res.set('ETag', photo_etag)
   res.send(buffer)

Errori:
- File non trovato su Hetzner (orfano) → 204 + log warning
- Hetzner irraggiungibile → 503
```

### Route `DELETE /api/customers/:erpId/photo`

```
1. SELECT photo_key FROM agents.customers WHERE erp_id=$1 AND user_id=$2
2. Se photo_key IS NULL → 204 (idempotente)
3. photoStorage.deletePhoto(photo_key)
4. DB: UPDATE SET photo_key = NULL, photo_etag = NULL
5. → { success: true }

Errori:
- Hetzner irraggiungibile → 500 (foto rimane su Hetzner, riconciliazione la eliminerà)
```

### Cascade delete clienti

In `deleteCustomer` (repository `customers.ts`): prima di cancellare la riga, se `photo_key IS NOT NULL` → `photoStorage.deletePhoto(key)`.

### Job riconciliazione (settimanale)

Uno script/job BullMQ che:
1. Lista tutti gli oggetti nel bucket (`agents/**`)
2. Per ogni key, verifica che esista una riga `agents.customers` con quel `photo_key`
3. Gli oggetti orfani vengono eliminati

Questo copre i casi in cui il cascade sincrono fallisce (es. Hetzner down al momento della delete).

### Variabili ENV nuove

```
HETZNER_S3_ENDPOINT=https://fsn1.your-objectstorage.com
HETZNER_S3_KEY=<access-key-id>
HETZNER_S3_SECRET=<secret-access-key>
HETZNER_S3_BUCKET=archibald-customer-photos
```

### Dipendenze nuove

```json
"sharp": "^0.33",
"@aws-sdk/client-s3": "^3"
```

---

## Frontend

### `customers.service.ts` — `getPhotoUrl`

- Passa `{ maxRetries: 0 }` a `fetchWithRetry` (foto non critiche, nessun retry)
- Rimuove `compressImage` (la compressione passa a Sharp nel backend)
- Upload: il `PhotoCropModal` rimane invariato (crop circolare 1:1 via canvas), ma il blob croppato viene inviato direttamente senza passare per `compressImage`. Sharp riceve il blob croppato e produce il WebP finale.

### `CustomerList.tsx` — IntersectionObserver

Rimuove:
- `photoCache` module-level `Map` — sostituita dalla HTTP cache del browser
- Batch polling con concorrenza fissa

Aggiunge:
- `IntersectionObserver` per ogni `CustomerRow`: fetch foto solo quando la riga entra nel viewport (rootMargin: `300px` per preload anticipato)
- Il browser serve dalla cache HTTP nelle visite successive — nessuna logica aggiuntiva necessaria

### Input file mobile

```html
<input type="file" accept="image/*" />
```

`accept="image/*"` senza `capture`: su iOS/Android mostra un picker con "Scatta foto / Libreria foto / File", lasciando all'agente la scelta. `capture="environment"` è sconsigliato perché forcerebbe solo la fotocamera, rimuovendo l'accesso alla galleria.

---

## GDPR

| Azione | Effetto |
|---|---|
| Agente cancella foto | File rimosso da Hetzner immediatamente |
| Cliente rimosso dal DB | Cascade → file rimosso da Hetzner |
| Agente (utente) cancellato | Job riconciliazione elimina tutti i file `agents/{userId}/**` |
| Richiesta Art. 17 (oblio) | `DELETE /api/customers/:erpId/photo` per ogni cliente |

**Isolamento multi-agente:** garantito dalla struttura key `agents/{userId}/...` + WHERE `user_id` in tutte le query DB.

**Backup PostgreSQL:** non contengono più dati binari di foto. Il bucket Hetzner ha lifecycle indipendente.

---

## Error handling

| Scenario | HTTP | Comportamento frontend |
|---|---|---|
| Hetzner down durante upload | 503 | Toast errore, foto non cambia |
| Hetzner down durante fetch | 503 | Avatar gradiente (già funziona) |
| Hetzner down durante delete | 500 | Toast errore, riconciliazione pulisce dopo |
| File orfano su Hetzner | 204 | Avatar gradiente + log warning backend |
| MIME non accettato | 400 | Toast "Formato non supportato" |
| File > 10MB | 413 | Toast "File troppo grande (max 10MB)" |

---

## Testing

### Backend

- **Unit** `photo-storage.spec.ts`: `putPhoto`, `getPhoto`, `deletePhoto` con S3Client mockato — verifica parametri PutObjectCommand, gestione errori NoSuchKey
- **Unit** `photo-processing.spec.ts`: Sharp pipeline — JPEG 4000×3000px → WebP output ≤ 512px in entrambe le dimensioni, buffer non vuoto
- **Integration** `customers.spec.ts` (route photo):
  - POST: mock `photoStorage.putPhoto`, verifica ETag calcolato correttamente e salvato in DB
  - GET: risponde 304 se `If-None-Match` corrisponde all'ETag in DB; risponde 200 con buffer altrimenti
  - DELETE: mock `photoStorage.deletePhoto`, verifica DB azzerato
  - Cascade: `deleteCustomer` chiama `photoStorage.deletePhoto` se `photo_key` presente

### Frontend

- **Unit** `CustomerList.spec.tsx`: IntersectionObserver mockato — verifica che `getPhotoUrl` venga chiamato solo dopo che la riga entra nel viewport, non al mount

---

## Sequence di implementazione

1. **Migration 051** — `photo_key` + `photo_etag`
2. **`photo-storage.ts`** — wrapper S3 Hetzner + unit test
3. **Backend routes** — POST/GET/DELETE aggiornate + integration test
4. **Cascade delete** — `deleteCustomer` aggiornato
5. **Job riconciliazione** — BullMQ weekly job
6. **Frontend service** — rimuovi `compressImage`, `maxRetries: 0`
7. **`CustomerList.tsx`** — IntersectionObserver, rimuovi `photoCache`
8. **ENV produzione** — configurare bucket Hetzner + variabili

---

## Note operative

- Il bucket Hetzner deve essere creato prima del deploy (già pianificato nel roadmap compliance)
- I valori `photo_key` esistenti vengono azzerati dalla migration — gli agenti dovranno ricaricare le foto. Con pochi agenti e poche foto caricate finora, l'impatto è accettabile.
- La migration è la 051 perché la 050 è già assegnata al progetto Komet PKB.
