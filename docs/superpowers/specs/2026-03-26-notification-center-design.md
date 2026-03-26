# Notification Center — Design Spec
**Data:** 2026-03-26
**Stato:** approvato

---

## Contesto

Durante un'analisi di produzione è emerso un bug nell'ERP Archibald (Komet Italy) che elimina
anagrafiche clienti che hanno ordini attivi. Il caso specifico (profilo 1002208 — Indelli Enrico)
ha evidenziato la necessità di un sistema strutturato per rilevare e comunicare queste anomalie,
estensibile a tutte le notifiche utili dell'applicazione.

---

## Obiettivi

1. Centro notifiche in-app (campanella navbar + pagina dedicata) accessibile da tutti i dispositivi
2. Notifiche real-time via WebSocket con persistenza DB
3. Supporto multi-agente e multi-dispositivo (PWA)
4. Estensibile: ogni nuovo tipo di notifica richiede solo di chiamare `createNotification`
5. Auto-archiviazione dopo 7 giorni

---

## Architettura

**Approccio scelto:** Store DB (PostgreSQL) + WebSocket push.

Le notifiche sono persistite in `agents.notifications`. Al momento della creazione, il backend
emette un evento WebSocket `NOTIFICATION_NEW` verso tutti i dispositivi del destinatario tramite
`broadcast(userId, event)` — il WebSocket server esistente gestisce già multiple connessioni per
utente via `connectionsPerUser`.

Fan-out al momento della scrittura: per notifiche `target='admin'` o `target='all'`, il service
inserisce una riga per ogni utente destinatario. Nessun join runtime, query semplice.

---

## Database

### Migrazione: `agents.notifications`

```sql
CREATE TABLE agents.notifications (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  severity   TEXT NOT NULL CHECK (severity IN ('info', 'success', 'warning', 'error')),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  data       JSONB,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX notifications_user_unread
  ON agents.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL AND expires_at > NOW();
```

`expires_at = created_at + INTERVAL '7 days'` — impostato al momento della creazione.

---

## Backend

### `notification-service.ts`

Unico punto di ingresso per creare notifiche. Firma principale:

```ts
type NotificationTarget = 'user' | 'admin' | 'all'

createNotification(deps: NotificationServiceDeps, params: {
  target: NotificationTarget,
  userId?: string,          // obbligatorio se target='user'
  type: string,
  severity: 'info' | 'success' | 'warning' | 'error',
  title: string,
  body: string,
  data?: Record<string, unknown>,
}): Promise<void>
```

Logica interna:
- `target='user'`: inserisce una riga con il `userId` specificato, emette `NOTIFICATION_NEW` su quel userId
- `target='admin'`: recupera tutti gli utenti con `role='admin'`, fan-out + emit per ciascuno
- `target='all'`: recupera tutti gli utenti, fan-out + emit per ciascuno

### Repository `notifications.ts`

```ts
getNotifications(db, userId, filter: 'all'|'unread'|'read', limit, offset): Promise<Notification[]>
getUnreadCount(db, userId): Promise<number>
markRead(db, userId, notificationId): Promise<void>
markAllRead(db, userId): Promise<void>
deleteNotification(db, userId, notificationId): Promise<void>
deleteExpired(db): Promise<number>   // usato dal cleanup job
insertNotification(db, params): Promise<Notification>
```

### API REST: `/api/notifications`

| Metodo | Path | Descrizione |
|--------|------|-------------|
| `GET` | `/api/notifications` | Lista notifiche (query: `filter`, `limit`, `offset`) |
| `GET` | `/api/notifications/count` | Solo contatore unread |
| `PATCH` | `/api/notifications/:id/read` | Segna singola come letta |
| `PATCH` | `/api/notifications/read-all` | Segna tutte come lette |
| `DELETE` | `/api/notifications/:id` | Elimina singola |

Tutte le route richiedono autenticazione. Ogni route filtra automaticamente per `user_id = req.userId`.

### WebSocket Events (server → client)

```ts
{ type: 'NOTIFICATION_NEW',      payload: Notification }
{ type: 'NOTIFICATION_READ',     payload: { id: number } }
{ type: 'NOTIFICATION_READ_ALL'  }
```

---

## Tipi di notifica (prima release)

| Type | Target | Severity | Trigger | Note |
|------|--------|----------|---------|------|
| `erp_customer_deleted` | agente + admin | error | `syncCustomers()` prima del DELETE | Fan-out all'agente con ordini + tutti gli admin |
| `fedex_exception` | agente | warning | `tracking-sync` su status `exception` | |
| `fedex_delivered` | agente | success | `tracking-sync` su status `delivered` | |
| `sync_anomaly` | admin | warning | Fine sync con dati anomali | |
| `price_change` | all | info | `price-sync` con variazioni | |
| `product_change` | all | info | `product-sync` (nuovo/modificato/eliminato) | Raggruppa per tipo |
| `product_missing_vat` | admin | error | `product-sync` | Articoli senza IVA o prezzo |
| `customer_inactive` | agente | warning | Job mensile | Clienti senza ordini da 8+ mesi |
| `order_expiring` | agente | warning | Job settimanale | Ordini scaduti da troppo |
| `budget_milestone` | agente | success | Al sync ordini | Raggiungimento premi/budget |

### Dettaglio: `erp_customer_deleted`

Prima del DELETE in `syncCustomers()`:
1. Query: `SELECT DISTINCT o.user_id FROM agents.order_records o WHERE o.customer_profile_id = ANY($1)` (con `$1` = array degli `internal_id` da eliminare)
2. Se trovati ordini: `createNotification` con `target='user'` per ogni `user_id` trovato + `createNotification` con `target='admin'`
3. `data` payload: `{ deletedProfiles: Array<{ profile: string, name: string, orderCount: number }> }`

---

## Frontend

### Componenti

```
frontend/src/
  components/
    NotificationBell.tsx     ← campanella + badge + dropdown preview (ultime 5)
    NotificationItem.tsx     ← singola riga: icona severity + titolo + body + tempo relativo + elimina
  pages/
    NotificationsPage.tsx    ← pagina /notifications con filtri e lista completa
  hooks/
    useNotifications.ts      ← stato centralizzato: fetch + WebSocket listener
  services/
    notifications.service.ts ← chiamate API (GET, PATCH, DELETE)
```

### `useNotifications`

```ts
{
  notifications: Notification[],
  unreadCount: number,
  filter: 'all' | 'unread' | 'read',
  setFilter: (f) => void,
  markRead: (id: number) => void,
  markAllRead: () => void,
  deleteNotification: (id: number) => void,
}
```

Al mount: fetch lista + contatore. WebSocket listener: `NOTIFICATION_NEW` prepend alla lista e incrementa contatore; `NOTIFICATION_READ` aggiorna `read_at` nella lista; `NOTIFICATION_READ_ALL` svuota tutti i `read_at`.

### `NotificationBell`

- Icona campanella in navbar (dopo le voci esistenti)
- Badge rosso con `unreadCount` (nascosto se 0)
- Click: dropdown overlay con ultime 5 notifiche (via `useNotifications`)
- Clic su notifica nel dropdown → `markRead(id)` + naviga a `/notifications` se action link presente
- Pulsante "Segna tutte come lette" nel footer del dropdown
- Link "Vedi tutte →" → `/notifications`
- Click fuori: chiude dropdown

### `NotificationsPage` (`/notifications`)

- Header: titolo + contatore unread + "Segna tutte come lette"
- Tabs/filtro: Tutte / Non lette / Lette
- Lista raggruppata per data (Oggi / Ieri / Questa settimana / Precedenti)
- Ogni `NotificationItem`: colore severity a sinistra, titolo + body, timestamp, pulsante elimina
- Paginazione: 20 notifiche per pagina, bottone "Carica altre"

### Severity → colori (inline style, coerente con il codebase)

| Severity | Colore bordo/icona |
|----------|--------------------|
| `info`   | `#3b82f6` (blu)    |
| `success`| `#22c55e` (verde)  |
| `warning`| `#f59e0b` (arancione) |
| `error`  | `#ef4444` (rosso)  |

---

## Scheduler — Cleanup automatico

Job giornaliero `cleanup-expired-notifications`:
- Chiama `deleteExpired(db)` che elimina `WHERE expires_at < NOW()`
- Si aggiunge alla lista job esistente in `sync-scheduler.ts`

---

## Fasi di implementazione

### Fase 1 — Infrastruttura core
1. Migrazione DB (`notifications` table + indice)
2. Repository `notifications.ts`
3. `notification-service.ts` con `createNotification` + WebSocket emit
4. API REST `/api/notifications` (4 endpoint)
5. Frontend: service + hook + `NotificationBell` + `NotificationItem` + `NotificationsPage` + route

### Fase 2 — Generatore: ERP customer deleted
- In `syncCustomers()`: check ordini prima del DELETE → `createNotification` per agente(i) + admin

### Fase 3 — Generatori tracking FedEx
- In `tracking-sync`: `exception` → notifica agente; `delivered` → notifica agente

### Fase 4 — Generatori sync anomalie + prodotti/prezzi
- Fine sync con anomalie → notifica admin
- Price-sync + product-sync → notifica all / admin

### Fase 5 — Job schedulati
- Cliente inattivo 8 mesi (job mensile)
- Ordini scaduti (job settimanale)
- Budget milestone (al sync ordini)
- Cleanup `expires_at` (job giornaliero)

Ogni fase è deployabile indipendentemente. Le fasi 2-5 dipendono solo da `createNotification` (Fase 1).

---

## Testing

- **Unit:** `notification-service.ts` — logica fan-out per ogni target; `deleteExpired` — filtra correttamente per data
- **Integration:** API REST — autenticazione, filtro per user, mark read, delete; generatore `erp_customer_deleted` — verifica che vengano create le righe corrette con il payload giusto
- **Non testare:** rendering React dei componenti (coperto da ispezione visiva)
