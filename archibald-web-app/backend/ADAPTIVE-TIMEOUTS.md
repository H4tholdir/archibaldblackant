# Sistema di Timeout Adattivi

## Overview

Il sistema di timeout adattivi impara automaticamente i tempi ottimali per ogni operazione del bot, riducendo i timeout quando le operazioni sono veloci e aumentandoli quando necessario per evitare fallimenti.

## Come Funziona

### 1. Registrazione Operazioni

Ogni operazione critica (dropdown clienti, caricamento risultati, ecc.) viene registrata con parametri configurabili:

```typescript
this.timeoutManager.registerOperation('customer.dropdown.open', {
  minTimeout: 300,        // Timeout minimo assoluto (ms)
  maxTimeout: 2000,       // Timeout massimo assoluto (ms)
  initialTimeout: 1000,   // Timeout iniziale (ms)
  adjustmentStep: 100,    // Step di incremento/decremento (ms)
  adjustmentInterval: 2,  // Ogni quante operazioni aggiustare
  successThreshold: 0.9,  // 90% di successo per ridurre timeout
  failureThreshold: 0.3,  // 30% di fallimento per aumentare timeout
});
```

### 2. Monitoraggio Performance

Il sistema traccia automaticamente:
- ✅ **Successi**: Tempo effettivo impiegato dall'operazione
- ❌ **Fallimenti**: Timeout scaduto prima del completamento
- 📊 **Statistiche**: Min, max, media dei tempi

### 3. Aggiustamento Automatico

Ogni N operazioni (definito da `adjustmentInterval`):

- **Se tasso di successo ≥ 90%**: Riduce il timeout verso il tempo medio + 50% di margine
- **Se tasso di fallimento ≥ 30%**: Aumenta il timeout di uno step

**Esempio**:
```
Operazione: customer.dropdown.open
Timeout iniziale: 1000ms
Dopo 10 successi con media 400ms → Timeout: 600ms (400 * 1.5)
Dopo 2 fallimenti su 10 tentativi → Timeout: 700ms (+100ms step)
```

## Operazioni Monitorate

| Operazione | Descrizione | Min | Max | Initial |
|-----------|-------------|-----|-----|---------|
| `order.wait.devexpress` | Attesa caricamento form ordine | 100ms | 3000ms | 300ms |
| `customer.dropdown.open` | Apertura dropdown clienti | 300ms | 2000ms | 1000ms |
| `customer.results.load` | Caricamento risultati clienti | 500ms | 3000ms | 1500ms |
| `article.search.open` | Apertura ricerca articoli | 200ms | 2000ms | 500ms |
| `article.results.load` | Caricamento risultati articoli | 300ms | 2000ms | 500ms |
| `quantity.field.ready` | Campo quantità pronto | 100ms | 1000ms | 300ms |
| `order.save` | Salvataggio ordine finale | 1000ms | 10000ms | 5000ms |

## API Endpoints

### GET /api/timeouts/stats

Ottieni statistiche di tutte le operazioni:

```bash
curl http://localhost:3000/api/timeouts/stats
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "operationName": "customer.dropdown.open",
      "successCount": 15,
      "failureCount": 1,
      "totalTime": 6500,
      "minTime": 380,
      "maxTime": 520,
      "avgTime": 433,
      "currentTimeout": 650,
      "lastAdjustment": 1736436075000
    }
  ]
}
```

### POST /api/timeouts/reset/:operation?

Reset statistiche (mantiene i timeout correnti):

```bash
# Reset singola operazione
curl -X POST http://localhost:3000/api/timeouts/reset/customer.dropdown.open

# Reset tutte le operazioni
curl -X POST http://localhost:3000/api/timeouts/reset
```

### POST /api/timeouts/set

Forza un timeout specifico (override manuale):

```bash
curl -X POST http://localhost:3000/api/timeouts/set \
  -H "Content-Type: application/json" \
  -d '{"operation": "customer.dropdown.open", "timeout": 800}'
```

## Persistenza

Le statistiche e i timeout ottimizzati vengono salvati automaticamente in:
```
/backend/data/adaptive-timeouts.json
```

Al riavvio del server, il sistema carica i timeout ottimizzati precedentemente appresi.

## Vantaggi

✅ **Auto-ottimizzazione**: Impara i tempi ottimali senza intervento manuale
✅ **Affidabilità**: Non scende mai sotto il minTimeout per evitare falsi negativi
✅ **Performance**: Riduce i tempi di attesa non necessari
✅ **Trasparenza**: Logs dettagliati di ogni aggiustamento
✅ **Persistenza**: Mantiene l'apprendimento tra i riavvii

## Logs

Il sistema logga ogni aggiustamento:

```
✅ customer.dropdown.open: 420ms (timeout: 650ms, avg: 433ms)
🔧 customer.dropdown.open: timeout 1000ms → 650ms (success: 93.8%, avg: 433ms)
❌ article.results.load: timeout (500ms)
🔧 article.results.load: timeout 500ms → 600ms (success: 70.0%, avg: 0ms)
```

## Monitoraggio in Tempo Reale

Durante l'esecuzione degli ordini, osserva i log per vedere il sistema imparare:

```bash
# Backend logs
tail -f /tmp/claude/-Users-hatholdir-Downloads-Archibald/tasks/*.output | grep -E "(✅|❌|🔧)"
```

## Best Practices

1. **Primo Avvio**: Lascia processare 10-15 ordini per permettere al sistema di calibrarsi
2. **Monitoraggio**: Verifica le statistiche con `/api/timeouts/stats` periodicamente
3. **Reset**: Resetta le stats dopo modifiche significative al codice o all'infrastruttura
4. **Override**: Usa `/api/timeouts/set` solo se necessario, lascia il sistema imparare autonomamente

## Troubleshooting

### Timeout troppo bassi causano fallimenti
- Il sistema aumenterà automaticamente il timeout dopo alcuni fallimenti
- Se persistente: forza un timeout più alto con `/api/timeouts/set`

### Timeout troppo alti rallentano il bot
- Aspetta che il sistema li riduca dopo successi consistenti
- Verifica che `adjustmentInterval` non sia troppo alto
- Reset delle stats per ripartire da `initialTimeout`

### Stats non persistono tra riavvii
- Verifica che la directory `/backend/data` esista
- Controlla i permessi di scrittura
- Verifica i log per errori di salvataggio
