# DevExpress Automation Research - Archibald Bot

## 0. Discovery Live - Risultati Concreti (7 Feb 2026)

### Controlli Trovati: 222 totali sul form ordine

### SALES LINES GRID (il controllo piu importante)
- **Nome**: `...dviSALESLINEs_v10_30726963_LE_v10`
- **Pattern di ricerca**: `c.name.includes('dviSALESLINEs') && typeof c.AddNewRow === 'function'`
- **Metodi disponibili** (TUTTI!): AddNewRow, UpdateEdit, CancelEdit, DeleteRow, GotoPage, NextPage, PrevPage, GetPageIndex, GetPageCount, GetVisibleRowsOnPage, InCallback, IsEditing, IsNewRowEditing, SetEditValue, GetEditValue, GetEditor, FocusEditor, SetFocusedRowIndex, GetFocusedRowIndex, Refresh, PerformCallback, StartEditRow, GetRowValues
- **Stato iniziale**: pageCount=0, visibleRows=0 (vuota su nuovo ordine)

### EDITOR COLONNE NELLE SALES LINES
| Colonna | Pattern Nome | Tipo | Metodi Extra |
|---------|-------------|------|-------------|
| **col0** (INVENTTABLE - articolo) | `...SALESLINEs...DXFREditorcol0` | Lookup/ComboBox | FindItemByValue, EnsureDropDownLoaded, PerformCallback |
| **col1** (secondo lookup) | `...SALESLINEs...DXFREditorcol1` | Lookup/ComboBox | FindItemByValue, EnsureDropDownLoaded, PerformCallback |
| **col2** (campo base) | `...SALESLINEs...DXFREditorcol2` | ComboBox base | SetValue, GetValue, SetText |
| **col3** (campo base) | `...SALESLINEs...DXFREditorcol3` | ComboBox base | SetValue, GetValue, SetText |
| **col8** (lookup extra) | `...SALESLINEs...DXFREditorcol8` | Lookup/ComboBox | FindItemByValue, EnsureDropDownLoaded, PerformCallback |

### CUSTOMER COMBOBOX
- **Nome**: `...dviCUSTTABLE_Edit`
- **Pattern di ricerca**: `c.name.includes('dviCUSTTABLE_Edit') && !c.name.includes('DDD')`
- **Input ID**: `...dviCUSTTABLE_Edit_I`
- **Dropdown Grid**: `...dviCUSTTABLE_Edit_DDD_gv` (74 pagine, 20 righe/pagina)

### TAB CONTROLS
- **Tab superiore** (dati ordine): `...xaf_l275_pg`
- **Tab inferiore** (sales lines): `...xaf_l715_pg`

### NOTE IMPORTANTI
1. I nomi contengono un hash sessione/versione (`v7_61007966`, `v10_30726963`) che POTREBBE cambiare tra sessioni
2. Per accesso affidabile: cercare per keyword (`dviSALESLINEs`, `dviCUSTTABLE`) + tipo metodo (`AddNewRow`)
3. Il tipo riportato e `ret` per tutti (nome interno DevExpress minificato) - ma i metodi confermano il tipo reale

### Pattern di Accesso Affidabile nel Bot
```typescript
// Trova la grid SALESLINEs dinamicamente
const gridName = await page.evaluate(() => {
    let found = '';
    ASPxClientControl.GetControlCollection().ForEachControl((c) => {
        if (c.name.includes('dviSALESLINEs') && typeof c.AddNewRow === 'function') {
            found = c.name;
        }
    });
    return found;
});

// Poi usa il nome per operazioni
await page.evaluate((name) => {
    const grid = ASPxClientControl.GetControlCollection().GetByName(name);
    grid.AddNewRow();
}, gridName);

// Attendi fine callback
await page.waitForFunction((name) => {
    const grid = ASPxClientControl.GetControlCollection().GetByName(name);
    return grid && !grid.InCallback();
}, { polling: 100, timeout: 15000 }, gridName);
```

---

## 1. Tecnologia del Sito Archibald

### Stack Tecnologico
- **Framework**: DevExpress XAF (eXpress Application Framework)
- **Runtime**: ASP.NET Web Forms
- **UI Controls**: DevExpress ASPx Controls (ASPxGridView, ASPxComboBox, ASPxLookup, ASPxTabControl, ASPxMenu)
- **Comunicazione Client-Server**: Callback mechanism (AJAX, NON full postback)
- **Linguaggio Server**: C# / .NET
- **Linguaggio Client**: JavaScript generato da DevExpress (non React/Angular/Vue)

### Caratteristiche Chiave DevExpress Web Forms
1. **Callback-based**: Ogni operazione grid (AddNew, Update, Delete, Pagina) avviene tramite callback AJAX asincrono
2. **Controlli con stato client-side**: Ogni controllo DevExpress ha un oggetto JavaScript accessibile tramite `ClientInstanceName`
3. **API client-side completa**: Metodi come `AddNewRow()`, `UpdateEdit()`, `GotoPage()` sono esposti nativamente
4. **Session state serializzato**: ASP.NET serializza le callback per sessione (una alla volta server-side)
5. **IncrementalFilteringMode**: ComboBox/Lookup filtrano automaticamente mentre l'utente digita

---

## 2. API Client-Side DevExpress (Riferimento Completo)

### 2.1 ASPxClientGridView - Metodi Principali

| Metodo | Descrizione | Trigger Callback? |
|--------|-------------|-------------------|
| `AddNewRow()` | Apre edit mode per nuova riga | SI |
| `UpdateEdit()` | Salva la riga in edit e torna a browse mode | SI |
| `CancelEdit()` | Annulla l'edit corrente | SI |
| `DeleteRow(visibleIndex)` | Elimina riga per indice visibile | SI |
| `StartEditRow(visibleIndex)` | Apre riga esistente in edit mode | SI |
| `GotoPage(pageIndex)` | Naviga a pagina specifica (0-based) | SI |
| `NextPage()` | Pagina successiva | SI |
| `PrevPage()` | Pagina precedente | SI |
| `Refresh()` | Ricarica dati grid | SI |
| `PerformCallback(args)` | Callback custom | SI |
| `GetRowValues(idx, fields, cb)` | Legge valori riga (con callback) | SI |
| `SetEditValue(column, value)` | Imposta valore in edit mode | NO |
| `GetEditValue(column)` | Legge valore in edit mode | NO |
| `GetEditor(column)` | Ritorna editor del campo (ASPxClientEdit) | NO |
| `FocusEditor(column)` | Mette focus sull'editor di una colonna | NO |
| `InCallback()` | Controlla se callback in corso | NO |
| `IsEditing()` | Controlla se in edit mode | NO |
| `IsNewRowEditing()` | Controlla se sta editando nuova riga | NO |
| `GetPageIndex()` | Ritorna indice pagina corrente (0-based) | NO |
| `GetPageCount()` | Ritorna numero totale pagine | NO |
| `GetVisibleRowsOnPage()` | Righe visibili nella pagina corrente | NO |
| `SetFocusedRowIndex(idx)` | Imposta riga focused | NO |
| `GetFocusedRowIndex()` | Ritorna indice riga focused | NO |

### 2.2 ASPxClientComboBox / ASPxClientLookup

| Metodo | Descrizione |
|--------|-------------|
| `SetValue(value)` | Imposta valore (da ValueField) |
| `SetText(text)` | Imposta testo display |
| `SetSelectedIndex(idx)` | Seleziona per indice |
| `SetSelectedItem(item)` | Seleziona oggetto item |
| `FindItemByValue(value)` | Cerca item per valore |
| `FindItemByText(text)` | Cerca item per testo |
| `ShowDropDown()` | Apre dropdown |
| `HideDropDown()` | Chiude dropdown |
| `GetItemCount()` | Numero items caricati |
| `GetItem(index)` | Item per indice |
| `EnsureDropDownLoaded(callback)` | Carica dropdown e poi esegue callback |
| `InCallback()` | Controlla se callback in corso |

### 2.3 Accesso ai Controlli

```javascript
// Metodo 1: Variabile globale (se ClientInstanceName impostato)
window['nomeControllo'].AddNewRow();

// Metodo 2: GetControlCollection (sempre funzionante)
ASPxClientControl.GetControlCollection().GetByName('nomeControllo');

// Metodo 3: Enumerare tutti i controlli
ASPxClientControl.GetControlCollection().ForEachControl(function(control) {
    console.log('Name:', control.name, '| Type:', control.constructor.name);
});
```

### 2.4 Eventi Callback

```javascript
// EndCallback - FONDAMENTALE per sincronizzazione
function grid_EndCallback(s, e) {
    // e.command identifica cosa ha triggerato il callback:
    // 'ADDNEWROW', 'UPDATEEDIT', 'CANCELEDIT', 'DELETEROW',
    // 'PAGERONCLICK', 'CUSTOMCALLBACK'
}

// BeginCallback - può cancellare il callback
function grid_BeginCallback(s, e) {
    e.cancel = true; // Previene il callback
}
```

---

## 3. Pattern Puppeteer + DevExpress (Pattern Raccomandati)

### 3.1 Pattern Base: Esegui Azione + Attendi Callback

```typescript
// PATTERN RACCOMANDATO per qualsiasi operazione DevExpress
async function executeDevExpressAction(page, action: string) {
    // 1. Esegui azione via API client-side
    await page.evaluate((action) => {
        const grid = window['gridName'];
        grid[action]();
    }, action);

    // 2. Attendi che il callback finisca
    await page.waitForFunction(() => {
        const grid = window['gridName'];
        return grid && !grid.InCallback();
    }, { polling: 100, timeout: 15000 });
}
```

### 3.2 Pattern: Aggiunta Riga con Valori

```typescript
async function addRowToGrid(page, gridName, values) {
    // 1. AddNewRow
    await page.evaluate((name) => window[name].AddNewRow(), gridName);
    await page.waitForFunction((name) => !window[name].InCallback(),
        { polling: 100, timeout: 15000 }, gridName);

    // 2. Imposta valori
    await page.evaluate((name, vals) => {
        const grid = window[name];
        for (const [field, value] of Object.entries(vals)) {
            grid.SetEditValue(field, value);
        }
    }, gridName, values);

    // 3. Salva
    await page.evaluate((name) => window[name].UpdateEdit(), gridName);
    await page.waitForFunction((name) => !window[name].InCallback(),
        { polling: 100, timeout: 15000 }, gridName);
}
```

### 3.3 Pattern: Navigazione Pagina Grid

```typescript
async function navigateToPage(page, gridName, pageIndex) {
    await page.evaluate((name, idx) => window[name].GotoPage(idx),
        gridName, pageIndex);
    await page.waitForFunction((name) => !window[name].InCallback(),
        { polling: 100, timeout: 15000 }, gridName);
}
```

### 3.4 Pattern: ComboBox con Callback Mode

```typescript
async function setComboBoxValue(page, comboName, value) {
    // EnsureDropDownLoaded prima di cercare item
    await page.evaluate((name) => {
        return new Promise((resolve) => {
            const combo = window[name];
            combo.EnsureDropDownLoaded(() => resolve());
        });
    }, comboName);

    // Poi imposta valore
    await page.evaluate((name, val) => {
        const combo = window[name];
        const item = combo.FindItemByValue(val);
        if (item) combo.SetSelectedItem(item);
        else combo.SetValue(val);
    }, comboName, value);
}
```

---

## 4. Analisi Comparativa: Bot Attuale vs Best Practice DevExpress

### 4.1 CRITICO - Paginazione Sales Lines Grid (NON GESTITA)

**Problema**: La grid delle sales lines (ordini) ha 20 righe per pagina. Quando il bot inserisce >20 articoli, la grid pagina automaticamente. Il bot NON gestisce questa casistica.

**Impatto**:
- Dopo la riga 20, il pulsante "AddNew" potrebbe trovarsi su una pagina diversa
- Il selettore `tr[id*="editnew"]` potrebbe non trovare la riga su pagine successive
- La formula Tab fallback `4 * (i + 1)` diventa completamente sbagliata dopo paginazione
- Il click diretto su `INVENTTABLE` input nella riga editnew potrebbe fallire

**Stato attuale** (linea 4554):
```typescript
if (i < orderData.items.length - 1) {  // BUG: usa orderData.items.length
```

**Soluzione raccomandata**:
- Usare `grid.GetPageCount()` e `grid.GetPageIndex()` per tracking
- Dopo `UpdateEdit()`, verificare se la grid ha paginato
- Navigare all'ultima pagina prima di `AddNewRow()` se necessario
- **Oppure**: usare direttamente `grid.AddNewRow()` via API (DevExpress gestisce automaticamente la navigazione)

### 4.2 CRITICO - Bug Condizione "Next Article" (Linea 4554)

**Problema**: Il bot usa `orderData.items.length` per decidere se aggiungere un'altra riga, ma dovrebbe usare `itemsToOrder.length` (che esclude articoli da magazzino).

**Codice attuale** (`archibald-bot.ts:4554`):
```typescript
if (i < orderData.items.length - 1) {
```

**Codice corretto**:
```typescript
if (i < itemsToOrder.length - 1) {
```

**Impatto**: Il bot potrebbe tentare di creare righe extra per articoli da magazzino che sono stati filtrati, causando errori o righe vuote.

### 4.3 ALTO - Simulazione Click vs API Client-Side

| Operazione | Approccio Attuale | Approccio Raccomandato | Perche |
|-----------|-------------------|----------------------|--------|
| AddNew riga | Click su `a[data-args*="AddNew"]` con fallback multipli | `grid.AddNewRow()` via `page.evaluate()` | API nativa, nessun selettore fragile |
| Update riga | Click su `a[data-args*="UpdateEdit"]` | `grid.UpdateEdit()` via `page.evaluate()` | API nativa, sempre funzionante |
| Navigazione campo | Tab × N o click su TD.dxic | `grid.FocusEditor('INVENTTABLE')` o `grid.GetEditor('campo')` | Preciso, non dipende da posizione |
| Selezione variante | ArrowDown × N + Tab | `grid.SetEditValue()` o `comboBox.SetSelectedItem()` | Diretto, nessun conteggio righe |
| Attesa callback | `waitForDevExpressReady()` (DOM polling) | `!grid.InCallback()` polling | Ufficiale, callback-aware |
| Paginazione variante | Click su img[alt="Next"] | `grid.NextPage()` o `grid.GotoPage()` | API nativa |

**Impatto**: L'approccio attuale con selettori CSS e simulazione click:
- Si rompe quando DevExpress aggiorna gli ID dei controlli
- Richiede fallback multipli (Strategy 0/1/2/3)
- Non gestisce bene i casi edge (pulsanti non visibili, paginazione)

### 4.4 ALTO - Sincronizzazione Callback Non Ottimale

**Problema attuale**: `waitForDevExpressReady()` controlla solo i loading panel CSS. `waitForDevExpressIdle()` fa polling generico su tutti i controlli.

**Approccio raccomandato**:
```typescript
// Specifico e affidabile
await page.waitForFunction(() => {
    const grid = window['salesLinesGrid'];
    return grid && !grid.InCallback();
}, { polling: 100, timeout: 15000 });
```

**Vantaggi**:
- Specifico per il controllo di interesse (non generico)
- `InCallback()` e il metodo ufficiale DevExpress
- Polling a 100ms e sufficiente (non servono 3 stable polls)

### 4.5 MEDIO - Tab Navigation Fragile

**Problema** (`archibald-bot.ts:3678-3780`):
- Primo articolo: Tab x 3
- Articoli successivi: click su `tr[id*="editnew"] input[id*="INVENTTABLE"]`
- Fallback: `tabCount = 4 * (i + 1)` - **COMPLETAMENTE SBAGLIATO dopo paginazione**

**Soluzione raccomandata**:
```typescript
// Usa API DevExpress per focus diretto
await page.evaluate(() => {
    const grid = window['salesLinesGrid'];
    grid.FocusEditor('INVENTTABLE_Name');
});
```

**Oppure** (se ClientInstanceName non e noto):
```typescript
// Trova il grid e usa SetEditValue/GetEditor
await page.evaluate(() => {
    const collection = ASPxClientControl.GetControlCollection();
    collection.ForEachControl((ctrl) => {
        if (ctrl.name.includes('SALESLINEs') && ctrl.AddNewRow) {
            const editor = ctrl.GetEditor('INVENTTABLE_Name');
            if (editor) editor.Focus();
        }
    });
});
```

### 4.6 MEDIO - Typing Articolo: paste + type vs API

**Problema attuale** (`archibald-bot.ts:3813-3846`): Il bot fa paste di tutti i caratteri tranne l'ultimo, poi type dell'ultimo per triggerare IncrementalFiltering.

**Approccio alternativo**: Potrebbe funzionare meglio usare direttamente l'API ComboBox/Lookup:
```typescript
await page.evaluate((code) => {
    const editor = grid.GetEditor('INVENTTABLE_Name');
    if (editor && editor.SetText) {
        editor.SetText(code);  // Triggera filtering
    }
}, articleCode);
```

**NOTA**: L'approccio paste+type attuale funziona ed e gia ottimizzato. Mantenere se non causa problemi.

### 4.7 MEDIO - Wait Fissi Ancora Presenti

| Posizione | Wait | Scopo | Raccomandazione |
|-----------|------|-------|-----------------|
| Linea 3348 | `1000ms` | "Wait for line items grid to be fully loaded" | Sostituire con `waitForFunction` su grid ready |
| Linea 5006 | `1500ms` | Dopo apertura tab "Prezzi e sconti" | Sostituire con `waitForDevExpressIdle` (gia presente dopo) |
| Linea 5061 | `1500ms` | Stessa situazione (secondo path) | Come sopra |
| Vari | `200-300ms` | Stabilizzazione post-operazione | Mantenere come buffer di sicurezza minimo |

### 4.8 MEDIO - Race Condition: Callback Paralleli

**Rischio**: DevExpress avverte esplicitamente: "When multiple callbacks execute in parallel, results may arrive out-of-order."

**Stato attuale**: Il bot usa `waitForDevExpressIdle()` che verifica TUTTI i controlli, il che mitiga parzialmente il rischio.

**Raccomandazione**: Prima di ogni operazione che triggera callback, verificare:
```typescript
// Guard: mai triggerare callback se uno e gia in corso
await page.waitForFunction(() => {
    const grid = window['salesLinesGrid'];
    return grid && !grid.InCallback();
}, { polling: 100, timeout: 10000 });
```

### 4.9 BASSO - Busy-Wait nel Fallback Update

**Problema** (`archibald-bot.ts:4352-4353`):
```typescript
const start = Date.now();
while (Date.now() - start < 200) {}  // BUSY WAIT - blocca il thread!
```

**Soluzione**: Usare `await this.wait(200)` o meglio rimuovere completamente (il `scrollIntoView` non necessita attesa).

---

## 5. Scoperta Nomi Controlli DevExpress

### 5.1 Strategia per Trovare i ClientInstanceName

Prima di poter usare l'API client-side DevExpress, dobbiamo scoprire i nomi dei controlli. Il modo migliore e eseguire nella console browser:

```javascript
ASPxClientControl.GetControlCollection().ForEachControl(function(c) {
    console.log(c.name, c.constructor.name);
});
```

Questo ci dara tutti i nomi. In particolare cerchiamo:
- **Grid sales lines**: probabilmente contiene "SALESLINEs" nel nome
- **Campo INVENTTABLE (articolo)**: lookup/combobox nel grid
- **Campo quantita**: editor numerico nel grid
- **Tab Prezzi e Sconti**: tab control

### 5.2 Come Fare (da implementare nel bot)

```typescript
// Aggiungere metodo di discovery al bot
async discoverControls(): Promise<Record<string, string>> {
    return await this.page!.evaluate(() => {
        const controls: Record<string, string> = {};
        ASPxClientControl.GetControlCollection().ForEachControl((c) => {
            controls[c.name] = c.constructor.name;
        });
        return controls;
    });
}
```

---

## 6. Piano di Miglioria Prioritizzato

### Priorita 1: FIX CRITICI (da fare subito)
1. **Fix bug linea 4554**: `orderData.items.length` -> `itemsToOrder.length`
2. **Gestire paginazione sales lines**: Dopo UpdateEdit con >20 righe, navigare alla pagina corretta prima di AddNewRow

### Priorita 2: STABILITA (riduce fallimenti)
3. **Scoprire i ClientInstanceName**: Aggiungere fase di discovery all'inizio di createOrder()
4. **Usare `grid.AddNewRow()` via API** invece di click su selettori CSS
5. **Usare `grid.UpdateEdit()` via API** invece di click
6. **Usare `!grid.InCallback()` per sincronizzazione** invece di polling generico
7. **Guardia anti-callback-paralleli**: Verificare `!grid.InCallback()` prima di ogni operazione

### Priorita 3: PERFORMANCE (velocizza operazioni)
8. **Rimuovere wait 1000ms** (linea 3348) - sostituire con check evento
9. **Rimuovere wait 1500ms** (linee 5006, 5061) - gia coperti da waitForDevExpressIdle
10. **Rimuovere busy-wait** (linea 4352) - sostituire con await

### Priorita 4: ROBUSTEZZA AVANZATA (previene edge case)
11. **Usare `grid.FocusEditor()` per navigazione campo** invece di Tab counting
12. **Usare `grid.SetEditValue()` per impostare valori** dove possibile
13. **Aggiungere retry con backoff** per operazioni critiche (AddNew, Update)
14. **Screenshot automatico su ogni fallimento** (gia implementato parzialmente)

---

## 7. Rischi e Limitazioni

### 7.1 ClientInstanceName Potrebbe Non Essere Impostato
In XAF, non tutti i controlli hanno `ClientInstanceName` esplicito. Se non impostato, il nome e l'ID ASP.NET generato (es. `ctl00_MainContent_SALESLINEs_DXGridView`).

**Mitigazione**: Usare `GetControlCollection().ForEachControl()` per scoprire i nomi, poi filtro con `indexOf('SALESLINEs')`.

### 7.2 API SetEditValue Potrebbe Non Funzionare per Lookup
`SetEditValue()` funziona bene per campi testo/numero. Per campi Lookup (come INVENTTABLE), potrebbe non triggerare la logica di risoluzione lato server.

**Mitigazione**: Per i Lookup, continuare a usare l'approccio typing + dropdown selection. Usare API solo dove funziona (quantita, sconto).

### 7.3 Versione DevExpress Sconosciuta
Non conosciamo la versione esatta di DevExpress usata da Archibald. Alcune API potrebbero non essere disponibili in versioni piu vecchie.

**Mitigazione**: Discovery dei controlli all'avvio + try/catch con fallback all'approccio attuale.

---

## 8. Conclusione

Il bot attuale funziona ma e **fragile** perche:
1. Simula click umani su elementi DOM con selettori CSS che possono cambiare
2. NON gestisce la paginazione della grid sales lines (>20 righe)
3. Usa Tab counting per navigazione (rompe dopo paginazione)
4. Ha un bug critico nella condizione per il prossimo articolo
5. Usa wait fissi dove dovrebbe usare callback-aware polling

La soluzione e **migrare progressivamente all'API client-side DevExpress**, mantenendo fallback sull'approccio attuale. Questo rendera il bot:
- **Piu affidabile**: API nativa vs selettori CSS fragili
- **Piu veloce**: Niente wait fissi, solo callback-aware polling
- **Piu robusto**: Gestione paginazione, recovery da errori
- **Piu mantenibile**: Meno strategie di fallback, codice piu pulito
