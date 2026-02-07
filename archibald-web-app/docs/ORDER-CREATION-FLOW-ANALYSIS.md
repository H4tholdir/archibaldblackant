# Analisi Atomica del Flusso di Creazione Ordine - Archibald Bot

## Indice Rapido

| Fase | File | Righe | Descrizione |
|------|------|-------|-------------|
| 0. Ingresso API | `routes/bot.ts` | 26-101 | Endpoint REST, validazione, accodamento |
| 1. Queue Manager | `queue-manager.ts` | 239-541 | Lock sync, creazione bot, esecuzione |
| 2. Inizializzazione | `archibald-bot.ts` | 1898-1987 | Acquisizione context browser |
| 3. Login | `archibald-bot.ts` | 2050-2395 | Autenticazione Archibald |
| 4. Navigazione Ordini | `archibald-bot.ts` | 2556-2637 | STEP 1: Naviga lista ordini |
| 5. Click "Nuovo" | `archibald-bot.ts` | 2642-2688 | STEP 2: Apre form nuovo ordine |
| 6. Selezione Cliente | `archibald-bot.ts` | 2691-3337 | STEP 3: Dropdown + ricerca cliente |
| 7. Click "New" Riga | `archibald-bot.ts` | 3342-3562 | STEP 4: Crea prima riga ordine |
| 8. Filtro Warehouse | `archibald-bot.ts` | 3566-3614 | Filtro articoli magazzino |
| 9. Loop Articoli | `archibald-bot.ts` | 3616-4870 | STEP 5-8: Per ogni articolo |
| 9a. Select Variant DB | `archibald-bot.ts` | 3625-3661 | 5.1: Query package variant |
| 9b. Search Articolo | `archibald-bot.ts` | 3664-3927 | 5.2: Cerca codice nel dropdown |
| 9c. Select Variante | `archibald-bot.ts` | 3936-4551 | 5.3: Paginazione + selezione riga |
| 9d. Quantita + Sconto | `archibald-bot.ts` | 4257-4416 | 5.4-5.7: Tab+type qty, discount, Update |
| 9e. New Riga Successiva | `archibald-bot.ts` | 4553-4869 | 5.8: AddNew per prossimo articolo |
| 10. Extract Order ID | `archibald-bot.ts` | 4940-4996 | STEP 9: Estrae ID ordine |
| 11. Line Discount N/A | `archibald-bot.ts` | 4998-5045 | STEP 9.2: Sconto linea = N/A |
| 12. Global Discount | `archibald-bot.ts` | 5047-5096 | STEP 9.5: Sconto globale % |
| 13. Salva e Chiudi | `archibald-bot.ts` | 5101-5183 | STEP 10: Salva ordine |
| 14. Cleanup | `archibald-bot.ts` | 5185-5217 | Report + screenshot errore |
| 15. Post-Processing | `queue-manager.ts` | 364-498 | Salva articoli DB, broadcast WS |

---

## FASE 0: INGRESSO API

### File: `backend/src/routes/bot.ts` (righe 26-101)

**Endpoint:** `POST /api/bot/submit-orders`

**Flusso:**
1. **Riga 31:** Estrae `userId` e `username` dal JWT (`req.user!`)
2. **Riga 33:** Estrae `orders` dal body
3. **Riga 35-40:** Validazione: `orders` deve essere array non vuoto
4. **Riga 50-76:** Loop su ogni ordine:
   - **Riga 53-54:** Estrae `pendingOrderId` dall'ordine o genera UUID
   - **Riga 56-61:** Chiama `queueManager.addOrder(orderData, userId, pendingOrderId)`
   - Ritorna `jobIds` array

**Input schema** (`schemas.ts` righe 25-31):
```typescript
createOrderSchema = {
  customerId: string (min 1),
  customerName: string (min 1),
  items: [{ articleCode, productName?, description?, quantity, price, discount?,
            articleId?, packageContent?, warehouseQuantity?, warehouseSources? }],
  discountPercent?: number (0-100),
  targetTotalWithVAT?: number
}
```

---

## FASE 1: QUEUE MANAGER - PROCESSAMENTO JOB

### File: `backend/src/queue-manager.ts`

### 1.1 Accodamento (`addOrder` - righe 546-591)
1. **Riga 552:** Recupera `username` dal DB utenti
2. **Riga 554-572:** Aggiunge job in coda BullMQ con:
   - `attempts: 1` (nessun retry automatico)
   - `removeOnComplete: { count: 100 }`
   - `removeOnFail: { count: 50 }`
3. **Riga 575:** Collega jobId a pendingOrderId (`linkJobToPending`)
4. **Riga 578-579:** Emette evento WebSocket `JOB_STARTED`

### 1.2 Lock Priority (`processOrder` - righe 239-541)
1. **Riga 248-295:** Acquisisce lock ordini (blocca tutti i sync):
   - Max 20 tentativi (20 secondi)
   - Dopo 10 secondi: trigger `forceStopAllSyncs()` (riga 260-277)
   - Se fallisce: throw Error
2. **Riga 312-313:** Pulizia browser zombie (`pkill -f "Google Chrome for Testing"`)
3. **Riga 325:** Crea `new ArchibaldBot(userId)`
4. **Riga 328:** Chiama `bot.initialize()` (acquisisce context dal BrowserPool)
5. **Riga 338-346:** Setta progress callback per broadcast WebSocket
6. **Riga 357-361:** Esegue `bot.createOrder(orderData)` dentro `PriorityManager.withPriority()`
7. **Riga 365-427:** Se ordine warehouse-only, crea record manuale
8. **Riga 430-467:** Salva articoli ordine nel DB
9. **Riga 476-482:** Emette `JOB_COMPLETED` via WebSocket
10. **Riga 499-522:** In caso di errore: emette `JOB_FAILED`
11. **Riga 523-541:** Finally: chiude bot, rilascia lock

---

## FASE 2: INIZIALIZZAZIONE BOT

### File: `backend/src/archibald-bot.ts` (righe 1898-1987)

**Metodo:** `initialize()`

### Multi-user mode (con userId):
1. **Riga 1903:** Ottiene istanza `BrowserPool`
2. **Riga 1904-1910:** `runOp("browserPool.acquireContext")` - Acquisisce context dal pool
3. **Riga 1912-1918:** `runOp("context.newPage")` - Crea nuova pagina
4. **Riga 1921-1927:** `runOp("page.setViewport")` - Imposta viewport 1280x800

### Legacy mode (senza userId):
1. **Riga 1938-1958:** `runOp("browser.launch")` - Lancia browser Puppeteer con:
   - `headless: false` (in dev), `true` (in prod)
   - `slowMo: 200ms` (dev), `50ms` (prod)
   - `protocolTimeout: 180000ms` (3 minuti)
   - Args: `--no-sandbox, --disable-setuid-sandbox, --disable-web-security, --ignore-certificate-errors`
   - Viewport: 1280x800
2. **Riga 1960-1966:** Crea nuova pagina

### Comune:
3. **Riga 1972-1977:** Abilita console logging dal browser
4. **Riga 1980-1986:** Disabilita request interception

---

## FASE 3: LOGIN

### File: `backend/src/archibald-bot.ts` (righe 2050-2395)

**Metodo:** `login()`

1. **Riga 2057-2082:** Recupera credenziali:
   - Multi-user: `PasswordCache.get(userId)` + `UserDatabase.getUserById(userId)`
   - Legacy: `config.archibald.username/password`
2. **Riga 2087-2093:** Carica sessione dalla cache:
   - Multi-user: `multiUserSessionCache.loadSession(userId)`
   - Legacy: `legacySessionCache.loadSession()`
3. **Riga 2095-2136:** Se cookie cached:
   - Imposta cookies sulla pagina
   - Naviga a `Default.aspx`
   - Se non redirect a `Login.aspx` -> sessione valida, return
   - Altrimenti: cancella cache, continua con fresh login
4. **Riga 2138:** URL login: `{url}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`
5. **Riga 2149-2159:** `runOp("login.goto")` - Naviga con `waitUntil: "networkidle2"`
6. **Riga 2174-2180:** `runOp("login.wait_page")` - Wait 2000ms fissi
7. **Riga 2190-2221:** `runOp("login.findUsernameField")` - Cerca campo username per ID/name/placeholder
8. **Riga 2225-2242:** `runOp("login.findPasswordField")` - Cerca campo password
9. **Riga 2244-2249:** Se campi non trovati: screenshot + throw
10. **Riga 2257:** Clicca campo username
11. **Riga 2274:** Digita username con `page.keyboard.type()`
12. **Riga 2291:** Clicca campo password
13. **Riga 2302-2311:** Cerca e clicca bottone "Accedi"
14. **Riga 2315-2338:** Attende navigazione post-login (URL change + networkidle2)
15. **Riga 2349-2395:** Salva cookies nella cache per riuso futuro

---

## FASE 4: STEP 1 - NAVIGAZIONE LISTA ORDINI

### File: `archibald-bot.ts` (righe 2556-2637)

**Operazione:** `runOp("order.menu.ordini", ..., "navigation.ordini")`

1. **Riga 2559:** URL ordini: `{url}/SALESTABLE_ListView_Agent/`
2. **Riga 2560-2572:** Funzione helper: attende che bottone "Nuovo" appaia (timeout 10s)
3. **Riga 2574-2593:** **Strategia primaria:** Navigazione diretta URL
   - `page.goto(ordersUrl, { waitUntil: "domcontentloaded", timeout: 30000 })`
   - Attende comparsa "Nuovo"
   - Se fallisce: fallback al menu
4. **Riga 2597-2623:** **Strategia fallback:** Click menu "Ordini"
   - Cerca link con href `SALESTABLE_ListView_Agent`
   - Fallback: `clickElementByText("Ordini")`
5. **Riga 2629:** Attende lista ordini
6. **Riga 2632:** Slowdown `click_ordini` (default 200ms)

**Emit progress:** `"navigation.ordini"` -> 10%

---

## FASE 5: STEP 2 - CLICK "NUOVO" (CREA ORDINE)

### File: `archibald-bot.ts` (righe 2642-2688)

**Operazione:** `runOp("order.click_nuovo", ..., "navigation.form")`

1. **Riga 2647:** Salva URL corrente
2. **Riga 2650-2655:** `clickElementByText("Nuovo", { exact: true })` su button/a/span
3. **Riga 2663-2678:** Attende cambio URL (indica navigazione al form) con timeout 5s
4. **Riga 2680:** `waitForDevExpressReady({ timeout: 5000 })` - Attende che tutti i controlli DX siano pronti
5. **Riga 2683:** Slowdown `click_nuovo` (default 200ms)

---

## FASE 6: STEP 3 - SELEZIONE CLIENTE

### File: `archibald-bot.ts` (righe 2691-3337)

**Operazione:** `runOp("order.customer.select", ..., "form.customer")`

### 6.1 Trova campo cliente (righe 2700-2804)
1. **Riga 2701-2722:** Check immediato sincrono: cerca `input[type="text"]` con ID contenente `custtable|custaccount|custome|cliente|account|profilo`
2. **Riga 2725-2780:** Se non trovato: polling con `waitForFunction` (timeout 3s, `polling: "mutation"`)
3. **Riga 2782-2802:** Se ancora non trovato: log diagnostico + throw
4. **Riga 2807-2809:** Estrae baseId (rimuove suffisso `_I`)

### 6.2 Apri dropdown (righe 2813-2838)
1. **Riga 2814-2820:** Selettori dropdown: `#baseId_B-1`, `_B-1Img`, `_B`, `_DDD`, `_DropDown`
2. **Riga 2822-2831:** Loop: trova e clicca primo selettore valido (con boundingBox)

### 6.3 Cerca input ricerca (righe 2842-2906)
1. **Riga 2843-2845:** Selettori: `#baseId_DDD_gv_DXSE_I`, `input[placeholder*="enter text"]`
2. **Riga 2853-2874:** `waitForFunction` con polling 50ms, timeout 3s
3. **Riga 2880-2895:** Fallback: prova ogni selettore manualmente

### 6.4 Inserisci nome cliente (righe 2908-2941)
1. **Riga 2913:** `pasteText(searchInput, customerName)` - Paste veloce
2. **Riga 2917-2931:** Verifica valore: `waitForFunction` polling 50ms
3. **Riga 2940:** `keyboard.press("Enter")` - Triggera ricerca
4. **Riga 2943-2946:** `waitForDevExpressIdle` - Attende filtro completato

### 6.5 Attendi risultati (righe 2948-3026)
1. **Riga 2949-3023:** `waitForFunction` (timeout 4s, polling 100ms):
   - Cerca container dropdown visibile con `[id*="_DDD"]`
   - Cerca popup DevExpress (`.dxpcLite, .dxpc-content, .dxpcMainDiv`)
   - Cerca righe `tr[class*="dxgvDataRow"]` visibili

### 6.6 Snapshot + matching (righe 3028-3137)
1. **Riga 3028-3130:** Estrae snapshot DOM: headers, righe con cellTexts
2. **Riga 3132-3136:** `buildTextMatchCandidates()` + `chooseBestTextMatchCandidate()`
   - Match esatto, contains, single-row

### 6.7 Click riga cliente (righe 3140-3248)
1. **Riga 3141-3245:** `page.evaluate()`:
   - Trova container attivo (dropdown o popup)
   - Trova riga per indice
   - `scrollIntoView` + `click()` sulla prima cella

### 6.8 Attendi caricamento dati (righe 3279-3335)
1. **Riga 3284-3298:** Attende chiusura dropdown panel (timeout 2s)
2. **Riga 3305:** `waitForDevExpressReady({ timeout: 3000 })`
3. **Riga 3308-3331:** Attende comparsa bottone "New" in griglia righe (timeout 4s)
4. **Riga 3334:** Slowdown `select_customer` (default 200ms)

**Emit progress:** `"form.customer"` -> 25%

---

## FASE 7: STEP 4 - CLICK "NEW" (PRIMA RIGA)

### File: `archibald-bot.ts` (righe 3342-3562)

**Operazione:** `runOp("order.lineditems.click_new", ..., "form.multi_article")`

1. **Riga 3348:** Wait fisso 1000ms (grid caricamento)
2. **Riga 3351-3356:** **Strategia 0 (preferita):** `clickDevExpressGridCommand({ command: "AddNew", baseIdHint: "SALESLINEs" })`
3. **Riga 3369-3505:** **Fallback multi-strategia:**
   - **Strategia 1 (riga 3372-3376):** `a[data-args*="AddNew"]`
   - **Strategia 2 (riga 3386-3402):** `img[title="New"][src*="Action_Inline_New"]` -> click parent `<a>`
   - **Strategia 3 (riga 3404-3418):** `a.dxbButton_XafTheme` con ID `SALESLINEs` + `DXCBtn`
4. **Riga 3439-3497:** Esegue click con `clickSequence()` (pointerdown -> mousedown -> pointerup -> mouseup -> click)
5. **Riga 3509-3548:** Attende comparsa input articolo (`waitForFunction` timeout 3s)
6. **Riga 3559:** Slowdown `click_new_article` (default 200ms)

---

## FASE 8: FILTRO WAREHOUSE

### File: `archibald-bot.ts` (righe 3566-3614)

1. **Riga 3566-3598:** Mappa articoli:
   - Se `warehouseQty >= totalQty`: skip completamente (tutto da magazzino)
   - Se `warehouseQty > 0`: riduce quantita (`qtyToOrder = totalQty - warehouseQty`)
   - Se `warehouseQty == 0`: ordine completo
2. **Riga 3606-3614:** Se `itemsToOrder.length === 0`: ritorna `warehouse-{timestamp}` (nessun invio ad Archibald)

---

## FASE 9: LOOP ARTICOLI (per ogni `itemsToOrder[i]`)

### File: `archibald-bot.ts` (righe 3616-4870)

**IMPORTANTE - BUG TROVATO (riga 4554):**
```typescript
if (i < orderData.items.length - 1)  // SBAGLIATO! Dovrebbe essere itemsToOrder.length
```
Questo bug fa si' che se ci sono articoli warehouse-only, il bot tenta di aggiungere righe "New" anche quando non servono.

---

### 9a. STEP 5.1: Selezione Variante dal DB (righe 3625-3661)

**Operazione:** `runOp("order.item.{i}.select_variant", ..., "form.package")`

1. **Riga 3628-3629:** `variantLookupName = item.productName || item.articleCode`
2. **Riga 3630-3632:** `productDb.getProductById(item.articleCode)` - lookup diretto
3. **Riga 3633-3638:** Se non trovato: `productDb.selectPackageVariant(name, quantity)` - selezione per confezione
4. **Riga 3640-3647:** Se nessun risultato: throw Error
5. **Riga 3658:** Salva variante selezionata in `item._selectedVariant`

---

### 9b. STEP 5.2: Ricerca Articolo nel Dropdown (righe 3664-3927)

**Operazione:** `runOp("order.item.{i}.search_article_dropdown", ..., "form.article")`

#### Per il PRIMO articolo (i === 0):
1. **Riga 3679-3683:** Tab x 3 dal bottone New per raggiungere campo INVENTTABLE
2. **Riga 3683:** Wait 100ms

#### Per ARTICOLI SUCCESSIVI (i > 0):
1. **Riga 3690:** Selector: `tr[id*="editnew"] input[id*="INVENTTABLE"]`
2. **Riga 3692-3704:** `waitForSelector(selector, { timeout: 3000 })`
3. **Riga 3708-3727:** **Strategia 1:** Click sul TD.dxic parent + focus input
4. **Riga 3731-3743:** Verifica focus: `waitForFunction` che `activeElement.id` contiene "INVENTTABLE"
5. **Riga 3746-3780:** **Fallback Tab incrementale:**
   - Formula: `tabCount = i === 0 ? 3 : 4 * (i + 1)`
   - Articolo 2 = 8 Tab, Articolo 3 = 12 Tab, ecc.
   - **NOTA: Questo fallback NON gestisce la paginazione della griglia (20 righe per pagina)**

#### Digitazione codice articolo (comune):
1. **Riga 3784-3797:** Legge ID campo focused e verifica contenga "INVENTTABLE"
2. **Riga 3800-3806:** Calcola `baseId` e salva per step successivi
3. **Riga 3820-3846:** Digitazione ottimizzata:
   - Se codice > 1 char: paste tutto tranne ultimo + type ultimo
   - Ultimo char triggerara IncrementalFiltering di DevExpress
4. **Riga 3854-3924:** Attende apertura dropdown automatica:
   - `waitForSelector('tr[id*="DXDataRow"]', { timeout: 5000 })`
   - Verifica visibilita (width/height > 0)
   - Se timeout: screenshot diagnostico + throw

---

### 9c. STEP 5.3: Selezione Variante nel Dropdown (righe 3936-4551)

**Operazione:** `runOp("order.item.{i}.select_article", ..., "form.article")`

**Questa e' la sezione PIU' CRITICA e COMPLESSA del bot.**

#### Paginazione dropdown varianti:
1. **Riga 3962-3964:** Init: `rowSelected = false`, `currentPage = 1`, `maxPages = 10`
2. **Riga 3992:** `while (!rowSelected && currentPage <= maxPages)`

#### Per ogni pagina:
3. **Riga 3995-4103:** Snapshot DOM:
   - Cerca container dropdown attivo (`[id*="_DDD"]` o popup DX)
   - Estrae header (da `table[id*="DXHeaderTable"]`)
   - Estrae righe visibili (`tr[class*="dxgvDataRow"]`)
   - Ritorna `{ containerId, headerTexts, rows, rowsCount }`
4. **Riga 4105-4118:** Matching variante:
   - `computeVariantHeaderIndices(headerTexts)` - Trova colonne Contenuto/Pacco/Multiplo
   - `buildVariantCandidates(rows, headerIndices, { variantId, variantSuffix, packageContent, multipleQty })`
   - `chooseBestVariantCandidate(candidates)` - Scoring: fullIdMatch(10k) > suffix(1k) > package(600) > multiple(400)

#### Se variante trovata:
5. **Riga 4141-4231:** Gestione keyboard state:
   - Rileva indice riga focused (`dxgvFocusedRow|dxgvSelectedRow`)
   - Focus input INVENTTABLE se ancora visibile
6. **Riga 4257-4269:** Navigazione con frecce:
   - Calcola delta tra riga focused e target
   - Loop `ArrowDown/ArrowUp` con wait 30ms per step
7. **Riga 4272:** `keyboard.press("Tab")` - Autoseleziona campo quantita

#### Quantita (righe 4275-4309):
8. **Riga 4275-4278:** Legge quantita attuale dal campo focused
9. **Riga 4286-4304:** Se diversa dal target:
   - Formatta con virgola (italiano): `targetQty.toString().replace(".", ",")`
   - `keyboard.type(qtyFormatted, { delay: 30 })`
   - `waitForDevExpressIdle({ timeout: 5000 })`

#### Sconto riga (righe 4312-4331):
10. **Riga 4312-4313:** Se `item.discount > 0`:
    - `keyboard.press("Tab")` + wait 100ms
    - `keyboard.type(discountFormatted, { delay: 30 })`
    - Wait 200ms

#### Click "Update" (righe 4333-4391):
11. **Riga 4336-4341:** `clickDevExpressGridCommand({ command: "UpdateEdit" })`
12. **Riga 4343-4381:** Fallback: cerca `a[data-args*="UpdateEdit"]` o `img[title="Update"]`
13. **Riga 4387-4391:** `waitForDevExpressIdle({ timeout: 4000 })` + wait 200ms

#### Se variante NON trovata nella pagina corrente:
14. **Riga 4465-4508:** Cerca "Next page":
    - **Strategia 1:** `img[alt="Next"]` o `className.includes("pNext")`
    - **Strategia 2:** `a.dxp-button` con onclick contenente `'PBN'`
    - Verifica non disabled (`dxp-disabled`)
15. **Riga 4516-4520:** `waitForDevExpressIdle` + incrementa `currentPage`

#### Se variante MAI trovata:
16. **Riga 4523-4531:** Screenshot + throw Error dettagliato

---

### 9e. STEP 5.8: "New" per Articolo Successivo (righe 4553-4869)

**Operazione:** `runOp("order.item.{i}.click_new_for_next", ..., "multi-article-navigation")`

**Condizione:** `if (i < orderData.items.length - 1)` **<-- BUG: dovrebbe essere `itemsToOrder.length - 1`**

#### Sequenza:
1. **Riga 4562-4576:** Attende chiusura edit row precedente (timeout 3s): `tr[id*="editnew"]` non visibile
2. **Riga 4579-4584:** **Tentativo 1:** `clickDevExpressGridCommand({ command: "AddNew" })`
3. **Riga 4595-4634:** **Tentativo 2:** Click diretto `a[data-args*="AddNew"]` o `a[id*="DXCBtn1"]`
4. **Riga 4642-4654:** **Tentativo 3:** `clickDevExpressGridCommand({ command: "NewEdit" })`
5. **Riga 4662-4697:** **Tentativo 4:** Attende disapparsa/ricomparsa bottone "AddNew"
6. **Riga 4704-4826:** **Tentativo 5 (manuale):**
   - Cerca `DXCBtn1` prima, poi `DXCBtn0`, poi `img[title="New"]`
   - Click con `scrollIntoView` + wait 300ms + click
7. **Riga 4837-4862:** Attende comparsa nuova riga edit (timeout 3s)
8. **Riga 4864:** `waitForDevExpressReady({ timeout: 3000 })`

---

## FASE 10: ESTRAZIONE ID ORDINE

### File: `archibald-bot.ts` (righe 4940-4996)

**Operazione:** `runOp("order.extract_id", ..., "form.submit")`

1. **Riga 4943-4951:** Cerca `ObjectKey=` nell'URL corrente
2. **Riga 4955-4976:** Cerca nel DOM:
   - Input con ID contenente `dviID_` o `SALESID_`
   - Valore non vuoto e diverso da "0"
3. **Riga 4992-4993:** Fallback: `ORDER-{timestamp}`

---

## FASE 11: SCONTO LINEA N/A

### File: `archibald-bot.ts` (righe 4998-5045)

**Operazione:** `runOp("order.apply_line_discount", ..., "form.discount")`

1. **Riga 5002:** Apre tab "Prezzi e sconti"
2. **Riga 5005-5007:** Se tab aperto: wait 1500ms
3. **Riga 5012-5013:** Trova dropdown: `td[id*="LINEDISC_Edit_dropdown_DD_B-1"]`
4. **Riga 5020:** Click dropdown
5. **Riga 5024-5027:** `waitForDevExpressIdle`
6. **Riga 5030-5034:** `ArrowUp` + `Tab` per selezionare N/A
7. **Riga 5037-5040:** `waitForDevExpressIdle`

---

## FASE 12: SCONTO GLOBALE

### File: `archibald-bot.ts` (righe 5047-5096)

**Operazione:** `runOp("order.apply_global_discount", ..., "form.discount")`

**Condizione:** `discountPercent > 0`

1. **Riga 5057-5063:** Apre tab Prezzi e Sconti se non gia aperto
2. **Riga 5069-5074:** Formatta e digita percentuale (`delay: 50ms`)
3. **Riga 5080:** `keyboard.press("Tab")` per confermare
4. **Riga 5083-5086:** `waitForDevExpressIdle`

**Emit progress:** `"form.discount"` -> 80%

---

## FASE 13: SALVA E CHIUDI

### File: `archibald-bot.ts` (righe 5101-5183)

**Operazione:** `runOp("order.save_and_close", ..., "form.submit")`

1. **Riga 5106-5118:** **Tentativo diretto:** `clickElementByText("Salva e chiudi")`
2. **Riga 5123-5158:** **Fallback dropdown:**
   - Cerca "Salvare" nel DOM
   - Cerca `div.dxm-popOut` nel parent `<li>`
   - Cerca `img[id*="_B-1"]` (freccia dropdown)
   - Click fallback sul bottone stesso
3. **Riga 5165:** Slowdown `click_salvare_dropdown`
4. **Riga 5168-5174:** Click "Salva e chiudi" nel dropdown
5. **Riga 5180:** Slowdown `click_salva_chiudi`

**Emit progress:** `"form.submit.start"` -> 90%, `"form.submit.complete"` -> 100%

---

## FASE 14: POST-CREAZIONE

### File: `archibald-bot.ts` (righe 5185-5217)

1. **Riga 5190:** `writeOperationReport()` - Genera report performance
2. **Riga 5192:** Return `orderId`
3. **In caso di errore (5193-5217):**
   - Screenshot: `logs/order-error-{timestamp}.png`
   - Scrive report operazioni comunque
   - Re-throw errore

---

## UTILITY METHODS CRITICI

### `waitForDevExpressReady` (riga 1217)
- Attende che la pagina non abbia loading overlay
- Attende che `document.readyState === "complete"`

### `waitForDevExpressIdle` (riga 1251)
- Polling loop che verifica:
  - Nessun loading panel visibile
  - Nessun controllo DevExpress in callback (`InCallback()`)
  - Stabilizzazione: richiede N poll consecutivi "idle"

### `clickDevExpressGridCommand` (riga 1779)
- Cerca comandi griglia per `data-args` (es. "AddNew", "UpdateEdit")
- Multi-strategia: data-args -> img -> generico
- Gestisce scrollIntoView + click sequence completa

### `pasteText` (riga 910)
- Triple click per selezionare tutto
- Set `value` direttamente
- Dispatch `input` + `change` + `keyup` events

### `getSlowdown` (riga 733)
- Config per step: `slowdownConfig[stepName] ?? 200`
- Default: 200ms tra ogni step

---

## PROBLEMI NOTI E PUNTI CRITICI

### 1. PAGINAZIONE GRIGLIA ORDINE (20 righe per pagina)
**Problema segnalato dall'utente:** Dopo 20 righe di articoli, Archibald cambia pagina.
**Stato attuale:** Il codice NON gestisce la paginazione della griglia "Linee di vendita".
- La navigazione Tab incrementale (riga 3753) NON funziona se le righe sono su pagina 2+
- Il click su `tr[id*="editnew"]` (riga 3690) potrebbe non trovare la riga se su pagina diversa
- La formula Tab `4 * (i + 1)` (riga 3753) diventa enorme e inaffidabile dopo 20 articoli
- Il bottone "New" (AddNew) potrebbe comportarsi diversamente su pagina 2+

### 2. BUG: Condizione New riga successiva
**File:** `archibald-bot.ts`, **riga 4554**
```typescript
if (i < orderData.items.length - 1)  // USA orderData.items (include warehouse-only)
```
**Dovrebbe essere:**
```typescript
if (i < itemsToOrder.length - 1)     // USA itemsToOrder (solo articoli da ordinare)
```

### 3. Wait fissi residui
- Riga 3348: `wait(1000)` prima di cercare bottone New
- Riga 5006: `wait(1500)` dopo apertura tab Prezzi e sconti
- Riga 5062: `wait(1500)` duplicato
- Riga 2177: `wait(2000)` post-login

### 4. Slowdown default troppo alto in dev
- `config.puppeteer.slowMo: 200ms` in dev (riga 24 config.ts)
- `getSlowdown` default: 200ms per ogni step

### 5. Formula Tab fallback fragile
- Riga 3753: `tabCount = i === 0 ? 3 : 4 * (i + 1)`
- Per 20 articoli: 80 Tab!
- Dopo paginazione griglia: completamente inaffidabile

---

## MAPPA PROGRESS MILESTONES

| Categoria | % | Label |
|-----------|---|-------|
| `navigation.ordini` | 10% | Apertura sezione ordini |
| `form.customer` | 25% | Inserimento cliente |
| `form.articles.start` | 35% | Inizio inserimento articoli |
| `form.articles.progress` | 35-70% | Inserimento articolo X di Y |
| `form.articles.complete` | 70% | Articoli inseriti |
| `form.discount` | 80% | Applicazione sconto globale |
| `form.submit.start` | 90% | Salvataggio ordine in corso |
| `form.submit.complete` | 100% | Ordine salvato con successo |

---

## CONFIGURAZIONE PERFORMANCE

| Parametro | Dev | Prod |
|-----------|-----|------|
| `headless` | false | true |
| `slowMo` | 200ms | 50ms |
| `timeout` | 60s | 60s |
| `protocolTimeout` | 180s | 180s |
| `viewport` | 1280x800 | 1280x800 |
| `getSlowdown` default | 200ms | 200ms |

---

*Documento generato per analisi del flusso di creazione ordine Archibald Bot*
*Ultimo aggiornamento: 2026-02-07*
