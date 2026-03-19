# Match Counts Inline in getSubclients — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminare le 1870+ richieste HTTP parallele a `/api/sub-client-matches` includendo i conteggi match direttamente nella query `getSubclients`.

**Architecture:** Aggiungere due subquery scalari (`customer_match_count`, `sub_client_match_count`) alla query SQL di `getAllSubclients` e `searchSubclients`. I due campi vengono propagati nei tipi TypeScript (backend + frontend) e letti direttamente in `SubclientsTab` eliminando il `Promise.all` N+1.

**Tech Stack:** PostgreSQL (subquery scalari), TypeScript strict, Vitest, React 19.

---

## Chunk 1: Backend — Repository

### Task 1: Aggiorna tipi e `mapRowToSubclient`

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/subclients.ts`
- Test: `archibald-web-app/backend/src/db/repositories/subclients.spec.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Apri `subclients.spec.ts` e aggiorna il fixture `sampleRow` aggiungendo i due nuovi campi, poi aggiorna `anagrafeNulls` / `anagrafeNullsCamel` e il test `getAllSubclients` per aspettarsi i nuovi campi nel risultato:

```ts
// In sampleRow (snake_case, lato DB):
const sampleRow = {
  codice: 'SC001',
  ragione_sociale: 'Acme S.r.l.',
  // ... campi esistenti invariati ...
  customer_match_count: 2,
  sub_client_match_count: 1,
};

const sampleRow2 = {
  codice: 'SC002',
  ragione_sociale: 'Beta Corp',
  // ... campi esistenti invariati ...
  customer_match_count: 0,
  sub_client_match_count: 0,
};
```

Aggiorna `anagrafeNulls` e `anagrafeNullsCamel` aggiungendo i due campi con valore `0` (non sono nullable: sottocliente senza match ha count = 0):

```ts
// anagrafeNulls (snake_case):
const anagrafeNulls = {
  // ... campi esistenti ...
  customer_match_count: 0,
  sub_client_match_count: 0,
};

// anagrafeNullsCamel (camelCase):
const anagrafeNullsCamel = {
  // ... campi esistenti ...
  customerMatchCount: 0,
  subClientMatchCount: 0,
};
```

Nel test `getAllSubclients` → `returns all subclients mapped and ordered by ragione_sociale`, aggiorna `expect(result).toEqual([...])` per includere:

```ts
// Nel primo oggetto atteso (SC001):
customerMatchCount: 2,
subClientMatchCount: 1,

// Nel secondo (SC002):
customerMatchCount: 0,
subClientMatchCount: 0,
```

- [ ] **Step 2: Esegui il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose subclients.spec
```

Atteso: FAIL — `customerMatchCount` non esiste nel tipo.

- [ ] **Step 3: Implementa i campi nei tipi**

In `subclients.ts`, aggiungi i due campi a `SubclientRow`:

```ts
type SubclientRow = {
  // ... campi esistenti ...
  arca_synced_at: string | null;
  customer_match_count: number;
  sub_client_match_count: number;
};
```

Aggiungi i due campi a `Subclient`:

```ts
type Subclient = {
  // ... campi esistenti ...
  arcaSyncedAt: string | null;
  customerMatchCount: number;
  subClientMatchCount: number;
};
```

Aggiorna `mapRowToSubclient` alla fine del return:

```ts
function mapRowToSubclient(row: SubclientRow): Subclient {
  return {
    // ... mappings esistenti ...
    arcaSyncedAt: row.arca_synced_at,
    customerMatchCount: row.customer_match_count,
    subClientMatchCount: row.sub_client_match_count,
  };
}
```

- [ ] **Step 4: Esegui il test per verificare che passa**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose subclients.spec
```

Atteso: PASS (tutti i test del file).

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/subclients.ts \
        archibald-web-app/backend/src/db/repositories/subclients.spec.ts
git commit -m "feat(subclients): add customerMatchCount and subClientMatchCount to Subclient type"
```

---

### Task 2: Aggiorna le query SQL

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/subclients.ts`
- Test: `archibald-web-app/backend/src/db/repositories/subclients.spec.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

Aggiungi due test in `subclients.spec.ts` che verificano la struttura SQL delle query (usa il mock `pool.query` già presente):

```ts
describe('getAllSubclients', () => {
  // ... test esistente ...

  test('includes customer and sub-client match count subqueries in SQL', async () => {
    const pool = createMockPool();
    (pool.query as MockQuery).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const { getAllSubclients } = await import('./subclients');
    await getAllSubclients(pool);

    const { text } = getQueryCall(pool, 0);
    expect(text).toContain('customer_match_count');
    expect(text).toContain('sub_client_match_count');
    expect(text).toContain('sub_client_customer_matches');
    expect(text).toContain('sub_client_sub_client_matches');
  });
});

describe('searchSubclients', () => {
  // ... eventuali test esistenti ...

  test('includes customer and sub-client match count subqueries in SQL', async () => {
    const pool = createMockPool();
    (pool.query as MockQuery).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const { searchSubclients } = await import('./subclients');
    await searchSubclients(pool, 'acme');

    const { text } = getQueryCall(pool, 0);
    expect(text).toContain('customer_match_count');
    expect(text).toContain('sub_client_match_count');
  });
});
```

- [ ] **Step 2: Esegui i test per verificare che falliscono**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose subclients.spec
```

Atteso: FAIL — i testi sulle subquery non trovano le stringhe nel SQL.

- [ ] **Step 3: Aggiorna `getAllSubclients` con le subquery**

Sostituisci il corpo di `getAllSubclients` in `subclients.ts`:

```ts
async function getAllSubclients(pool: DbPool): Promise<Subclient[]> {
  const { rows } = await pool.query<SubclientRow>(
    `SELECT sc.${COLUMNS.trim().replace(/\n\s*/g, ', sc.')
      /* Nota: COLUMNS elenca i campi senza prefisso tabella.
         Usiamo una SELECT esplicita con alias sc per le subquery. */}`,
  );
  return rows.map(mapRowToSubclient);
}
```

⚠️ La costante `COLUMNS` non ha prefisso tabella. Poiché aggiungiamo subquery che usano `sc.codice`, dobbiamo qualificare la SELECT. Il modo più pulito è usare `sc.*` + aggiungere le subquery come colonne aggiuntive, oppure aggiungere il prefisso `sc.` ai COLUMNS. Usa questo approccio:

```ts
async function getAllSubclients(pool: DbPool): Promise<Subclient[]> {
  const { rows } = await pool.query<SubclientRow>(
    `SELECT sc.codice, sc.ragione_sociale, sc.suppl_ragione_sociale,
       sc.indirizzo, sc.cap, sc.localita, sc.prov,
       sc.telefono, sc.fax, sc.email,
       sc.partita_iva, sc.cod_fiscale, sc.zona,
       sc.pers_da_contattare, sc.email_amministraz,
       sc.agente, sc.agente2, sc.settore, sc.classe,
       sc.pag, sc.listino, sc.banca, sc.valuta, sc.cod_nazione,
       sc.aliiva, sc.contoscar, sc.tipofatt,
       sc.telefono2, sc.telefono3, sc.url,
       sc.cb_nazione, sc.cb_bic, sc.cb_cin_ue, sc.cb_cin_it, sc.abicab, sc.contocorr,
       sc.matched_customer_profile_id, sc.match_confidence, sc.arca_synced_at,
       (SELECT COUNT(*)::int FROM shared.sub_client_customer_matches
        WHERE sub_client_codice = sc.codice) AS customer_match_count,
       (SELECT COUNT(*)::int FROM shared.sub_client_sub_client_matches
        WHERE sub_client_codice_a = sc.codice OR sub_client_codice_b = sc.codice
       ) AS sub_client_match_count
     FROM shared.sub_clients sc
     WHERE sc.hidden = FALSE
     ORDER BY sc.ragione_sociale ASC`,
  );
  return rows.map(mapRowToSubclient);
}
```

- [ ] **Step 4: Aggiorna `searchSubclients` con le subquery**

```ts
async function searchSubclients(pool: DbPool, query: string): Promise<Subclient[]> {
  const pattern = `%${query}%`;
  const { rows } = await pool.query<SubclientRow>(
    `SELECT sc.codice, sc.ragione_sociale, sc.suppl_ragione_sociale,
       sc.indirizzo, sc.cap, sc.localita, sc.prov,
       sc.telefono, sc.fax, sc.email,
       sc.partita_iva, sc.cod_fiscale, sc.zona,
       sc.pers_da_contattare, sc.email_amministraz,
       sc.agente, sc.agente2, sc.settore, sc.classe,
       sc.pag, sc.listino, sc.banca, sc.valuta, sc.cod_nazione,
       sc.aliiva, sc.contoscar, sc.tipofatt,
       sc.telefono2, sc.telefono3, sc.url,
       sc.cb_nazione, sc.cb_bic, sc.cb_cin_ue, sc.cb_cin_it, sc.abicab, sc.contocorr,
       sc.matched_customer_profile_id, sc.match_confidence, sc.arca_synced_at,
       (SELECT COUNT(*)::int FROM shared.sub_client_customer_matches
        WHERE sub_client_codice = sc.codice) AS customer_match_count,
       (SELECT COUNT(*)::int FROM shared.sub_client_sub_client_matches
        WHERE sub_client_codice_a = sc.codice OR sub_client_codice_b = sc.codice
       ) AS sub_client_match_count
     FROM shared.sub_clients sc
     WHERE sc.hidden = FALSE
       AND (sc.ragione_sociale ILIKE $1
        OR sc.suppl_ragione_sociale ILIKE $1
        OR sc.codice ILIKE $1
        OR sc.partita_iva ILIKE $1
        OR sc.localita ILIKE $1
        OR sc.cod_fiscale ILIKE $1
        OR sc.indirizzo ILIKE $1
        OR sc.cap ILIKE $1
        OR sc.telefono ILIKE $1
        OR sc.email ILIKE $1
        OR sc.zona ILIKE $1
        OR sc.agente ILIKE $1
        OR sc.pag ILIKE $1
        OR sc.listino ILIKE $1)
     ORDER BY sc.ragione_sociale ASC`,
    [pattern],
  );
  return rows.map(mapRowToSubclient);
}
```

- [ ] **Step 5: Esegui i test per verificare che passano**

```bash
npm test --prefix archibald-web-app/backend -- --reporter=verbose subclients.spec
```

Atteso: PASS tutti.

- [ ] **Step 6: Type-check backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Atteso: compilazione senza errori.

⚠️ Se il build fallisce con errore su `newSubclient` in `archibald-web-app/backend/src/routes/subclients.ts` (il handler `POST /`), aggiungi `customerMatchCount: 0` e `subClientMatchCount: 0` al literal `newSubclient` in quel file — non cambia nessuna logica.

- [ ] **Step 7: Nota su `COLUMN_COUNT` e funzioni non aggiornate**

⚠️ `COLUMN_COUNT` deve rimanere `39`. I nuovi campi `customer_match_count` e `sub_client_match_count` sono **colonne computate da subquery**, non colonne fisiche di `shared.sub_clients`. Non devono essere inclusi in `subclientToParams` né nell'`upsertSubclients`. Non modificare `COLUMN_COUNT`.

Le funzioni `getHiddenSubclients`, `getSubclientByCodice`, `getUnmatchedSubclients`, `getSubclientByCustomerProfile` usano ancora `${COLUMNS}` (senza le subquery) e restituiranno `customerMatchCount: undefined` a runtime. Questo è accettabile perché:
- `getHiddenSubclients` viene usata per mostrare i sottoclienti nascosti, che non visualizzano badge match
- Le altre sono usate per lookup puntuali (modal, matching), non per la lista con badge

Se in futuro un consumer accede a `customerMatchCount` da uno di questi path, aggiornare la query corrispondente.

- [ ] **Step 8: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/subclients.ts \
        archibald-web-app/backend/src/db/repositories/subclients.spec.ts
git commit -m "feat(subclients): embed match counts in getAllSubclients and searchSubclients queries"
```

---

## Chunk 2: Frontend — Tipo e componente

### Task 3: Aggiorna il tipo `Subclient` nel frontend

**Files:**
- Modify: `archibald-web-app/frontend/src/services/subclients.service.ts`

- [ ] **Step 1: Aggiungi i due campi al tipo `Subclient`**

In `subclients.service.ts`, aggiungi dopo `arcaSyncedAt`:

```ts
type Subclient = {
  // ... campi esistenti ...
  arcaSyncedAt: string | null;
  customerMatchCount: number;
  subClientMatchCount: number;
};
```

Non servono modifiche alle funzioni: `getSubclients` deserializza già automaticamente la risposta JSON e i nuovi campi vengono inclusi.

- [ ] **Step 2: Aggiorna `emptySubclient` in `SubclientsTab.tsx`**

La funzione `emptySubclient` (intorno alla riga 79 di `SubclientsTab.tsx`) costruisce un oggetto `Subclient` literal. Dopo l'aggiunta dei due nuovi campi obbligatori al tipo, TypeScript genererà un errore di compilazione se non vengono inclusi. Aggiungi i due campi con valore `0`:

```ts
function emptySubclient(codice: string): Subclient {
  return {
    codice,
    ragioneSociale: '',
    // ... tutti i campi esistenti ...
    arcaSyncedAt: null,
    customerMatchCount: 0,   // aggiunto
    subClientMatchCount: 0,  // aggiunto
  };
}
```

⚠️ **Nota su `handleSave`:** La funzione `handleSave` in `SubclientsTab.tsx` destruttura il `Subclient` prima di chiamare `updateSubclient`, escludendo alcuni campi computed. Dopo questa modifica, `customerMatchCount` e `subClientMatchCount` finiranno nello spread `...updates` inviato al backend. Il backend ignora silenziosamente le proprietà JSON extra non previste dallo schema Zod, quindi non è un bug funzionale. Per pulizia, aggiungi i due campi alla destruttura di esclusione:

```ts
const {
  codice: _,
  matchedCustomerProfileId: _m,
  matchConfidence: _c,
  arcaSyncedAt: _a,
  customerMatchCount: _cc,    // aggiunto
  subClientMatchCount: _scc,  // aggiunto
  ...updates
} = data;
```

- [ ] **Step 3: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: nessun errore TypeScript.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/services/subclients.service.ts \
        archibald-web-app/frontend/src/components/SubclientsTab.tsx
git commit -m "feat(subclients): add customerMatchCount and subClientMatchCount to frontend Subclient type"
```

---

### Task 4: Rimuovi il loop N+1 da `SubclientsTab`

**Files:**
- Modify: `archibald-web-app/frontend/src/components/SubclientsTab.tsx`

- [ ] **Step 1: Individua il codice da rimuovere**

In `SubclientsTab.tsx` cerca il blocco che fa:
```ts
void Promise.all(
  data.map(async (sc): Promise<[string, MatchCount | null]> => {
    const r = await getMatchesForSubClient(sc.codice).catch(() => null);
    return [sc.codice, r ? { customerCount: r.customerProfileIds.length, subClientCount: r.subClientCodices.length } : null];
  }),
).then((entries) => { ... setMatchCounts(...) ... });
```

- [ ] **Step 2: Sostituisci il loop con derivazione diretta dai dati**

Sostituisci l'intero blocco `void Promise.all(...)` con:

```ts
const counts = new Map<string, MatchCount>(
  data.map((sc) => [
    sc.codice,
    { customerCount: sc.customerMatchCount, subClientCount: sc.subClientMatchCount },
  ]),
);
setMatchCounts(counts);
```

- [ ] **Step 3: Rimuovi l'import di `getMatchesForSubClient` se non più usato**

Verifica che `getMatchesForSubClient` non venga usato altrove in `SubclientsTab.tsx`. Se non è usato, rimuovi la riga:

```ts
import { getMatchesForSubClient } from '../services/sub-client-matches.service';
```

- [ ] **Step 4: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: nessun errore TypeScript.

- [ ] **Step 5: Esegui i test frontend**

```bash
npm test --prefix archibald-web-app/frontend
```

Atteso: tutti i test passano.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/components/SubclientsTab.tsx
git commit -m "fix(subclients-tab): eliminate N+1 HTTP requests by reading match counts from subclient data"
```

---

## Verifica finale

- [ ] **Esegui tutti i test backend**

```bash
npm test --prefix archibald-web-app/backend
```

- [ ] **Esegui tutti i test frontend**

```bash
npm test --prefix archibald-web-app/frontend
```

- [ ] **Apri la pagina `/fresis-history` tab Sottoclienti e verifica in console**

- I badge "Non matchato" / "N clienti" appaiono immediatamente al caricamento
- La console non mostra errori 503
- Il Network tab mostra una sola chiamata a `/api/subclients` (o con `?search=...`) e zero chiamate a `/api/sub-client-matches`
