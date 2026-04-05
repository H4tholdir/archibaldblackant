# Customer Photos Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrare il sistema foto clienti da base64 TEXT in PostgreSQL a Hetzner Object Storage con ETag HTTP caching e IntersectionObserver lazy loading.

**Architecture:** Upload → Sharp WebP 512px server-side → Hetzner S3 bucket → `photo_key`/`photo_etag` in DB → GET con 304 ETag + `Cache-Control` → IntersectionObserver in `CustomerList`. Rimozione di `compressImage` frontend e `photoCache` module-level.

**Tech Stack:** `@aws-sdk/client-s3` (Hetzner S3-compatible), `sharp` (resize/WebP), SHA-256 ETag, `Cache-Control: public, max-age=86400, stale-while-revalidate=604800`, vitest, supertest, React IntersectionObserver.

**Spec:** `docs/superpowers/specs/2026-04-05-customer-photos-redesign.md`

---

## File Map

| File | Azione | Responsabilità |
|---|---|---|
| `backend/src/db/migrations/051-customer-photo-key.sql` | Crea | Rinomina colonna `photo→photo_key`, azzera valori, aggiunge `photo_etag` |
| `backend/src/services/photo-storage.ts` | Crea | Wrapper S3: `putPhoto`, `getPhoto`, `deletePhoto`, `listAllPhotoKeys` |
| `backend/src/services/photo-storage.spec.ts` | Crea | Unit test con S3Client mockato |
| `backend/src/services/photo-processing.ts` | Crea | Sharp pipeline: resize 512px, WebP 80%, SHA-256 ETag |
| `backend/src/services/photo-processing.spec.ts` | Crea | Unit test con sharp reale (no mock) |
| `backend/src/db/repositories/customers.ts` | Modifica | 3 funzioni foto aggiornate + nuova `getPhotoKeysForCustomers` |
| `backend/src/routes/customers.ts` | Modifica | Deps interface + POST/GET/DELETE photo routes |
| `backend/src/routes/customers.spec.ts` | Modifica | Test photo routes aggiornati |
| `backend/src/sync/photo-reconciliation.ts` | Crea | Job settimanale: elimina oggetti Hetzner orfani |
| `backend/src/sync/photo-reconciliation.spec.ts` | Crea | Unit test con mocks |
| `backend/src/sync/sync-scheduler.ts` | Modifica | Aggiunge timer settimanale per reconciliazione |
| `backend/src/server.ts` | Modifica | Crea S3Client + photoStorage, wiring deps |
| `frontend/src/services/customers.service.ts` | Modifica | Rimuove `compressImage`, `maxRetries: 0`, send blob croppato |
| `frontend/src/pages/CustomerList.tsx` | Modifica | Rimuove `photoCache`, aggiunge IntersectionObserver |

---

## Task 1: Migration 051

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/051-customer-photo-key.sql`

- [ ] **Step 1: Crea il file migration**

```sql
-- Migration 051: Customer photo storage redesign
-- Migra da base64 TEXT in-DB a photo_key (path Hetzner Object Storage)

ALTER TABLE agents.customers
  RENAME COLUMN photo TO photo_key;

-- Azzera i valori base64 esistenti: gli agenti ricaricoranno le foto
UPDATE agents.customers SET photo_key = NULL;

-- Aggiunge ETag (SHA-256 del blob WebP) per rispondere 304 senza fetch Hetzner
ALTER TABLE agents.customers
  ADD COLUMN photo_etag TEXT;
```

- [ ] **Step 2: Verifica che il file sia presente**

```bash
ls archibald-web-app/backend/src/db/migrations/ | sort | tail -5
```
Expected: `051-customer-photo-key.sql` appare nell'elenco.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/051-customer-photo-key.sql
git commit -m "feat(db): migration 051 — photo_key + photo_etag columns"
```

---

## Task 2: `photo-storage.ts` — Wrapper S3 Hetzner

**Files:**
- Create: `archibald-web-app/backend/src/services/photo-storage.ts`
- Create: `archibald-web-app/backend/src/services/photo-storage.spec.ts`

- [ ] **Step 1: Installa dipendenza**

```bash
npm install --prefix archibald-web-app/backend @aws-sdk/client-s3
```
Expected: package aggiunto a `package.json`, nessun errore.

- [ ] **Step 2: Scrivi il test (failing)**

`archibald-web-app/backend/src/services/photo-storage.spec.ts`:

```ts
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createPhotoStorage } from './photo-storage';

vi.mock('@aws-sdk/client-s3', async () => {
  const actual = await vi.importActual<typeof import('@aws-sdk/client-s3')>('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: vi.fn(),
    PutObjectCommand: vi.fn((args) => ({ ...args, _cmd: 'put' })),
    GetObjectCommand: vi.fn((args) => ({ ...args, _cmd: 'get' })),
    DeleteObjectCommand: vi.fn((args) => ({ ...args, _cmd: 'delete' })),
    ListObjectsV2Command: vi.fn((args) => ({ ...args, _cmd: 'list' })),
  };
});

const BUCKET = 'test-bucket';
const KEY = 'agents/user1/client1.webp';
const BUFFER = Buffer.from('fake-webp-data');

describe('createPhotoStorage', () => {
  let mockSend: ReturnType<typeof vi.fn>;
  let client: S3Client;

  beforeEach(() => {
    mockSend = vi.fn();
    vi.mocked(S3Client).mockImplementation(() => ({ send: mockSend }) as unknown as S3Client);
    client = new S3Client({});
  });

  describe('putPhoto', () => {
    test('invia PutObjectCommand con Bucket, Key, Body e ContentType image/webp', async () => {
      mockSend.mockResolvedValue({});
      const storage = createPhotoStorage(client, BUCKET);

      await storage.putPhoto(KEY, BUFFER);

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: BUCKET,
        Key: KEY,
        Body: BUFFER,
        ContentType: 'image/webp',
      });
      expect(mockSend).toHaveBeenCalledOnce();
    });
  });

  describe('getPhoto', () => {
    test('restituisce il buffer concatenato dal Body stream', async () => {
      const readable = Readable.from([BUFFER]);
      mockSend.mockResolvedValue({ Body: readable });
      const storage = createPhotoStorage(client, BUCKET);

      const result = await storage.getPhoto(KEY);

      expect(result).toEqual(BUFFER);
      expect(GetObjectCommand).toHaveBeenCalledWith({ Bucket: BUCKET, Key: KEY });
    });
  });

  describe('deletePhoto', () => {
    test('invia DeleteObjectCommand con Bucket e Key', async () => {
      mockSend.mockResolvedValue({});
      const storage = createPhotoStorage(client, BUCKET);

      await storage.deletePhoto(KEY);

      expect(DeleteObjectCommand).toHaveBeenCalledWith({ Bucket: BUCKET, Key: KEY });
      expect(mockSend).toHaveBeenCalledOnce();
    });
  });

  describe('listAllPhotoKeys', () => {
    test('restituisce tutti i key da bucket (paginazione singola)', async () => {
      mockSend.mockResolvedValue({
        Contents: [{ Key: 'agents/u1/c1.webp' }, { Key: 'agents/u1/c2.webp' }],
        IsTruncated: false,
      });
      const storage = createPhotoStorage(client, BUCKET);

      const keys = await storage.listAllPhotoKeys();

      expect(keys).toEqual(['agents/u1/c1.webp', 'agents/u1/c2.webp']);
      expect(ListObjectsV2Command).toHaveBeenCalledWith({ Bucket: BUCKET, ContinuationToken: undefined });
    });

    test('gestisce paginazione con IsTruncated', async () => {
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'agents/u1/c1.webp' }],
          IsTruncated: true,
          NextContinuationToken: 'token-2',
        })
        .mockResolvedValueOnce({
          Contents: [{ Key: 'agents/u1/c2.webp' }],
          IsTruncated: false,
        });
      const storage = createPhotoStorage(client, BUCKET);

      const keys = await storage.listAllPhotoKeys();

      expect(keys).toEqual(['agents/u1/c1.webp', 'agents/u1/c2.webp']);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });
});
```

- [ ] **Step 3: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose photo-storage
```
Expected: FAIL — `Cannot find module './photo-storage'`

- [ ] **Step 4: Implementa `photo-storage.ts`**

`archibald-web-app/backend/src/services/photo-storage.ts`:

```ts
import type { S3Client } from '@aws-sdk/client-s3';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type { Readable } from 'stream';

export type PhotoStorage = {
  putPhoto(key: string, buffer: Buffer): Promise<void>;
  getPhoto(key: string): Promise<Buffer>;
  deletePhoto(key: string): Promise<void>;
  listAllPhotoKeys(): Promise<string[]>;
};

export function createPhotoStorage(client: S3Client, bucket: string): PhotoStorage {
  return {
    async putPhoto(key, buffer) {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: 'image/webp',
      }));
    },

    async getPhoto(key) {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
      }
      return Buffer.concat(chunks);
    },

    async deletePhoto(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async listAllPhotoKeys() {
      const keys: string[] = [];
      let continuationToken: string | undefined;
      do {
        const response = await client.send(new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
        }));
        for (const obj of response.Contents ?? []) {
          if (obj.Key) keys.push(obj.Key);
        }
        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
      } while (continuationToken);
      return keys;
    },
  };
}
```

- [ ] **Step 5: Esegui il test per verificare che passa**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose photo-storage
```
Expected: PASS — 5 tests passed

- [ ] **Step 6: Type-check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | head -20
```
Expected: nessun errore TypeScript.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/services/photo-storage.ts archibald-web-app/backend/src/services/photo-storage.spec.ts
git commit -m "feat(backend): photo-storage service — S3/Hetzner wrapper"
```

---

## Task 3: `photo-processing.ts` — Sharp WebP pipeline

**Files:**
- Create: `archibald-web-app/backend/src/services/photo-processing.ts`
- Create: `archibald-web-app/backend/src/services/photo-processing.spec.ts`

- [ ] **Step 1: Installa dipendenza**

```bash
npm install --prefix archibald-web-app/backend sharp
```
Expected: sharp aggiunto a `package.json`. Sharp 0.33+ include i propri types, `@types/sharp` non serve.

- [ ] **Step 2: Scrivi il test (failing)**

`archibald-web-app/backend/src/services/photo-processing.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import sharp from 'sharp';
import { processPhoto, isAllowedMimeType } from './photo-processing';

async function makeTestImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 100, g: 150, b: 200 } },
  })
    .jpeg()
    .toBuffer();
}

describe('isAllowedMimeType', () => {
  test('accetta image/jpeg, image/png, image/webp, image/gif', () => {
    expect(isAllowedMimeType('image/jpeg')).toBe(true);
    expect(isAllowedMimeType('image/png')).toBe(true);
    expect(isAllowedMimeType('image/webp')).toBe(true);
    expect(isAllowedMimeType('image/gif')).toBe(true);
  });

  test('rifiuta application/pdf, image/svg+xml, text/html', () => {
    expect(isAllowedMimeType('application/pdf')).toBe(false);
    expect(isAllowedMimeType('image/svg+xml')).toBe(false);
    expect(isAllowedMimeType('text/html')).toBe(false);
  });
});

describe('processPhoto', () => {
  test('ridimensiona immagini grandi a max 512px e converte in WebP', async () => {
    const input = await makeTestImage(4000, 3000);
    const { buffer, etag } = await processPhoto(input);

    const metadata = await sharp(buffer).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBeLessThanOrEqual(512);
    expect(metadata.height).toBeLessThanOrEqual(512);
    expect(etag).toMatch(/^[0-9a-f]{64}$/);
  });

  test('non ingrandisce immagini già piccole (100x80 rimane 100x80)', async () => {
    const input = await makeTestImage(100, 80);
    const { buffer } = await processPhoto(input);

    const metadata = await sharp(buffer).metadata();
    expect(metadata.width).toBe(100);
    expect(metadata.height).toBe(80);
  });

  test('produce ETag SHA-256 deterministico (stesso input → stesso ETag)', async () => {
    const input = await makeTestImage(200, 200);
    const { etag: etag1 } = await processPhoto(input);
    const { etag: etag2 } = await processPhoto(input);

    expect(etag1).toBe(etag2);
    expect(etag1).toHaveLength(64);
  });
});
```

- [ ] **Step 3: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose photo-processing
```
Expected: FAIL — `Cannot find module './photo-processing'`

- [ ] **Step 4: Implementa `photo-processing.ts`**

`archibald-web-app/backend/src/services/photo-processing.ts`:

```ts
import sharp from 'sharp';
import { createHash } from 'crypto';

export type ProcessedPhoto = {
  buffer: Buffer;
  etag: string;
};

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.has(mimeType);
}

export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  const buffer = await sharp(input)
    .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const etag = createHash('sha256').update(buffer).digest('hex');
  return { buffer, etag };
}
```

- [ ] **Step 5: Esegui il test per verificare che passa**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose photo-processing
```
Expected: PASS — 5 tests passed

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/services/photo-processing.ts archibald-web-app/backend/src/services/photo-processing.spec.ts
git commit -m "feat(backend): photo-processing service — Sharp WebP 512px pipeline"
```

---

## Task 4: Repository — funzioni foto aggiornate

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/customers.ts`

Le funzioni `getCustomerPhoto`, `setCustomerPhoto`, `deleteCustomerPhoto` referenziano la colonna `photo` che è stata rinominata a `photo_key` dalla migration 051. Vanno aggiornate. Si aggiunge anche `getPhotoKeysForCustomers` per il cascade delete.

**Nota preliminare:** La query `getCustomers` usa `NULL::bytea AS photo` (non `c.photo`), quindi non è impattata dalla migration e non va modificata.

- [ ] **Step 1: Aggiorna `getCustomerPhoto` → `getCustomerPhotoInfo`**

Nel file `archibald-web-app/backend/src/db/repositories/customers.ts`, trova la funzione `getCustomerPhoto` (circa riga 706) e sostituiscila:

```ts
async function getCustomerPhotoInfo(
  pool: DbPool,
  userId: string,
  erpId: string,
): Promise<{ photoKey: string; photoEtag: string } | undefined> {
  const { rows } = await pool.query<{ photo_key: string | null; photo_etag: string | null }>(
    `SELECT photo_key, photo_etag FROM agents.customers
     WHERE erp_id = $1 AND user_id = $2`,
    [erpId, userId],
  );
  if (rows.length === 0 || !rows[0].photo_key) return undefined;
  return { photoKey: rows[0].photo_key, photoEtag: rows[0].photo_etag ?? '' };
}
```

- [ ] **Step 2: Aggiorna `setCustomerPhoto` → `setCustomerPhotoKey`**

Trova `setCustomerPhoto` (circa riga 719) e sostituiscila:

```ts
async function setCustomerPhotoKey(
  pool: DbPool,
  userId: string,
  erpId: string,
  photoKey: string,
  photoEtag: string,
): Promise<void> {
  await pool.query(
    `UPDATE agents.customers SET photo_key = $1, photo_etag = $2, updated_at = NOW()
     WHERE erp_id = $3 AND user_id = $4`,
    [photoKey, photoEtag, erpId, userId],
  );
}
```

- [ ] **Step 3: Aggiorna `deleteCustomerPhoto`**

Trova `deleteCustomerPhoto` (circa riga 732) e sostituisci la query SQL interna:

```ts
async function deleteCustomerPhoto(
  pool: DbPool,
  userId: string,
  erpId: string,
): Promise<void> {
  await pool.query(
    `UPDATE agents.customers SET photo_key = NULL, photo_etag = NULL, updated_at = NOW()
     WHERE erp_id = $1 AND user_id = $2`,
    [erpId, userId],
  );
}
```

- [ ] **Step 4: Aggiungi `getPhotoKeysForCustomers`**

Subito dopo `deleteCustomerPhoto`, aggiungi:

```ts
async function getPhotoKeysForCustomers(
  pool: DbPool,
  userId: string,
  erpIds: string[],
): Promise<Array<{ erpId: string; photoKey: string }>> {
  if (erpIds.length === 0) return [];
  const placeholders = erpIds.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query<{ erp_id: string; photo_key: string }>(
    `SELECT erp_id, photo_key FROM agents.customers
     WHERE erp_id IN (${placeholders})
       AND user_id = $${erpIds.length + 1}
       AND photo_key IS NOT NULL`,
    [...erpIds, userId],
  );
  return rows.map(r => ({ erpId: r.erp_id, photoKey: r.photo_key }));
}
```

- [ ] **Step 5: Aggiorna l'oggetto exports in fondo al file**

Trova la sezione `export` (circa riga 789) e aggiorna:

```ts
// Sostituisci:
getCustomerPhoto,
setCustomerPhoto,
// Con:
getCustomerPhotoInfo,
setCustomerPhotoKey,
// Aggiungi:
getPhotoKeysForCustomers,
```

`deleteCustomerPhoto` rimane (stesso nome, implementazione aggiornata).

- [ ] **Step 6: Verifica type-check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep -E "error TS|photo" | head -20
```
Expected: nessun errore relativo a photo.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/customers.ts
git commit -m "feat(backend): update customers repo — photo_key/photo_etag functions"
```

---

## Task 5: Backend routes — POST / GET / DELETE photo

**Files:**
- Modify: `archibald-web-app/backend/src/routes/customers.ts`
- Modify: `archibald-web-app/backend/src/routes/customers.spec.ts`

- [ ] **Step 1: Scrivi i test per le nuove route (failing)**

Nel file `archibald-web-app/backend/src/routes/customers.spec.ts`, trova i test `describe('GET /api/customers/:erpId/photo'` e `describe('POST /api/customers/:erpId/photo'` e `describe('DELETE /api/customers/:erpId/photo'` e **sostituisci interamente** quei tre describe block con:

```ts
describe('GET /api/customers/:erpId/photo', () => {
  test('restituisce 204 quando il cliente non ha foto', async () => {
    (deps.getCustomerPhotoInfo as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const res = await request(app).get('/api/customers/CUST-001/photo');
    expect(res.status).toBe(204);
  });

  test('restituisce 304 quando If-None-Match corrisponde all\'ETag in DB', async () => {
    const etag = 'abc123etag';
    (deps.getCustomerPhotoInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
      photoKey: 'agents/user-1/CUST-001.webp',
      photoEtag: etag,
    });
    const res = await request(app)
      .get('/api/customers/CUST-001/photo')
      .set('If-None-Match', etag);
    expect(res.status).toBe(304);
    expect(deps.photoStorage.getPhoto).not.toHaveBeenCalled();
  });

  test('restituisce 200 con buffer WebP, ETag e Cache-Control quando ETag non corrisponde', async () => {
    const etag = 'newetag456';
    const photoBuffer = Buffer.from('fake-webp');
    (deps.getCustomerPhotoInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
      photoKey: 'agents/user-1/CUST-001.webp',
      photoEtag: etag,
    });
    (deps.photoStorage.getPhoto as ReturnType<typeof vi.fn>).mockResolvedValue(photoBuffer);

    const res = await request(app).get('/api/customers/CUST-001/photo');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/webp');
    expect(res.headers['etag']).toBe(etag);
    expect(res.headers['cache-control']).toBe('public, max-age=86400, stale-while-revalidate=604800');
    expect(res.body).toBeDefined();
  });
});

describe('POST /api/customers/:erpId/photo', () => {
  test('processa il file, carica su Hetzner e salva photo_key + photo_etag in DB', async () => {
    const fakeWebp = Buffer.from('fake-webp-output');
    vi.mocked(processPhoto).mockResolvedValue({ buffer: fakeWebp, etag: 'sha256etag' });
    (deps.photoStorage.putPhoto as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (deps.setCustomerPhotoKey as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/customers/CUST-001/photo')
      .attach('photo', Buffer.from('fake-jpeg'), { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deps.photoStorage.putPhoto).toHaveBeenCalledWith(
      'agents/user-1/CUST-001.webp',
      fakeWebp,
    );
    expect(deps.setCustomerPhotoKey).toHaveBeenCalledWith(
      'user-1', 'CUST-001', 'agents/user-1/CUST-001.webp', 'sha256etag',
    );
  });

  test('restituisce 400 per MIME non supportato', async () => {
    const res = await request(app)
      .post('/api/customers/CUST-001/photo')
      .attach('photo', Buffer.from('fake-pdf'), { filename: 'doc.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('restituisce 400 quando nessun file è allegato', async () => {
    const res = await request(app).post('/api/customers/CUST-001/photo');
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/customers/:erpId/photo', () => {
  test('cancella da Hetzner e azzera photo_key in DB', async () => {
    (deps.getCustomerPhotoInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
      photoKey: 'agents/user-1/CUST-001.webp',
      photoEtag: 'someetag',
    });
    (deps.photoStorage.deletePhoto as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (deps.deleteCustomerPhoto as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await request(app).delete('/api/customers/CUST-001/photo');

    expect(res.status).toBe(200);
    expect(deps.photoStorage.deletePhoto).toHaveBeenCalledWith('agents/user-1/CUST-001.webp');
    expect(deps.deleteCustomerPhoto).toHaveBeenCalledWith('user-1', 'CUST-001');
  });

  test('restituisce 204 idempotente quando non c\'è foto', async () => {
    (deps.getCustomerPhotoInfo as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const res = await request(app).delete('/api/customers/CUST-001/photo');
    expect(res.status).toBe(204);
    expect(deps.photoStorage.deletePhoto).not.toHaveBeenCalled();
  });
});
```

Aggiorna anche `createMockDeps()` nello stesso file per aggiungere i nuovi campi deps:

```ts
// Nel createMockDeps(), sostituisci getCustomerPhoto/setCustomerPhoto con:
getCustomerPhotoInfo: vi.fn().mockResolvedValue(undefined),
setCustomerPhotoKey: vi.fn().mockResolvedValue(undefined),
// deleteCustomerPhoto rimane (stesso nome)
deleteCustomerPhoto: vi.fn().mockResolvedValue(undefined),
getPhotoKeysForCustomers: vi.fn().mockResolvedValue([]),
photoStorage: {
  putPhoto: vi.fn().mockResolvedValue(undefined),
  getPhoto: vi.fn().mockResolvedValue(Buffer.from('')),
  deletePhoto: vi.fn().mockResolvedValue(undefined),
  listAllPhotoKeys: vi.fn().mockResolvedValue([]),
},
```

Aggiungi in cima al file, **dopo gli import esistenti**:

```ts
import { processPhoto } from '../services/photo-processing';

vi.mock('../services/photo-processing');
```

`vi.mock` viene hoistato automaticamente da vitest — deve essere nel file (non dentro describe), ma l'import di `processPhoto` permette a `vi.mocked(processPhoto)` di funzionare con type-safety.

- [ ] **Step 2: Esegui i test per verificare che falliscono**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose customers.spec
```
Expected: FAIL — errori su `getCustomerPhotoInfo` non trovato, deps mancanti.

- [ ] **Step 3: Aggiorna `CustomersRouterDeps` in `customers.ts`**

Nel file `archibald-web-app/backend/src/routes/customers.ts`, nella `type CustomersRouterDeps`, **sostituisci** le righe di `getCustomerPhoto`, `setCustomerPhoto`:

```ts
// Rimuovi queste due righe:
getCustomerPhoto: (userId: string, erpId: string) => Promise<string | undefined>;
setCustomerPhoto: (userId: string, erpId: string, photo: string) => Promise<void>;

// Aggiungi al loro posto:
getCustomerPhotoInfo: (userId: string, erpId: string) => Promise<{ photoKey: string; photoEtag: string } | undefined>;
setCustomerPhotoKey: (userId: string, erpId: string, photoKey: string, photoEtag: string) => Promise<void>;
getPhotoKeysForCustomers: (userId: string, erpIds: string[]) => Promise<Array<{ erpId: string; photoKey: string }>>;
photoStorage: import('../services/photo-storage').PhotoStorage;
```

`deleteCustomerPhoto` rimane invariata nella signature.

- [ ] **Step 4: Aggiorna destructuring e multer in `createCustomersRouter`**

Nella funzione `createCustomersRouter`, aggiorna il destructuring (circa riga 100):

```ts
// Sostituisci:
getCustomerPhoto, setCustomerPhoto, deleteCustomerPhoto,
// Con:
getCustomerPhotoInfo, setCustomerPhotoKey, deleteCustomerPhoto, getPhotoKeysForCustomers, photoStorage,
```

Aggiorna il limite multer (riga ~12):

```ts
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // era 5MB, ora 10MB
});
```

Aggiungi import in cima al file:

```ts
import { processPhoto, isAllowedMimeType } from '../services/photo-processing';
```

- [ ] **Step 5: Riscrivi le 3 route foto**

Trova le route `router.get('/:erpId/photo'`, `router.post('/:erpId/photo'`, `router.delete('/:erpId/photo'` e sostituiscile interamente con:

```ts
router.get('/:erpId/photo', async (req: AuthRequest, res) => {
  try {
    const info = await getCustomerPhotoInfo(req.user!.userId, req.params.erpId);
    if (!info) return res.status(204).end();

    if (req.headers['if-none-match'] === info.photoEtag) {
      return res.status(304).end();
    }

    const buffer = await photoStorage.getPhoto(info.photoKey);
    res
      .set('Content-Type', 'image/webp')
      .set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
      .set('ETag', info.photoEtag)
      .send(buffer);
  } catch (error) {
    logger.error('Error fetching customer photo', { error });
    res.status(503).json({ success: false, error: 'Errore nel recupero foto' });
  }
});

router.post('/:erpId/photo', upload.single('photo'), async (req: AuthRequest, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, error: 'Nessun file allegato' });

    if (!isAllowedMimeType(file.mimetype)) {
      return res.status(400).json({ success: false, error: 'Formato non supportato. Usa JPEG, PNG, WebP o GIF.' });
    }

    const { buffer, etag } = await processPhoto(file.buffer);
    const photoKey = `agents/${req.user!.userId}/${req.params.erpId}.webp`;

    await photoStorage.putPhoto(photoKey, buffer);
    await setCustomerPhotoKey(req.user!.userId, req.params.erpId, photoKey, etag);

    res.json({ success: true });
  } catch (error) {
    logger.error('Error saving customer photo', { error });
    res.status(503).json({ success: false, error: 'Errore nel salvataggio foto' });
  }
});

router.delete('/:erpId/photo', async (req: AuthRequest, res) => {
  try {
    const info = await getCustomerPhotoInfo(req.user!.userId, req.params.erpId);
    if (!info) return res.status(204).end();

    await photoStorage.deletePhoto(info.photoKey);
    await deleteCustomerPhoto(req.user!.userId, req.params.erpId);

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting customer photo', { error });
    res.status(500).json({ success: false, error: 'Errore nella cancellazione foto' });
  }
});
```

- [ ] **Step 6: Esegui i test per verificare che passano**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose customers.spec
```
Expected: PASS — tutti i test photo passano.

- [ ] **Step 7: Type-check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | head -20
```
Expected: nessun errore TypeScript.

- [ ] **Step 8: Commit**

```bash
git add archibald-web-app/backend/src/routes/customers.ts archibald-web-app/backend/src/routes/customers.spec.ts
git commit -m "feat(backend): photo routes — ETag 304, Sharp WebP, Hetzner storage"
```

---

## Task 6: `server.ts` — Wiring S3Client + deps

**Files:**
- Modify: `archibald-web-app/backend/src/server.ts`

- [ ] **Step 1: Aggiungi import in cima a `server.ts`**

```ts
import { S3Client } from '@aws-sdk/client-s3';
import { createPhotoStorage } from './services/photo-storage';
import * as customersRepo from './db/repositories/customers';
```
(Se `customersRepo` è già importato, aggiungi solo i due nuovi import.)

- [ ] **Step 2: Crea `photoStorage` dopo la creazione del pool DB**

Trova il punto dove viene creato il `pool` e aggiungi subito dopo:

```ts
const photoStorage = createPhotoStorage(
  new S3Client({
    endpoint: process.env.HETZNER_S3_ENDPOINT!,
    region: 'eu-central',
    credentials: {
      accessKeyId: process.env.HETZNER_S3_KEY!,
      secretAccessKey: process.env.HETZNER_S3_SECRET!,
    },
    forcePathStyle: true,
  }),
  process.env.HETZNER_S3_BUCKET ?? 'archibald-customer-photos',
);
```

- [ ] **Step 3: Aggiorna i deps del router customers**

Trova `app.use('/api/customers', authenticate, createCustomersRouter({` e aggiorna i seguenti campi:

```ts
// Sostituisci:
getCustomerPhoto: (userId, profile) => customersRepo.getCustomerPhoto(pool, userId, profile),
setCustomerPhoto: (userId, profile, photo) => customersRepo.setCustomerPhoto(pool, userId, profile, photo),
// Con:
getCustomerPhotoInfo: (userId, erpId) => customersRepo.getCustomerPhotoInfo(pool, userId, erpId),
setCustomerPhotoKey: (userId, erpId, photoKey, photoEtag) => customersRepo.setCustomerPhotoKey(pool, userId, erpId, photoKey, photoEtag),
getPhotoKeysForCustomers: (userId, erpIds) => customersRepo.getPhotoKeysForCustomers(pool, userId, erpIds),
photoStorage,
// deleteCustomerPhoto rimane invariato:
deleteCustomerPhoto: (userId, profile) => customersRepo.deleteCustomerPhoto(pool, userId, profile),
```

- [ ] **Step 4: Aggiungi ENV alle variabili richieste**

Se esiste una validazione ENV in `server.ts`, aggiungi:
```
HETZNER_S3_ENDPOINT, HETZNER_S3_KEY, HETZNER_S3_SECRET, HETZNER_S3_BUCKET
```

- [ ] **Step 5: Type-check finale**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | head -20
```
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/server.ts
git commit -m "feat(backend): wire S3Client + photoStorage in server.ts"
```

---

## Task 7: Photo Reconciliation — cleanup oggetti orfani

**Files:**
- Create: `archibald-web-app/backend/src/sync/photo-reconciliation.ts`
- Create: `archibald-web-app/backend/src/sync/photo-reconciliation.spec.ts`
- Modify: `archibald-web-app/backend/src/sync/sync-scheduler.ts`

- [ ] **Step 1: Scrivi il test (failing)**

`archibald-web-app/backend/src/sync/photo-reconciliation.spec.ts`:

```ts
import { describe, expect, test, vi } from 'vitest';
import { reconcilePhotos } from './photo-reconciliation';
import type { PhotoStorage } from '../services/photo-storage';
import type { DbPool } from '../db/pool';

const makePhotoStorage = (keys: string[]): PhotoStorage => ({
  listAllPhotoKeys: vi.fn().mockResolvedValue(keys),
  putPhoto: vi.fn(),
  getPhoto: vi.fn(),
  deletePhoto: vi.fn().mockResolvedValue(undefined),
});

const makePool = (photoKeys: string[]): DbPool => ({
  query: vi.fn().mockResolvedValue({ rows: photoKeys.map(k => ({ photo_key: k })) }),
} as unknown as DbPool);

describe('reconcilePhotos', () => {
  test('elimina da Hetzner gli oggetti non presenti in DB', async () => {
    const storage = makePhotoStorage([
      'agents/u1/client1.webp',
      'agents/u1/client2.webp', // orfano
    ]);
    const pool = makePool(['agents/u1/client1.webp']);

    const deleted = await reconcilePhotos(pool, storage);

    expect(storage.deletePhoto).toHaveBeenCalledWith('agents/u1/client2.webp');
    expect(storage.deletePhoto).not.toHaveBeenCalledWith('agents/u1/client1.webp');
    expect(deleted).toBe(1);
  });

  test('non elimina nulla se tutti i key sono in DB', async () => {
    const keys = ['agents/u1/client1.webp', 'agents/u2/client3.webp'];
    const storage = makePhotoStorage(keys);
    const pool = makePool(keys);

    const deleted = await reconcilePhotos(pool, storage);

    expect(storage.deletePhoto).not.toHaveBeenCalled();
    expect(deleted).toBe(0);
  });

  test('non elimina nulla se bucket è vuoto', async () => {
    const storage = makePhotoStorage([]);
    const pool = makePool([]);

    const deleted = await reconcilePhotos(pool, storage);

    expect(deleted).toBe(0);
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose photo-reconciliation
```
Expected: FAIL — `Cannot find module './photo-reconciliation'`

- [ ] **Step 3: Implementa `photo-reconciliation.ts`**

`archibald-web-app/backend/src/sync/photo-reconciliation.ts`:

```ts
import type { DbPool } from '../db/pool';
import type { PhotoStorage } from '../services/photo-storage';
import { logger } from '../logger';

export async function reconcilePhotos(pool: DbPool, photoStorage: PhotoStorage): Promise<number> {
  const [bucketKeys, dbResult] = await Promise.all([
    photoStorage.listAllPhotoKeys(),
    pool.query<{ photo_key: string }>(
      `SELECT photo_key FROM agents.customers WHERE photo_key IS NOT NULL`,
    ),
  ]);

  const dbKeys = new Set(dbResult.rows.map(r => r.photo_key));
  const orphaned = bucketKeys.filter(k => !dbKeys.has(k));

  if (orphaned.length === 0) return 0;

  logger.info(`Photo reconciliation: ${orphaned.length} oggetti orfani trovati`, { count: orphaned.length });

  await Promise.all(
    orphaned.map(key =>
      photoStorage.deletePhoto(key).catch(err =>
        logger.error('Photo reconciliation: errore cancellazione', { key, err }),
      ),
    ),
  );

  return orphaned.length;
}
```

- [ ] **Step 4: Esegui il test per verificare che passa**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose photo-reconciliation
```
Expected: PASS — 3 tests passed

- [ ] **Step 5: Aggiunge timer settimanale in `sync-scheduler.ts`**

Nel file `archibald-web-app/backend/src/sync/sync-scheduler.ts`:

Aggiungi il parametro `runPhotoReconciliation` alla firma di `createSyncScheduler`:

```ts
// Aggiungi alla lista parametri opzionali:
runPhotoReconciliation?: () => Promise<number>,
```

Aggiungi la costante in cima al file (vicino alle altre costanti):

```ts
const PHOTO_RECONCILIATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // settimanale
```

Nel corpo di `createSyncScheduler`, aggiungi il timer (vicino agli altri `setInterval`):

```ts
if (runPhotoReconciliation) {
  const reconciliationTimer = setInterval(async () => {
    try {
      const deleted = await runPhotoReconciliation();
      if (deleted > 0) {
        logger.info(`Photo reconciliation completata: ${deleted} oggetti eliminati`);
      }
    } catch (err) {
      logger.error('Photo reconciliation fallita', { err });
    }
  }, PHOTO_RECONCILIATION_INTERVAL_MS);
  timers.push(reconciliationTimer);
}
```

- [ ] **Step 6: Aggiorna `server.ts` per passare `runPhotoReconciliation`**

Nel file `server.ts`, trova dove viene chiamato `createSyncScheduler` e aggiungi l'argomento:

```ts
// Importa reconcilePhotos se non già importato:
import { reconcilePhotos } from './sync/photo-reconciliation';

// Aggiungi come ultimo argomento di createSyncScheduler:
() => reconcilePhotos(pool, photoStorage),
```

- [ ] **Step 7: Type-check**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | grep "error TS" | head -20
```
Expected: nessun errore.

- [ ] **Step 8: Commit**

```bash
git add archibald-web-app/backend/src/sync/photo-reconciliation.ts \
         archibald-web-app/backend/src/sync/photo-reconciliation.spec.ts \
         archibald-web-app/backend/src/sync/sync-scheduler.ts \
         archibald-web-app/backend/src/server.ts
git commit -m "feat(backend): photo reconciliation job — cleanup oggetti Hetzner orfani"
```

---

## Task 8: Frontend — `customers.service.ts`

**Files:**
- Modify: `archibald-web-app/frontend/src/services/customers.service.ts`

- [ ] **Step 1: Aggiorna `uploadPhoto` — rimuovi `compressImage`, invia blob croppato**

Trova `uploadPhoto` (circa riga 300) e sostituisci:

```ts
async uploadPhoto(erpId: string, file: File): Promise<void> {
  const formData = new FormData();
  formData.append('photo', file, 'photo.jpg');

  await fetchWithRetry(
    `/api/customers/${encodeURIComponent(erpId)}/photo`,
    { method: 'POST', body: formData },
  );
}
```

Il metodo `uploadPhoto` ora accetta il blob croppato direttamente da `PhotoCropModal` — la compressione è delegata al backend (Sharp).

- [ ] **Step 2: Aggiorna `getPhotoUrl` — aggiungi `maxRetries: 0`**

Trova `getPhotoUrl` (circa riga 319) e sostituisci:

```ts
async getPhotoUrl(erpId: string): Promise<string | null> {
  try {
    const response = await fetchWithRetry(
      `/api/customers/${encodeURIComponent(erpId)}/photo`,
      undefined,
      { maxRetries: 0 },
    );
    if (!response.ok || response.status === 204) return null;

    const blob = await response.blob();
    return await this.blobToDataUri(blob);
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Rimuovi `compressImage`**

Elimina l'intero metodo privato `compressImage` (circa riga 333-359) — non è più necessario.

- [ ] **Step 4: Aggiorna `CustomerProfilePage.tsx` dove viene chiamato `uploadPhoto`**

Cerca in `archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx` il punto dove viene chiamato `uploadPhoto`:

```ts
// Ora deve passare il blob del crop direttamente
// Da:
const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
await customerService.uploadPhoto(erpId, file);
// La riga sopra non cambia, è già corretta — uploadPhoto riceve un File
```

Il chiamante (`CustomerProfilePage.tsx`) crea già un `File` dal blob croppato e chiama `uploadPhoto`. Non serve modifica qui.

- [ ] **Step 5: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | grep "error TS" | head -20
```
Expected: nessun errore.

- [ ] **Step 6: Esegui test frontend**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose customers
```
Expected: PASS

- [ ] **Step 7: Aggiorna `accept` dell'input foto in `CustomerProfilePage.tsx`**

Nel file `archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx`, trova l'elemento `<input` per il file foto (quello collegato a `photoInputRef`) e assicurati che l'attributo `accept` sia presente senza `capture`:

```tsx
// Prima (potrebbe avere capture o accept diverso):
<input ref={photoInputRef} type="file" style={{ display: 'none' }} ... />
// Dopo:
<input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={...} />
```

`accept="image/*"` senza `capture`: su iOS mostra picker con "Scatta foto / Libreria foto / File", su desktop apre il file selector.

- [ ] **Step 8: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | grep "error TS" | head -20
```
Expected: nessun errore.

- [ ] **Step 9: Esegui test frontend**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose customers
```
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add archibald-web-app/frontend/src/services/customers.service.ts \
         archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx
git commit -m "feat(frontend): photo service — rimuovi compressImage, maxRetries 0, accept image/*"
```

---

## Task 9: Frontend — `CustomerList.tsx` IntersectionObserver

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerList.tsx`

- [ ] **Step 1: Aggiungi `useRef` agli import React**

All'inizio del file, assicurati che `useRef` sia negli import:

```ts
import { useState, useEffect, useCallback, useRef } from 'react';
```

- [ ] **Step 2: Rimuovi `photoCache` e il batch loading**

Elimina la riga module-level:
```ts
const photoCache = new Map<string, string | null>();
```

Elimina l'intero `useEffect` che carica le foto in batch (il blocco `useEffect(() => { ... }, [visibleCustomers])` che contiene `CONCURRENCY = 5` e il loop di batch).

Elimina lo state `customerPhotos` e il suo `useState`:
```ts
// Rimuovi:
const [customerPhotos, setCustomerPhotos] = useState<Record<string, string | null>>({});
```

- [ ] **Step 3: Aggiorna `CustomerRow` per gestire il proprio fetch**

Sostituisci il componente `CustomerRow` con questa versione che gestisce il proprio lazy loading via IntersectionObserver:

```ts
function CustomerRow({
  customer: c,
  onClick,
}: {
  customer: Customer;
  onClick: () => void;
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null | 'pending'>('pending');
  const rowRef = useRef<HTMLDivElement>(null);
  const badge = customerBadge(c);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        customerService.getPhotoUrl(c.erpId).then(url => setPhotoUrl(url));
      },
      { rootMargin: '300px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [c.erpId]);

  const photo = photoUrl === 'pending' ? null : photoUrl;

  return (
    <div
      ref={rowRef}
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}
    >
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: photo ? undefined : avatarGradient(c.erpId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0, overflow: 'hidden' }}>
        {photo ? <img src={photo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : customerInitials(c.name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
        <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[c.phone ?? c.mobile, c.city].filter(Boolean).join(' · ')}
        </div>
      </div>
      {badge && <span style={BADGE_STYLE[badge]}>{badge}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Aggiorna tutti i punti dove viene passato `photo=` a `CustomerRow`**

Con la nuova versione di `CustomerRow`, il prop `photo` non esiste più. Cerca nel file tutte le occorrenze di `<CustomerRow` e rimuovi il prop `photo={...}`:

```tsx
// Da:
<CustomerRow key={c.erpId} customer={c} photo={customerPhotos[c.erpId] ?? null} onClick={() => handleClick(c.erpId)} />
// A:
<CustomerRow key={c.erpId} customer={c} onClick={() => handleClick(c.erpId)} />
```

Applica la stessa modifica a tutte le ~6 occorrenze nel file.

- [ ] **Step 5: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | grep "error TS" | head -20
```
Expected: nessun errore.

- [ ] **Step 6: Esegui test frontend**

```bash
npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerList
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerList.tsx
git commit -m "feat(frontend): CustomerList — IntersectionObserver, rimuovi photoCache"
```

---

## Checklist finale prima del deploy

- [ ] Bucket Hetzner `archibald-customer-photos` creato nel pannello Hetzner
- [ ] Variabili ENV aggiunte al VPS (`.env` + `docker-compose.yml`):
  ```
  HETZNER_S3_ENDPOINT=https://fsn1.your-objectstorage.com
  HETZNER_S3_KEY=<access-key-id>
  HETZNER_S3_SECRET=<secret-access-key>
  HETZNER_S3_BUCKET=archibald-customer-photos
  ```
- [ ] Migration 051 girata in produzione
- [ ] Deploy backend + frontend
- [ ] Test manuale: carica una foto da mobile (camera), verifica che appare nella lista clienti dopo navigazione
- [ ] Verifica DevTools Network: seconda visita alla lista → `Status 304` sulle foto già caricate

---

## Note operative

- Gli agenti dovranno ricaricare le proprie foto dopo la migration (i valori base64 vengono azzerati)
- Il job di riconciliazione gira settimanalmente; alla prima esecuzione in produzione il bucket sarà vuoto (nessun orfano)
- La migration 051 deve girare prima del deploy del nuovo backend (breaking change sulla colonna `photo`)
