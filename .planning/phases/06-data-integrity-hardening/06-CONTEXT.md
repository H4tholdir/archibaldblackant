# Phase 6: Data Integrity & Hardening - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<vision>
## How This Should Work

La PWA deve essere semplice, pulita e super affidabile — usata quotidianamente da 60+ agenti su multi-dispositivi. Questa fase rende i dati corretti e il sistema robusto:

- **IVA per prodotto**: Ogni prodotto deve usare la sua aliquota IVA reale dal database (4%, 10%, 22% ecc.), non il 22% fisso hardcoded nel frontend. Gli agenti vendono un mix di prodotti con aliquote diverse — i totali ordine devono essere precisi. Il backend ha già il supporto (colonne `vat`, `vat_source`, `vat_updated_at` nella tabella products), ma il frontend (`order-calculations.ts`) ignora tutto e usa `VAT_RATE = 0.22`. Questa è una feature incompleta, non una regressione.

- **Hash SHA-256**: Sostituire MD5 con SHA-256 per il change detection nei sync (order-sync, price-sync). Il primo sync dopo la migrazione ricalcolerà tutti gli hash (one-time full sync) — accettabile.

- **Validazione input**: Tutti i query params con `parseInt` devono avere validazione `isNaN`. Il sistema deve essere robusto contro input sporchi, pensando a 60+ agenti multi-device.

- **Rate limiting**: Protezione sulle route costose (bot/Puppeteer, sync, PDF generation). Non ci sono problemi oggi, ma con 60+ agenti su multi-dispositivi serve protezione preventiva.

- **PDF lifecycle**: I PDF hanno due categorie:
  - PDF per sync (parsing dati): servono solo il tempo di estrarre le informazioni, poi cancellati
  - PDF generati per condivisione (mail, WhatsApp, Dropbox): restano sul VPS il tempo necessario per essere usati, poi cancellati — possono sempre essere ricreati da capo

</vision>

<essential>
## What Must Be Nailed

- **IVA corretta per prodotto** — I calcoli ordine devono usare l'aliquota IVA reale di ogni prodotto dal DB. Errori nei totali sono inaccettabili con un mix di aliquote (4%, 10%, 22%).
- **Affidabilità generale** — Dati corretti (hash), input validati, route protette. Il sistema deve reggere 60+ agenti multi-device senza sorprese.
- **PDF lifecycle pulito** — Nessun PDF orfano che accumula spazio sul VPS. TTL appropriato per tipo, cleanup automatico.

</essential>

<boundaries>
## What's Out of Scope

- Nessuna esclusione specifica — tutto quello descritto nel roadmap per questa fase va implementato
- UI admin avanzata per gestione aliquote IVA (si legge dal DB quello che c'è già)
- Sicurezza avanzata (CSRF, WAF, helmet) — solo rate limiting base

</boundaries>

<specifics>
## Specific Ideas

- Il frontend ha già `vat-utils.ts` con `VALID_ITALIAN_VAT_RATES = [0, 4, 5, 10, 22]` e `normalizeVatRate` — la struttura per aliquote multiple esiste già, va collegata ai calcoli ordine
- Il backend ha già colonne `vat`/`vat_source`/`vat_updated_at` nella tabella products e funzioni `getNoVatCount()`/`updateProductPrice()` — l'infrastruttura dati è pronta
- Migrazione hash MD5→SHA-256: one-time full sync accettabile, nessuna necessità di periodo transitorio con doppio supporto

</specifics>

<notes>
## Additional Context

- La PWA serve a rendere facile usare Archibald — deve essere semplice, pulita e super affidabile
- Sempre pensare al sistema come usato da 60+ agenti su multi-dispositivi simultaneamente
- I PDF possono sempre essere ricreati da capo, quindi non serve conservarli a lungo termine

</notes>

---

*Phase: 06-data-integrity-hardening*
*Context gathered: 2026-02-20*
