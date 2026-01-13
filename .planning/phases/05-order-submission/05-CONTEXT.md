# Phase 5: Order Submission - Context

**Gathered:** 2026-01-13
**Status:** Ready for planning

<vision>
## How This Should Work

**CRITICAL PRINCIPLE: NON rovinare quello che abbiamo già costruito.**

Il processo di creazione ordine (bot Puppeteer, validazioni, queue BullMQ) esiste già e funziona. Phase 5 riguarda **migliorare l'esperienza utente** attorno a questo processo esistente:

1. **Progress tracking visivo step-by-step**: L'agente vede una pagina in real-time che mostra esattamente cosa sta succedendo:
   - ✅ Cliente selezionato
   - ⏳ Aggiunta articoli (2/3)
   - ⏸️ Salvataggio ordine

   Con tempo rimanente stimato (~45s) che si aggiorna dinamicamente.

2. **Toast notification di successo**: Quando l'ordine è creato, appare una notifica verde semplice e non invasiva:
   - "✅ Ordine #12345 creato con successo"
   - Non blocca il workflow, l'agente può continuare

3. **Messaggi di errore chiari**: Se qualcosa fallisce (timeout rete, errore Archibald), mostra:
   - Cosa è andato storto in linguaggio umano (no codici tecnici)
   - Cosa fare per risolvere
   - Esempio: "Timeout rete dopo 60s. Controlla la connessione e riprova tra 30s"

**Il focus è UX/UI, non rifar il bot o le logiche esistenti.**

</vision>

<essential>
## What Must Be Nailed

- **Visibility del processo**: L'agente deve sempre sapere cosa sta succedendo e quanto manca. No "buchi neri" dove sembra che non succeda nulla.

- **Comunicazione errori chiara**: Quando fallisce, l'agente deve capire perché e cosa fare. No messaggi cryptici o stack traces.

- **Preservare l'esistente**: Il bot createOrder(), le validazioni, il PriorityManager, la queue BullMQ - tutto questo già funziona e NON va toccato salvo necessità assoluta.

</essential>

<boundaries>
## What's Out of Scope

- **Riscrivere il bot**: Il bot Puppeteer (createOrder()) esiste e funziona - non rifarlo
- **Ottimizzazioni performance**: Phase 3.2 ha già gestito le performance, non riaprire quel tema
- **Storico ordini**: Vedere ordini passati è Phase 10 (Order History)
- **Modifica ordini**: Edit di ordini esistenti è Phase 11 (Order Management)
- **Coda offline**: Gestione ordini senza rete è Phase 9 (Offline Queue)
- **Riepilogo pre-invio**: Esiste già nel form ordine, non duplicare

</boundaries>

<specifics>
## Specific Ideas

**Progress Tracking UI:**
- Step-by-step list con status icons (✅ ⏳ ⏸️)
- Tempo rimanente stimato basato su baseline (~82s tipico)
- Aggiornamenti real-time via WebSocket

**Success Notification:**
- Toast notification verde, stile minimal
- Mostra ID ordine Archibald
- Auto-dismiss dopo pochi secondi
- Non blocca il workflow dell'agente

**Error Messages:**
- Linguaggio umano, no codici
- Spiegazione del problema + azione suggerita
- Esempi:
  - "Timeout rete dopo 60s. Controlla la connessione e riprova tra 30s"
  - "Archibald non risponde. Riprova tra 1 minuto o controlla che Archibald sia accessibile"
  - "Cliente non trovato. Verifica che il cliente esista in Archibald"

**Technical Notes:**
- Sistema attuale ha già BullMQ job tracking con progress 25% e 100%
- WebSocket già configurato per sync services (/ws/sync)
- PriorityManager gestisce lock durante order creation
- Baseline performance: ~82s order creation (Phase 3.2 metrics)

</specifics>

<notes>
## Additional Context

**Existing Infrastructure (DO NOT BREAK):**
1. **BullMQ Queue**: `queue-manager.ts` gestisce job con retry automatico
2. **Progress Updates**: Attualmente solo 2 step (25%, 100%) - espandere a step granulari
3. **WebSocket**: `/ws/sync` esiste per clienti/prodotti sync - riutilizzare pattern per ordini
4. **Error Handling**: BullMQ ha retry built-in - aggiungere messaggi user-friendly
5. **PriorityManager**: Pausa sync durante order creation - preservare questo comportamento

**User Priorities:**
- Solo ciò che è strettamente necessario
- Non aggiungere complessità non richiesta
- Rispettare il principio: "non rovinare quello che abbiamo già costruito"

**Implementation Approach:**
- Phase 5 è principalmente **frontend + WebSocket enhancement**
- Backend già solido - solo minor tweaks se necessario
- Focus su user feedback visivo, non su rifare la logica

</notes>

---

*Phase: 05-order-submission*
*Context gathered: 2026-01-13*
