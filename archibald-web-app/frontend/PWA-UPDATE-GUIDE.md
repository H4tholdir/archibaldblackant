# Guida Completa: Risoluzione Problemi Cache PWA

## 🎯 Problema Risolto

La PWA non si aggiornava correttamente su dispositivi degli utenti dopo un deploy, mostrando contenuto obsoleto a causa della cache del browser e del Service Worker.

## ✅ Soluzioni Implementate

### 1. Auto-Reload Automatico (main.tsx)

**Cosa è stato fatto:**
- Aggiunto auto-reload automatico quando viene rilevato un aggiornamento
- Implementato check periodico ogni 60 secondi per nuove versioni
- Il Service Worker ora forza il reload appena rileva nuovo contenuto

**Come funziona:**
```typescript
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Auto-reload della pagina quando c'è nuovo contenuto
    updateSW(true);
  },
  onRegistered(registration) {
    // Check ogni 60 secondi
    setInterval(() => registration.update(), 60000);
  },
});
```

### 2. Strategia Cache Migliorata (vite.config.ts)

**Modifiche:**
- ✅ **HTML files**: NetworkOnly (sempre fresh dal server)
- ✅ **JS/CSS files**: StaleWhileRevalidate (serve cached ma aggiorna in background)
- ✅ **API calls**: NetworkOnly (mai cached)
- ✅ **Service Worker**: navigationPreload abilitato
- ✅ **Cache cleanup**: cleanupOutdatedCaches automatico

**Vantaggi:**
- Gli utenti vedono l'app immediatamente (da cache)
- L'app si aggiorna automaticamente in background
- Reload automatico quando nuova versione è pronta

### 3. Build Hash per Cache Busting

**Aggiunto:**
```typescript
build: {
  rollupOptions: {
    output: {
      entryFileNames: 'assets/[name].[hash].js',
      chunkFileNames: 'assets/[name].[hash].js',
      assetFileNames: 'assets/[name].[hash].[ext]'
    }
  }
}
```

**Risultato:**
- Ogni build genera hash unici (es: `main.abc123def.js`)
- Browser non può usare cache vecchia (nome file cambia)
- Invalidazione cache automatica garantita

## 🚀 Cosa Devi Fare Ora

### Passo 1: Test Locale

```bash
cd /Users/hatholdir/Downloads/Archibald/archibald-web-app/frontend

# Build della PWA
npm run build

# Verifica che i file abbiano hash
ls -la dist/assets/
# Dovresti vedere: main.xyz123abc.js, index.abc456def.css, etc.
```

### Passo 2: Configurazione Server VPS ⚠️ IMPORTANTE

**Devi applicare le configurazioni HTTP headers sul tuo VPS.**

Leggi e applica **UNA** di queste configurazioni:
- **Se usi Nginx**: Vedi `server-config.md` sezione "Nginx Configuration"
- **Se usi Apache**: Vedi `server-config.md` sezione "Apache Configuration"

**Header HTTP critici da configurare:**

```nginx
# Service Worker - MAI cachare
location ~ ^/sw\.js$ {
    add_header Cache-Control "no-store, no-cache, must-revalidate";
}

# HTML - MAI cachare
location ~ \.html$ {
    add_header Cache-Control "no-store, no-cache, must-revalidate";
}

# JS/CSS con hash - cachare per 1 anno (immutable)
location ~* \.(js|css)$ {
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

❗ **SENZA QUESTI HEADER IL PROBLEMA PERSISTERÀ**

### Passo 3: Deploy

```bash
# 1. Build
npm run build

# 2. Deploy sul VPS (esempio con rsync)
rsync -avz --delete dist/ user@formicanera.com:/var/www/formicanera/dist/

# 3. Ricarica nginx (se hai modificato la config)
ssh user@formicanera.com "sudo nginx -t && sudo systemctl reload nginx"
```

### Passo 4: Verifica

**Su Chrome Desktop:**
1. Apri https://formicanera.com
2. Apri DevTools (F12) → Console
3. Dovresti vedere: `[PWA] Service Worker registered`
4. Fai un altro deploy
5. Entro 60 secondi dovresti vedere: `[PWA] New content available, reloading...`
6. La pagina si ricarica automaticamente

**Su Mobile/PWA installata:**
1. Chiudi completamente l'app (swipe up, non solo minimize)
2. Riapri l'app
3. Entro 60 secondi l'app si aggiornerà automaticamente

**Verifica Header HTTP:**
```bash
# Verifica Service Worker headers
curl -I https://formicanera.com/sw.js
# Dovrebbe mostrare: Cache-Control: no-store, no-cache, must-revalidate

# Verifica JS bundle headers
curl -I https://formicanera.com/assets/main.[hash].js
# Dovrebbe mostrare: Cache-Control: public, max-age=31536000, immutable
```

## 📊 Comportamento Atteso Dopo le Modifiche

### Scenario 1: Primo caricamento
1. Utente apre l'app
2. Service Worker si registra
3. App si carica normalmente

### Scenario 2: Deploy nuova versione
1. Fai un deploy con modifiche
2. Utente ha l'app aperta o la riapre
3. **Entro 60 secondi**: Service Worker rileva aggiornamento
4. **Automaticamente**: App si ricarica con nuova versione
5. Utente vede le nuove modifiche

### Scenario 3: Utente offline
1. Utente apre app senza connessione
2. App funziona con cache (versione precedente)
3. Quando si riconnette: aggiornamento automatico

## 🔧 Troubleshooting

### L'app non si aggiorna su mobile
**Soluzione:**
```bash
1. Chiudi COMPLETAMENTE l'app (non solo background)
2. Riapri l'app
3. Aspetta 60 secondi
4. L'app si dovrebbe ricaricare automaticamente
```

### Vedo ancora contenuto vecchio
**Causa**: Header HTTP non configurati correttamente sul server

**Verifica:**
```bash
curl -I https://formicanera.com/sw.js | grep Cache-Control
```

**Dovrebbe mostrare**: `Cache-Control: no-store, no-cache, must-revalidate`

**Se vedi altro**: Applica la configurazione nginx/apache da `server-config.md`

### Service Worker non si registra
**Checklist:**
- [ ] Sito è HTTPS? (richiesto per PWA)
- [ ] File `sw.js` è accessibile? (https://formicanera.com/sw.js)
- [ ] Console mostra errori? (Chrome DevTools → Console)

### Cache ostinata su Chrome
**Reset completo:**
```
1. Chrome DevTools → Application → Storage
2. Click "Clear site data"
3. Reload pagina (Ctrl+Shift+R)
```

## 📝 Note Importanti

1. **Auto-reload è trasparente**: Gli utenti non vedranno un prompt, l'app si ricarica automaticamente
2. **Update check ogni 60 secondi**: Quando l'app è aperta, controlla aggiornamenti ogni minuto
3. **Background update**: Quando l'app è chiusa e riaperta, controlla immediatamente
4. **Header HTTP sono critici**: Senza header corretti sul server, il problema persiste

## 🎓 Come Funziona (Tecnico)

```
Deploy nuova versione
      ↓
Build genera nuovi hash file
      ↓
Server serve index.html (no-cache)
      ↓
Browser carica nuovo index.html
      ↓
index.html referenzia main.[newhash].js
      ↓
Browser scarica nuovo JS (nome diverso = cache miss)
      ↓
Service Worker rileva cambio
      ↓
updateSW(true) forza reload
      ↓
Utente vede nuova versione
```

## ✨ Vantaggi della Soluzione

✅ **Zero intervento utente**: Aggiornamenti completamente automatici
✅ **Sempre up-to-date**: Check ogni 60 secondi garantisce freschezza
✅ **Offline-first**: App funziona anche offline
✅ **Performance**: Cache intelligente per velocità
✅ **Developer friendly**: Deploy semplice, nessuna configurazione manuale

## 📚 File Modificati

- ✅ `src/main.tsx` - Auto-reload logic
- ✅ `vite.config.ts` - Cache strategy + build hash
- ✅ `server-config.md` - Configurazioni server (da applicare)
- ✅ `PWA-UPDATE-GUIDE.md` - Questa guida

## 🆘 Supporto

Se dopo aver seguito questa guida il problema persiste:

1. Verifica gli header HTTP sul server (vedi sopra)
2. Controlla la console del browser per errori
3. Testa in incognito mode (esclude cache persistente)
4. Verifica che il build abbia generato hash diversi nei file names
