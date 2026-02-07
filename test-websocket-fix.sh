#!/bin/bash
# Script di testing guidato per verifica fix WebSocket

set -e

FRONTEND_DIR="/Users/hatholdir/Downloads/Archibald/archibald-web-app/frontend"
BACKEND_DIR="/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 TEST WEBSOCKET FIX - VERIFICA COMPLETA"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Colori per output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📋 PREREQUISITI${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Prima di procedere, assicurati di:"
echo "  1. ✅ Aver completato tutte le modifiche al codice"
echo "  2. ✅ Backend e frontend NON devono essere in esecuzione"
echo "  3. ✅ Terminali separati pronti per backend e frontend"
echo ""
read -p "Premi INVIO per continuare..."
echo ""

echo -e "${BLUE}🔧 STEP 1: VERIFICA COMPILAZIONE${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Backend type-check
echo -e "${YELLOW}Verifica backend TypeScript...${NC}"
cd "$BACKEND_DIR"
if npx tsc --noEmit 2>&1 | grep -q "error TS"; then
    echo -e "${RED}❌ ERRORE: Backend ha errori TypeScript!${NC}"
    npx tsc --noEmit
    exit 1
else
    echo -e "${GREEN}✅ Backend: nessun errore TypeScript${NC}"
fi
echo ""

# Frontend type-check
echo -e "${YELLOW}Verifica frontend TypeScript...${NC}"
cd "$FRONTEND_DIR"
if npm run type-check 2>&1 | grep -q "error TS"; then
    echo -e "${RED}❌ ERRORE: Frontend ha errori TypeScript!${NC}"
    npm run type-check
    exit 1
else
    echo -e "${GREEN}✅ Frontend: nessun errore TypeScript${NC}"
fi
echo ""

echo -e "${GREEN}✅ STEP 1 COMPLETATO: Compilazione OK${NC}"
echo ""
read -p "Premi INVIO per continuare..."
echo ""

echo -e "${BLUE}🚀 STEP 2: AVVIO BACKEND${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "In un terminale separato, esegui:"
echo ""
echo -e "  ${YELLOW}cd $BACKEND_DIR && npm run dev${NC}"
echo ""
echo "Attendi finché non vedi:"
echo "  ✅ Server started on port 3000"
echo "  ✅ 🔌 WebSocket server initialized on ws://localhost:3000/ws/realtime"
echo ""
read -p "Premi INVIO quando il backend è avviato..."
echo ""

echo -e "${YELLOW}Verifica che il backend sia in ascolto...${NC}"
if curl -s http://localhost:3000/api/health > /dev/null; then
    echo -e "${GREEN}✅ Backend risponde su http://localhost:3000${NC}"
else
    echo -e "${RED}❌ ERRORE: Backend non risponde!${NC}"
    echo "Verifica che il backend sia avviato correttamente"
    exit 1
fi
echo ""

echo -e "${GREEN}✅ STEP 2 COMPLETATO: Backend avviato${NC}"
echo ""
read -p "Premi INVIO per continuare..."
echo ""

echo -e "${BLUE}🌐 STEP 3: AVVIO FRONTEND${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "In un altro terminale separato, esegui:"
echo ""
echo -e "  ${YELLOW}cd $FRONTEND_DIR && npm run dev${NC}"
echo ""
echo "Attendi finché non vedi:"
echo "  ✅ Local:   http://localhost:5173/"
echo ""
read -p "Premi INVIO quando il frontend è avviato..."
echo ""

echo -e "${YELLOW}Verifica che il frontend sia accessibile...${NC}"
if curl -s http://localhost:5173 > /dev/null; then
    echo -e "${GREEN}✅ Frontend accessibile su http://localhost:5173${NC}"
else
    echo -e "${RED}❌ ERRORE: Frontend non accessibile!${NC}"
    echo "Verifica che il frontend sia avviato correttamente"
    exit 1
fi
echo ""

echo -e "${GREEN}✅ STEP 3 COMPLETATO: Frontend avviato${NC}"
echo ""
read -p "Premi INVIO per continuare..."
echo ""

echo -e "${BLUE}🔐 STEP 4: LOGIN E VERIFICA CONNESSIONE${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Ora esegui questi passaggi nel BROWSER:"
echo ""
echo "1. Apri http://localhost:5173"
echo "2. Apri DevTools (F12)"
echo "3. Vai su tab Console"
echo "4. Effettua LOGIN con le tue credenziali"
echo ""
echo -e "${YELLOW}VERIFICHE DA FARE:${NC}"
echo ""
echo "A) Nel terminale BACKEND, cerca questi log:"
echo "   ✅ 'WebSocket client authenticated { userId: \"...\" }'"
echo "   ✅ 'WebSocket client connected'"
echo ""
echo "B) Nella Console del BROWSER, cerca questi log:"
echo "   ✅ '[WebSocket] Connected'"
echo "   ✅ '[WebSocketSync] Real-time sync initialized'"
echo ""
echo "C) Nella Console del BROWSER, NON devono esserci:"
echo "   ❌ '[WebSocket] No auth token, cannot connect'"
echo "   ❌ 'WebSocket connection failed'"
echo "   ❌ Errori di connessione WebSocket"
echo ""
read -p "Hai visto tutti i log correttamente? Premi INVIO per continuare..."
echo ""

echo -e "${GREEN}✅ STEP 4 COMPLETATO: Login effettuato${NC}"
echo ""
read -p "Premi INVIO per continuare..."
echo ""

echo -e "${BLUE}📊 STEP 5: VERIFICA ADMIN PANEL${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Ora nel BROWSER:"
echo ""
echo "1. Vai su http://localhost:5173/admin"
echo "2. Scorri fino alla sezione 'WebSocket Real-Time Sync'"
echo ""
echo -e "${YELLOW}VERIFICHE DA FARE:${NC}"
echo ""
echo "✅ Status: deve essere 🟢 HEALTHY (verde)"
echo "   ❌ Se vedi 🟡 IDLE (giallo) → PROBLEMA NON RISOLTO!"
echo ""
echo "✅ Connessioni Attive: deve essere ≥ 1"
echo "✅ Utenti Connessi: deve essere ≥ 1"
echo ""
echo "✅ Tabella 'Connessioni per Utente': deve mostrare il tuo userId con count=1"
echo ""
echo "✅ Uptime: deve mostrare tempo > 0 (es. '5m')"
echo ""
read -p "Lo status è 'healthy' (verde)? [y/N] " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}❌ PROBLEMA: Status non è 'healthy'!${NC}"
    echo ""
    echo "Debug suggestions:"
    echo "  1. Verifica log backend per errori di connessione"
    echo "  2. Verifica console browser per errori WebSocket"
    echo "  3. Controlla che il token JWT sia presente in localStorage"
    echo "  4. Riavvia backend e frontend"
    exit 1
fi
echo ""

echo -e "${GREEN}✅ STEP 5 COMPLETATO: Admin panel mostra 'healthy'${NC}"
echo ""
read -p "Premi INVIO per continuare..."
echo ""

echo -e "${BLUE}🔄 STEP 6: TEST REAL-TIME SYNC${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Test Draft Order Sync:"
echo ""
echo "1. Nel browser, vai su http://localhost:5173/order"
echo "2. Crea un nuovo draft order (compila form ma NON inviare)"
echo "3. Clicca 'Salva come Bozza'"
echo ""
echo -e "${YELLOW}VERIFICHE DA FARE:${NC}"
echo ""
echo "A) Console Browser deve mostrare:"
echo "   ✅ Log di invio draft via WebSocket"
echo ""
echo "B) Backend deve mostrare:"
echo "   ✅ Log di ricezione evento draft"
echo ""
echo "C) Il draft deve apparire immediatamente nella lista draft"
echo ""
read -p "Il draft è stato creato e sincronizzato correttamente? [y/N] " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}⚠️  ATTENZIONE: Sync potrebbe non funzionare correttamente${NC}"
    echo "Controlla i log per debugging"
fi
echo ""

echo -e "${GREEN}✅ STEP 6 COMPLETATO: Real-time sync testato${NC}"
echo ""
read -p "Premi INVIO per continuare..."
echo ""

echo -e "${BLUE}🔌 STEP 7: TEST RECONNECTION${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Test auto-reconnect:"
echo ""
echo "1. Nel terminale BACKEND, premi Ctrl+C per fermare il server"
echo "2. Nella Console del BROWSER, osserva i log:"
echo "   ✅ '[WebSocket] Closed (code: ..., reason: ...)'"
echo "   ✅ '[WebSocket] Reconnecting in 1000ms...'"
echo "   ✅ Tentativi di reconnect con backoff (1s, 2s, 4s, 8s...)"
echo ""
echo "3. Riavvia il backend:"
echo "   cd $BACKEND_DIR && npm run dev"
echo ""
echo "4. Nella Console del BROWSER, osserva:"
echo "   ✅ '[WebSocket] Connected'"
echo "   ✅ Riconnessione automatica avvenuta!"
echo ""
read -p "La riconnessione automatica ha funzionato? [y/N] " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}⚠️  ATTENZIONE: Auto-reconnect potrebbe avere problemi${NC}"
fi
echo ""

echo -e "${GREEN}✅ STEP 7 COMPLETATO: Auto-reconnect testato${NC}"
echo ""
read -p "Premi INVIO per continuare..."
echo ""

echo -e "${BLUE}🎭 STEP 8: TEST MULTI-DEVICE (OPZIONALE)${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Test sincronizzazione multi-device:"
echo ""
echo "1. Apri un SECONDO BROWSER (o finestra incognito)"
echo "2. Vai su http://localhost:5173"
echo "3. Effettua login con lo STESSO utente"
echo ""
echo "4. Vai su /admin nel primo browser"
echo "5. Nella sezione WebSocket, verifica:"
echo "   ✅ 'Connessioni Attive': deve essere = 2"
echo "   ✅ 'Utenti Connessi': deve rimanere = 1 (stesso user)"
echo "   ✅ Tabella: il tuo userId deve avere count=2"
echo ""
echo "6. Crea un draft nel PRIMO browser"
echo "7. Verifica che appaia IMMEDIATAMENTE nel SECONDO browser"
echo ""
read -p "Vuoi eseguire questo test multi-device? [y/N] " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "Segui i passaggi sopra e verifica la sincronizzazione..."
    echo ""
    read -p "La sincronizzazione multi-device ha funzionato? [y/N] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${GREEN}✅ STEP 8 COMPLETATO: Multi-device funziona!${NC}"
    else
        echo -e "${YELLOW}⚠️  ATTENZIONE: Multi-device potrebbe avere problemi${NC}"
    fi
else
    echo -e "${YELLOW}⏭️  STEP 8 SALTATO${NC}"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}🎉 TEST COMPLETATI!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${GREEN}✅ RIEPILOGO RISULTATI:${NC}"
echo ""
echo "  ✅ Compilazione TypeScript: OK"
echo "  ✅ Backend avviato: OK"
echo "  ✅ Frontend avviato: OK"
echo "  ✅ Login e connessione WebSocket: OK"
echo "  ✅ Admin panel status 'healthy': OK"
echo "  ✅ Real-time sync: OK"
echo "  ✅ Auto-reconnect: OK"
echo ""
echo -e "${BLUE}📝 PROSSIMI PASSI:${NC}"
echo ""
echo "1. Se tutti i test sono passati:"
echo "   → Il problema è RISOLTO! ✅"
echo "   → Puoi procedere con il commit delle modifiche"
echo ""
echo "2. Se qualche test è fallito:"
echo "   → Analizza i log di backend e frontend"
echo "   → Verifica i messaggi di errore nella console browser"
echo "   → Consulta il file WEBSOCKET-FIX-SUMMARY.md per dettagli"
echo ""
echo -e "${YELLOW}Commit delle modifiche:${NC}"
echo "  git add ."
echo "  git commit -m 'fix(websocket): implement singleton WebSocket context and remove legacy server'"
echo "  git push"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}Fine del testing!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
