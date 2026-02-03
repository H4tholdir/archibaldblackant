# Configurazione Server per Cache-Busting PWA

Questo file contiene le configurazioni necessarie per il server VPS per garantire che la PWA si aggiorni correttamente senza problemi di cache del browser.

## Nginx Configuration

Aggiungi queste direttive alla configurazione del tuo sito nginx (solitamente in `/etc/nginx/sites-available/formicanera.com`):

```nginx
server {
    listen 80;
    server_name formicanera.com www.formicanera.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name formicanera.com www.formicanera.com;

    # SSL certificates
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;

    root /var/www/formicanera/dist;
    index index.html;

    # ============================================
    # Cache-Control Headers per PWA
    # ============================================

    # Service Worker - NEVER cache, always check for updates
    location ~ ^/sw\.js$ {
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
        add_header Pragma "no-cache";
        add_header Expires "0";
        try_files $uri =404;
    }

    # HTML files - NEVER cache (to always load fresh service worker)
    location ~ \.html$ {
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
        add_header Pragma "no-cache";
        add_header Expires "0";
        try_files $uri /index.html;
    }

    # Manifest and icons - cache for 1 hour (can be updated frequently)
    location ~ \.(webmanifest|manifest\.json)$ {
        add_header Cache-Control "public, max-age=3600";
        try_files $uri =404;
    }

    # Static assets with hash (JS, CSS) - cache for 1 year (hash changes when file changes)
    location ~* \.(js|css)$ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    # Images and fonts - cache for 1 month
    location ~* \.(jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$ {
        add_header Cache-Control "public, max-age=2592000";
        try_files $uri =404;
    }

    # API calls - NEVER cache
    location /api {
        add_header Cache-Control "no-store, no-cache, must-revalidate";
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SPA fallback - redirect all requests to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

## Apache Configuration (.htaccess)

Se usi Apache invece di nginx, aggiungi questo al file `.htaccess` nella root della PWA:

```apache
<IfModule mod_headers.c>
    # Service Worker - NEVER cache
    <FilesMatch "sw\.js$">
        Header set Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
        Header set Pragma "no-cache"
        Header set Expires "0"
    </FilesMatch>

    # HTML files - NEVER cache
    <FilesMatch "\.html$">
        Header set Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
        Header set Pragma "no-cache"
        Header set Expires "0"
    </FilesMatch>

    # Manifest
    <FilesMatch "\.(webmanifest|manifest\.json)$">
        Header set Cache-Control "public, max-age=3600"
    </FilesMatch>

    # Static assets with hash (JS, CSS)
    <FilesMatch "\.(js|css)$">
        Header set Cache-Control "public, max-age=31536000, immutable"
    </FilesMatch>

    # Images and fonts
    <FilesMatch "\.(jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$">
        Header set Cache-Control "public, max-age=2592000"
    </FilesMatch>
</IfModule>

# SPA fallback
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /
    RewriteRule ^index\.html$ - [L]
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . /index.html [L]
</IfModule>
```

## Dopo aver applicato le configurazioni

1. **Testa la configurazione nginx:**
   ```bash
   sudo nginx -t
   ```

2. **Ricarica nginx:**
   ```bash
   sudo systemctl reload nginx
   ```

3. **Verifica gli header HTTP:**
   Apri Chrome DevTools → Network → carica la pagina → clicca su un file JS → guarda gli header "Response Headers"
   Dovresti vedere `Cache-Control: public, max-age=31536000, immutable`

4. **Test su dispositivo mobile:**
   - Chiudi completamente l'app
   - Riapri
   - Dovrebbe aggiornarsi automaticamente entro 60 secondi

## Processo di Deploy

Ogni volta che fai un deploy:

1. **Build la PWA:**
   ```bash
   cd frontend
   npm run build
   ```

2. **Deploy sul VPS (esempio con rsync):**
   ```bash
   rsync -avz --delete dist/ user@vps:/var/www/formicanera/dist/
   ```

3. **Verifica che il Service Worker si aggiorni:**
   - Apri Chrome DevTools → Application → Service Workers
   - Dovresti vedere "waiting to activate" e poi "activated"
   - L'app si ricaricherà automaticamente

## Verifica Cache Busting

Per verificare che tutto funzioni:

1. **Console del browser:**
   - Dovresti vedere: `[PWA] New content available, reloading...`
   - Seguito da un reload automatico della pagina

2. **Service Worker Update:**
   - Chrome DevTools → Application → Service Workers
   - Dovresti vedere il nuovo service worker attivarsi immediatamente

3. **File con hash:**
   - Chrome DevTools → Network
   - I file JS/CSS dovrebbero avere nomi come `main.abc123def.js`
   - Ogni build genera hash diversi

## Troubleshooting

### L'app non si aggiorna su mobile
- Chiudi completamente l'app (non solo metterla in background)
- Riapri l'app
- Aspetta 60 secondi per il check automatico degli aggiornamenti

### Vedo ancora contenuto vecchio
1. Cancella cache del browser: Settings → Privacy → Clear browsing data
2. Disinstalla la PWA e reinstallala
3. Verifica che gli header HTTP siano corretti (vedi sopra)

### Service Worker non si registra
- Verifica che il sito sia HTTPS (richiesto per PWA)
- Controlla la console del browser per errori
- Verifica che `sw.js` sia accessibile (https://formicanera.com/sw.js)
