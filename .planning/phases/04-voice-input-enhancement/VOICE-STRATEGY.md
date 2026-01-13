# Voice Input Strategy - Phase 4

## 🎯 Strategia Parsing: Quantity-First

### Principio Base
L'utente dice la **quantità totale** di pezzi necessari. Il bot seleziona automaticamente la variante ottimale basandosi su validazione matematica dei multipli.

### Esempio
```
🎤 AGENTE: "Cliente Fresis, articolo H129FSQ quantità 10"

🤖 BOT REASONING:
- Trova varianti: K2 (5pz, multipleQty=5), K3 (1pz, multipleQty=1)
- Calcola soluzioni:
  * 10 % 5 = 0 ✓ → 2×K2 (2 confezioni) ← OTTIMALE
  * 10 % 1 = 0 ✓ → 10×K3 (10 confezioni)
- Auto-seleziona: K2 (meno confezioni)

📋 FORM PRE-FILL:
- Cliente: Fresis
- Articolo: H129FSQ.104.023
- Quantità: 10
- Badge: "📦 5 colli (min: 5, multipli di 5)" [K2 auto-selezionato]
```

---

## 🔢 Pattern Critici: Codici Articolo

### Problema
Gli agenti **NON** dicono "punto" tra i numeri. Dicono solo i numeri con pause naturali.

### Pattern Reale
```
❌ NON DICONO: "H71 punto 104 punto 032"
✅ DICONO:      "H71 (pausa) 104 (pausa) 032"
```

### Normalizzazione
```typescript
// Input vocale riconosciuto
"H71 104 032"

// Parser deve normalizzare a
"H71.104.032"

// Algoritmo
1. Identifica pattern: [LETTERE+CIFRE opz.] [SPAZIO] [CIFRE] [SPAZIO] [CIFRE]
2. Sostituisci spazi con punti tra sequenze numeriche
3. Regex: /([A-Z]+\d*)\s+(\d+)\s+(\d+)/gi → '$1.$2.$3'
```

### Casi Edge
| Input Vocale | Normalizzato | Note |
|--------------|--------------|------|
| `"H71 104 032"` | `"H71.104.032"` | Caso standard (più comune) |
| `"TD 1272 314"` | `"TD.1272.314"` | Solo lettere iniziali |
| `"SF 1000"` | `"SF.1000"` | 2 parti invece di 3 |
| `"H250E 104 040"` | `"H250E.104.040"` | Lettera+cifra iniziale |
| `"H71.104 032"` | `"H71.104.032"` | Formato misto |

---

## 📦 Disambiguazione Package: Quando e Come

### Quando Serve
Quando **esistono multiple soluzioni valide** con numero diverso di confezioni.

### Esempio Critico: Quantità 7
```
Articolo H129FSQ disponibile in:
- K2: 5 pezzi per confezione (multipleQty=5)
- K3: 1 pezzo per confezione (multipleQty=1)

Quantità richiesta: 7 pezzi

SOLUZIONI POSSIBILI:
1. 7×K3 = 7 confezioni da 1 pezzo     [7 packages]
2. 1×K2 + 2×K3 = 3 confezioni totali  [3 packages] ← OTTIMALE

→ needsDisambiguation = TRUE
→ Mostra modal con scelta
```

### Algoritmo Decisione
```typescript
function needsDisambiguation(quantity: number, variants: Product[]): boolean {
  // Se solo 1 variante → no disambiguazione
  if (variants.length < 2) return false;

  const large = variants[0];      // Più grande (es. 5pz)
  const small = variants[variants.length - 1]; // Più piccola (es. 1pz)

  // Soluzione single-variant (solo piccolo)
  const singleVariantValid = quantity % small.multipleQty === 0;

  // Soluzione mixed-packages
  const largeCount = Math.floor(quantity / large.multipleQty);
  const remainder = quantity % large.multipleQty;
  const mixedValid = remainder % small.multipleQty === 0 && largeCount > 0;

  // Se entrambe valide → disambiguazione necessaria
  return singleVariantValid && mixedValid;
}
```

### UI Disambiguazione
```
┌─────────────────────────────────────────┐
│ Seleziona Confezione                    │
├─────────────────────────────────────────┤
│ Articolo H129FSQ.104.023                │
│ Quantità: 7 pezzi                       │
│                                         │
│ Scegli il confezionamento preferito:   │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ 📦 3 confezioni totali            │  │
│ │ 1×5pz + 2×1pz  ✓ Raccomandato     │  │ ← Ottimale (meno confezioni)
│ └───────────────────────────────────┘  │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ 📦 7 confezioni totali            │  │
│ │ 7×1pz                             │  │
│ └───────────────────────────────────┘  │
│                                         │
│                    [Annulla]            │
└─────────────────────────────────────────┘
```

---

## 🔄 Workflow Completo

### Flow Chart
```
1. 🎤 DETTATURA
   ↓
   "Cliente Fresis, articolo H71 104 032 quantità 7"
   ↓
2. 🔍 PARSING
   ↓
   - Normalizza: "H71 104 032" → "H71.104.032"
   - Estrae: cliente="Fresis", articolo="H71.104.032", qty=7
   - Confidence scoring
   ↓
3. ✅ VALIDAZIONE
   ↓
   - Fuzzy match cliente contro DB
   - Cerca varianti articolo
   - Calcola package solutions
   ↓
4. ❓ DISAMBIGUAZIONE? (se necessaria)
   ↓
   YES: Mostra modal → User seleziona
   NO: Procedi
   ↓
5. 📝 PRE-FILL FORM
   ↓
   - Popola campi (NON submit)
   - Mostra badge "🎤 voice-populated"
   - Keep modal open
   ↓
6. ✏️ MANUAL EDIT (opzionale)
   ↓
   - User può modificare qualsiasi campo
   - Badge rimosso su edit
   ↓
7. ➕ ADD TO DRAFT
   ↓
   - Click "Add Item"
   - Item → draft list
   - Form cleared per prossimo articolo
   ↓
8. 👆 TAP CONFIRMATION
   ↓
   - Click "Create Order (N items)"
   - Modal conferma con summary
   - Click "Confirm & Submit"
   ↓
9. 🚀 SUBMISSION
```

---

## 🎓 Casi d'Uso Reali

### Caso 1: Ordine Semplice (No Disambiguazione)
```
🎤 INPUT: "Cliente Fresis articolo H129FSQ quantità 10"

🔍 PARSING:
- Cliente: "Fresis" (confidence: 0.95)
- Articolo: "H129FSQ" (confidence: 0.9, assume full code)
- Quantità: 10 (confidence: 1.0)

✅ VALIDAZIONE:
- Fuzzy match: "Fresis" → "FRESIS SRL" (100% match)
- Varianti trovate: K2 (5pz), K3 (1pz)
- Soluzione: 10 % 5 = 0 → 2×K2 (OTTIMALE, unica valida)
- needsDisambiguation: FALSE

📋 RESULT:
- Auto-compila form con K2
- Mostra: "📦 5 colli (min: 5, multipli di 5)"
- User review → Add Item → Confirm
```

### Caso 2: Codice Senza Punto + Disambiguazione
```
🎤 INPUT: "Articolo H71 104 032 quantità 7"

🔍 PARSING:
- Articolo: "H71 104 032" → normalizza a "H71.104.032"
- Quantità: 7

✅ VALIDAZIONE:
- Cerca varianti: K2 (5pz), K3 (1pz)
- Soluzione A: 7×K3 = 7 packages
- Soluzione B: 1×K2 + 2×K3 = 3 packages (OTTIMALE)
- needsDisambiguation: TRUE

❓ DISAMBIGUATION:
- Mostra modal con 2 opzioni
- User seleziona: "📦 3 confezioni (1×5pz + 2×1pz)"

📋 RESULT:
- Pre-compila form con qty=7
- Salva: _selectedPackageSolution per backend
- Backend userà mix K2+K3
```

### Caso 3: Multi-Articolo
```
🎤 INPUT: "Cliente Fresis, articolo SF1000 quantità 5, poi TD1272 quantità 2"

🔍 PARSING:
- Cliente: "Fresis"
- Item 1: SF1000, qty=5
- Item 2: TD1272, qty=2

📋 WORKFLOW:
1. Pre-compila SF1000, qty=5
2. User review → Add Item → draft list
3. Pre-compila TD1272, qty=2
4. User review → Add Item → draft list
5. Click "Create Order (2 items)"
6. Confirmation modal → Confirm & Submit
```

---

## 🛡️ Error Recovery: Gestione Errori Riconoscimento Vocale

### Problema: Voice Recognition Errors

Il riconoscimento vocale può commettere errori su:
1. **Lettere simili foneticamente**: H71 → H61, B vs P, D vs T
2. **Numeri simili**: 023 vs 016, 5 vs 9
3. **Parti mancanti**: "H71 104" invece di "H71.104.032"

### Strategia Multi-Layer Validation

```
Voice Input: "H61 104 032"
     ↓
Normalize: "H61.104.032"
     ↓
Validation (3 layers):
     ↓
┌──────────────────────────────────────┐
│ Layer 1: Exact Match                 │
│ Search: "H61.104.032"                │
│ Result: NOT FOUND                    │
└──────────────────────────────────────┘
     ↓
┌──────────────────────────────────────┐
│ Layer 2: Base Pattern Match          │
│ Extract base: "H61.104"              │
│ Search: "H61.104.*"                  │
│ Result: NOT FOUND (no variants)      │
└──────────────────────────────────────┘
     ↓
┌──────────────────────────────────────┐
│ Layer 3: Fuzzy Match                 │
│ Search similar: fuse.js (30% diff)   │
│ Results:                             │
│   - H71.104.032 (95% similar) ← TOP  │
│   - H61.104.016 (80% similar)        │
│   - H61.105.032 (75% similar)        │
└──────────────────────────────────────┘
     ↓
Show Suggestions Modal
```

### Caso 1: Recognition Error (H71 → H61)

**Scenario:**
```
🎤 AGENTE dice: "H71 104 032"
🤖 SISTEMA sente: "H61 104 032"
```

**Detection:**
```typescript
const validation = await validateArticleCode("H61.104.032", productDb);
// Returns:
{
  matchType: 'fuzzy',
  confidence: 0.5,
  suggestions: [
    { code: "H71.104.032", confidence: 0.95, reason: 'fuzzy_match' },
    { code: "H61.104.016", confidence: 0.80, reason: 'fuzzy_match' }
  ],
  error: "Articolo 'H61.104.032' non trovato"
}
```

**UI Feedback:**
```
┌─────────────────────────────────────────┐
│ ⚠️ Articolo Non Trovato                 │
├─────────────────────────────────────────┤
│ Hai detto: "H61 104 032"                │
│                                         │
│ Articolo non trovato nel catalogo.     │
│ Intendevi uno di questi?                │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ ○ H71.104.032 (95% simile)        │  │ ← Click to select
│ │   K2 - 5pz | K3 - 1pz             │  │
│ └───────────────────────────────────┘  │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ ○ H61.104.016 (80% simile)        │  │
│ │   K1 - 10pz                       │  │
│ └───────────────────────────────────┘  │
│                                         │
│ [🎤 Riprova]  [✏️ Scrivi Manualmente]   │
└─────────────────────────────────────────┘
```

**User Action:** Click "H71.104.032" → Confidence becomes 1.0, continue workflow

---

### Caso 2: Variant Doesn't Exist (023 vs 016)

**Scenario:**
```
🎤 AGENTE dice: "845 104 023"
🗄️ DATABASE ha: "845.104.016", "845.104.032" (non .023)
```

**Detection:**
```typescript
const validation = await validateArticleCode("845.104.023", productDb);
// Returns:
{
  matchType: 'base_pattern',
  confidence: 0.7,
  basePattern: "845.104",
  suggestions: [
    { code: "845.104.016", variant: "016", packageInfo: "K2 - 5pz", confidence: 0.8 },
    { code: "845.104.032", variant: "032", packageInfo: "K3 - 1pz", confidence: 0.8 }
  ],
  error: "Variante .023 non trovata per 845.104"
}
```

**UI Feedback:**
```
┌─────────────────────────────────────────┐
│ ⚠️ Variante Non Trovata                 │
├─────────────────────────────────────────┤
│ Articolo 845.104 ✓ trovato              │
│ Variante .023 non disponibile           │
│                                         │
│ Seleziona la variante corretta:        │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ ○ 845.104.016                     │  │
│ │   K2 - 5 pezzi per confezione     │  │
│ └───────────────────────────────────┘  │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ ○ 845.104.032                     │  │
│ │   K3 - 1 pezzo per confezione     │  │
│ └───────────────────────────────────┘  │
│                                         │
│ [🎤 Riprova]  [✏️ Scrivi Manualmente]   │
└─────────────────────────────────────────┘
```

**User Action:** Click ".016" → Continue with "845.104.016"

---

### Caso 3: Complete Mismatch

**Scenario:**
```
🎤 SISTEMA sente: "XXXYYY 999 888" (completamente errato)
```

**Detection:**
```typescript
const validation = await validateArticleCode("XXXYYY.999.888", productDb);
// Returns:
{
  matchType: 'not_found',
  confidence: 0.0,
  suggestions: [],
  error: "Articolo 'XXXYYY.999.888' non trovato nel catalogo"
}
```

**UI Feedback:**
```
┌─────────────────────────────────────────┐
│ ❌ Articolo Non Trovato                 │
├─────────────────────────────────────────┤
│ Hai detto: "XXXYYY 999 888"             │
│                                         │
│ Articolo non trovato nel catalogo.     │
│ Nessun articolo simile disponibile.    │
│                                         │
│ [🎤 Riprova Dettatura]                  │
│ [✏️ Inserisci Manualmente]              │
│ [❌ Annulla]                            │
└─────────────────────────────────────────┘
```

---

### Decision Tree: Validation → UI

```
validateArticleCode(code)
    ↓
┌─────────────────────────────────────┐
│ matchType?                          │
├─────────────────────────────────────┤
│ exact        → ✅ Green checkmark   │
│                 "Articolo trovato"  │
│                 Auto-populate form  │
│                                     │
│ base_pattern → ⚠️  Yellow modal     │
│                 "Variante non       │
│                  trovata"           │
│                 Show variant list   │
│                 User selects        │
│                                     │
│ fuzzy        → ⚠️  Orange modal     │
│                 "Articolo simile"   │
│                 Show top 3 matches  │
│                 User selects        │
│                                     │
│ not_found    → ❌ Red modal         │
│                 "Non trovato"       │
│                 Retry or Manual     │
└─────────────────────────────────────┘
```

---

### Confidence Thresholds

```typescript
const CONFIDENCE_THRESHOLDS = {
  AUTO_ACCEPT: 0.9,      // Exact match - auto-populate
  REVIEW_REQUIRED: 0.7,  // Base pattern - show variants
  MANUAL_REQUIRED: 0.5,  // Fuzzy - show suggestions
  INVALID: 0.0           // Not found - retry or manual
};
```

**Behavior by Confidence:**
- **≥ 0.9**: Auto-populate form, green checkmark
- **0.7 - 0.89**: Show variant/suggestions modal, yellow warning
- **0.5 - 0.69**: Show fuzzy suggestions, orange warning, require selection
- **< 0.5**: Show error, red, require retry or manual input

---

### Implementation Notes

**Fuzzy Match Configuration:**
```typescript
import Fuse from 'fuse.js';

const fuse = new Fuse(productDb, {
  keys: ['name', 'id'],
  threshold: 0.3,        // Max 30% difference
  distance: 100,         // Max edit distance
  includeScore: true,    // Return similarity score
  minMatchCharLength: 3  // Min 3 chars to match
});
```

**Performance:**
- Exact match: O(1) hash lookup
- Base pattern: O(n) filtered search
- Fuzzy match: O(n) but cached, ~50ms for 10k products

**UX Principles:**
1. **Never auto-populate invalid data** (confidence < 0.9)
2. **Always show why** suggestion was made (95% similar, same base, etc.)
3. **Provide escape hatches**: Riprova voice, Manual edit, Cancel
4. **Visual hierarchy**: Most likely suggestion first, with confidence %

---

## 🚀 Evoluzione Futura (Post-MVP)

### Hybrid Mode: Controllo Esplicito Variante

**Permettere override variante esplicita:**
```
🎤 "Articolo H129FSQ K2 quantità 3 confezioni"
→ 3 confezioni × 5pz = 15 pezzi totali
→ Forza K2 (non K3)

🎤 "Articolo H129FSQ 3 confezioni da 5"
→ 3 × 5 = 15 pezzi
→ Parser riconosce "confezioni da X" pattern
```

**Vantaggi:**
- Utenti esperti possono specificare packaging preferito
- Riduce disambiguazioni per utenti che sanno cosa vogliono
- Graduale: principianti usano quantity-first, esperti scoprono shortcuts

**Implementazione:**
- Estendi `parseVoiceOrder()` per pattern "KX" e "N confezioni da Y"
- Confidence più alta per override esplicito
- Validazione che variante specificata esiste

---

## 📊 Metriche di Successo

### KPI Voice Input
1. **Accuracy**: % ordini voice correttamente riconosciuti (target: >90%)
2. **Disambiguation Rate**: % ordini che richiedono disambiguazione (<20% ideale)
3. **Edit Rate**: % campi voice-populated poi modificati manualmente (<30% ideale)
4. **Completion Time**: Tempo medio voice → order submitted (target: <60s)
5. **Error Rate**: % ordini voice con errori backend (<5%)

### A/B Testing (Future)
- Quantity-First vs Hybrid mode
- Auto-select optimal vs always ask
- Voice confidence threshold (0.5 vs 0.7)

---

## 🛠️ Implementazione Tecnica

### File Structure
```
frontend/src/
├── utils/
│   ├── orderParser.ts           # Parsing & normalization
│   ├── orderParser.spec.ts      # Unit tests
│   └── packageSolver.ts         # Mixed-package algorithm (NEW)
├── components/
│   ├── OrderForm.tsx            # Main form with voice integration
│   ├── ConfidenceMeter.tsx      # Real-time confidence display
│   ├── EntityBadge.tsx          # Entity highlighting
│   ├── TranscriptDisplay.tsx    # Transcript with badges
│   ├── ValidationStatus.tsx     # Validation spinner/error
│   ├── SmartSuggestions.tsx     # Context-aware hints
│   └── PackageDisambiguationModal.tsx  # Package choice UI (NEW)
└── hooks/
    └── useVoiceInput.ts         # Web Speech API wrapper
```

### Dependencies
- `fuse.js` - Fuzzy matching per cliente/articolo
- Web Speech API (built-in browser)
- React Testing Library - Integration tests

---

## ✅ Acceptance Criteria

### Phase 4 Complete When:
- [x] Parser normalizza "H71 104 032" → "H71.104.032" (>95% accuracy)
- [x] Mixed-package detection funzionante (qty=7 scenario)
- [x] Disambiguation modal UI implementata e testata
- [x] Voice pre-fill workflow (NO auto-submit)
- [x] Manual edit capability con badge removal
- [x] Draft items list + confirmation modal
- [x] Full test coverage (unit + integration)
- [x] Accessibility audit passed (WCAG AA)

---

**Document Version**: 1.0
**Last Updated**: 2026-01-13
**Author**: AI Planning Agent
**Status**: Ready for Implementation
