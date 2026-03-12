# 🐜 Formicanera - Archibald Rework

**Sistema di gestione ordini Archibald per agenti Komet**

## 📋 Descrizione

Formicanera è una Progressive Web App (PWA) che modernizza e semplifica la gestione degli ordini Archibald per gli agenti commerciali Komet. L'applicazione trasforma un processo manuale complesso in un'esperienza mobile-first, veloce e affidabile.

## 👨‍💻 Autore

**Francesco Formicola**
- Email: francesco@formicanera.com
- GitHub: [@H4tholdir](https://github.com/H4tholdir)

## 💼 Modello di Business

Soluzione **SaaS (Software as a Service)** con abbonamento mensile:
- Gestione ordini Archibald semplificata
- Accesso da qualsiasi dispositivo (mobile, tablet, desktop)
- Funzionalità offline con sincronizzazione automatica
- Aggiornamenti continui e supporto tecnico

## ✨ Caratteristiche Principali

### 🚀 Performance & UX
- **PWA installabile** - Funziona come app nativa su iOS/Android
- **Offline-first** - Lavora senza connessione, sincronizza quando disponibile
- **Autenticazione biometrica** - Face ID / Touch ID per accesso rapido
- **Validazione password sicura** - Integrazione Puppeteer con Archibald

### 📦 Gestione Ordini
- **Creazione ordini rapida** - Interface ottimizzata per mobile
- **Voice input** - Dettatura vocale per inserimento veloce
- **Package selection intelligente** - Auto-correzione quantità
- **Coda offline** - Ordini salvati localmente e sincronizzati

### 📊 Funzionalità Avanzate
- **Order history** - Cronologia completa con filtri
- **Send to Milano** - Invio automatizzato ordini
- **DDT & Fatture** - Download PDF diretti
- **Monitoraggio real-time** - Dashboard con metriche Prometheus/Grafana

## 🏗️ Architettura Tecnica

### Stack Tecnologico
- **Frontend**: React 18, TypeScript, Vite, Material-UI
- **Backend**: Node.js, Express, Puppeteer, BullMQ
- **Database**: SQLite (user data), IndexedDB (offline cache)
- **Infrastructure**: Docker, Nginx, Redis, Prometheus, Grafana
- **Deployment**: VPS con SSL (Let's Encrypt)

### Sicurezza
- ✅ HTTPS obbligatorio (A+ SSL rating)
- ✅ JWT authentication (24h expiration)
- ✅ Password validation via Puppeteer
- ✅ Credential encryption (IndexedDB)
- ✅ Biometric auth support
- ✅ No credentials in logs/storage

### Performance
- ⚡ Login validation: ~10-15s (optimized from 30-60s)
- ⚡ Instant form fill (paste-style, no typing delay)
- ⚡ Offline capability with background sync
- ⚡ Service Worker caching strategy
- ⚡ 50ms slowMo for stable Puppeteer operations

## 🚀 Deployment

### Production Environment
- **URL**: https://formicanera.com
- **Infrastructure**: Docker Compose multi-container
  - Frontend (Nginx + React build)
  - Backend (Node.js + Puppeteer)
  - Redis (BullMQ job queue)
  - Nginx Proxy (SSL termination)
  - Prometheus (metrics)
  - Grafana (monitoring)

### CI/CD Pipeline
- GitHub Actions automatic deployment
- Health checks for all containers
- Zero-downtime updates
- Automatic SSL renewal

## 🧭 Claude Code Cost Control

Per evitare consumi anomali con repository grandi:

- Usa la guida: `docs/CLAUDE-COST-GUARDRAILS.md`
- Avvia con profilo sicuro (Sonnet default):

```bash
./scripts/claude-launch.sh
```

- Opus solo on-demand, con conferma esplicita:

```bash
./scripts/claude-launch.sh --model opus --target backend --confirm-opus
```

## 📄 License

**PROPRIETARY** - All rights reserved.

This software is proprietary and confidential. Unauthorized copying, modification, distribution, or use of this software, via any medium, is strictly prohibited.

© 2026 Francesco Formicola. All rights reserved.

---

**Target Customers**: Agenti commerciali Komet
**Business Model**: SaaS con abbonamento mensile
**Status**: Production-ready, in active development
