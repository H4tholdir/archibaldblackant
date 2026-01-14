# Bot Operations & SlowMo Analysis

**Obiettivo**: Mappatura atomica di TUTTE le operazioni del bot con ottimizzazione granulare dello slowMo per massimizzare velocità mantenendo affidabilità.

## Come Funziona slowMo

### Definizione
`slowMo` è un parametro di Puppeteer che introduce un delay **dopo OGNI operazione** di interazione con la pagina.

### Operazioni Affette da slowMo
Lo slowMo aggiunge delay **SOLO** a queste operazioni:
- ✅ `page.click()` - Click su elementi
- ✅ `page.type()` - Digitazione testo
- ✅ `page.keyboard.press()` - Pressione tasti
- ✅ `page.keyboard.down()` / `page.keyboard.up()` - Tasti modificatori
- ✅ `page.mouse.click()` - Click coordinate mouse
- ❌ `page.goto()` - **NON affetto** (ha proprio timeout)
- ❌ `page.waitForSelector()` - **NON affetto** (ha proprio timeout)
- ❌ `page.evaluate()` - **NON affetto** (esegue JS nel browser)
- ❌ `page.$()` / `page.$$()` - **NON affetto** (query DOM)

### Configurazione Attuale
```typescript
// config.ts
puppeteer: {
  slowMo: 200, // GLOBALE - applicato a TUTTE le operazioni
}
```

**Problema**: Valore fisso globale = non ottimale
- Operazioni semplici (Tab, Enter) non servono 200ms
- Operazioni DevExpress complesse potrebbero servire >200ms

---

## Mappatura Completa Operazioni Bot

### 1. INIZIALIZZAZIONE (0 slowMo operations)

#### 1.1 Creazione Browser
```typescript
puppeteer.launch({
  headless: false,
  slowMo: 200,  // ← VALORE GLOBALE APPLICATO
  args: [...],
  defaultViewport: { width: 1280, height: 800 }
})
```
**Operazioni**: `launch()` - NON affetto da slowMo

#### 1.2 Creazione Pagina
```typescript
await browser.newPage()
await page.setViewport(...)
```
**Operazioni**: `newPage()`, `setViewport()` - NON affetti da slowMo

---

### 2. LOGIN (9 slowMo operations = 1.8s overhead)

#### 2.1 Navigazione a Login Page
```typescript
await page.goto(loginUrl, { waitUntil: 'networkidle2' })
```
**SlowMo Impact**: ❌ ZERO (goto ha proprio timeout)

#### 2.2 Input Username
```typescript
await page.click(usernameSelector, { clickCount: 3 })  // +200ms
await page.keyboard.press('Backspace')                 // +200ms
await page.type(usernameSelector, username, { delay: 50 }) // +200ms + (50ms * len)
```
**SlowMo Impact**: ✅ 600ms + typing delay
**Ottimizzazione Possibile**:
- click: 100ms sufficiente (semplice triple-click)
- Backspace: 50ms sufficiente
- type: 50ms delay già ottimale

#### 2.3 Input Password
```typescript
await page.click(passwordSelector, { clickCount: 3 })  // +200ms
await page.keyboard.press('Backspace')                 // +200ms
await page.type(passwordSelector, password, { delay: 50 }) // +200ms + typing
```
**SlowMo Impact**: ✅ 600ms + typing delay

#### 2.4 Submit Form
```typescript
// Tentativo 1: Click button
await page.evaluate(() => loginButton.click())  // JS eval - no slowMo

// Tentativo 2: Press Enter
await page.keyboard.press('Enter')              // +200ms
```
**SlowMo Impact**: ✅ 200ms

#### 2.5 Wait Navigation
```typescript
await page.waitForNavigation({ waitUntil: 'networkidle2' })
```
**SlowMo Impact**: ❌ ZERO

**LOGIN TOTALE slowMo**: ~1.8s overhead

---

### 3. NAVIGAZIONE A ORDINI (0 slowMo operations)

```typescript
await page.goto(`${config.archibald.url}/`, ...)        // No slowMo
await page.goto(`${url}/CUSTINVOICEJOUR_ListView/`, ...) // No slowMo
await page.waitForSelector('#ribbon-menu', ...)         // No slowMo
```
**SlowMo Impact**: ❌ ZERO

---

### 4. APERTURA FORM ORDINE (1 slowMo operation = 200ms)

#### 4.1 Click "Ordini" Menu
```typescript
await page.evaluate(() => {
  const ordiniButton = findButtonByText('Ordini')
  ordiniButton?.click()  // JS click - no slowMo
})
```
**SlowMo Impact**: ❌ ZERO (JS evaluation)

#### 4.2 Click "Nuovo" Ribbon
```typescript
await page.evaluate(() => {
  const nuovoButton = findButtonByText('Nuovo')
  nuovoButton?.click()  // JS click - no slowMo
})
```
**SlowMo Impact**: ❌ ZERO

#### 4.3 Wait Form Load
```typescript
await page.waitForSelector('.form-container', ...)
```
**SlowMo Impact**: ❌ ZERO

**APERTURA FORM TOTALE slowMo**: 0ms (tutte operazioni JS/wait)

---

### 5. SELEZIONE CLIENTE (CRITICAL PATH - 12-20s duration)

#### 5.1 Detect "Profilo cliente" Dropdown
```typescript
await page.evaluate(() => {
  const inputs = document.querySelectorAll('input[type="text"]')
  return inputs.find(el => el.labels?.textContent === 'Profilo cliente')
})
```
**SlowMo Impact**: ❌ ZERO (JS query)

#### 5.2 Click Customer Dropdown (CRITICO!)
```typescript
// Approccio 1: Direct handle click
const handle = await page.$(selector)
await handle.click()                               // +200ms

// Approccio 2: Evaluate click
await page.evaluate(() => element.click())         // No slowMo

// Approccio 3: Keyboard (Alt+Down or F4)
await page.keyboard.down('Alt')                    // +200ms
await page.keyboard.press('ArrowDown')             // +200ms
await page.keyboard.up('Alt')                      // +200ms
```
**SlowMo Impact**: ✅ 200-600ms (dipende da approccio)
**Ottimizzazione**: Evaluate click = 0ms overhead

#### 5.3 Wait Dropdown Open
```typescript
await page.waitForSelector('#dropdown_DDD', ...)
```
**SlowMo Impact**: ❌ ZERO

#### 5.4 Type Customer Search Query
```typescript
await page.keyboard.down('Control')                // +200ms
await page.keyboard.press('A')                     // +200ms
await page.keyboard.up('Control')                  // +200ms
await page.keyboard.press('Backspace')             // +200ms

await page.type(selector, customerQuery, { delay: 50 }) // +200ms + typing
```
**SlowMo Impact**: ✅ 1000ms + typing delay
**Ottimizzazione Possibile**:
- Ctrl+A: 50ms sufficiente (semplice combinazione)
- Backspace: 50ms sufficiente
- Type: delay 50ms già ottimale

#### 5.5 Wait Search Results (BOTTLENECK!)
```typescript
await page.waitForFunction(
  (selector) => {
    const rows = document.querySelectorAll(`${selector} tr`)
    return rows.length > 0 && !rows[0].textContent.includes('Loading')
  },
  { timeout: 10000 }
)
```
**SlowMo Impact**: ❌ ZERO (attesa DOM rendering)
**NOTA**: Questo è il vero bottleneck (5-15s), NON slowMo

#### 5.6 Select First Result (Tab + Enter)
```typescript
await page.keyboard.press('Enter')                 // +200ms
await page.keyboard.press('Tab')                   // +200ms
```
**SlowMo Impact**: ✅ 400ms
**Ottimizzazione**: 50-100ms sufficiente

**SELEZIONE CLIENTE TOTALE slowMo**: ~2-2.5s overhead
**SELEZIONE CLIENTE TOTALE REALE**: 12-20s (di cui 10-18s waitForFunction)

---

### 6. SELEZIONE ARTICOLO (PER OGNI ARTICOLO)

#### 6.1 Click Plus Button (Aggiungi Riga)
```typescript
await page.evaluate(() => {
  const plusButton = findButtonByText('+')
  plusButton?.click()  // JS click
})
```
**SlowMo Impact**: ❌ ZERO

#### 6.2 Detect Article Input
```typescript
await page.evaluate(() => {
  const inputs = document.querySelectorAll('input')
  return inputs.find(el => el.id.includes('INVENTTABLE'))
})
```
**SlowMo Impact**: ❌ ZERO

#### 6.3 Open Article Dropdown
```typescript
// Stesso pattern di customer dropdown
await page.keyboard.down('Alt')                    // +200ms
await page.keyboard.press('ArrowDown')             // +200ms
await page.keyboard.up('Alt')                      // +200ms
```
**SlowMo Impact**: ✅ 600ms

#### 6.4 Type Article Code
```typescript
await page.keyboard.down('Control')                // +200ms
await page.keyboard.press('A')                     // +200ms
await page.keyboard.up('Control')                  // +200ms
await page.keyboard.press('Backspace')             // +200ms

await page.type(selector, articleCode, { delay: 50 }) // +200ms + typing
```
**SlowMo Impact**: ✅ 1000ms + typing

#### 6.5 Wait Article Results
```typescript
await page.waitForFunction(...)  // 3-8s DOM rendering
```
**SlowMo Impact**: ❌ ZERO

#### 6.6 Select Article (Enter + Tab)
```typescript
await page.keyboard.press('Enter')                 // +200ms
await page.keyboard.press('Tab')                   // +200ms
```
**SlowMo Impact**: ✅ 400ms

**SELEZIONE ARTICOLO TOTALE slowMo**: ~2.6s per articolo
**SELEZIONE ARTICOLO TOTALE REALE**: 8-12s (di cui 5-9s waitForFunction)

---

### 7. IMPOSTAZIONE QUANTITÀ

#### 7.1 Clear Quantity Field
```typescript
await page.keyboard.down('Control')                // +200ms
await page.keyboard.press('A')                     // +200ms
await page.keyboard.up('Control')                  // +200ms
await page.keyboard.press('Backspace')             // +200ms
```
**SlowMo Impact**: ✅ 800ms
**Ottimizzazione**: 50ms per operazione = 200ms totale

#### 7.2 Type Quantity
```typescript
await page.keyboard.press('Enter')                 // +200ms
await page.keyboard.press('Tab')                   // +200ms
```
**SlowMo Impact**: ✅ 400ms

**QUANTITÀ TOTALE slowMo**: ~1.2s

---

### 8. UPDATE BUTTON (Multi-Articolo)

```typescript
await page.evaluate(() => {
  const updateButton = findButtonByText('Update')
  updateButton?.click()  // JS click
})
```
**SlowMo Impact**: ❌ ZERO

---

### 9. SALVATAGGIO FINALE (2 slowMo operations = 400ms)

#### 9.1 Click "Salvare" (Alt+S)
```typescript
await page.keyboard.down('Alt')                    // +200ms
await page.keyboard.press('S')                     // +200ms
await page.keyboard.up('Alt')                      // +200ms
```
**SlowMo Impact**: ✅ 600ms

#### 9.2 Click "Salva e chiudi"
```typescript
await page.evaluate(() => {
  const button = findButtonByText('Salva e chiudi')
  button?.click()  // JS click
})
```
**SlowMo Impact**: ❌ ZERO

#### 9.3 Wait Navigation
```typescript
await page.waitForNavigation(...)
```
**SlowMo Impact**: ❌ ZERO

**SALVATAGGIO TOTALE slowMo**: ~600ms

---

## TOTALE slowMo Overhead per Ordine Singolo

### Breakdown
| Fase | SlowMo Overhead | Durata Reale |
|------|----------------|--------------|
| Login | ~1.8s | ~60-75s |
| Navigazione | 0s | ~2-3s |
| Apertura Form | 0s | ~1-2s |
| **Selezione Cliente** | **~2.5s** | **12-20s** |
| **Selezione Articolo** | **~2.6s** | **8-12s** |
| Quantità | ~1.2s | ~2s |
| Update Button | 0s | ~1s |
| Salvataggio | ~0.6s | ~3-5s |

### Totale (1 articolo)
- **SlowMo Overhead**: ~8.7s
- **Durata Reale Totale**: ~75-90s
- **Percentuale slowMo**: ~10-12% del tempo totale

### Multi-Articolo (3 articoli)
- **SlowMo Overhead**: ~8.7s + (2.6s × 2 extra) = ~13.9s
- **Durata Reale Totale**: ~90-110s
- **Percentuale slowMo**: ~12-15%

---

## Strategia di Ottimizzazione Granulare

### Approccio 1: SlowMo Per-Operation (IDEALE)

Invece di `slowMo` globale, implementare delay granulare per operazione:

```typescript
// Nuova interfaccia
interface OperationDelays {
  // Input operations
  click: number;
  type: number;

  // Keyboard operations
  keyPress: number;
  keyDown: number;
  keyUp: number;

  // DevExpress-specific
  devExpressDropdownOpen: number;
  devExpressWaitAfterSelect: number;
}

const optimizedDelays: OperationDelays = {
  // Clicks semplici
  click: 50,  // vs 200ms attuale = -75% tempo

  // Typing (già ottimale con delay: 50)
  type: 50,

  // Keyboard semplice
  keyPress: 50,  // Tab, Enter, Backspace
  keyDown: 50,   // Ctrl, Alt
  keyUp: 50,

  // DevExpress critici
  devExpressDropdownOpen: 300,  // Serve tempo per rendering
  devExpressWaitAfterSelect: 200,  // Grid refresh
};
```

### Implementazione

#### Opzione A: Wrapper Functions (RACCOMANDATO)
```typescript
class ArchibaldBot {
  private delays: OperationDelays;

  async clickWithDelay(selector: string, delay?: number) {
    await this.page.click(selector);
    await new Promise(r => setTimeout(r, delay ?? this.delays.click));
  }

  async keyPressWithDelay(key: string, delay?: number) {
    await this.page.keyboard.press(key);
    await new Promise(r => setTimeout(r, delay ?? this.delays.keyPress));
  }

  async typeWithDelay(selector: string, text: string, delay?: number) {
    await this.page.type(selector, text, {
      delay: delay ?? this.delays.type
    });
  }
}
```

**Vantaggio**:
- Controllo granulare per operazione
- Possiamo override per casi speciali
- SlowMo globale = 0 (nessun overhead nascosto)

#### Opzione B: SlowMo Dinamico (PIÙ SEMPLICE ma MENO GRANULARE)
```typescript
async setSlowMo(value: number) {
  // Puppeteer non supporta cambio runtime
  // Serve ricreare browser 😞
}
```

**Problema**: Puppeteer slowMo è fisso al launch, non modificabile runtime.

---

### Approccio 2: Profiling Prima + Ottimizzazione Dopo

#### Step 1: Profiling Dettagliato con slowMo=0
```typescript
puppeteer.launch({ slowMo: 0 })  // NESSUN delay

// Profila per vedere dove fallisce
```

#### Step 2: Aggiungere Delay Solo Dove Serve
```typescript
// Esempio: Dropdown DevExpress serve delay
await page.keyboard.press('ArrowDown');
await new Promise(r => setTimeout(r, 300));  // DevExpress rendering
```

---

## Raccomandazioni Immediate

### Quick Wins (Implementabili Subito)

#### 1. Ridurre slowMo Globale
```typescript
// config.ts
puppeteer: {
  slowMo: 50,  // vs 200ms = -75% overhead
}
```

**Impatto Stimato**:
- Overhead da 8.7s → 2.2s (-6.5s)
- Ordine da 75s → 68.5s (**-9% tempo totale**)

**Rischio**: Medio (DevExpress potrebbe non reggere)

#### 2. Wrapper con Delay Selettivo
```typescript
// Sostituisci tutti keyboard.press con:
await this.smartKeyPress(key, options)

smartKeyPress(key, options = {}) {
  const delay = options.devExpress ? 200 : 50;
  await page.keyboard.press(key);
  if (delay > 0) await new Promise(r => setTimeout(r, delay));
}
```

**Impatto**: Ottimale, sicuro

#### 3. Eliminare slowMo per JS Evaluation
```typescript
// Invece di:
await page.click(selector);  // +200ms slowMo

// Usare:
await page.evaluate((sel) => {
  document.querySelector(sel).click();
}, selector);  // 0ms slowMo
```

**Impatto**: -200ms per click = -1.2s per ordine

---

## Prossimi Passi Raccomandati

### Fase 1: Profiling Zero-SlowMo
1. Imposta `slowMo: 0`
2. Esegui 3 ordini test
3. Identifica ESATTAMENTE dove fallisce

### Fase 2: Delay Granulare
1. Implementa wrapper functions
2. Delay minimo (50ms) di default
3. Override solo per DevExpress critici (200-300ms)

### Fase 3: A/B Testing
1. Baseline: slowMo=200 (75s)
2. Test A: slowMo=50 (68s target)
3. Test B: slowMo=0 + selective delays (60s target)

### Target Performance
- **Attuale**: ~75s (slowMo=200)
- **Quick Win**: ~68s (slowMo=50)
- **Ottimale**: ~60s (slowMo=0 + selective)
- **Miglioramento**: **-20% tempo ordine**

---

## Appendice: Operazioni NON Affette da SlowMo

Queste operazioni NON subiscono overhead da slowMo:

1. **Navigation**
   - `page.goto()`
   - `page.waitForNavigation()`

2. **DOM Queries**
   - `page.$()`
   - `page.$$()`
   - `page.$x()`
   - `page.waitForSelector()`
   - `page.waitForFunction()`

3. **JavaScript Evaluation**
   - `page.evaluate()`
   - `page.evaluateHandle()`

4. **Screenshots**
   - `page.screenshot()`

5. **Network**
   - `page.waitForResponse()`
   - `page.setRequestInterception()`

**INSIGHT CHIAVE**: La maggior parte del tempo bot (~80%) è speso in waitForFunction/waitForSelector (rendering DevExpress), NON in slowMo. Ottimizzare slowMo aiuta ma il vero guadagno è ridurre wait times.
