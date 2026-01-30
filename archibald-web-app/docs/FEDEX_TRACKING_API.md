# FedEx Tracking API - Documentazione

## Panoramica

Questo documento descrive le opzioni disponibili per integrare il tracking FedEx nell'applicazione Archibald, permettendo di ottenere automaticamente la data/ora di consegna effettiva degli ordini.

## Stato Attuale

Attualmente, il sistema:
- ✅ Riceve tracking URL da Archibald quando disponibili
- ✅ Mostra link cliccabili per aprire pagina tracking FedEx
- ❌ Non ottiene automaticamente lo stato di consegna
- ❌ Non popola il campo `deliveryCompletedDate`

## Opzioni di Integrazione

### Opzione 1: FedEx Track & Trace API (RACCOMANDATO)

**Pro:**
- API ufficiale FedEx con supporto completo
- Dati affidabili e in tempo reale
- Include data/ora consegna precisa
- Include firma digitale e prova di consegna
- Supporta tracking multipli in batch

**Contro:**
- Richiede account FedEx aziendale
- Necessita API credentials (API Key, Secret Key)
- Costo potenziale (da verificare con FedEx)

**Requisiti:**
1. Account FedEx Business
2. Registrazione su [FedEx Developer Portal](https://developer.fedex.com/)
3. Credenziali API:
   - API Key
   - Secret Key
   - Account Number
   - Meter Number

**Endpoint API:**
```
POST https://apis.fedex.com/track/v1/trackingnumbers
```

**Esempio Request:**
```json
{
  "includeDetailedScans": true,
  "trackingInfo": [
    {
      "trackingNumberInfo": {
        "trackingNumber": "123456789012"
      }
    }
  ]
}
```

**Esempio Response (consegnato):**
```json
{
  "output": {
    "completeTrackResults": [
      {
        "trackingNumber": "123456789012",
        "trackResults": [
          {
            "latestStatusDetail": {
              "code": "DL",
              "derivedCode": "DL",
              "statusByLocale": "Delivered",
              "description": "Delivered",
              "scanLocation": {
                "city": "MILAN",
                "stateOrProvinceCode": "MI",
                "countryCode": "IT"
              }
            },
            "dateAndTimes": [
              {
                "type": "ACTUAL_DELIVERY",
                "dateTime": "2026-01-30T14:23:00+01:00"
              }
            ],
            "deliveryDetails": {
              "receivedByName": "JOHN DOE",
              "deliveryAttempts": "0",
              "deliveryOptionEligibilityDetails": []
            }
          }
        ]
      }
    ]
  }
}
```

**Campi Utili:**
- `latestStatusDetail.code`: "DL" = Delivered
- `dateAndTimes[type=ACTUAL_DELIVERY].dateTime`: Data/ora consegna ISO 8601
- `deliveryDetails.receivedByName`: Nome firmatario

### Opzione 2: FedEx Webhook Notifications

**Pro:**
- Notifiche push automatiche quando cambia lo stato
- Non richiede polling periodico
- Efficiente e real-time
- Riduce carico API

**Contro:**
- Richiede endpoint pubblico per ricevere webhook
- Setup più complesso
- Stesse credenziali API dell'Opzione 1

**Come Funziona:**
1. Registrare endpoint webhook su FedEx Developer Portal
2. FedEx invia POST al nostro endpoint quando tracking cambia stato
3. Aggiorniamo automaticamente `deliveryCompletedDate`

**Endpoint da Implementare:**
```
POST /api/webhooks/fedex-tracking
```

### Opzione 3: Polling Periodico

**Pro:**
- Semplice da implementare
- Non richiede webhook pubblico
- Usa API Track & Trace standard

**Contro:**
- Meno efficiente (deve fare molte chiamate API)
- Ritardo tra consegna effettiva e aggiornamento DB
- Costi API più alti

**Implementazione:**
- Cron job ogni 2-4 ore
- Query ordini "in transito" (con tracking, senza deliveryCompletedDate)
- Chiamata batch API FedEx per controllare stato
- Aggiornamento DB quando stato = "Delivered"

### Opzione 4: Scraping Pagina Tracking (NON RACCOMANDATO)

**Pro:**
- Non richiede credenziali API
- "Gratis" (nessun costo diretto)

**Contro:**
- ❌ Viola Terms of Service FedEx
- ❌ Fragile (si rompe se FedEx cambia HTML)
- ❌ Richiede browser headless (Puppeteer/Playwright)
- ❌ Lento e inefficiente
- ❌ Rischio di ban IP
- ❌ Non affidabile per uso produzione

**NON IMPLEMENTARE** - solo per testing/debug

## Raccomandazione

**Approccio consigliato:**

### Fase 1: Soluzione Immediata (GIÀ IMPLEMENTATO)
✅ Link tracking cliccabile nella card ordine
- Utente apre manualmente pagina FedEx
- Veloce da implementare
- Nessun costo

### Fase 2: Integrazione API (FUTURE)
Quando disponibili credenziali FedEx:

1. **Setup Iniziale:**
   - Ottenere credenziali API da FedEx
   - Salvare in variabili ambiente (.env):
     ```
     FEDEX_API_KEY=xxx
     FEDEX_SECRET_KEY=xxx
     FEDEX_ACCOUNT_NUMBER=xxx
     FEDEX_METER_NUMBER=xxx
     ```

2. **Implementazione Polling (MVP):**
   - Cron job ogni 4 ore
   - Query ordini in transito
   - Batch API call (max 30 tracking per request)
   - Update `deliveryCompletedDate` quando delivered

3. **Upgrade a Webhook (Ottimizzazione):**
   - Registrare webhook endpoint
   - Ricevere notifiche real-time
   - Eliminare cron job

## File da Creare

Quando si implementa l'integrazione API:

### Backend Service
```
backend/src/fedex-tracking-service.ts
```

Funzioni principali:
- `getTrackingInfo(trackingNumber: string)`
- `batchGetTrackingInfo(trackingNumbers: string[])`
- `updateDeliveryStatus(orderId: string, deliveryDate: string)`

### Cron Job (Polling)
```
backend/src/cron/update-delivery-status.ts
```

### Webhook Handler
```
backend/src/routes/webhooks/fedex-tracking.ts
```

## Database Schema

Campo già aggiunto (Task #9):
```sql
ALTER TABLE orders ADD COLUMN delivery_completed_date TEXT;
```

## Testing

### Test Tracking Numbers FedEx
FedEx fornisce tracking numbers di test per development:

```
Delivered: 123456789012
In Transit: 123456789013
Exception: 123456789014
```

Documentazione: https://developer.fedex.com/api/en-us/guides/api-reference.html#testing

## Costi

Da verificare con account FedEx aziendale:
- API Track & Trace: Potenzialmente gratuito per clienti business
- Webhook Notifications: Solitamente gratuito
- Contattare FedEx Sales per dettagli pricing

## Link Utili

- [FedEx Developer Portal](https://developer.fedex.com/)
- [Track API Documentation](https://developer.fedex.com/api/en-us/catalog/track/v1/docs.html)
- [Webhook Guide](https://developer.fedex.com/api/en-us/guides/webhooks.html)
- [API Authentication](https://developer.fedex.com/api/en-us/get-started.html#authentication)

## Next Steps

1. ✅ Implementato link tracking cliccabile (Fase 1)
2. ⏳ Verificare se esistono credenziali FedEx aziendali
3. ⏳ Se sì: registrare app su FedEx Developer Portal
4. ⏳ Implementare polling service (MVP)
5. ⏳ (Opzionale) Upgrade a webhook per real-time updates

## Note Implementazione

Quando si implementa, ricordare:
- ✅ Campo `deliveryCompletedDate` già presente nel DB
- ✅ Tipo `Order` già include `deliveryCompletedDate?: string`
- ✅ Logica `getOrderStatus()` già usa questo campo per distinguere "In transito" vs "Consegnato"
- Aggiungere retry logic per API calls (network failures)
- Loggare tutte le chiamate API per debugging
- Gestire rate limits FedEx
- Cachare risultati per evitare chiamate duplicate
