# Customer Form & Bot Fixes — Design Spec

**Data**: 2026-03-25
**Scope**: Fix 4 bug critici nella creazione/modifica cliente (frontend + bot)

---

## Contesto

Durante una modifica interattiva del cliente "Dr. Elio Verace Centro Medico" (ID 55.041)
il bot ha prodotto dati corrotti in Archibald ERP:

- Nome raddoppiato: `"Dr. Elio Verace Centro MedicoDr. Elio Verace Centro Medico"`
- Via troncata: `"e Garibaldi, 7"` invece di `"Corso Giuseppe Garibaldi, 7"`
- NAMEALIAS troncato senza gestione del maxLength
- URL compilato con valore residuo dal DB (`"r. Elio Verace Centro Medico"`) senza che
  l'utente potesse vedere o correggere il campo

---

## Bug 1 & 2 — `typeDevExpressField` provoca raddoppio/troncamento

### Causa radice

Nel codice attuale (linee ~9995–10036) la sequenza è:

```
page.evaluate {
  find + focus + select
  clear via native setter
  dispatchEvent("input")   ← triggera XHR DevExpress che ripristina il valore
  return inputId
}
waitForDevExpressIdle      ← aspetta la XHR: al termine il campo è tornato al valore originale
page.type(value)           ← appende al valore ripristinato → raddoppio
```

Il `dispatchEvent(new Event("input", { bubbles: true }))` segnala a DevExpress che il
campo è cambiato. DevExpress risponde con una callback server-side che reinserisce il
valore originale. `waitForDevExpressIdle` aspetta esattamente questa XHR. Al termine,
il campo non è vuoto ma ha il valore originale, e `page.type()` ci appende sopra.

La struttura del `page.evaluate` → `waitForDevExpressIdle` → `page.type` è già
nell'ordine corretto. L'unica modifica necessaria è **rimuovere il `dispatchEvent`**
dal blocco `page.evaluate`.

### Fix — path principale (linea ~10015)

Rimuovere la riga:
```typescript
input.dispatchEvent(new Event("input", { bubbles: true }));
```
dal blocco `page.evaluate` all'interno di `typeDevExpressField`. Senza `dispatchEvent`,
DevExpress non triggera la XHR di ripristino, e `page.type()` scrive su un campo vuoto.
I real keyboard events di `page.type()` (keydown/keypress/keyup/input per ogni carattere)
sono sufficienti perché DevExpress commmiti il valore al server model su Tab.

### Fix — path retry (linea ~10069)

Il blocco retry interno a `typeDevExpressField` (linee ~10056–10079) contiene lo stesso
pattern: clear via native setter + `dispatchEvent`. Rimuovere anche qui il `dispatchEvent`.
Inoltre, nel retry usare `effectiveValue` (valore troncato al maxLength) sia per il
`page.type` che per il confronto finale, in coerenza con il path principale.

### Verifica maxLength-aware

Nella stessa `page.evaluate` iniziale, leggere `input.maxLength` insieme all'`inputId`:

```typescript
const result = await this.page.evaluate((regex: string) => {
  // ... find input ...
  return { id: input.id, maxLength: input.maxLength ?? 0 };
}, fieldRegex.source);
const effectiveValue = result.maxLength > 0
  ? value.substring(0, result.maxLength)
  : value;
```

Usare `effectiveValue` (non `value`) sia per il `page.type()` che per il confronto
finale. Questo evita retry inutili su campi con limite di caratteri (es. NAMEALIAS
a 20 char). Lo stesso pattern è già implementato in `ensureNameFieldBeforeSave`
(linea ~11062) ed è comprovato in produzione.

### File coinvolti

- `archibald-web-app/backend/src/bot/archibald-bot.ts`
  - Funzione `typeDevExpressField` (linea ~9986): rimozione `dispatchEvent` nel path
    principale e nel retry; lettura `maxLength`; uso di `effectiveValue`

---

## Fix correlato — `ensureNameFieldBeforeSave`

`ensureNameFieldBeforeSave` (linea ~11052) contiene lo stesso pattern buggy: clear via
native setter + `dispatchEvent("input")` (linea ~11095), poi `page.type`. Questo
significa che anche il re-type di NAME eseguito prima del salvataggio può incorrere nel
medesimo raddoppio.

**Fix**: rimuovere il `dispatchEvent` anche in `ensureNameFieldBeforeSave`, lasciando
solo il clear via native setter. Il `maxLength` è già gestito correttamente in questa
funzione (linea ~11062) — nessuna modifica necessaria per quella parte.

### File coinvolti

- `archibald-web-app/backend/src/bot/archibald-bot.ts`
  - Funzione `ensureNameFieldBeforeSave` (linea ~11052): rimozione `dispatchEvent`

---

## Bug 3 — NAMEALIAS / SEARCHNAME su form di modifica

### Comportamento ERP

- Su **creazione**: Archibald auto-genera NAMEALIAS quando NAME perde il focus (Tab).
  Il bot non deve scriverlo esplicitamente.
- Su **modifica**: l'auto-generazione non scatta. Il bot scrive NAMEALIAS
  esplicitamente tramite `updateCustomerName`.

### Flow corretto (dopo fix 1 & 2)

`updateCustomerName` implementa già la sequenza corretta:

1. `typeDevExpressField(NAME_regex, newName)` → Tab → loading DevExpress parte
2. `waitForDevExpressIdle` interno a `typeDevExpressField` → loading completato
3. `typeDevExpressField(SEARCHNAME_regex, newName)` → clear (senza dispatchEvent) →
   retype → Tab → idle

Con il fix 1 & 2 applicato il campo SEARCHNAME viene cancellato e riscritto
correttamente. La verifica maxLength-aware evita il falso mismatch dovuto al limite di
20 caratteri del campo NAMEALIAS in Archibald.

**Nessuna modifica al flow di `updateCustomerName`**: il fix 3 è una conseguenza
diretta del fix 1 & 2.

### File coinvolti

- `archibald-web-app/backend/src/bot/archibald-bot.ts`
  - Funzione `typeDevExpressField` (fix condiviso con bug 1 & 2)

---

## Bug 4 — Campi `mobile` e `url` invisibili nel form cliente

### Problema

`CustomerCreateModal` pre-popola `url` e `mobile` da `customer.url` e `customer.mobile`
(linea ~111) ma non li mostra come input nel form (`FIELDS_BEFORE_ADDRESS_QUESTION` non
li contiene). L'utente non vede né può correggere questi valori. Al submit, i valori
residui del DB vengono inviati al backend e scritti in Archibald ERP senza che l'utente
ne sia consapevole.

### Fix

Aggiungere `mobile` e `url` a `FIELDS_BEFORE_ADDRESS_QUESTION` come campi visibili:

| Campo | Posizione | Label | Placeholder | Tipo |
|-------|-----------|-------|-------------|------|
| `mobile` | dopo `phone` | Cellulare | +39 333 000 0000 | tel |
| `url` | dopo `email` | Sito web / URL | https://... | url |

Entrambi i campi:
- Su **creazione**: partono vuoti (o `"+39"` per mobile) — l'utente decide se compilarli
- Su **modifica**: mostrano il valore esistente dal DB — l'utente può correggerli o
  svuotarli prima di salvare

Nota: `lineDiscount` è anch'esso presente in `CustomerFormData` e nel `saveSchema` ma
non è in `FIELDS_BEFORE_ADDRESS_QUESTION` — è intenzionale, perché è gestito da un
percorso UI dedicato nella tab "Prezzi e sconti" del bot. Non è in scope di questo fix.

### Nessuna modifica al backend

Il backend riceve già `mobile` e `url` come campi opzionali nel `saveSchema` e li
scrive correttamente. Nessuna modifica necessaria lato server.

### File coinvolti

- `archibald-web-app/frontend/src/components/CustomerCreateModal.tsx`
  - Array `FIELDS_BEFORE_ADDRESS_QUESTION`: aggiunta entry `mobile` dopo `phone`
    e `url` dopo `email`

---

## Scope e confini

### In scope

- Rimozione `dispatchEvent` da `typeDevExpressField` (path principale + retry)
- Lettura `maxLength` e uso di `effectiveValue` in `typeDevExpressField`
- Rimozione `dispatchEvent` da `ensureNameFieldBeforeSave`
- Aggiunta `mobile` e `url` a `FIELDS_BEFORE_ADDRESS_QUESTION`

### Fuori scope

- Correzione dei dati corrotti già presenti in produzione per il cliente 55.041
- Refactoring di altre funzioni del bot
- Modifiche al DB schema o alle migration
- Campo `lineDiscount` (gestito separatamente)

---

## Test

### Backend — `typeDevExpressField`

Aggiungere test in `archibald-bot-customer.spec.ts` usando `(bot as any).methodName`
per accedere ai metodi privati (pattern già usato nel file esistente):

1. **No doubling**: mockare `page.evaluate` per restituire `inputId` e `maxLength = 0`;
   mockare `page.type` per tracciare le chiamate. Verificare che `page.type` riceva
   il valore esatto e non un valore doppio.
2. **maxLength truncation**: con `maxLength = 20` e un valore di 29 char, verificare
   che `page.type` riceva `value.substring(0, 20)` e che non ci sia log di mismatch.
3. **Retry usa effectiveValue**: simulare mismatch al primo tentativo; verificare che
   il retry passi `effectiveValue` (troncato) e non `value` grezzo.

### Frontend — `CustomerCreateModal`

Verificare che in modalità edit i campi `mobile` e `url` siano presenti nel DOM e
pre-valorizzati con i dati del cliente esistente.
