# Tracking UI Redesign

## Contesto

Il sistema di tracking FedEx ora usa l'API ufficiale (100% success rate, dati real-time). L'UI va aggiornata per sfruttare i nuovi dati.

## Modifiche

### 1. Strip compatta tracking (sostituisce TrackingProgressBar)

Sostituire la barra a 5 pallini con una strip informativa su 2 righe:

**Riga 1**: Icona stato + descrizione + location + orario + ETA/firma
**Riga 2**: Progress bar colorata piena in % + route origin->destination + contatore giorni

Percentuale fill basata sullo step raggiunto:
- Ritirato (PU): 10%
- In viaggio (IT/DP): 40%
- Hub locale destinazione (AR+country): 65%
- In consegna (OD): 85%
- Consegnato (DL): 100%

Calcolo giorni: differenza tra primo scan (PU o primo evento) e ultimo evento (o oggi se non consegnato).

Stati visuali:

| Stato | Icona | Testo riga 1 | Info destra | Colore barra |
|---|---|---|---|---|
| Ritirato | `📦` | `Ritirato • {location} • {data} {ora}` | `arr. ~{ETA}` | borderColor stato |
| In viaggio | `🚚` | `In viaggio • {location} • {data} {ora}` | `arr. ~{ETA}` | borderColor stato |
| In consegna | `🚛` | `In consegna • {location} • {data} {ora}` | `arr. oggi` | borderColor stato |
| Consegnato | `✅` | `Consegnato • {location} • {data} {ora}` | `Firmato: {nome}` | borderColor stato |
| Eccezione | `⚠️` | `Eccezione • {location} • {data} {ora}` | `{descrizione}` | borderColor stato |

Riga 2: `{origin} -> {destination} • {N}° giorno` oppure `consegnato in {N} giorni`

### 2. Traduzione eventi timeline (tab Logistica)

Aggiungere mappa di traduzione per le descrizioni degli scan events FedEx EN->IT. Gli eventi arrivano dall'API con `status` in inglese (es. "On the way", "Arrived at FedEx hub", "Picked up", "Left FedEx origin facility", "Shipment information sent to FedEx", "Departed FedEx hub", "In transit", "Out for delivery", "Delivered").

Mappa da applicare in `TrackingTimeline.tsx` nel rendering di `ev.status`:

| Inglese | Italiano |
|---|---|
| Picked up | Ritirato |
| Shipment information sent to FedEx | Informazioni spedizione inviate a FedEx |
| Left FedEx origin facility | Partito dal centro FedEx di origine |
| Departed FedEx hub | Partito dall'hub FedEx |
| In transit | In transito |
| On the way | In viaggio |
| Arrived at FedEx hub | Arrivato all'hub FedEx |
| At local FedEx facility | Presso centro FedEx locale |
| Out for delivery | In consegna |
| Delivered | Consegnato |
| Delivery exception | Eccezione di consegna |
| Shipment arriving On-Time | Spedizione in arrivo nei tempi previsti |
| Customer not available or business closed | Destinatario non disponibile o attivita chiusa |
| International shipment release - Loss report | Spedizione internazionale rilasciata |

Fallback: se la stringa non e in mappa, mostrare il testo originale.

### 3. Rimuovere bottone Tracking dall'header

Rimuovere il bottone `🚚 Tracking` dalla sezione action buttons dell'ordine espanso (`OrderCardNew.tsx` righe ~4088-4122). Le stesse informazioni sono nella tab Logistica.

### 4. Gerarchia stati ordine

Modificare `getOrderStatus()` in `orderStatus.ts`. Nuova priorita:

```
1. Pagato (invariato)
2. Pagamento scaduto (invariato)
3. Eccezione corriere (trackingStatus === 'exception')
4. In transito (trackingStatus === 'out_for_delivery' || 'in_transit')
5. Consegnato (deliveryConfirmedAt !== null)
6. Fatturato (invoiceNumber presente)
7. Consegnato (fallback euristica isLikelyDelivered)
8. In transito (fallback euristica isInTransit)
9. Bloccato / In attesa / In lavorazione / Backorder / Su Archibald
```

Cambio chiave: tracking real-time (punti 3-5) prevale su Fatturato (punto 6).

### 5. Filtri veloci (conseguenza punto 4)

Aggiornare i filtri `inTransit` e `delivered` in `OrderHistory.tsx` per usare i dati tracking reali:

- **In transito**: `order.trackingStatus === 'in_transit' || order.trackingStatus === 'out_for_delivery' || isInTransit(order)` (API + fallback euristica)
- **Consegnati**: `order.deliveryConfirmedAt != null || isLikelyDelivered(order)` (API + fallback euristica)

## File coinvolti

| File | Modifica |
|---|---|
| `frontend/src/components/TrackingProgressBar.tsx` | Riscrivere: strip compatta |
| `frontend/src/components/TrackingProgressBar.spec.tsx` | Aggiornare test |
| `frontend/src/components/TrackingTimeline.tsx` | Aggiungere mappa traduzione EN->IT |
| `frontend/src/components/TrackingTimeline.spec.tsx` | Aggiornare test |
| `frontend/src/components/OrderCardNew.tsx` | Rimuovere bottone Tracking, integrare nuova strip |
| `frontend/src/utils/orderStatus.ts` | Riordinare gerarchia stati |
| `frontend/src/utils/orderStatus.spec.ts` | Aggiornare test |
| `frontend/src/pages/OrderHistory.tsx` | Aggiornare filtri veloci |
