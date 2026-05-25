# VPN Relay Auto-Mode — Design Spec
**Data:** 25 maggio 2026
**Stato:** In attesa di approvazione

---

## Contesto

Komet Germany ha inserito in blacklist l'IP del VPS (91.98.136.198).
Il login ERP dell'agente è operativo. Il problema è esclusivamente il punto di uscita della rete.

**Soluzione adottata:** WireGuard relay attraverso il Mac di casa.
Il traffico ERP esce dall'IP residenziale dell'agente — legittimo al 100%.

**Stato attuale (già funzionante, ma manuale):**
- `net.inet.ip.forwarding=1` già persistente via `/etc/sysctl.conf` ✅
- `/etc/pf-formicanera.conf` già presente ✅
- Admin panel "Sessione Sync VPN" già presente ✅
- Flusso manuale funziona: WireGuard → script (solo dopo reboot) → "Apri Sessione" → operazioni ERP

**Gap da colmare:**
1. Script PF non si ricarica automaticamente al reboot del Mac
2. "Apri/Chiudi Sessione" richiede azione manuale
3. Bot ha timeout corti (2–6s) vulnerabili alla latenza relay (+50–100ms/XHR)
4. Nessun test E2E per validare il path relay prima di automatizzarlo
5. Rollback a modalità diretta non è un comando unico

---

## Architettura target

```
Mac di casa (relay)
  ├── WireGuard auto-start al login (Login Item)
  ├── LaunchDaemon: ricarica PF rules al boot
  └── Heartbeat agent: POST /api/internal/relay-heartbeat ogni 60s
          ↓ WireGuard tunnel (10.10.0.2 → 10.10.0.1)
VPS formicanera.com
  ├── RelayMonitor: controlla heartbeat ogni 30s
  ├── Auto-session: apre/chiude sync_paused_users automaticamente
  ├── Bot: timeout × BOT_RELAY_TIMEOUT_MULTIPLIER quando relay attivo
  └── Static route: 4.231.124.90 via 10.10.0.2 (wg0)
          ↓ NAT (IP di casa)
ERP Komet (4.231.124.90)
```

---

## Componenti

### 1. Mac persistence layer (LaunchDaemon)

**Problema:** le regole PF si perdono al reboot.

**Soluzione:** LaunchDaemon che si esegue come root all'avvio, carica le regole PF da `/etc/pf-formicanera.conf`.

File: `/Library/LaunchDaemons/com.formicanera.pf-nat.plist`
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>         <string>com.formicanera.pf-nat</string>
  <key>RunAtLoad</key>     <true/>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>pfctl -e -f /etc/pf-formicanera.conf 2>/dev/null; true</string>
  </array>
</dict>
</plist>
```

WireGuard: aggiungere `formicanera-vpn.conf` ai Login Items del Mac (Preferenze di Sistema → Generali → Elementi login). WireGuard.app supporta auto-connect al login.

**Risultato:** dopo un reboot, il Mac è pronto come relay senza nessun intervento manuale.

---

### 2. Mac heartbeat agent

**Problema:** il backend deve sapere quando il relay è attivo senza richiedere `wg` CLI in Docker.

**Soluzione:** il Mac invia un heartbeat HTTP al VPS ogni 60s quando WireGuard è attivo.

Script: `/usr/local/bin/formicanera-heartbeat.sh`
```bash
#!/bin/bash
# Invia heartbeat al VPS solo se WireGuard è connesso
WG_IFACE=$(ifconfig | grep -o 'utun[0-9]*' | head -1)
[ -z "$WG_IFACE" ] && exit 0
curl -sf -X POST https://formicanera.com/api/internal/relay-heartbeat \
  -H "Authorization: Bearer $RELAY_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"source":"mac-relay"}' \
  --max-time 5 || true
```

LaunchDaemon separato con `StartInterval: 60`.
`RELAY_SECRET` = stringa random salvata in `/etc/formicanera-env` (chmod 600, owner root).

---

### 3. Backend: RelayMonitor + auto-session

**File nuovo:** `backend/src/services/relay-monitor.ts`

**API endpoint nuovo:** `POST /api/internal/relay-heartbeat` (protetto da `RELAY_SECRET`)

```typescript
// relay-monitor.ts
// Verifica heartbeat Redis ogni 30s.
// Transizione live→dead: add sync_paused_users + open circuit breaker.
// Transizione dead→live: remove sync_paused_users + close circuit breaker.
// Stato persistito in Redis key "relay:last_heartbeat_at" (TTL 120s).
```

Logica transizione (idempotente):
- `isRelayLive()`: `now - last_heartbeat < 90s`
- Ogni 30s: confronta `previousState` vs `currentState`
- Se cambia: aggiorna `system.sync_paused_users` e `system.agent_circuit_state`
- Emette evento WebSocket `relay_status_changed` al frontend admin

Il pannello "Sessione Sync VPN" esistente mostra lo stato real-time e mantiene l'override manuale come fallback.

**Endpoint heartbeat:**
```
POST /api/internal/relay-heartbeat
Authorization: Bearer <RELAY_SECRET>
→ 200 OK { "ts": <unix>, "relayActive": true }
```

---

### 4. Bot timeout adaptation

**Problema:** timeout inline 2–6s falliscono con latenza relay (+200–800ms per operazione DevExpress).

**Soluzione:** `relayTimeout(ms)` helper + `BOT_RELAY_TIMEOUT_MULTIPLIER` env var.

```typescript
// backend/src/bot/relay-timeout.ts
export function relayTimeout(baseMs: number): number {
  const multiplier = parseFloat(process.env.BOT_RELAY_TIMEOUT_MULTIPLIER ?? '1.0');
  return Math.ceil(baseMs * multiplier);
}
```

Sostituire tutti i timeout inline < 10s in `archibald-bot.ts` con `relayTimeout(N)`.
Default produzione: `BOT_RELAY_TIMEOUT_MULTIPLIER=1.0` (nessun impatto).
Modalità relay: `BOT_RELAY_TIMEOUT_MULTIPLIER=2.5`.

**Impostare staticamente nel `.env` del VPS:** `BOT_RELAY_TIMEOUT_MULTIPLIER=2.5` per tutta la durata del relay. Quando si torna a modalità diretta, lo script `disable-relay-mode.sh` lo riporta a 1.0 e riavvia il backend. Non serve gestirlo dinamicamente — il relay period è lungo per sua natura.

**Timeout critici da aggiornare** (identificati da code inspection):
- `waitForDevExpressIdle` defaults: 3s → `relayTimeout(3000)`
- Text input: 2s → `relayTimeout(2000)`
- Dropdown detection: 3s → `relayTimeout(3000)`
- Command execution: 4s → `relayTimeout(4000)`
- Notes tab operations: 5s → `relayTimeout(5000)`
- Function waits: 6–8s → `relayTimeout(6000)` / `relayTimeout(8000)`

I timeout già generosi (60s navigazione, 180s CDP, 90s gridAddNewRow) rimangono invariati.

---

### 5. E2E smoke test suite

**Scopo:** validare il relay path PRIMA di attivare l'automazione.
Questi test si eseguono manualmente (VPN attiva, Mac relay operativo) — non girano in CI.

**File:** `backend/src/tests/e2e/relay-smoke.test.ts`

```typescript
// Eseguire con: npm run test:e2e:relay
// Prerequisiti: WireGuard attivo, formicanera-vpn-start.sh eseguito (o LaunchDaemon attivo)

describe('relay smoke tests', () => {
  test('relay-connectivity: heartbeat ricevuto e ERP raggiungibile', ...);
  test('relay-latency: RTT medio verso ERP < 300ms', ...);
  test('erp-login: bot si autentica su ERP con successo', ...);
  test('erp-read: scraper legge primi 5 ordini', ...);
  test('erp-write-dryrun: bot naviga fino al form nuovo ordine senza submitare', ...);
});
```

Il test `relay-latency` misura il 95° percentile RTT su 10 richieste HTTP HEAD all'ERP.
Se RTT p95 > 200ms → log warning "considera di aumentare BOT_RELAY_TIMEOUT_MULTIPLIER a 3.0".

Script npm: `"test:e2e:relay": "vitest run src/tests/e2e/relay-smoke.test.ts --reporter=verbose"`

---

### 6. VPS routing statico

Il VPS deve avere una rotta verso l'ERP che passa per il Mac.

Su VPS (una tantum, da eseguire via SSH):
```bash
# Aggiunge rotta ERP via Mac relay (wg0 = interfaccia WireGuard)
ip route add 4.231.124.90/32 via 10.10.0.2 dev wg0

# Per rendere persistente al reboot (aggiungere a /etc/network/interfaces o systemd-networkd):
# Dentro il Docker bridge network serve un approccio diverso — vedi note implementazione
```

Il peer WireGuard del Mac sul VPS (`/etc/wireguard/wg0.conf`) deve avere:
```ini
[Peer]
PublicKey = <Mac public key>
AllowedIPs = 10.10.0.2/32, 4.231.124.90/32  # aggiungere ERP IP
PersistentKeepalive = 25
```

---

## Rollback / Restore Points

### Restore Point 1: Auto-relay → Manual relay
Torna al flusso manuale corrente senza perdere nulla:
```bash
# Mac: disabilita LaunchDaemon heartbeat (PF rules rimangono)
sudo launchctl unload /Library/LaunchDaemons/com.formicanera.heartbeat.plist
# Admin panel: gestisci sessione manualmente come prima
```

### Restore Point 2: Relay → Modalità diretta (quando Komet sblocca l'IP)
```bash
# Script: backend/scripts/disable-relay-mode.sh
#!/bin/bash
SSH_KEY="$1"
VPS="deploy@91.98.136.198"
USER_ID="bbed531f-97a5-4250-865e-39ec149cd048"

ssh -i "$SSH_KEY" "$VPS" "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
  exec -T postgres psql -U archibald -d archibald -c \"
  UPDATE system.agent_circuit_state
    SET state='closed', consecutive_erp_failures=0, next_probe_at=NULL, updated_at=NOW()
    WHERE user_id='$USER_ID';
  DELETE FROM system.sync_paused_users WHERE user_id='$USER_ID';
\""

# Rimuove rotta ERP via relay
ssh -i "$SSH_KEY" "$VPS" "ip route del 4.231.124.90/32 via 10.10.0.2 dev wg0 2>/dev/null || true"

# Ripristina timeout bot
ssh -i "$SSH_KEY" "$VPS" "cd /home/deploy/archibald-app && \
  sed -i 's/BOT_RELAY_TIMEOUT_MULTIPLIER=.*/BOT_RELAY_TIMEOUT_MULTIPLIER=1.0/' .env && \
  docker compose restart backend"

echo "Modalità diretta ripristinata. Sistema completamente autonomo."
```

Esecuzione: `bash backend/scripts/disable-relay-mode.sh ~/archibald_vps`

### Restore Point 3: Emergenza (relay down, operazioni critiche)
Se il Mac non è disponibile per più giorni e serve comunque piazzare un ordine:
1. Usa il bot da qualsiasi rete diversa dalla VPS (es. hotspot telefono → SSH tunneling)
2. Oppure: ordine direttamente su ERP dalla UI web (login funziona da qualsiasi IP)

---

## Ordine di implementazione

| Fase | Cosa | Prerequisito |
|---|---|---|
| **Fase 1** | E2E smoke tests (manuale, relay attivo) | Nessuno — testa lo stato attuale |
| **Fase 2** | Bot timeout adaptation (`relayTimeout` helper) | Risultati Fase 1 |
| **Fase 3** | Mac LaunchDaemon PF + WireGuard Login Item | — |
| **Fase 4** | Mac heartbeat agent + LaunchDaemon | Fase 3 |
| **Fase 5** | Backend RelayMonitor + auto-session | Fase 4 |
| **Fase 6** | VPS routing statico + wg0 peer AllowedIPs | Fase 5 |
| **Fase 7** | Script `disable-relay-mode.sh` | Fase 6 |

Fase 1 e 2 sono indipendenti e possono partire subito senza modifiche all'infrastruttura.

---

## Invarianti di sicurezza

- `RELAY_SECRET` mai in chiaro nel codice — solo in `/etc/formicanera-env` (Mac) e `.env` (VPS)
- Il relay non modifica il login ERP — le credenziali dell'agente rimangono invariate
- Il bot continua a usare le credenziali cifrate AES-256-GCM dal DB — nessuna credenziale in chiaro
- L'IP di casa viene usato esattamente come farebbe un umano da browser — nessuna azione sospetta
- Il circuit breaker rimane l'unico gate ERP — `sync_paused_users` diventa un effetto del relay state, non un controllo manuale

---

## Out of scope

- Relay H24 su router (richiederebbe router OpenWRT/pfSense — future work)
- Cambio VPS provider / IP rotation (rischio visibilità)
- Proxy residenziale terzo (rischio reputazionale, costo)
