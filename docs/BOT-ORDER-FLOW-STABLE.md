# Bot creazione ordini - specifica stabile (DevExpress/XAF Web)

## Obiettivo
Definire un flusso operativo e una strategia di automazione stabile per creare ordini in Archibald via UI DevExpress/XAF Web, seguendo la documentazione ufficiale DevExpress e il flusso descritto nel file `intero flusso bot genera ordini.txt`.

## Riferimenti DevExpress (da usare come base tecnica)
- I controlli DevExpress Web Forms espongono eventi client-side di callback (es. `BeginCallback`/`EndCallback`) per sapere quando le operazioni asincrone sul server sono completate. Questo e' essenziale per sincronizzare il bot con lo stato UI. citeturn0search0turn0search5
- Le dropdown nei controlli DevExpress hanno eventi client-side (es. `DropDown`) che indicano l'apertura della finestra dropdown; utili per sapere quando la UI e' pronta a ricevere input. citeturn0search1
- I controlli list-edit espongono API client per selezionare l'elemento attivo in modo deterministico (es. `SetSelectedItem`). citeturn1search2
- In XAF, l'azione "Save and Close" e' disponibile via `ModificationsController.SaveAndCloseAction` e in Web Forms la chiusura della Detail View puo' essere gestita con `QueryCloseAfterSave` e `CloseAfterSave` (di default `false`). citeturn1search1turn2search0turn2search7

## Flusso operativo (riassunto con passaggi chiave)
1. Login rapido su `https://4.231.124.90/Archibald/Login.aspx?...` usando fast login (incolla user/pass, click Accedi).
2. Naviga alla lista ordini: `https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/`.
3. Clic su **Nuovo** (menu verticale) e attendi il caricamento della pagina di dettaglio: `.../SALESTABLE_DetailViewAgent/?NewObject=true`.
4. **Profilo Cliente**: apri la dropdown del campo cliente, incolla il nome struttura cliente nella barra "Enter text to search", seleziona la riga corretta.
5. Attendi che compaia **New** nel riquadro righe ordine, cliccalo per aggiungere la prima riga.
6. Inserisci articolo nella cella **NOME ARTICOLO** (search + selezione riga).
7. Inserisci quantita'/note/sconto riga se presenti.
8. Salva la riga (pulsante Update/Save inline).
9. Se ordine multi-articolo: clic **AddNew** e ripeti il ciclo articolo.
10. Vai su **Prezzi e sconti**:
   - Imposta **Sconto linea** = N/A (obbligatorio).
   - Inserisci **Sconto totale** se presente.
11. **Salva e chiudi** (se necessario apri dropdown di "Salvare" e seleziona "Salva e chiudi").

## Strategia di stabilita' (sincronizzazione UI DevExpress)
Queste regole migliorano la stabilita' in presenza di callback asincroni, caricamenti parziali e dropdown dinamiche.

1. **Aspetta i callback DevExpress prima di procedere**
   - Molte azioni (filtri, selezioni, salvataggi inline) generano callback asincroni. Usa eventi `EndCallback` a livello controllo o global events per sapere quando la UI ha finito di aggiornarsi prima di cliccare o digitare. citeturn0search0turn0search5

2. **Sincronizza l'apertura delle dropdown**
   - Dopo il click sulla freccia dropdown, attendi il segnale di apertura (eventi di dropdown) e l'apparizione della search box prima di scrivere testo. citeturn0search1

3. **Selezioni deterministiche nei list-edit**
   - Dove possibile, preferisci selezioni tramite API di lista (es. `SetSelectedItem`) o selezione basata su testo univoco, invece di click su coordinate. citeturn1search2

4. **Salvataggio e chiusura**
   - Dopo il click su "Salva e chiudi", verifica che la vista di dettaglio venga effettivamente chiusa (comportamento controllabile in XAF). Se non si chiude, attendi la fine del callback e gestisci l'azione di chiusura. citeturn1search1turn2search0turn2search7

## Linee guida pratiche per il bot (robustezza)
- **Wait conditions**: usa condizioni basate su UI (elemento visibile + stabile) invece di sleep fissi. Usa timeout con retry incrementale.
- **Selector strategy**:
  - Preferisci selettori con ID suffix stabili (es. `_Edit_DDD_gv_DXSE_I`, `_DXCBtn0`, `_DXCBtn1`) e classi DevExpress (`dxm-item`, `dxeButtonEdit`, `dxgvCommandColumnItem`).
  - Evita ID completi con numeri dinamici (es. `Vertical_v3_12842904_...`).
- **Input**: usa incolla (paste) per campi di ricerca, poi invio/blur per triggerare il filtro.
- **Gestione errori**:
  - Se il cliente non appare, ripeti la ricerca e verifica se la dropdown ha completato il callback.
  - Se il salvataggio riga non aggiorna la tabella, riprova dopo EndCallback e controlla eventuali messaggi di errore.
- **Logging**: salva screenshot e HTML in caso di errore per riprodurre il problema.

## Retry/timeout consigliati (per stabilita')
Valori indicativi: mantieni sempre un backoff leggero e massimo numero di tentativi per evitare loop infiniti.

- **Login + redirect post-login**: timeout 20s, retry 1
- **Navigazione lista ordini**: timeout 15s, retry 2
- **Apertura dettaglio nuovo ordine**: timeout 20s, retry 2
- **Apertura dropdown cliente**: timeout 10s, retry 3
- **Filtro cliente (search)**: timeout 12s, retry 3
- **Selezione riga cliente**: timeout 10s, retry 2
- **Pulsante New righe**: timeout 12s, retry 3
- **Apertura editor riga articolo**: timeout 12s, retry 3
- **Filtro articolo (search)**: timeout 12s, retry 3
- **Salva riga articolo (Update)**: timeout 15s, retry 2
- **AddNew riga successiva**: timeout 12s, retry 3
- **Tab Prezzi e sconti**: timeout 10s, retry 2
- **Dropdown Sconto linea + selezione N/A**: timeout 10s, retry 2
- **Salva e chiudi**: timeout 20s, retry 2

Regola pratica: se un step fallisce, ripeti la singola azione dopo aver verificato che non ci sia un callback in corso e che l'elemento target sia visibile e non coperto.

## Selettori consigliati (con esempi reali dal flusso)
Usa preferibilmente selettori basati su ID parziali (suffix) o classi DevExpress stabili. Di seguito esempi concreti dai tuoi HTML.

- **Pulsante Nuovo (menu verticale)**:
  - `li[id$='_DXI0_'] a[title='Nuovo Ordini']`
  - fallback: `li.dxm-item.dropDownNew a[title='Nuovo Ordini']`
- **Dropdown Profilo Cliente (freccia)**:
  - `img[id$='dviCUSTTABLE_Edit_B-1Img']`
  - fallback: `td[id$='dviCUSTTABLE_Edit_B-1'] img.dxEditors_edtDropDown_XafTheme`
- **Search box clienti**:
  - `input[id$='dviCUSTTABLE_Edit_DDD_gv_DXSE_I']`
  - fallback: `#*[id$='dviCUSTTABLE_Edit_DDD_gv_DXSE'] input.dxeEditArea`
- **Riga cliente filtrata**:
  - preferenza: `table[id$='dviCUSTTABLE_Edit_DDD_gv'] tr.dxgvDataRow` + match testo
- **Pulsante New righe ordine**:
  - `a[id$='_DXCBtn0'] img[title='New']`
  - fallback: `a[data-args*='AddNew'][id*='SALESLINEs']`
- **Cella NOME ARTICOLO (N/A)**:
  - `input[id$='xaf_INVENTTABLE_Edit_I']`
- **Search box articoli (dropdown articolo)**:
  - `input[id$='xaf_INVENTTABLE_Edit_DDD_gv_DXSE_I']`
- **Salva riga (Update inline)**:
  - `img[title='Update'][id$='_DXCBtn0Img']`
  - fallback: `a[id$='_DXCBtn0'] img[title='Update']`
- **AddNew riga successiva**:
  - `a[id$='_DXCBtn1'] img[title='New']`
  - fallback: `a[data-args*='AddNew'][id*='SALESLINEs']`
- **Tab Prezzi e sconti**:
  - `li[id$='_pg_T2'] a span:contains('Prezzi e sconti')`
  - fallback: `li.dxtc-tab a#*pg_T2T`
- **Dropdown Sconto linea**:
  - `img[id$='dviLINEDISC_Edit_dropdown_DD_B-1Img']`
- **Item N/A in dropdown sconto linea**:
  - `td[id$='dviLINEDISC_Edit_dropdown_DD_DDD_L_LBI0T0']`
  - fallback: `td.dxeListBoxItem_XafTheme:contains('N/A')`
- **Sconto totale (input)**:
  - `input[id$='dviMANUALDISCOUNT_Edit_I']`
- **Salvare (menu principale)**:
  - `li[id$='_DXI1_'] a[title='Salvare']`
- **Dropdown Salvare**:
  - `div[id$='_DXI1_P'] span[id$='_DXI1_PImg']`
- **Salva e chiudi (voce menu)**:
  - `li[id$='_DXI1i1_'] a[title='Salva e chiudi']`

Nota: `:contains()` non e' supportato da CSS standard; usalo solo se la tua libreria di selettori lo consente. In alternativa, filtra le righe via testo nel codice.

## Checklist di esecuzione stabile (step-by-step)
- Login effettuato e URL lista ordini caricata.
- Click Nuovo -> conferma URL dettaglio ordine.
- Dropdown Profilo Cliente aperta, search box pronta.
- Cliente selezionato (riga evidenziata) e callback completato.
- Pulsante New righe visibile -> click.
- Riga articolo in modalita' edit -> inserimento articolo -> callback completato.
- Quantita'/sconto riga inseriti -> salva riga -> callback completato.
- (Se multi) AddNew -> nuova riga in edit.
- Tab Prezzi e sconti -> dropdown Sconto linea -> selezione N/A.
- Inserisci sconto totale se presente -> callback completato.
- Salva e chiudi -> vista chiusa / ritorno lista.

## Note operative specifiche (dal flusso fornito)
- Il fast login e la navigazione alla lista ordini sono gia' implementati nelle sync esistenti: riutilizzarli.
- La tabella di ricerca clienti filtra dinamicamente: se mostra piu' righe, selezionare quella con nome esatto.
- Se la regola di skip si attiva (nessuno sconto riga), si puo' salvare direttamente la riga.
- Il pulsante "Salva e chiudi" puo' essere nel menu a tendina di "Salvare".
