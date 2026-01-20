# Phase 20: Prices Sync Analysis & Optimization - Context

**Gathered:** 2026-01-20
**Status:** Ready for planning

<vision>
## How This Should Work

Seguiamo esattamente il pattern consolidato delle Phase 18 (Customers) e Phase 19 (Products):

1. **Bot scarica PDF** dal menu Archibald "Prezzi" usando il sistema di forzatura italiano
2. **Parser Python estrae i prezzi** dal PDF con le ottimizzazioni RAM usate nelle fasi precedenti
3. **Salvataggio in DB separato** (`prices.db`) - NON nel database prodotti
4. **Matching con products.db** usando:
   - Importo Unitario (prezzo) dal PDF
   - Controllo Item Selection (tipologia confezionamento) per gestire varianti con prezzi diversi
   - IVA dall'Excel admin upload
5. **Excel IVA upload** nel menu admin per popolare il campo IVA mancante da Archibald

Il sync è **manuale** (no scheduler automatico), con bottone 🔄 sotto quello della scheda prodotti, indicando chiaramente "Sincronizzazione Prezzi".

Quando l'utente vede un prodotto nell'OrderForm o ArticoliList, deve vedere il prezzo corretto per la variante specifica (5 colli vs 1 collo) con l'IVA corretta dall'Excel.

</vision>

<essential>
## What Must Be Nailed

Due aspetti ugualmente critici:

1. **Prezzi corretti per variante** - Il matching deve essere perfetto al 100%. Ogni confezionamento (5 colli, 1 collo) deve avere il suo prezzo specifico se diverso. Nessun errore di abbinamento articolo-prezzo-variante.

2. **Excel IVA upload admin** - L'admin deve poter caricare facilmente il file `Listino_2026_vendita.xlsx` (formato standard Komet) per popolare le percentuali IVA che Archibald non fornisce. Il formato Excel è quello in root del progetto.

Se questi due punti non funzionano perfettamente, l'intera funzionalità prezzi è inutilizzabile per gli agenti.

</essential>

<boundaries>
## What's Out of Scope

Esplicitamente NON in questa fase:

- **Sync automatico schedulato** - Disabilitato, solo manuale. L'orchestratore schedulato sarà Phase 22
- **Gestione listini multipli** - Un solo listino prezzi globale, no listini personalizzati per cliente
- **Storico modifiche prezzi** - Per ora tracciamo solo storico nella `price_changes` table (già esistente da v1.0), non cronologia completa
- **Notifiche variazioni prezzo** - Nessun alert quando i prezzi cambiano dopo sync

</boundaries>

<specifics>
## Specific Ideas

### Database Structure
- **DB separato**: `prices.db` (NON mischiare con `products.db`)
- **Matching fields**:
  - `importo_unitario` (dal PDF Archibald) → `price` nel prodotto
  - `item_selection` (dal PDF Archibald) → identifica confezionamento variante
  - `iva` (dall'Excel Komet) → `vat` nel prodotto

### Excel IVA Format
- File di riferimento: `Listino_2026_vendita.xlsx` nella root del progetto
- Formato standard fornito da Komet
- Upload nel menu admin (da implementare)

### Best Practices da Phase 18/19
Riutilizzare TUTTE le best practices consolidate:
- **PDF download**: Metodo bot come Phase 18-02 e 19-02
- **Forzatura italiano**: Sistema locale come Phase 18-01 e 19-01
- **Ottimizzazioni RAM**: Durante parsing Python come Phase 19-01 (20MB buffer se necessario)
- **Delta hash**: MD5 hash per evitare re-sync inutili come Phase 18-02 e 19-02
- **Health check**: Endpoint `/health` verifica dipendenze parser
- **Child process spawn**: Per Python parser con timeout 30s
- **Error handling**: Structured logging e graceful degradation

### Edge Cases
- **Prodotto senza prezzo in PDF**: NON inserire prezzo, mostrare badge "non disponibile" (già esistente in ProductCard da Phase 19.1-02). Coverage dovrebbe essere 100%, ma se capita l'utente deve poter investigare.
- **Performance target**: Non critico ora - prima fallo funzionare, poi ottimizziamo nelle Phase 27-28.

### UI Integration
- **Sync button**: Sotto il bottone sync prodotti in ArticoliList
- **Label chiaro**: "🔄 Sincronizza Prezzi" (distinto da "🔄 Sincronizza Articoli")
- **Progress feedback**: Come Phase 18-03 e 19-03 (ManualSyncBanner pattern)

</specifics>

<notes>
## Additional Context

### Technical Context
- Excel IVA già presente nel codebase v1.0 (Phase 4.1-02 usa Excel per default pricing)
- Products.db ha già campi `price`, `vat`, `priceSource` popolati parzialmente
- ProductCard già mostra badge prezzi (Phase 19.1-02) - riutilizzare UI esistente
- Item Selection table nel PDF identifica confezionamento (es: K2=5 colli, K3=1 collo)

### Dependencies
- Phase 19.1 complete (UI prodotti con varianti)
- Phase 18 e 19 pattern consolidati (PDF sync workflow)

### Priority
- HIGH - Prezzi accurati sono fondamentali per ordini corretti
- Blocca creazione ordini se prezzi non sincronizzati? Da decidere in planning.

</notes>

---

*Phase: 20-prices-sync-analysis-optimization*
*Context gathered: 2026-01-20*
