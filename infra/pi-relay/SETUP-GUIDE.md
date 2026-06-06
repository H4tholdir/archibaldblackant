# Raspberry Pi 4 — Relay WireGuard per Formicanera
**Creato: 2026-06-03 | Sostituisce il relay Mac**

## Architettura finale

```
PWA (qualsiasi device) → VPS 91.98.136.198
  → WireGuard tunnel wg0 (10.10.0.1 → 10.10.0.3)
  → Raspberry Pi (collegato al modem WINDTRE, H24)
  → ERP Komet (4.231.124.90:443)
```

Il Pi sostituisce il Mac. L'IP residenziale WINDTRE esce dal Pi invece che dal Mac.
Il VPS rimane invariato — cambia solo il peer WireGuard.

---

## Valori fissi di riferimento

| Cosa | Valore |
|------|--------|
| IP VPS | 91.98.136.198 |
| IP WireGuard VPS | 10.10.0.1 |
| IP WireGuard Mac (vecchio) | 10.10.0.2 |
| **IP WireGuard Pi (nuovo)** | **10.10.0.3** |
| Porta WireGuard VPS | 51820 |
| Public key VPS | `Zug0OOKg+HBDC00k+SLxJ3jLyqfy+Xyef/wU5m9i1zA=` |
| Relay secret (heartbeat) | `1508d687fc42fe878924670bbbb23abeb17e8950c7c5d0f1afc31e956c7f232d` |

---

## FASE 1 — Flash del sistema operativo

### Cosa serve
- Raspberry Pi 4 Model B
- MicroSD card (≥ 8 GB)
- Lettore microSD per Mac
- Cavo ethernet
- Alimentatore USB-C (5V / 3A)

### Passi

**1.1 — Scarica Raspberry Pi Imager**
- Vai su https://www.raspberrypi.com/software/
- Scarica "Raspberry Pi Imager for macOS"
- Installalo normalmente

**1.2 — Apri Imager e scegli il sistema**
- Clicca **"CHOOSE DEVICE"** → seleziona **Raspberry Pi 4**
- Clicca **"CHOOSE OS"** → **Raspberry Pi OS (other)** → **Raspberry Pi OS Lite (64-bit)**
  - "Lite" = senza interfaccia grafica (non ti serve per un server)
  - "64-bit" = necessario per Pi 4
- Clicca **"CHOOSE STORAGE"** → seleziona la tua microSD

**1.3 — Configurazione avanzata (FONDAMENTALE)**
Prima di scrivere, clicca sull'icona ingranaggio ⚙️ (oppure apparirà una finestra "Use OS customisation?") e configura:

- **Hostname**: `formicanera-relay` (il nome del Pi sulla rete)
- **Enable SSH**: spunta ✓
  - "Use password authentication"
- **Username**: `hatholdir`
- **Password**: scegli una password sicura (es. `formicanera2026!`) — **annotala**
- **Locale settings**: fuso orario `Europe/Rome`, layout tastiera `it`
- WiFi: lascia vuoto (userai ethernet)

Clicca **"SAVE"** poi **"YES"**.

**1.4 — Scrivi sulla microSD**
- Clicca **"WRITE"** e conferma
- Attendi 3-5 minuti finché non compare "Write Successful"
- Rimuovi la microSD dal Mac

---

## FASE 2 — Primo avvio e connessione SSH

**2.1 — Assembla e accendi il Pi**
1. Inserisci la microSD nel Pi (slot sul lato inferiore)
2. Collega il cavo ethernet: Pi → porta LAN del modem WINDTRE
3. Collega l'alimentatore USB-C
4. Attendi 90 secondi — il Pi fa il boot

**2.2 — Trova l'IP del Pi sulla rete**
Dal Mac, apri il Terminale e digita:
```bash
arp -a | grep -v incomplete
```
Cerca una riga con un indirizzo tipo `192.168.1.xxx` o `192.168.0.xxx` associato a un MAC address che inizia con `dc:a6:32` o `e4:5f:01` (sono i prefissi Raspberry Pi).

In alternativa, accedi al pannello admin del modem WINDTRE (di solito su `192.168.1.1`) → sezione "Dispositivi connessi" → cerca `formicanera-relay`.

**2.3 — Connettiti via SSH**
```bash
ssh hatholdir@192.168.1.XXX   # sostituisci XXX con l'IP trovato
```
- Alla prima connessione chiede conferma fingerprint → digita `yes`
- Inserisci la password che hai scelto nel punto 1.3

Sei dentro il Pi.

---

## FASE 3 — Configurazione base del Pi

Esegui questi comandi uno alla volta (sei connesso via SSH al Pi):

**3.1 — Aggiornamento sistema** (può richiedere 5-10 minuti)
```bash
sudo apt update && sudo apt upgrade -y
```

**3.2 — Installa pacchetti necessari**
```bash
sudo apt install -y wireguard curl iptables-persistent
```
Durante l'installazione di `iptables-persistent` chiede se salvare le regole attuali → rispondi **Yes** a entrambe le domande.

**3.3 — IP statico (opzionale ma consigliato)**
Per evitare che il Pi cambi IP dopo un riavvio, assegna IP fisso dal pannello del modem WINDTRE:
- Pannello admin modem → DHCP reservations → aggiungi il MAC del Pi con IP fisso (es. 192.168.1.50)
- Il MAC del Pi lo vedi con: `ip addr show eth0 | grep ether`

---

## FASE 4 — WireGuard sul Pi

**4.1 — Genera la coppia di chiavi WireGuard**
```bash
wg genkey | sudo tee /etc/wireguard/pi_private.key | wg pubkey | sudo tee /etc/wireguard/pi_public.key
sudo chmod 600 /etc/wireguard/pi_private.key
```

**4.2 — Leggi e annota la chiave pubblica** (ti servirà nel Passo 7)
```bash
sudo cat /etc/wireguard/pi_public.key
```
Copia questo valore — è la **PI_PUBLIC_KEY**.

**4.3 — Crea il file di configurazione WireGuard**
```bash
sudo nano /etc/wireguard/wg0.conf
```
Incolla questo contenuto (sostituisci `<PI_PRIVATE_KEY>` con il contenuto di `/etc/wireguard/pi_private.key`):

```ini
[Interface]
Address = 10.10.0.3/24
PrivateKey = <PI_PRIVATE_KEY>
PostUp   = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE; iptables -A FORWARD -i wg0 -o eth0 -j ACCEPT; iptables -A FORWARD -i eth0 -o wg0 -m state --state ESTABLISHED,RELATED -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE; iptables -D FORWARD -i wg0 -o eth0 -j ACCEPT; iptables -D FORWARD -i eth0 -o wg0 -m state --state ESTABLISHED,RELATED -j ACCEPT

[Peer]
# VPS Formicanera
PublicKey = Zug0OOKg+HBDC00k+SLxJ3jLyqfy+Xyef/wU5m9i1zA=
Endpoint = 91.98.136.198:51820
AllowedIPs = 10.10.0.0/24
PersistentKeepalive = 25
```

Per leggere la chiave privata senza uscire da nano:
```bash
sudo cat /etc/wireguard/pi_private.key
```
(apri un secondo terminale per vederla)

Salva con: `Ctrl+X` → `Y` → `Enter`

**4.4 — Permessi e IP forwarding**
```bash
sudo chmod 600 /etc/wireguard/wg0.conf

# Abilita IP forwarding permanente
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

**4.5 — Avvia WireGuard**
```bash
sudo wg-quick up wg0
```

**4.6 — Verifica che si sia connesso**
```bash
sudo wg show
```
Dovresti vedere l'interfaccia wg0 con il peer VPS. Per ora NON vedrà handshake perché il VPS non sa ancora del Pi — lo aggiustiamo nel Passo 7.

**4.7 — Abilita WireGuard all'avvio automatico**
```bash
sudo systemctl enable wg-quick@wg0
```

---

## FASE 5 — Heartbeat service

Il Pi deve mandare un "sono vivo" al VPS ogni 60 secondi (come faceva il Mac).

**5.1 — Crea lo script heartbeat**
```bash
sudo nano /usr/local/bin/formicanera-heartbeat.sh
```
Contenuto:
```bash
#!/bin/bash
curl -sf \
  -X POST "https://formicanera.com/api/internal/relay-heartbeat" \
  -H "Authorization: Bearer 1508d687fc42fe878924670bbbb23abeb17e8950c7c5d0f1afc31e956c7f232d" \
  -H "Content-Type: application/json" \
  -d '{"source":"pi-relay"}' \
  --max-time 5 --retry 2 --retry-delay 1 > /dev/null 2>&1 || true
```
Salva. Poi:
```bash
sudo chmod +x /usr/local/bin/formicanera-heartbeat.sh
```

**5.2 — Crea il servizio systemd**
```bash
sudo nano /etc/systemd/system/formicanera-heartbeat.service
```
Contenuto:
```ini
[Unit]
Description=Formicanera Relay Heartbeat
After=network-online.target wg-quick@wg0.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/formicanera-heartbeat.sh

[Install]
WantedBy=multi-user.target
```

**5.3 — Crea il timer systemd (esegue ogni 60 secondi)**
```bash
sudo nano /etc/systemd/system/formicanera-heartbeat.timer
```
Contenuto:
```ini
[Unit]
Description=Formicanera Relay Heartbeat Timer

[Timer]
OnBootSec=60
OnUnitActiveSec=60
Unit=formicanera-heartbeat.service

[Install]
WantedBy=timers.target
```

**5.4 — Abilita e avvia il timer**
```bash
sudo systemctl daemon-reload
sudo systemctl enable formicanera-heartbeat.timer
sudo systemctl start formicanera-heartbeat.timer
```

---

## FASE 6 — Aggiunta Pi come peer sul VPS

Questa fase si esegue dal **Mac**, non dal Pi.

Hai già la PI_PUBLIC_KEY dal punto 4.2. Ora la aggiungiamo al VPS.

**6.1 — Connettiti al VPS**
```bash
ssh -i ~/archibald_vps deploy@91.98.136.198
```

**6.2 — Aggiungi il Pi come peer WireGuard**
```bash
echo 'passworddeploy' | sudo -S wg set wg0 peer <PI_PUBLIC_KEY> \
  allowed-ips 10.10.0.3/32 \
  persistent-keepalive 25
```
Sostituisci `<PI_PUBLIC_KEY>` con la chiave pubblica del Pi.

Questo aggiunge il Pi come peer "temporaneo" senza toccare il routing ERP (ancora tutto passa dal Mac).

**6.3 — Verifica handshake Pi ↔ VPS**
```bash
sudo wg show
```
Dovresti vedere due peer: il Mac (con handshake recente) e il Pi (nuovo, handshake in arrivo).

Dal Pi, verifica il ping:
```bash
ping 10.10.0.1
```
Se risponde → il tunnel Pi ↔ VPS funziona.

---

## FASE 7 — Migrazione: ERP → Pi (il grande switch)

Questa operazione causa ~5 secondi di downtime del relay. Eseguila quando non stai usando Formicanera.

**7.1 — Aggiorna wg0.conf sul VPS per usare il Pi**

Dal VPS:
```bash
echo 'passworddeploy' | sudo -S cp /etc/wireguard/wg0.conf /etc/wireguard/wg0.conf.backup-mac
echo 'passworddeploy' | sudo -S nano /etc/wireguard/wg0.conf
```

Modifica il file:
1. `PostUp`: cambia `via 10.10.0.2` → `via 10.10.0.3`
2. `PostDown`: cambia `via 10.10.0.2` → `via 10.10.0.3` (se presente)
3. Nel blocco `[Peer]` del Pi: aggiungi `4.231.124.90/32` ad AllowedIPs
4. Commenta o rimuovi il peer Mac (con `#`)

Risultato finale:
```ini
[Interface]
Address = 10.10.0.1/24
ListenPort = 51820
PrivateKey = GMgj9/sWGgY/K4AMgwwVPvlsg7+CqvYVzsYltpWbDEE=
PostUp = ip route add 4.231.124.90/32 via 10.10.0.3 dev wg0
PostDown = ip route del 4.231.124.90/32 2>/dev/null || true

# [Peer] Mac — disabilitato, sostituito da Pi
# PublicKey = 9zlch5waNQigMVCWMxhRXpC6pg1Rv7jMPkjbS1R+ew8=
# AllowedIPs = 10.10.0.2/32, 4.231.124.90/32
# PersistentKeepalive = 25

[Peer]
# Raspberry Pi relay (WINDTRE)
PublicKey = <PI_PUBLIC_KEY>
AllowedIPs = 10.10.0.3/32, 4.231.124.90/32
PersistentKeepalive = 25
```

**7.2 — Riavvia WireGuard sul VPS**
```bash
echo 'passworddeploy' | sudo -S systemctl restart wg-quick@wg0
```

**7.3 — Verifica**
```bash
# Dal VPS: il Pi risponde?
ping -c 3 10.10.0.3

# Verifica routing ERP
ip route get 4.231.124.90

# Test connessione ERP attraverso Pi
curl -k -o /dev/null -w "%{http_code}" https://4.231.124.90/Archibald/ --max-time 10
# Atteso: 302 (redirect login)
```

**7.4 — Apri Formicanera e verifica che funzioni**
- Vai su https://formicanera.com
- Fai una sync manuale
- Se le sync partono → sei sul Pi

---

## FASE 8 — Cleanup finale

Ora che il Pi funziona, puoi disconnettere WireGuard dal Mac.

**8.1 — Sul Mac**
- Apri WireGuard.app
- Clicca su `formicanera-vpn.conf` → **Disconnect**

Il relay gira ora solo sul Pi, H24, senza dipendere dal Mac.

**8.2 — Riavvio Pi (test finale)**
```bash
sudo reboot
```
Dopo 2 minuti, verifica che Formicanera funzioni ancora → conferma che WireGuard e heartbeat partono automaticamente al boot.

---

## Gestione e Monitoraggio del Pi

### Connessione SSH al Pi
```bash
ssh hatholdir@192.168.1.9
# Password: Pibekumre52!
```

---

### MONITORAGGIO — Cosa controllare e come

**Stato generale del relay (primo check)**
```bash
# Dal VPS (via Mac):
ssh -i ~/archibald_vps deploy@91.98.136.198 \
  "echo 'passworddeploy' | sudo -S wg show"
# Cerca: Pi peer con handshake < 2 minuti e traffico crescente
```

**Stato WireGuard sul Pi**
```bash
sudo wg show
# Output atteso: peer VPS con latest handshake < 2 minuti
```

**IP pubblico attuale**
```bash
curl -s ifconfig.me
# Dev essere il tuo IP WINDTRE (es. 37.100.22.31)
# Se fosse l'IP del VPS (91.98.136.198) → il NAT non funziona
```

**Stato di tutti i servizi**
```bash
sudo systemctl status wg-quick@wg0
sudo systemctl status formicanera-heartbeat.timer
sudo systemctl status netfilter-persistent
```

**Log WireGuard in tempo reale**
```bash
sudo journalctl -u wg-quick@wg0 -f
# Ctrl+C per uscire
```

**Log heartbeat (ultimi 20)**
```bash
sudo journalctl -u formicanera-heartbeat --since "1 hour ago"
```

**Regole NAT attive**
```bash
sudo iptables -t nat -L POSTROUTING -n -v
# Dev mostrare: MASQUERADE all -- * eth0 10.10.0.0/24
```

**Test ERP attraverso Pi (dal VPS)**
```bash
ssh -i ~/archibald_vps deploy@91.98.136.198 \
  "curl -k -o /dev/null -w '%{http_code}' https://4.231.124.90/Archibald/ --max-time 10"
# Atteso: 302
```

---

### MANUTENZIONE — Operazioni comuni

**Spegnimento sicuro**
```bash
# SEMPRE spegnere così — non staccare mai la corrente senza questo!
sudo shutdown now
# Aspetta che la luce verde smetta di lampeggiare, poi stacca l'alimentatore
```

**Riavvio**
```bash
sudo reboot
# Oppure: stacca e riattacca l'alimentatore (il Pi parte automaticamente)
```

**Restart solo WireGuard (senza riavviare il Pi)**
```bash
sudo systemctl restart wg-quick@wg0
# Causa ~3 secondi di interruzione relay
```

**Aggiornamento sistema (da fare ogni mese circa)**
```bash
sudo apt update && sudo apt upgrade -y
sudo reboot
```

**Verifica spazio disco**
```bash
df -h
# La microSD non deve superare l'80% di utilizzo
```

**Temperatura CPU (il Pi non deve superare i 70°C con dissipatori)**
```bash
vcgencmd measure_temp
# Output: temp=45.0'C  (normale con dissipatori)
```

**Memoria disponibile**
```bash
free -h
```

---

### DIAGNOSTICA — Se qualcosa non funziona

**Formicanera non fa sync**

1. Controlla tunnel dal VPS:
```bash
ssh -i ~/archibald_vps deploy@91.98.136.198 \
  "echo 'passworddeploy' | sudo -S wg show"
# Handshake Pi > 5 minuti? → problema tunnel
```

2. Controlla che il Pi sia online (dal modem WINDTRE → 192.168.1.1 → Periferiche)

3. Sul Pi, riavvia WireGuard:
```bash
sudo systemctl restart wg-quick@wg0
sudo wg show
# Entro 30 secondi dovrebbe apparire il handshake col VPS
```

**WireGuard non si connette al boot**
```bash
# Controlla se il servizio è abilitato
sudo systemctl is-enabled wg-quick@wg0
# Dev rispondere: enabled

# Se disabled:
sudo systemctl enable wg-quick@wg0
sudo systemctl start wg-quick@wg0
```

**NAT non funziona (IP pubblico mostra VPS invece di WINDTRE)**
```bash
# Ricarica le regole iptables
sudo systemctl restart netfilter-persistent
# Oppure riavvia WireGuard (le regole vengono riapplicate dal PostUp)
sudo wg-quick down wg0
sudo wg-quick up wg0
```

**Heartbeat non parte**
```bash
sudo systemctl status formicanera-heartbeat.timer
sudo systemctl restart formicanera-heartbeat.timer
# Test manuale:
sudo /usr/local/bin/formicanera-heartbeat.sh && echo "OK"
```

**Pi non risponde a SSH (ma è acceso)**
Possibili cause: IP cambiato (DHCP), SSH crashato.
- Controlla IP nel modem WINDTRE → Periferiche
- Se IP diverso da 192.168.1.9, usa il nuovo IP
- Considera di assegnare IP fisso dal pannello modem (DHCP reservation per MAC `88:A2:9E:59:D6:89`)

---

### RIFERIMENTO RAPIDO — Valori chiave

| Cosa | Valore |
|------|--------|
| IP locale Pi (ethernet) | 192.168.1.9 |
| MAC ethernet Pi | 88:A2:9E:59:D6:89 |
| IP WireGuard Pi | 10.10.0.3 |
| IP WireGuard VPS | 10.10.0.1 |
| Public key Pi | bRLxCuUq5mj9ScrJBGAUwNoAuNRA/eMFYNGoCaHd40s= |
| Public key VPS | Zug0OOKg+HBDC00k+SLxJ3jLyqfy+Xyef/wU5m9i1zA= |
| Username Pi | hatholdir |
| Password Pi | Pibekumre52! |

---

## Rollback (se qualcosa va storto)

Se il relay Pi non funziona e devi tornare al Mac immediatamente:

1. Sul Mac: apri WireGuard.app → Connetti `formicanera-vpn.conf`
2. Sul VPS: ripristina config Mac
```bash
sudo cp /etc/wireguard/wg0.conf.backup-mac /etc/wireguard/wg0.conf
sudo systemctl restart wg-quick@wg0
```
3. Verifica: `sudo wg show` → il Mac deve mostrare handshake recente
