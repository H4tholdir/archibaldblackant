# Archibald Bot - Order Creation Flow Reference (non-legacy)

## Scopo e vincoli
- Usare il bot Archibald standard (non legacy).
- Rimuovere ogni utilizzo della variante `ex_` dal flusso di creazione ordini.
- Questo documento deriva da `intero flusso bot genera ordini.txt` ed e` il riferimento per l'aggiornamento del flusso.

## Input minimi richiesti dal flusso
- Credenziali Archibald (username + password) per il fast login.
- Nome cliente (ragione sociale) usato nella ricerca del profilo cliente:
  - Esempi: "Fresis Soc Cooperativa", "Carrazza Giovanni", "Smile Srl", "Lab. Dental Tekna Snc".
- Lista articoli dell'ordine:
  - Nome Articolo (valore usato nella PWA e inserito nel campo "Nome articolo"):
    - Esempi: "H129FSQ.104.023", "TD1272.314", "H77.104.060".
  - Variante richiesta (quando esistono varianti).
  - Quantita ordinata.
  - Sconto di riga (opzionale).
- Sconto globale ordine (opzionale).

## URL principali
- Login: `https://4.231.124.90/Archibald/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`
- Lista ordini (agente): `https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/`
- Nuovo ordine (dopo click "Nuovo"): `https://4.231.124.90/Archibald/SALESTABLE_DetailViewAgent/?NewObject=true`

## Note operative chiave
- Il sito e` visto come non sicuro senza HTTPS
- Il fast login deve incollare velocemente username e password, poi click su "Accedi".
- Le azioni di input articolo devono essere veloci (no slowmo/timeouts).
- Molti id includono prefissi dinamici `Vertical_v3_<numero>...`: preferire selettori per suffisso/attributo/label.

## Selettori e riferimenti principali (con fallback)
### Pulsanti top menu
- Nuovo ordine:
  - Primario: `li[title="Nuovo Ordini"] a#Vertical_mainMenu_Menu_DXI0_T`
  - Fallback: `li[title="Nuovo Ordini"] a.dxm-content`
- Salva/Salva e chiudi:
  - Primario: `li[title="Salvare"] a#Vertical_mainMenu_Menu_DXI1_T`
  - Dropdown: `#Vertical_mainMenu_Menu_DXI1_P` (apre menu con "Salva e chiudi")
  - Voce menu: `#Vertical_mainMenu_Menu_DXI1i1_T` (testo "Salva e chiudi")

### Profilo cliente
- Freccia dropdown profilo cliente:
  - Primario: `td[id$="_dviCUSTTABLE_Edit_B-1"] img[alt="v"]`
- Input ricerca clienti:
  - Primario: `input[id$="_dviCUSTTABLE_Edit_DDD_gv_DXSE_I"]` (placeholder "Enter text to search...")
- Selezione cliente:
  - Click sulla riga che matcha esattamente il nome cliente inserito.

### Righe ordine (articoli)
- Pulsante "New" per prima riga (sopra "no data display"):
  - Primario: `a[id$="_dviSALESLINEs_*_DXCBtn0"] img[title="New"]`
- Cella "Nome articolo" (input N/A):
  - Primario: `input[id$="_INVENTTABLE_Edit_I"][value="N/A"]`
- Dropdown articoli (grid lookup):
  - Container: `div[id$="_INVENTTABLE_Edit_DDD_PW-1"]`
  - Search input: `input[id$="_INVENTTABLE_Edit_DDD_gv_DXSE_I"]`
- Varianti articolo (esempi):
  - `td.dxgv.dx-al` con valori come `K2`, `K3`.
- Quantita confezionamento (esempi):
  - `td.dxgv.dx-ar` con valori numerici (es. `1`, `5`).
- Quantita ordinata (campo editabile):
  - Primario: `table[id$="_QTYORDERED_Edit"] input[id$="_QTYORDERED_Edit_I"]`
- Sconto riga (campo editabile):
  - Primario: `table[id$="_MANUALDISCOUNT_Edit"] input[id$="_MANUALDISCOUNT_Edit_I"]` (valore default `0,00 %`)
- Salva riga (floppy/update):
  - Primario: `a[id$="_dviSALESLINEs_*_DXCBtn0"] img[title="Update"]`
- Nuova riga (multi articolo):
  - Primario: `a[id$="_dviSALESLINEs_*_DXCBtn1"] img[title="New"]`

### Sconti ordine (tab Prezzi e sconti)
- Tab "Prezzi e sconti":
  - Primario: `li#Vertical_v3_*_MainLayoutEdit_xaf_l37_pg_T2 a` (testo "Prezzi e sconti")
- Dropdown "Sconto linea" (obbligatorio):
  - Primario: `td[id$="_dviLINEDISC_Edit_dropdown_DD_B-1"] img[alt="v"]`
  - Voce "N/A": `td[id$="_dviLINEDISC_Edit_dropdown_DD_DDD_L_LBI0T0"]`
- Sconto globale (opzionale):
  - Primario: `table[id$="_dviMANUALDISCOUNT_Edit"] input[id$="_dviMANUALDISCOUNT_Edit_I"]` (valore default `0,00 %`)

## Flusso atomico dettagliato

### 0) Preparazione
1) Recupera i dati dell'ordine dagli "ordini in attesa" (inviati ad Archibald tramite pulsante).
2) Valida i campi minimi: struttura cliente, lista articoli, quantita, sconti (riga/globale).

### 1) Login (fast login)
1) Apri l'URL di login.
2) Attendi che la pagina di login sia renderizzata.
3) Inserisci username e password con incolla veloce (no slowmo).
4) Clicca "Accedi".
5) Attendi il redirect su Archibald (menu principale visibile).

### 2) Navigazione alla lista ordini
1) Naviga direttamente a `.../SALESTABLE_ListView_Agent/`.
2) Attendi caricamento pagina lista ordini (menu verticale visibile).

### 3) Avvio nuovo ordine
1) Clicca il pulsante "Nuovo" nella barra menu (titolo "Nuovo").
2) Attendi il redirect a `.../SALESTABLE_DetailViewAgent/?NewObject=true`.
3) Verifica che la pagina nuovo ordine sia caricata (campi editabili visibili).

### 4) Selezione profilo cliente
1) Clicca la freccia del dropdown "Profilo cliente" (icona v).
2) Attendi l'apertura del dropdown con search box "Enter text to search...".
3) Clicca nella search box e incolla il nome cliente (ragione sociale, es. "Fresis Soc Cooperativa").
4) Attendi il filtraggio della tabella clienti.
5) Se compare 1 risultato, seleziona la riga.
6) Se compaiono piu` risultati, seleziona quello con nome esatto uguale al valore cercato.
7) Attendi che la pagina carichi la sezione righe ordine (comparsa pulsante "New" sopra "no data display").

### 5) Inserimento prima riga articolo
1) Clicca il pulsante "New" nella tabella righe (icona New).
2) Attendi che la tabella righe mostri la nuova riga editabile.
3) Clicca una sola volta nella cella "Nome articolo" che mostra `N/A`.
4) Digita il Nome Articolo velocemente (senza rallentamenti).
5) Attendi l'apertura del dropdown articoli (grid lookup).
6) La tabella articoli deve filtrare automaticamente il Nome Articolo inserito.
7) Esegui il pairing tra articolo richiesto e riga risultante:
   - Se esistono varianti, seleziona la variante corretta.
   - Usa lo stesso algoritmo della PWA per determinare la variante corretta.
8) Clicca la riga della variante scelta.

### 6) Quantita ordinata + regola skip
1) Dopo la selezione variante, attendi che il sistema popoli automaticamente la quantita ordinata.
2) Applica la regola di skip:
   - Se la quantita auto-popolata == quantita richiesta nell'ordine, NON modificare il campo.
   - Se la quantita richiesta dall'ordine e` diversa, entra in edit (doppio click) sul campo quantita.
3) Inserisci la quantita richiesta nel campo `QTYORDERED`.

### 7) Sconto riga (opzionale) + salvataggio riga
1) Verifica se l'ordine richiede uno sconto di riga per l'articolo.
2) Se NON richiesto:
   - Clicca l'icona "Update" (floppy) per salvare la riga.
3) Se richiesto:
   - Doppio click sulla cella `0,00 %` in colonna "Applica sconto %".
   - Inserisci il valore dello sconto riga.
   - Clicca l'icona "Update" (floppy) per salvare la riga.
4) Se la regola di skip e` attiva e non c'e` sconto riga, e` consentito salvare direttamente senza edit quantita.

### 8) Multi articolo (loop)
1) Se restano articoli da inserire:
   - Clicca l'icona "New" per aggiungere una nuova riga.
   - Ripeti i passi 5, 6 e 7 per ciascun articolo.
2) Se NON restano articoli, prosegui con gli sconti ordine.

### 9) Prezzi e sconti ordine
1) Apri la tab "Prezzi e sconti".
2) Operazione obbligatoria: imposta "Sconto linea" = `N/A`.
   - Apri il dropdown della cella "Sconto linea".
   - Seleziona la voce `N/A`.
3) Operazione opzionale: sconto globale ordine.
   - Doppio click sulla cella `0,00 %` in "Applica sconto %".
   - Inserisci il valore sconto globale se presente nell'ordine.

### 10) Salvataggio ordine (Salva e chiudi)
1) Individua il menu "Salvare".
2) Se la voce "Salva e chiudi" e` direttamente visibile, cliccala.
3) Altrimenti:
   - Clicca il dropdown (freccia) accanto a "Salvare".
   - Seleziona "Salva e chiudi" dal menu.
4) Attendi la chiusura della scheda ordine e il ritorno alla lista ordini.

## Punti di attenzione per l'automazione
- Evitare hardcode su id completi con `Vertical_v3_*`: usare selettori per suffisso o per attributo `title`/`alt`.
- Le icone "New" e "Update" condividono pattern simili: discriminare tramite `img[title="New"]` vs `img[title="Update"]`.
- La selezione variante deve rispettare l'algoritmo PWA (stessa logica usata lato web app).
- Il campo quantita puo` essere auto-compilato: usare la regola di skip per ridurre modifiche inutili.
