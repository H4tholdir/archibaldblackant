# Phase 10: Order History - Context

**Gathered:** 2026-01-15
**Status:** Ready for research

<vision>
## How This Should Work

Una timeline cronologica degli ordini stile banking app (Intesa/UniCredit), che combina:
- **Scansione rapida**: Lista cronologica con ordini recenti in alto, scroll per storico
- **Raggruppamento temporale**: Ordini raggruppati per periodo ('Oggi', 'Questa settimana', 'Questo mese', 'Più vecchi')
- **Espansione inline**: Card compatte per default (cliente + data + totale), tap per espandere e vedere dettaglio completo senza cambiare schermata

**Focus principale**: Stati dell'ordine e tracking degli aggiornamenti che Archibald rilascia durante il processing, con accesso ai documenti di riferimento (fatture, DDT).

L'agente deve poter:
1. Scorrere cronologicamente tutti i suoi ordini
2. Filtrare per cliente, data/periodo, stato ordine
3. Espandere un ordine per vedere dettaglio completo
4. Vedere la timeline degli stati/aggiornamenti Archibald
5. Accedere ai documenti (fatture/DDT) quando disponibili
6. Vedere il tracking spedizione quando Archibald lo aggiunge

</vision>

<essential>
## What Must Be Nailed

**Tutto il pacchetto è essenziale** - questa fase deve fornire visibilità completa sullo storico:

1. **Stati ordine e tracking aggiornamenti**
   - Vedere chiaramente stato attuale (in lavorazione/evaso/spedito)
   - Timeline completa degli aggiornamenti con timestamp
   - Tracking spedizione quando disponibile (badge 'Tracking disponibile' con corriere + numero)

2. **Dettaglio completo ordine**
   - Lista articoli con quantità e prezzi (come nella conferma originale)
   - Timeline stati/aggiornamenti Archibald
   - Info cliente e note ordine
   - Tracking spedizione quando diventa disponibile

3. **Documenti di riferimento**
   - Pulsante 'Vedi documenti' nella card ordine
   - Accesso a fatture e DDT generati da Archibald
   - Click apre Archibald o scarica PDF se disponibile

4. **Ricerca e filtri**
   - Ricerca per cliente (digitare nome e vedere tutti i suoi ordini)
   - Filtro per data/periodo (questa settimana/mese, custom range)
   - Filtro per stato ordine (pending/evasi/spediti)
   - Tutti e tre i filtri sono ugualmente essenziali

</essential>

<boundaries>
## What's Out of Scope

**Phase 10 è solo lettura e consultazione** - nessuna modifica o azione sugli ordini:

- **Modifica ordini esistenti** - È Phase 11 (Order Management). Questa fase serve solo a visualizzare, non a modificare ordini pendenti.

- **Duplicazione ordini** ('Ripeti ordine') - Creare nuovo ordine da storico è Phase 11. Phase 10 è consultazione pura.

- **Analytics e statistiche** - Grafici, trend, KPI, top prodotti/clienti sono fuori scope. Focus su consultazione cronologica individuale, non analisi aggregata.

- **Export massivo** (CSV/Excel) - Download bulk o export in altri formati è feature avanzata, non necessaria per MVP storico ordini.

</boundaries>

<specifics>
## Specific Ideas

**UX Reference: Banking app (Intesa/UniCredit)**
- Stesso pattern UX già usato in Phase 8 (offline indicator)
- Gli agenti conoscono già questo pattern dalle loro app bancarie
- Card espandibili, stati chiari, timeline verticale

**Card Ordine Compatta (collapsed):**
- Cliente
- Data creazione
- Totale ordine
- Stato attuale (badge colorato)
- Badge 'Tracking disponibile' (se presente)
- Pulsante 'Vedi documenti' (sempre visibile)

**Card Ordine Espansa:**
- Tutte le info compatte sopra
- **Lista articoli**: articolo, quantità, prezzo unitario, subtotale
- **Timeline stati**: tutti gli aggiornamenti Archibald con timestamp (creato → preso in carico → evaso → spedito)
- **Info cliente**: nome completo, eventuali note inserite dall'agente
- **Tracking spedizione**: corriere + numero tracking (quando diventa disponibile in Archibald)
- **Sezione documenti**: lista fatture/DDT cliccabili

**Filtri e Ricerca:**
- Barra ricerca in alto (search per cliente)
- Chip/filtri per periodo (Oggi, Settimana, Mese, Custom range)
- Chip/filtri per stato (Tutti, In lavorazione, Evasi, Spediti)
- Combinabili tra loro

**Tracking UX:**
- Badge 'Tracking disponibile' appare nella card quando Archibald aggiunge tracking
- Click badge per vedere corriere + numero tracking
- Eventuale link a sito corriere per tracking live (se supportato)

</specifics>

<notes>
## Additional Context

**Priorità utente:**
- L'agente deve poter verificare facilmente lo stato di un ordine
- Accesso rapido ai documenti (fatture) è importante per customer service
- Tracking spedizione è fondamentale per rispondere a richieste cliente
- L'espansione inline evita troppe navigazioni (più veloce su mobile)

**Pattern esistenti da riutilizzare:**
- Banking app UX già usato in Phase 8 (yellow banner offline)
- Card espandibili come pattern mobile-friendly
- Timeline verticale per stati (come tracking corrieri BRT/DHL)

**Dipendenze tecniche da esplorare:**
- Come Archibald espone lo storico ordini (UI, API, pagination)
- Dove sono memorizzati i documenti (fatture/DDT)
- Come Archibald traccia gli stati e aggiornamenti ordine
- Formato e disponibilità del tracking spedizione

</notes>

---

*Phase: 10-order-history*
*Context gathered: 2026-01-15*
