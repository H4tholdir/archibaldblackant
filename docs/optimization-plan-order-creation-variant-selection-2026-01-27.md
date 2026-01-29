# Piano di ottimizzazione: creazione ordini (focus varianti) — 2026-01-27

## Output atteso
Un flusso di creazione ordine più deterministico, con selezione varianti stabile anche quando la UI DevExpress/XAF aggiorna via callback e cambia markup/ID dinamici.

## Vincoli osservati (dal flusso reale)
Elementi chiave del flusso che impattano l'automazione:
- Dopo “Nuovo”, la DetailView si apre con `?NewObject=true` e richiede attese: `intero flusso bot genera ordini.txt:10`.
- I lookup cliente e articolo usano pattern DevExpress standard:
  - dropdown button: `_B-1` / `_B-1Img`;
  - popup: `_DDD`;
  - search panel: `_DDD_gv_DXSE_I`.
  Riferimenti: `intero flusso bot genera ordini.txt:10`, `intero flusso bot genera ordini.txt:11`, `intero flusso bot genera ordini.txt:61`.
- La variante è visibile come suffisso (es. `K3`) in celle `td.dxgv.dx-al`: `intero flusso bot genera ordini.txt:2559`.
- La confezione/minimo è spesso un numero in `td.dxgv.dx-ar`: `intero flusso bot genera ordini.txt:2560`.
- Esiste una “regola dello skip” sulla quantità auto-popolata: `intero flusso bot genera ordini.txt:2562`.
- I comandi inline grid sono spesso riconoscibili via `data-args` AddNew/UpdateEdit: `intero flusso bot genera ordini.txt:56`, `intero flusso bot genera ordini.txt:2570`.

## Stato attuale del bot (punti forti e fragilità)

### Punti forti già presenti
- Derivazione `baseId` da input `_I`.
- Ricerca della search box del lookup con fallback robusti.
- Ranking per variante che combina suffix + package + multiple.

Riferimenti:
- derivazione baseId e search lookup: `archibald-web-app/backend/src/archibald-bot.ts:2798`, `archibald-web-app/backend/src/archibald-bot.ts:2961`.
- ranking e selezione variante: `archibald-web-app/backend/src/archibald-bot.ts:3740`.

### Fragilità principali
- Alcune attese sono ancora a tempo fisso (es. sleep dopo apertura dropdown).
- Non sempre la selezione è “confermata” via stato client-side, solo via click.
- La logica è molto lunga dentro un unico step e difficile da osservare/strumentare.

## Strategia di ottimizzazione (atomica, applicabile subito)

### Fase 1 — Sincronizzazione “callback-aware”
Obiettivo: ridurre i fallimenti dovuti a callback DevExpress non ancora conclusi.

Azioni:
1) Introdurre un helper riusabile: `waitForDevExpressIdle(...)`.
2) Dentro l'helper, quando possibile:
   - cercare la griglia lookup via client API;
   - attendere fine callback con segnali client-side;
   - in fallback, usare condizioni DOM (righe visibili + stato stabile).
3) Richiamare l'helper dopo:
   - apertura dropdown;
   - ricerca nel lookup;
   - paginazione next.

Dove applicare prima:
- Step selezione articolo/varianti: `archibald-web-app/backend/src/archibald-bot.ts:3118`.

## Fase 2 — Identificazione deterministica del lookup attivo
Obiettivo: evitare di leggere righe da una griglia non attiva o invisibile.

Azioni:
1) Estrarre la logica “trova container attivo visibile” in una funzione isolata.
2) Priorità di root:
   - container `_DDD` visibile con data rows;
   - popup DevExpress visibile con data rows;
   - fallback document.
3) Salvare sempre un mini snapshot diagnostico:
   - id container;
   - header texts;
   - prime N righe.

Dove applicare prima:
- Snapshot e selezione varianti: `archibald-web-app/backend/src/archibald-bot.ts:3133`, `archibald-web-app/backend/src/archibald-bot.ts:3742`.

## Fase 3 — Selezione varianti a “doppia conferma”
Obiettivo: trasformare il click in una selezione verificabile.

Azioni:
1) Dopo la selezione, eseguire una conferma esplicita:
   - leggere l'input dell'editor (valore/testo);
   - se disponibile, leggere lo stato della griglia (selected keys, focused key, state input).
2) Se la conferma non passa:
   - ripetere la selezione con strategia diversa (es. click su cella diversa);
   - se serve, rifare ricerca + attesa idle.
3) Rendere la conferma una funzione con output strutturato:
   - `confirmed: boolean`;
   - `inputValue`, `selectedKeys`, `focusedKey`;
   - `reason` in caso di failure.

Dove applicare prima:
- Subito dopo il blocco di selezione variante: `archibald-web-app/backend/src/archibald-bot.ts:3740`.

## Fase 4 — Variant ranking più aderente al flusso reale
Obiettivo: allineare il ranking alle evidenze del file TXT.

Dal flusso reale sappiamo che:
- Il suffisso variante (K2/K3) è una cella testuale “secca”.
- Il confezionamento/minimo è spesso in una cella numerica vicina.

Azioni mirate:
1) Rafforzare la ricerca del suffisso:
   - match su cella esatta (es. `K3`), non solo su row text.
2) Rafforzare il match del confezionamento:
   - quando trovi la cella del suffisso, prova prima la cella precedente come numero.
3) Aggiungere una regola di tie-break esplicita:
   - suffix+package+multiple
   - suffix+package
   - suffix+multiple
   - package
   - suffix
4) Quando il ranking sceglie “package-only”, loggare un warning esplicito.

Dove applicare prima:
- Dentro il ranking varianti: `archibald-web-app/backend/src/archibald-bot.ts:3847`, `archibald-web-app/backend/src/archibald-bot.ts:4009`.

## Fase 5 — Applicare la regola dello skip in modo misurabile
Obiettivo: evitare edit non necessari, ma con controllo.

Azioni:
1) Dopo la selezione variante, attendere la popolazione quantità.
2) Leggere la quantità auto-popolata.
3) Confrontare con:
   - quantità richiesta;
   - package minimo/multiple atteso.
4) Se scatta skip:
   - loggare chiaramente il motivo;
   - andare a salvataggio riga.

Riferimento flusso reale:
- regola skip: `intero flusso bot genera ordini.txt:2562`.

## Fase 6 — Stabilizzare i comandi di griglia (AddNew / Update)
Obiettivo: evitare di dipendere da un singolo ID dinamico.

Azioni:
1) Cercare i comandi inline prioritariamente per `data-args`:
   - `[['AddNew'],1]`
   - `[['UpdateEdit'],1]`
2) Usare l'ID solo come fallback.
3) Dopo il click, attendere segnali chiari:
   - comparsa di riga editnew/edit0;
   - oppure scomparsa della riga in edit.

Riferimenti flusso reale:
- add new: `intero flusso bot genera ordini.txt:56`
- update edit: `intero flusso bot genera ordini.txt:2570`

## Refactor consigliato (minimo ma ad alto impatto)
Estrarre 4 helper in un modulo dedicato, per riuso e testabilità:
1) `resolveDevExpressLookup(baseHints)`
2) `openLookupAndSearch({ baseId, query })`
3) `selectVariantInActiveLookup({ variantId, suffix, packageContent, multipleQty })`
4) `confirmLookupSelection({ baseId, expected })`

Target iniziale:
- incapsulare solo la parte inventtable/varianti.
- poi riusare anche per cliente e altri lookup.

## Micro-piano operativo (ordine esatto)
1) Aggiungere helper `waitForDevExpressIdle`.
2) Inserire idle-wait dopo apertura dropdown e dopo ricerca.
3) Estrarre “active lookup root” in funzione dedicata.
4) Aggiungere `confirmLookupSelection` e usarla dopo la selezione.
5) Spostare ranking varianti in funzione pura (input → decisione + reason).
6) Applicare la regola skip usando lettura reale della quantità auto-popolata.
7) Stabilizzare AddNew/Update via `data-args`.

## Come misurare se abbiamo migliorato
Indicatori pratici da loggare e confrontare:
- tempo medio per articolo;
- numero retry su variante;
- percentuale conferme al primo tentativo;
- mismatch tra variante attesa e valore finale input;
- mismatch su quantità skip vs quantità attesa.

## Punti del codice da toccare per primi
- Selezione varianti e paginazione lookup: `archibald-web-app/backend/src/archibald-bot.ts:3118`.
- Ranking e click su riga variante: `archibald-web-app/backend/src/archibald-bot.ts:3740`.
- Riutilizzare pattern già usati per baseId/search: `archibald-web-app/backend/src/archibald-bot.ts:2798`, `archibald-web-app/backend/src/archibald-bot.ts:2961`.

