# Relay Mode — Checkpoint 2026-06-01
**Creato prima del rollback a modalità diretta (IP VPS sbloccato da Komet Germany).**
Questo file contiene tutto il necessario per ripristinare il relay Mac in caso di nuovo blocco.

---

## Contesto

IP VPS `91.98.136.198` era in blacklist Komet Germany dal ~15/05/2026.
Il 01/06/2026 il VPS ha risposto HTTP 302 direttamente all'ERP → blocco rimosso.
Il relay è stato dismesso con `disable-relay-mode.sh`.

Se Komet ri-blocca il VPS, seguire la sezione "Ripristino relay" in fondo.

---

## Architettura relay (come era)

```
PWA → VPS (91.98.136.198, archibald-backend)
  → WireGuard tunnel wg0 (10.10.0.1 → 10.10.0.2)
  → Mac di casa (IP Fastweb ~151.53.x.x)
  → ERP Komet (4.231.124.90:443)
```

Il Mac fungeva da NAT gateway: pacchetti dal VPS uscivano con l'IP residenziale Fastweb.

---

## Stato DB al momento del checkpoint

| Tabella | Righe | Note |
|---|---|---|
| `system.sync_paused_users` | 0 | Relay attivo → nessuna pausa |
| `system.agent_circuit_state` | 1 | state='closed', consecutive_erp_failures=0 |
| `system.circuit_breaker` | 4 | Tutti consecutive_failures=0 |

---

## Configurazione VPS (.env al checkpoint)

```env
RELAY_SECRET=1508d687fc42fe878924670bbbb23abeb17e8950c7c5d0f1afc31e956c7f232d
BOT_RELAY_TIMEOUT_MULTIPLIER=2.5
```

Routing kernel VPS (aggiunto da WireGuard AllowedIPs):
```
4.231.124.90 via 10.10.0.2 dev wg0
```

WireGuard VPS `/etc/wireguard/wg0.conf` (contenuto reale al checkpoint):
```
[Interface]
Address = 10.10.0.1/24
ListenPort = 51820
PrivateKey = GMgj9/sWGgY/K4AMgwwVPvlsg7+CqvYVzsYltpWbDEE=
# Quando il tunnel si alza: manda il traffico ERP attraverso il Mac
PostUp = ip route add 4.231.124.90/32 via 10.10.0.2 dev wg0
PostDown = ip route del 4.231.124.90/32 2>/dev/null || true

[Peer]
# Mac di casa
PublicKey = 9zlch5waNQigMVCWMxhRXpC6pg1Rv7jMPkjbS1R+ew8=
AllowedIPs = 10.10.0.2/32, 4.231.124.90/32
PersistentKeepalive = 25
```

---

## File Mac relay (tutti già presenti nel repo)

### `/etc/pf-formicanera.conf`
```
nat on en0 from 10.10.0.0/24 to any -> (en0)
pass all
```

### `/Library/LaunchDaemons/com.formicanera.pf-nat.plist`
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.formicanera.pf-nat</string>
  <key>RunAtLoad</key>
  <true/>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>sysctl -w net.inet.ip.forwarding=1; pfctl -e -f /etc/pf-formicanera.conf 2>/dev/null; true</string>
  </array>
  <key>StandardOutPath</key>
  <string>/var/log/formicanera-pf-nat.log</string>
  <key>StandardErrorPath</key>
  <string>/var/log/formicanera-pf-nat.log</string>
</dict>
</plist>
```

### `/Library/LaunchDaemons/com.formicanera.heartbeat.plist`
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.formicanera.heartbeat</string>
  <key>StartInterval</key>
  <integer>60</integer>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/formicanera-heartbeat.sh</string>
  </array>
  <key>StandardOutPath</key>
  <string>/var/log/formicanera-heartbeat.log</string>
  <key>StandardErrorPath</key>
  <string>/var/log/formicanera-heartbeat.log</string>
</dict>
</plist>
```

### `/usr/local/bin/formicanera-heartbeat.sh`
```bash
#!/bin/bash
if [ -f /etc/formicanera-env ]; then
  source /etc/formicanera-env
fi
if [ -z "${RELAY_SECRET:-}" ]; then exit 1; fi
WG_ACTIVE=$(ifconfig 2>/dev/null | grep -c 'utun' || true)
if [ "$WG_ACTIVE" -eq 0 ]; then exit 0; fi
curl -sf \
  -X POST "https://formicanera.com/api/internal/relay-heartbeat" \
  -H "Authorization: Bearer ${RELAY_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"source":"mac-relay"}' \
  --max-time 5 --retry 2 --retry-delay 1 > /dev/null 2>&1 || true
exit 0
```

### `/etc/formicanera-env`
```
RELAY_SECRET=1508d687fc42fe878924670bbbb23abeb17e8950c7c5d0f1afc31e956c7f232d
```

---

## Ripristino relay (se Komet ri-blocca il VPS)

### Step 1 — Reinstalla LaunchDaemon sul Mac (se rimossi)
```bash
# Copia file di config
sudo cp /etc/pf-formicanera.conf /etc/pf-formicanera.conf  # già presente, skip
# oppure ricrea da questo checkpoint

# LaunchDaemon pf-nat
sudo cp ~/Downloads/Archibald/infra/mac-relay/com.formicanera.pf-nat.plist \
  /Library/LaunchDaemons/
sudo launchctl load /Library/LaunchDaemons/com.formicanera.pf-nat.plist

# LaunchDaemon heartbeat
sudo cp ~/Downloads/Archibald/infra/mac-relay/com.formicanera.heartbeat.plist \
  /Library/LaunchDaemons/
sudo launchctl load /Library/LaunchDaemons/com.formicanera.heartbeat.plist

# Script heartbeat
sudo cp ~/Downloads/Archibald/infra/mac-relay/formicanera-heartbeat.sh \
  /usr/local/bin/
sudo chmod +x /usr/local/bin/formicanera-heartbeat.sh
```

### Step 2 — Ricrea /etc/formicanera-env (se mancante)
```bash
echo "RELAY_SECRET=1508d687fc42fe878924670bbbb23abeb17e8950c7c5d0f1afc31e956c7f232d" \
  | sudo tee /etc/formicanera-env > /dev/null
sudo chmod 600 /etc/formicanera-env
```

### Step 3 — Ripristina VPS in relay mode
```bash
ssh -i ~/archibald_vps deploy@91.98.136.198 'bash -s' <<'REMOTE'
APP_DIR="/home/deploy/archibald-app"
# Rimette BOT_RELAY_TIMEOUT_MULTIPLIER a 2.5
sed -i 's/^BOT_RELAY_TIMEOUT_MULTIPLIER=.*/BOT_RELAY_TIMEOUT_MULTIPLIER=2.5/' $APP_DIR/.env
# Aggiunge rotta ERP via relay (se non presente)
ip route add 4.231.124.90/32 via 10.10.0.2 dev wg0 2>/dev/null || echo "rotta già presente"
# Riavvia backend
docker compose -f $APP_DIR/docker-compose.yml restart backend
echo "Relay ripristinato."
REMOTE
```

### Step 4 — Apri WireGuard sul Mac
WireGuard.app → formicanera-vpn.conf → Connect
Il LaunchDaemon pf-nat abilita ip.forwarding automaticamente al boot.
Il heartbeat inizia dopo ~60s → RelayMonitor rimuove sync_paused_users automaticamente.

### Verifica
```bash
curl -s -X POST https://formicanera.com/api/internal/relay-heartbeat \
  -H "Authorization: Bearer 1508d687fc42fe878924670bbbb23abeb17e8950c7c5d0f1afc31e956c7f232d" \
  -H "Content-Type: application/json" \
  -d '{"source":"test"}'
# Atteso: {"ok":true,"ts":...}
```
