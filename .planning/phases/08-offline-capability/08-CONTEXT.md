# Phase 8: Offline Capability - Context

**Gathered:** 2026-01-14
**Status:** Ready for research

<vision>
## How This Should Work

L'app funziona **sempre**, online o offline, senza che l'agente debba pensarci. Cache automatica di tutti i dati (clienti, prodotti, prezzi) - circa 50-100 MB, scaricati automaticamente e aggiornati in background.

**Quando l'agente è offline:**
- Il form ordine funziona esattamente come quando è online
- Ricerca clienti/prodotti è istantanea (< 100ms) dalla cache locale
- Creazione ordine procede normalmente
- L'ordine va in **coda automatica** per sync in background
- **Banner giallo prominent** (banking app style) mostra "Modalità Offline" - chiaro e rassicurante come Intesa o UniCredit

**Quando torna online:**
- Il sistema sincronizza automaticamente in background
- **Progress bar discreto** in basso mostra "Aggiornamento dati... 45%"
- Ordini in coda vengono inviati automaticamente
- **Notifiche push** informano: "Ordine #12345 inviato ad Archibald"
- **Badge contatore** sull'icona ordini mostra quanti sono pending
- **Lista sync con stato real-time**: "In coda (2)", "Invio in corso... (1)", "Inviati (5)"

**First-run:**
- Al primo avvio l'agente DEVE essere online
- Durante il sync iniziale (dopo login + PIN setup), l'app scarica tutti i dati
- Da quel momento in poi, può lavorare offline

L'esperienza è seamless - l'agente lavora normalmente, il sistema gestisce automaticamente cache e sincronizzazione.

</vision>

<essential>
## What Must Be Nailed

Tre pilastri non negoziabili:

1. **Affidabilità - nessuna perdita dati**
   - Un ordine creato offline DEVE arrivare ad Archibald
   - Anche se il device si spegne, l'app viene chiusa, o la connessione è intermittente
   - Garanzia assoluta di persistenza - gli ordini non si perdono MAI

2. **Trasparenza - l'agente vede lo stato**
   - L'agente deve sempre sapere se è online/offline (banner prominent)
   - Quali ordini sono in coda, quali in invio, quali inviati (lista real-time)
   - Quando i dati sono stati aggiornati l'ultima volta
   - Visibilità completa dello stato di sincronizzazione

3. **Velocità - form ordine istantaneo**
   - Ricerca cliente/prodotto deve rispondere in < 100ms dalla cache locale
   - Niente spinner, niente attesa
   - L'esperienza offline deve essere veloce come un'app nativa
   - Il sync in background non deve rallentare l'uso dell'app

Se anche solo uno di questi tre pilastri manca, la fase è fallita.

</essential>

<boundaries>
## What's Out of Scope

Confini chiari per Phase 8:

- **Conflict resolution - quello è Phase 9**
  - Phase 8 assume che i dati cached siano sempre validi
  - Se un prezzo cambia mentre sei offline, Phase 9 gestirà il conflitto
  - Ora focus su cache + bozze persistenti + sync automatico

- **Storico ordini offline - quello è Phase 10**
  - Phase 8 permette di CREARE ordini offline
  - Vedere lo storico ordini (anche offline) sarà Phase 10
  - Ora focus su creazione, non lettura storico

- **Sync intelligente (delta) - per ora full sync**
  - Phase 8 scarica TUTTI i clienti/prodotti/prezzi ogni volta
  - Ottimizzazioni (solo delta, sync parziale, sync incrementale) verranno dopo
  - Ora focus su funzionalità base che funziona, poi ottimizziamo
  - Storage illimitato (50-100 MB) è accettabile su device moderni

</boundaries>

<specifics>
## Specific Ideas

**UI/UX Requirements:**

1. **Banner Offline** (banking app style)
   - Banner giallo prominent in alto quando offline: "Modalità Offline"
   - Impossibile non notare, rassicurante
   - Riferimento: come Intesa Sanpaolo o UniCredit quando sei offline
   - Non minimale - deve essere chiaro e visibile

2. **Progress Sync** (discreto ma informativo)
   - Piccola barra in basso durante sync: "Aggiornamento dati... 45%"
   - Non blocca l'uso dell'app
   - L'agente sa cosa sta succedendo senza essere interrotto

3. **Feedback Multi-Livello**
   - **Notifiche push**: "Ordine #12345 inviato ad Archibald" (anche app chiusa)
   - **Badge contatore**: icona ordini mostra "2" (ordini pending)
   - **Lista dettagliata**: sezione "Ordini in Coda" con stato real-time

4. **Warning Dati Stale**
   - Se i dati cached sono vecchi (es: 3 giorni), l'agente può comunque creare ordini
   - Ma prima di inviare vede un warning: "Prezzi aggiornati 3 giorni fa. Continuare?"
   - Conferma esplicita - scelta informata, non blocco totale

**Technical Preferences:**

- Storage illimitato: scarica TUTTI i dati (5.000 clienti, 4.500 prodotti)
- Full sync per ora (delta optimization è Phase 9+)
- First-run sync richiede connessione online (logico - senza dati non puoi lavorare)
- Cache automatica - niente configurazione, niente scelte per l'agente

**Performance Targets:**

- Ricerca cliente/prodotto: < 100ms (come app nativa)
- Sync in background non deve rallentare l'uso dell'app
- Initial sync: accettabile anche 2-3 minuti (succede solo una volta)

</specifics>

<notes>
## Additional Context

**Priorità design**: Banking app parity - Intesa Sanpaolo, UniCredit come riferimento per:
- Banner offline prominent (giallo, impossibile non vedere)
- Feedback sync chiaro ma non invasivo
- Garanzia affidabilità (ordini non si perdono mai)

**User expectations**: L'agente non vuole pensare a "offline mode" - deve solo funzionare. Il sistema gestisce automaticamente cache e sync in background.

**Technical constraints to research**:
- IndexedDB limits (quanto storage è disponibile in realtà?)
- Service worker caching strategies (cache-first vs network-first)
- Background sync API (come garantire invio anche app chiusa)
- Workbox best practices per Vite

**Integration with previous phases**:
- Phase 7 (Credential Management): Sync iniziale dopo PIN setup
- Phase 6 (Multi-User): Cache per-user? O condivisa?
- Phase 3 (Order Form): Form deve funzionare con dati cached

</notes>

---

*Phase: 08-offline-capability*
*Context gathered: 2026-01-14*
