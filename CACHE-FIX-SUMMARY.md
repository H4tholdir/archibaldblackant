# Fix Cache Frontend - Prevenzione Problema Deploy

## 🔴 Problema Originale

**Sintomo:** Frontend in produzione serviva versione vecchia dopo deploy
**Causa:** BuildKit cache aggressivo riusava build precedenti senza rilevare cambiamenti ai file sorgente

## ✅ Soluzioni Implementate

### 1. **Cache Scoping per Commit** (CRITICO)

```yaml
# PRIMA (problema)
cache-from: type=gha
cache-to: type=gha,mode=max

# DOPO (fix)
cache-from: |
  type=gha,scope=frontend-${{ github.sha }}
  type=gha,scope=frontend-main
cache-to: type=gha,mode=max,scope=frontend-${{ github.sha }}
```

**Effetto:** Ogni commit ha il suo cache scope, prevenendo riuso di build obsoleti.

### 2. **Build Args con Metadati**

```yaml
build-args: |
  BUILDKIT_INLINE_CACHE=1
  GIT_COMMIT=${{ github.sha }}
  BUILD_DATE=${{ github.event.head_commit.timestamp }}
```

**Effetto:** Build args diversi invalidano automaticamente la cache quando commit cambia.

### 3. **Docker Image Labels**

```yaml
labels: |
  org.opencontainers.image.revision=${{ github.sha }}
  org.opencontainers.image.created=${{ github.event.head_commit.timestamp }}
  org.opencontainers.image.source=${{ github.repositoryUrl }}
```

**Effetto:** Ogni immagine è tracciabile al commit esatto che l'ha generata.

### 4. **Force Pull su VPS**

```bash
# PRIMA
docker compose pull backend frontend

# DOPO
docker compose pull --no-cache backend frontend
```

**Effetto:** VPS ignora cache locale e forza download ultima immagine da GHCR.

### 5. **Force Recreate Containers**

```bash
# PRIMA
docker compose up -d backend frontend

# DOPO
docker compose up -d --no-deps --force-recreate backend frontend
```

**Effetto:** Container sempre ricreati da zero, mai riusati.

### 6. **Logging Deploy Metadata**

```bash
echo "📊 Deployed commit: ${{ github.sha }}"
echo "📊 Frontend image labels:"
docker inspect ghcr.io/h4tholdir/archibald-frontend:latest --format '{{json .Config.Labels}}'
```

**Effetto:** Verifica immediata in logs del commit deployato.

## 📊 Impact Matrix

| Fix | Previene Cache Stale | Performance Impact | Rischio |
|-----|---------------------|-------------------|---------|
| 1. Cache Scoping | ✅ Critico | ⚠️ Minimo (+5s build) | 🟢 Basso |
| 2. Build Args | ✅ Alto | 🟢 Nessuno | 🟢 Basso |
| 3. Image Labels | ℹ️ Tracciabilità | 🟢 Nessuno | 🟢 Basso |
| 4. Force Pull | ✅ Medio | ⚠️ Minimo (+2s pull) | 🟢 Basso |
| 5. Force Recreate | ✅ Alto | 🟢 Nessuno | 🟢 Basso |
| 6. Logging | ℹ️ Debugging | 🟢 Nessuno | 🟢 Basso |

## 🎯 Risultato Atteso

✅ **Ogni deploy garantisce:**
- Frontend buildato con codice aggiornato
- Immagine tracciabile al commit esatto
- Cache invalidata correttamente
- Container sempre freschi

⚠️ **Trade-off accettabile:**
- Build leggermente più lenti (~5-10s)
- Cache meno riusabile tra commit
- **MA:** Deploy sempre affidabili

## 🔍 Verifica Post-Deploy

Dopo ogni deploy, verificare nei logs GitHub Actions:

```
✅ Deployment to production successful!
📊 Deployed commit: <sha>
📊 Frontend: ghcr.io/h4tholdir/archibald-frontend:<sha>
📊 Backend: ghcr.io/h4tholdir/archibald-backend:<sha>
```

Su VPS:
```bash
docker inspect ghcr.io/h4tholdir/archibald-frontend:latest \
  --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'
```

Dovrebbe mostrare il commit SHA corrente.

## 📅 Implementato

- **Data:** 2026-02-04
- **Commit:** (in corso)
- **Validazione:** ✅ Workflow CD aggiornato
- **Test:** In attesa prossimo deploy

## 🚀 Prossimi Passi

1. Committare fix workflow CD
2. Push su master → trigger deploy
3. Verificare nei logs che commit SHA sia corretto
4. Verificare frontend in produzione ha modifiche recenti
5. Documentare processo in VPS-ACCESS-CREDENTIALS.md

---

**Autore:** Claude Sonnet 4.5
**Review:** In attesa validazione deploy
