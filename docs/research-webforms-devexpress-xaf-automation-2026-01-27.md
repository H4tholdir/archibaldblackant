# Research: Automazione ASP.NET WebForms + DevExpress/XAF (2026-01-27)

## Obiettivo
Costruire linee guida operative per rendere il bot Archibald più stabile e deterministico su UI WebForms + DevExpress/XAF, con focus sulla selezione varianti articolo.

## Segnali tecnici dal sito Archibald
Archibald mostra pattern tipici WebForms + DevExpress/XAF:
- Hidden fields e postback/callback state: `__VIEWSTATE`, `__EVENTVALIDATION`.
- Risorse DevExpress e WebForms: `DXR.axd`, `WebResource.axd`.
- Classi DevExpress: `dxgv*`, `dxe*`, `dxpc*`, `dxm*`, tema `XafTheme`.
- UI altamente dinamica: dropdown con griglie, search panel, popup, callback asincroni.

Implicazione chiave: la UI spesso non fa full reload. Aggiorna porzioni di DOM via callback/postback parziali. Il bot deve quindi:
- Rileggere il DOM dopo ogni azione significativa.
- Aspettare callback/aggiornamenti in modo event-driven (non solo con sleep).

## Cosa dicono le doc ufficiali DevExpress (impatti diretti sul bot)

### 1) Esiste una control collection client-side (usiamola quando possibile)
DevExpress espone una collezione globale di controlli client:
- `ASPxClientControl.GetControlCollection()`.
- La collection consente accesso per nome/istanza e filtraggio per tipo/predicato.

Impatto pratico:
- Quando siamo dentro un dropdown DevExpress (GridLookup/ButtonEdit), provare prima via client API.
- Se troviamo il controllo giusto, possiamo usare metodi come `SetValue`, `ShowDropDown`, accesso alla griglia embedded, e inspection dello stato.

### 2) Il client-side API può essere disponibile anche senza ClientInstanceName esplicito
La doc di `ASPxGridLookup` indica che la client API è abilitata se:
- `EnableClientSideAPI = true`, oppure
- `ClientInstanceName` è definito, oppure
- c'è almeno un client event gestito.

Impatto pratico:
- Vale la pena tentare sempre l'approccio via `GetControlCollection()` prima del puro scraping DOM.
- La pagina XAF spesso ha già eventi client agganciati, quindi la client API può esistere anche senza instance name noto.

### 3) `SetValue` ha limiti in callback mode / on-demand loading
La doc di `ASPxClientEditBase.SetValue` segnala che, per controlli tipo ComboBox/ListBox con callback mode, non puoi selezionare elementi non attualmente caricati/visibili nella finestra editor.

Impatto pratico:
- La selezione “a freddo” via `SetValue(variantId)` può fallire se la riga non è nel client cache.
- Prima bisogna filtrare/caricare la griglia lookup (es. tramite search panel), poi selezionare.

### 4) Le griglie DevExpress lavorano molto via callback
La doc di `ASPxClientGridView.PerformCallback` e `ASPxGridView.CustomCallback` chiarisce che molte operazioni client → server sono callback asincroni.

Impatto pratico:
- Dopo azioni come ricerca, paginazione, selezione, edit, serve attendere la fine del callback.
- Dove possibile, il bot deve sincronizzarsi su segnali di callback completato.

## Cosa dicono le doc ufficiali WebForms/AJAX (impatti diretti sul bot)

### 5) Le pagine possono aggiornare solo parti del DOM (partial-page rendering)
La documentazione Microsoft su UpdatePanel e partial-page rendering chiarisce che in WebForms/AJAX:
- un'azione può aggiornare solo una porzione della pagina;
- il DOM viene rimpiazzato “a blocchi” senza una navigazione completa.

Impatto pratico:
- Ogni handle/elemento può diventare stale dopo una callback.
- Dopo ogni callback, riacquisire selettori/elementi chiave.
- Evitare dipendenze troppo rigide su un singolo handle DOM conservato nel tempo.

## Pattern che emergono dal nostro flusso reale (file TXT)
Il file `intero flusso bot genera ordini.txt` rende espliciti pattern DevExpress molto utili per automatizzare.

### Pattern ID / struttura ricorrenti (molto riusabili)
- Base editor: spesso finisce con `_Edit` o `_Edit_I`.
- Dropdown/popup:
  - pulsante dropdown: `_B-1` o `_B-1Img`.
  - popup container: `_DDD`.
  - grid nel dropdown: `_DDD_gv`.
  - search input nel dropdown: `_DDD_gv_DXSE_I`.

Questi pattern sono confermati in più punti del flusso, ad esempio:
- dropdown cliente e search panel: `intero flusso bot genera ordini.txt:10`, `intero flusso bot genera ordini.txt:11`.
- dropdown articolo (INVENTTABLE) e search panel: `intero flusso bot genera ordini.txt:56`, `intero flusso bot genera ordini.txt:61`.

### Segnali funzionali molto importanti
- Il click su “Nuovo” porta a DetailView con `?NewObject=true`: `intero flusso bot genera ordini.txt:10`.
- La riga variante si riconosce da celle con:
  - variante: `td.dxgv.dx-al` con valori tipo `K2`, `K3`;
  - confezionamento: `td.dxgv.dx-ar` con numeri tipo `1`, `5`.
  Riferimento: `intero flusso bot genera ordini.txt:2559`, `intero flusso bot genera ordini.txt:2560`.
- Regola dello skip: dopo selezione variante, la quantità ordinata può popolarsi automaticamente; se coincide con la minima, si può saltare l'edit manuale: `intero flusso bot genera ordini.txt:2562`.
- I comandi grid inline sono riconoscibili via `data-args`:
  - add new: `data-args="[['AddNew'],1]"`;
  - update/save: `data-args="[['UpdateEdit'],1]"`.
  Riferimenti: `intero flusso bot genera ordini.txt:56`, `intero flusso bot genera ordini.txt:2570`.

## Implicazioni dirette per la parte “selezione varianti”

### Cose che aiutano molto (in ordine di valore)
1) Agganciare il lookup corretto via client control collection.
2) Filtrare/caricare prima, selezionare dopo.
3) Riconoscere la griglia attiva (dropdown visibile) prima di leggere righe/celle.
4) Detezione colonne via header text (quando disponibile) + fallback su pattern di valori.
5) Confermare la selezione leggendo stato e input finale, non solo “ho cliccato”.

### Cose da evitare
- Selezionare subito via `SetValue` senza essere certi che la riga sia caricata.
- Usare sleep lunghi come unica sincronizzazione.
- Conservare handle DOM attraverso callback multiple.

## Check-list “atomica” per automazione DevExpress/XAF

### Sincronizzazione
- Dopo ogni azione che può scatenare callback:
  - attendi fine callback (se puoi agganciarti alla client API);
  - altrimenti: attendi segnali di DOM aggiornato e poi riacquisisci i selettori.

### Lookup / dropdown grid
- Deriva sempre un `baseId` a partire dall'input `_I` (rimuovi `_I`).
- Prova prima a ottenere il controllo via client collection (match su input id/baseId).
- Apri il dropdown con priorità:
  - `#${baseId}_B-1Img`, `#${baseId}_B-1`, `#${baseId}_B`, `#${baseId}_DDD`.
- Identifica il dropdown “attivo” filtrando solo container visibili.
- Cerca la search box preferendo `#${baseId}_DDD_gv_DXSE_I`.

### Selezione riga
- Leggi le righe solo nel container attivo.
- Normalizza sempre i testi (`trim`, lower-case, gestione virgola/punto).
- Usa una strategia di ranking chiara (es. id pieno > suffix+pack+multiple > ...).
- Clicca la cella più “stabile” (di solito la colonna pack/contenuto o la prima non vuota).

### Conferma
- Dopo selezione:
  - rileggi l'input dell'editor;
  - se disponibile, leggi stato/chiavi selezionate della griglia.
- Se la conferma non passa, riprova con una strategia diversa (non solo re-click).

## Fonti ufficiali consultate (primarie)
Di seguito le fonti principali usate per guidare la strategia. Le URL sono riportate in un blocco di codice per praticità.

```text
DevExpress:
- https://docs.devexpress.com/AspNet/js-ASPxClientControl.GetControlCollection.static
- https://docs.devexpress.com/AspNet/js-ASPxClientControlCollection
- https://docs.devexpress.com/AspNet/js-ASPxClientPopupControl.GetPopupControlCollection.static
- https://docs.devexpress.com/AspNet/js-ASPxClientPopupControlCollection._methods
- https://docs.devexpress.com/AspNet/js-ASPxClientEditBase.SetValue%28value%29
- https://docs.devexpress.com/AspNet/js-ASPxClientGridView.PerformCallback%28args%29
- https://docs.devexpress.com/AspNet/js-ASPxClientGridView.EndCallback
- https://docs.devexpress.com/AspNet/DevExpress.Web.ASPxGridView.CustomCallback
- https://docs.devexpress.com/AspNet/DevExpress.Web.ASPxGridLookup

Microsoft Learn (WebForms/AJAX):
- https://learn.microsoft.com/en-us/previous-versions/aspnet/bb386573%28v%3Dvs.100%29
- https://learn.microsoft.com/en-us/previous-versions/aspnet/bb386454%28v%3Dvs.100%29
- https://learn.microsoft.com/en-us/previous-versions/aspnet/bb386571%28v%3Dvs.100%29
```

## Collegamenti rapidi nel nostro codice (per applicare subito)
- Selezione variante e dropdown analysis: `archibald-web-app/backend/src/archibald-bot.ts:3118`.
- Ranking e match su suffix/package/multiple: `archibald-web-app/backend/src/archibald-bot.ts:3740`.
- Tentativo via client API / control collection: `archibald-web-app/backend/src/archibald-bot.ts:3259`.

