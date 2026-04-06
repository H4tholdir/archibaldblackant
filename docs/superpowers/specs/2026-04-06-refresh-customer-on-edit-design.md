# Refresh Cliente da ERP all'Ingresso in Edit Mode

**Data:** 2026-04-06
**Stato:** Approvato

## Obiettivo

Quando l'agente entra in edit mode sulla `CustomerProfilePage`, il sistema legge i dati aggiornati del cliente direttamente dall'ERP (DetailView) e li sincronizza nel DB prima di aprire il form. In questo modo l'agente modifica sempre dati freschi, non potenzialmente stale.

## Comportamento

### Check di stale

Prima di avviare il refresh, il frontend controlla:

```
isStale = !customer.erpDetailReadAt
       || Date.now() - new Date(customer.erpDetailReadAt).getTime() > 30 * 60 * 1000
```

- **Non stale** (letto negli ultimi 30 minuti): `setEditMode(true)` direttamente, nessun bot.
- **Stale** (> 30 minuti fa, o mai letto): avvia il refresh flow.

La soglia di 30 minuti copre il caso più comune da evitare: l'agente salva un cliente, poi riapre subito in edit per una seconda modifica (il `update-customer` ha già letto dall'ERP durante il save).

### Refresh flow (caso stale)

1. Frontend mostra **modale bloccante** sull'intera pagina (overlay scuro + spinner).
2. Chiama `enqueueOperation('refresh-customer', { erpId })`.
3. `pollJobUntilDone(jobId, { onProgress })` aggiorna la progress bar nel modale.
4. **Successo:** `fetchCustomer(erpId)` → `setCustomer(fresh)` → overlay scompare → `setEditMode(true)`.
5. **Fallback (bot fallisce):** toast "Impossibile leggere dati ERP — procedo con dati locali" → overlay scompare → `setEditMode(true)` comunque. L'agente non viene bloccato.

### Modale bloccante — stati progress

| % | Label |
|---|---|
| 20% | Navigazione al cliente |
| 60% | Lettura dati dal form |
| 90% | Aggiornamento database |
| 100% | Completato |

Il bottone "✎ Modifica" viene disabilitato (`disabled={refreshing}`) e la scheda sfocata (`filter: blur`) durante il refresh tramite lo stato `refreshing`.

## Architettura

### Nuova operation type: `refresh-customer`

- Aggiunta a `OPERATION_TYPES` con priorità 4 (stessa di `read-vat-status`).
- **Non** in `WRITE_OPERATIONS` (non scrive sull'ERP).
- **Non** in `SCHEDULED_SYNCS` (on-demand only).

### Backend — pezzi nuovi

| File | Modifica |
|---|---|
| `db/migrations/053-erp-detail-read-at.sql` | `ALTER TABLE agents.customers ADD COLUMN erp_detail_read_at TIMESTAMPTZ` (**nota:** 052 è riservata a Customer Photos — verificare lo stato al momento dell'implementazione) |
| `db/repositories/customers.ts` | `setErpDetailReadAt(pool, userId, erpId): Promise<void>` |
| `db/repositories/customers.ts` | `erp_detail_read_at` aggiunto alla SELECT e al mapping `rowToCustomer` |
| `operations/operation-types.ts` | aggiunge `'refresh-customer'` e priorità |
| `operations/handlers/refresh-customer.ts` | handler (nuovo file) |
| `operations/handlers/index.ts` | registra il nuovo handler |
| `bot/archibald-bot.ts` | nuovo metodo `readCustomerFields(): Promise<CustomerFormInput>` |

### Handler `refresh-customer`

```ts
async (_context, data, userId, onProgress) => {
  const { erpId } = data as { erpId: string };
  const bot = createBot(userId);
  await bot.initialize();
  try {
    onProgress(20, 'Navigazione al cliente');
    await bot.navigateToCustomerByErpId(erpId);
    onProgress(60, 'Lettura dati dal form');
    const fields = await bot.readCustomerFields();
    onProgress(90, 'Aggiornamento database');
    await upsertSingleCustomer(pool, userId, fields, erpId, 'synced');
    await setErpDetailReadAt(pool, userId, erpId);
    onProgress(100, 'Completato');
    return { erpId };
  } finally {
    await bot.close();
  }
};
```

### Bot — `readCustomerFields()`

Legge i campi dalla pagina **già caricata** da `navigateToCustomerByErpId` (non naviga di nuovo). Usa i selettori `xaf_dvi*_View` della Bibbia ERP per leggere i campi in modalità View. Ritorna un oggetto `CustomerFormInput` compatibile con `upsertSingleCustomer`.

**Importante:** non è riusabile né `readEditFormFieldValues` (legge solo 8 campi da Edit mode, selettori `_Edit_I$`) né `buildCustomerSnapshot` (naviga autonomamente via `page.goto()` — chiamerebbe una seconda navigazione). Il metodo va scritto da zero.

I campi da leggere: name, nameAlias, attentionTo, vatNumber, pec, sdi, fiscalCode, street, postalCode, phone, mobile, email, url, deliveryTerms, paymentTerms, sector, notes, county, state, country, priceGroup, lineDiscount.

**Gestione `name` null:** `CustomerFormInput.name` è `required: string`. Se la View restituisce name vuoto/null, `readCustomerFields()` deve lanciare un errore (`throw new Error('Customer name not found in ERP DetailView')`) — il handler lo propagherà e il frontend atterrerà sul fallback graceful.

### Frontend — pezzi nuovi/modificati

| File | Modifica |
|---|---|
| `frontend/src/types/customer.ts` | aggiunge campo `erpDetailReadAt: string \| null` al tipo `Customer` frontend |
| `frontend/src/api/operations.ts` | aggiunge `'refresh-customer'` alla union type `OperationType` locale |
| `pages/CustomerProfilePage.tsx` | `handleEnterEditMode()` sostituisce il click diretto su `enterEditMode` |
| `pages/CustomerProfilePage.tsx` | stati: `refreshing`, `refreshProgress`, `refreshLabel` |
| `pages/CustomerProfilePage.tsx` | overlay modale bloccante (JSX) |

### `handleEnterEditMode()` (logica completa)

```ts
async function handleEnterEditMode() {
  const isStale = !customer.erpDetailReadAt ||
    Date.now() - new Date(customer.erpDetailReadAt).getTime() > 30 * 60 * 1000;

  if (!isStale) {
    enterEditMode();
    return;
  }

  setRefreshing(true);
  try {
    const { jobId } = await enqueueOperation('refresh-customer', { erpId });
    await pollJobUntilDone(jobId, {
      onProgress: (p, label) => {
        setRefreshProgress(p);
        if (label) setRefreshLabel(label);
      },
    });
    const fresh = await fetchCustomer(erpId);
    setCustomer(fresh);
    enterEditMode();
  } catch {
    toastService.error('Impossibile leggere dati ERP — procedo con dati locali');
    enterEditMode();
  } finally {
    setRefreshing(false);
    setRefreshProgress(0);
    setRefreshLabel('');
  }
}
```

### API — `GET /api/customers/:erpId`

Aggiunge `erpDetailReadAt` alla response shape (già serializzato da `rowToCustomer`).

### `update-customer` — aggiornamento `erp_detail_read_at` post-save

Il handler `update-customer` chiama internamente `bot.updateCustomerSurgical(...)`, che al suo termine naviga alla DetailView e chiama `buildCustomerSnapshot` per leggere i valori confermati dall'ERP. Questo costituisce una lettura ERP aggiornata. Il handler deve quindi chiamare `setErpDetailReadAt(pool, userId, erpId)` dopo il save con successo, altrimenti il check di stale ignorerebbe questa lettura e triggererebbe un refresh inutile al successivo ingresso in edit mode.

## Testing

| Test | File | Tipo |
|---|---|---|
| Handler aggiorna DB e chiama `setErpDetailReadAt` | `refresh-customer.spec.ts` | unit |
| Handler propaga errore se bot fallisce | `refresh-customer.spec.ts` | unit |
| `setErpDetailReadAt` scrive il timestamp corretto | `customers.spec.ts` | unit |
| Click "Modifica" con dati stale → mostra overlay → `enqueueOperation` chiamato | `CustomerProfilePage.spec.tsx` | integration |
| Click "Modifica" con dati freschi → nessun enqueue, `editMode=true` direttamente | `CustomerProfilePage.spec.tsx` | integration |
| Fallback: refresh fallisce → `editMode=true` comunque + toast errore | `CustomerProfilePage.spec.tsx` | integration |

## Migrazione e deploy

- Migration `053` da applicare prima del deploy backend. **Verificare che 052 sia ancora libera al momento dell'implementazione** (riservata a Customer Photos in MEMORY.md, ma non ancora creata su disco).
- Nessuna breaking change: `erp_detail_read_at` è nullable, tutti i clienti esistenti hanno `NULL` → al primo ingresso in edit mode il refresh viene sempre eseguito.
- Nessuna modifica alle operazioni di sync esistenti.
