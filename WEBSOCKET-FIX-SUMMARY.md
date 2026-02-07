# WebSocket Fix - Summary

**Data**: 2026-02-05
**Problema**: Nessuna connessione client WebSocket, admin panel mostra sempre "idle"

---

## 🔍 PROBLEMI IDENTIFICATI

### 1. ❌ MULTIPLE ISTANZE WEBSOCKET (CRITICO)
**Root Cause**: Ogni hook (`useDraftSync`, `usePendingSync`) chiamava `useWebSocket()` indipendentemente, creando **2 connessioni WebSocket separate** allo stesso endpoint `/ws/realtime`.

**Effetti**:
- Consumo doppio di risorse
- Race conditions
- Possibili conflitti/rifiuti dal server
- Debug impossibile

### 2. ❌ DOPPIO WEBSOCKET SERVER NEL BACKEND
**Root Cause**: Backend aveva **DUE** server WebSocket attivi contemporaneamente:
1. Vecchio: `/ws/sync` (legacy, per sync progress)
2. Nuovo: `/ws/realtime` (draft/pending real-time)

**Effetti**:
- Interferenza tra i due server
- Consumo inutile di risorse
- Confusione nel debugging

### 3. ⚠️ TOKEN JWT - NESSUN RETRY
**Root Cause**: Se il token JWT non era presente al mount, la connessione non veniva mai tentata (nessun retry automatico).

---

## ✅ SOLUZIONI IMPLEMENTATE

### FASE 1: REFACTORING FRONTEND - WebSocket Singleton

#### 1.1 Creato WebSocketContext (NEW FILE)
**File**: `frontend/src/contexts/WebSocketContext.tsx`

- ✅ Context Provider che crea UN'UNICA istanza WebSocket condivisa
- ✅ Gestisce connessione/disconnessione/reconnect
- ✅ Espone `useWebSocketContext()` hook
- ✅ Auto-reconnect con exponential backoff
- ✅ Queue offline per operazioni

#### 1.2 Aggiornato useDraftSync
**File**: `frontend/src/hooks/useDraftSync.ts`

**Modifiche**:
```diff
- import { useWebSocket } from "./useWebSocket";
+ import { useWebSocketContext } from "../contexts/WebSocketContext";

- const { state, subscribe } = useWebSocket();
+ const { state, subscribe } = useWebSocketContext();
```

#### 1.3 Aggiornato usePendingSync
**File**: `frontend/src/hooks/usePendingSync.ts`

**Modifiche**:
```diff
- import { useWebSocket } from "./useWebSocket";
+ import { useWebSocketContext } from "../contexts/WebSocketContext";

- const { state, subscribe } = useWebSocket();
+ const { state, subscribe } = useWebSocketContext();
```

#### 1.4 Aggiornato AppRouter
**File**: `frontend/src/AppRouter.tsx`

**Modifiche**:
```diff
- import WebSocketSync from "./components/WebSocketSync";
+ import { WebSocketProvider } from "./contexts/WebSocketContext";

  <BrowserRouter>
+   <WebSocketProvider>
      <ToastContainer ... />
      <OfflineBanner />
      ...
      <DashboardNav />
-     {auth.isAuthenticated && <WebSocketSync />}
      <Routes>
        ...
      </Routes>
+   </WebSocketProvider>
  </BrowserRouter>
```

**Risultato**:
- ✅ Una sola connessione WebSocket per l'intera app
- ✅ Condivisa tra tutti i componenti che usano `useWebSocketContext()`
- ✅ Gestione centralizzata dello stato

---

### FASE 2: CLEANUP BACKEND - Rimozione Vecchio WebSocket

#### 2.1 Rimosso vecchio WebSocket server
**File**: `backend/src/index.ts`

**Modifiche**:
```diff
- import { WebSocketServer } from "ws";

  const app = express();
  const server = createServer(app);
- export const wss = new WebSocketServer({ server, path: "/ws/sync" });
-
- // Make wss available to price-endpoints for cache invalidation broadcast
- import { setWssInstance } from "./price-endpoints";
- setWssInstance(wss);

- // WebSocket per notifiche sync in real-time
- wss.on("connection", (ws) => {
-   // ... vecchio handler per sync progress ...
- });

+ // LEGACY: Old WebSocket sync progress handler - REMOVED (2026-02-05)
+ // Sync progress tracking now handled via orchestrator (Phase 36).
+ // Real-time draft/pending sync uses WebSocketServerService on /ws/realtime.
```

#### 2.2 Migrato price-endpoints a WebSocketServerService
**File**: `backend/src/price-endpoints.ts`

**Modifiche**:
```diff
- import { WebSocket } from "ws";
+ import { WebSocketServerService } from "./websocket-server";

- // WebSocket server instance (imported lazily to avoid circular dependency)
- let wssInstance: any = null;
- export function setWssInstance(wss: any) {
-   wssInstance = wss;
- }

  // 🔔 Broadcast cache invalidation
- if (wssInstance && wssInstance.clients) {
-   const invalidationEvent = { ... };
-   const message = JSON.stringify(invalidationEvent);
-   let broadcastCount = 0;
-   wssInstance.clients.forEach((client: WebSocket) => {
-     if (client.readyState === WebSocket.OPEN) {
-       client.send(message);
-       broadcastCount++;
-     }
-   });
- }

+ const wsService = WebSocketServerService.getInstance();
+ wsService.broadcastToAll({
+   type: "cache_invalidation",
+   payload: {
+     target: "products",
+     reason: "excel_import",
+     importId: result.importId,
+     matchedRows: result.matchedRows,
+     vatUpdatedCount: result.vatUpdatedCount,
+     priceUpdatedCount: result.priceUpdatedCount,
+   },
+   timestamp: new Date().toISOString(),
+ });
```

**Risultato**:
- ✅ Rimosso vecchio WebSocket server su `/ws/sync`
- ✅ Mantenuto SOLO nuovo server su `/ws/realtime`
- ✅ Migrato broadcast cache invalidation al nuovo sistema

---

## 📊 FILE MODIFICATI

### Frontend (4 file)
1. ✅ `frontend/src/contexts/WebSocketContext.tsx` (NEW - 311 righe)
2. ✅ `frontend/src/hooks/useDraftSync.ts` (2 modifiche)
3. ✅ `frontend/src/hooks/usePendingSync.ts` (2 modifiche)
4. ✅ `frontend/src/AppRouter.tsx` (wrapping con WebSocketProvider)

### Backend (2 file)
1. ✅ `backend/src/index.ts` (rimosso vecchio WebSocket server)
2. ✅ `backend/src/price-endpoints.ts` (migrato a WebSocketServerService)

---

## 🧪 TESTING - PIANO DI VERIFICA

### Step 1: Verifica Connessione WebSocket

1. **Backend Logs**:
   ```bash
   npm run dev:backend
   ```
   Attendi log:
   ```
   🔌 WebSocket server initialized on ws://localhost:3000/ws/realtime
   ```

2. **Frontend Logs** (Browser Console):
   ```bash
   npm run dev
   ```
   - Effettua login
   - Apri DevTools → Console
   - Cerca:
     ```
     [WebSocket] Connected
     [WebSocketSync] Real-time sync initialized
     ```

3. **Backend Connection Log**:
   Dopo il login del frontend, il backend dovrebbe mostrare:
   ```
   WebSocket client authenticated { userId: '...' }
   ```

### Step 2: Verifica Admin Panel

1. Login come admin
2. Vai su `/admin`
3. Sezione "WebSocket Real-Time Sync"
4. **Verifica**:
   - ✅ Status: **"healthy"** (verde) invece di "idle" (giallo)
   - ✅ "Connessioni Attive": **≥ 1**
   - ✅ "Utenti Connessi": **≥ 1**
   - ✅ Tabella "Connessioni per Utente" mostra il tuo userId

### Step 3: Test Real-Time Sync

#### Test Draft Sync
1. Crea un draft order
2. Verifica log browser console:
   ```
   [WebSocket] Queued operation (offline): draft:create
   ```
3. Backend dovrebbe ricevere l'evento e processarlo
4. Verifica che il draft appaia immediatamente

#### Test Multi-Device
1. Apri l'app in due browser diversi (stesso utente)
2. Crea un draft in Browser A
3. **Verifica**: Browser B riceve la notifica e si aggiorna immediatamente
4. Admin panel dovrebbe mostrare **2 connessioni** per lo stesso user

### Step 4: Test Reconnection

1. Apri DevTools → Network
2. Filter: WS (WebSocket)
3. Verifica connessione attiva a `ws://localhost:3000/ws/realtime?token=...`
4. **Simula disconnessione**:
   - Backend: stop server
   - Frontend console dovrebbe mostrare:
     ```
     [WebSocket] Closed (code: 1006, reason: )
     [WebSocket] Reconnecting in 1000ms...
     ```
5. Restart backend
6. Frontend dovrebbe riconnettersi automaticamente:
   ```
   [WebSocket] Connected
   ```

### Step 5: Test Cache Invalidation (Price Endpoints)

1. Login come admin
2. Vai su Warehouse Management
3. Upload Excel con nuovi prezzi
4. **Verifica backend log**:
   ```
   📡 Cache invalidation broadcast sent to all WebSocket clients
   ```
5. **Verifica frontend log**:
   ```
   Ricevuto evento: cache_invalidation
   ```

---

## ✅ CHECKLIST COMPLETAMENTO

- [x] ✅ Frontend: Creato WebSocketContext
- [x] ✅ Frontend: Aggiornato useDraftSync
- [x] ✅ Frontend: Aggiornato usePendingSync
- [x] ✅ Frontend: Wrappato AppRouter con WebSocketProvider
- [x] ✅ Backend: Rimosso vecchio WebSocket server
- [x] ✅ Backend: Migrato price-endpoints a WebSocketServerService
- [x] ✅ Type-check: Nessun errore TypeScript
- [x] ✅ Prettier: File formattati

**TODO (Testing)**:
- [ ] ⏳ Test connessione WebSocket (Step 1)
- [ ] ⏳ Test admin panel status (Step 2)
- [ ] ⏳ Test real-time sync (Step 3)
- [ ] ⏳ Test reconnection (Step 4)
- [ ] ⏳ Test cache invalidation (Step 5)

---

## 🎯 RISULTATO ATTESO

Dopo queste modifiche:

**Prima** (❌):
```
Admin Panel:
  Status: 🟡 idle
  Connessioni: 0
  Utenti: 0

Backend Logs:
  ✅ WebSocket server initialized
  ❌ Nessuna connessione client

Frontend Console:
  ❌ Nessun log di connessione
```

**Dopo** (✅):
```
Admin Panel:
  Status: 🟢 healthy
  Connessioni: ≥1
  Utenti: ≥1
  Tabella: mostra utenti connessi

Backend Logs:
  ✅ WebSocket server initialized
  ✅ WebSocket client authenticated { userId: '...' }
  ✅ WebSocket client connected

Frontend Console:
  ✅ [WebSocket] Connected
  ✅ [WebSocketSync] Real-time sync initialized
```

---

## 📝 NOTE AGGIUNTIVE

### File Non Modificati (ma rilevanti)
- `frontend/src/hooks/useWebSocket.ts` - Hook originale (non più usato direttamente, ma logica migrata in WebSocketContext)
- `frontend/src/components/WebSocketSync.tsx` - Componente ancora presente ma non più montato in AppRouter
- `backend/src/websocket-server.ts` - Nuovo server WebSocket (già esistente, non modificato)

### Legacy Code Rimosso
- Vecchio WebSocket server su `/ws/sync`
- Handler per sync progress (clienti/prodotti/prezzi)
- Funzione `setWssInstance()` in price-endpoints

### Compatibilità
- ✅ Nessuna breaking change per l'utente finale
- ✅ API endpoints non modificati
- ✅ Database schema non modificato
- ✅ Funzionalità esistenti preservate

---

## 🚀 PROSSIMI PASSI

1. **Avvia backend e frontend in dev mode**
2. **Esegui Testing Plan** (vedi sezione sopra)
3. **Verifica log in entrambi** (backend + frontend console)
4. **Conferma status "healthy" nel panel admin**
5. **Test multi-device** (due browser)

Se tutto funziona correttamente:
- ✅ Il problema "idle" sarà risolto
- ✅ Admin panel mostrerà connessioni attive
- ✅ Real-time sync funzionerà correttamente
- ✅ Nessuna più doppia connessione

---

**Fine del Summary Report**
