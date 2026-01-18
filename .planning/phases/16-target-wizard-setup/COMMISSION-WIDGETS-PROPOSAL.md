# Dashboard Commission Widgets - Proposta Completa

**Data:** 2026-01-18
**Context:** Wizard provvigionale 7-step completo, mancano widget dashboard motivazionali

---

## Sistema Provvigionale (Recap)

Basato sul wizard implementato in Phase 16-02:

```typescript
// Dati configurati dall'agente
yearlyTarget: €300,000 (default)
monthlyTarget: €25,000 (auto-calculated: yearlyTarget / 12)
commissionRate: 18% (0.18)
bonusAmount: €5,000
bonusInterval: €75,000 fatturato
extraBudgetInterval: €50,000 oltre target
extraBudgetReward: €6,000 per tier
monthlyAdvance: €3,500 (€42,000/anno)
```

**Formula Provvigioni Totali:**
```
Provvigioni Base = fatturato × 18%
Bonus Progressivi = floor(fatturato / €75k) × €5k
Premi Extra-Budget = floor(extraBudget / €50k) × €6k
Anticipo Annuale = €3,500 × 12 = €42,000

Totale Maturato = Base + Bonus + Premi
Conguaglio Fine Anno = Totale Maturato - Anticipo Annuale
```

---

## 🎯 Proposta Widget: 4 Widget Motivazionali

### **Widget 1: Provvigioni Maturate** (Priority: HIGH)

**Visual:** Card con breakdown a 3 livelli

```
┌─────────────────────────────────────────────────┐
│ 💰 Provvigioni Maturate                      ⓘ │
├─────────────────────────────────────────────────┤
│                                                 │
│        €67,400 maturate finora               │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │ Provvigioni Base (18%)        €54,000  │  │
│  │ Bonus Progressivi (4×€5k)     €20,000  │  │
│  │ Premi Extra-Budget (1×€6k)     €6,000  │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  📊 Su €300,000 di fatturato                   │
│                                                 │
│  [Dettaglio Calcolo →]                          │
└─────────────────────────────────────────────────┘
```

**Dati necessari:**
- `currentBudget` (già disponibile da GET /api/metrics/budget)
- `yearlyTarget`, `commissionRate`, `bonusAmount`, `bonusInterval`, `extraBudgetInterval`, `extraBudgetReward` (da GET /api/users/me/target)

**Calcoli Frontend:**
```typescript
const baseCommission = currentBudget * commissionRate
const bonusCount = Math.floor(currentBudget / bonusInterval)
const totalBonuses = bonusCount * bonusAmount
const extraBudget = Math.max(0, currentBudget - yearlyTarget)
const extraTiers = Math.floor(extraBudget / extraBudgetInterval)
const extraRewards = extraTiers * extraBudgetReward
const totalCommissions = baseCommission + totalBonuses + extraRewards
```

**Hover Tooltip (ⓘ):**
- "Provvigioni base: fatturato × 18%"
- "Bonus progressivi: ogni €75k di fatturato = €5k bonus"
- "Premi extra-budget: ogni €50k oltre target = €6k premio"

**Click "Dettaglio Calcolo":** Modal espandibile con tabella completa

---

### **Widget 2: Progresso Prossimo Bonus** (Priority: HIGH)

**Visual:** Progress bar circolare con countdown

```
┌─────────────────────────────────────────────────┐
│ 🎁 Prossimo Bonus Progressivo                    │
├─────────────────────────────────────────────────┤
│                                                 │
│              ╭─────────╮                        │
│              │   87%   │                        │
│              │  €5,000 │     Mancano solo      │
│              │         │      €9,750!          │
│              ╰─────────╯                        │
│                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│  €65,250                            €75,000    │
│                                                 │
│  🔥 Ancora 4 ordini medi e raggiungi il bonus!  │
└─────────────────────────────────────────────────┘
```

**Dati necessari:**
- `currentBudget` (€65,250 esempio)
- `bonusInterval` (€75,000)
- Media ordine: `currentBudget / orderCount` (opzionale, motivazionale)

**Calcoli:**
```typescript
const currentProgress = currentBudget % bonusInterval
const progressPercent = (currentProgress / bonusInterval) * 100
const remaining = bonusInterval - currentProgress
const avgOrderValue = currentBudget / totalOrderCount
const ordersNeeded = Math.ceil(remaining / avgOrderValue)
```

**Animazione:** Progress bar che cresce con transition smooth 0.3s

**Colori:**
- 0-30%: Grigio (#95a5a6)
- 31-70%: Giallo (#f39c12)
- 71-99%: Verde (#27ae60)
- 100%: 🎉 Confetti animation + "Bonus raggiunto!"

---

### **Widget 3: Premi Extra-Budget (Tier System)** (Priority: MEDIUM)

**Visual:** Vertical tier ladder con achievement badges

```
┌─────────────────────────────────────────────────┐
│ 🏆 Premi Extra-Budget                            │
├─────────────────────────────────────────────────┤
│                                                 │
│  Oltre il target: €50,000 (+16.7%)             │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │  ✅ Tier 1 → €6,000   (+€50k) RAGGIUNTO │   │
│  │  🎯 Tier 2 → €12,000  (+€100k) ATTIVO   │   │
│  │  ⚪ Tier 3 → €18,000  (+€150k)          │   │
│  │  ⚪ Tier 4 → €24,000  (+€200k)          │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  Progresso verso Tier 2:                        │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━          │
│  +€50,000                         +€100,000    │
│                                                 │
│  💪 Altri €50,000 per sbloccare Tier 2!        │
└─────────────────────────────────────────────────┘
```

**Dati necessari:**
- `currentBudget` (€350,000 esempio)
- `yearlyTarget` (€300,000)
- `extraBudgetInterval` (€50,000)
- `extraBudgetReward` (€6,000)

**Calcoli:**
```typescript
const extraBudget = Math.max(0, currentBudget - yearlyTarget)
const currentTier = Math.floor(extraBudget / extraBudgetInterval)
const totalExtraRewards = currentTier * extraBudgetReward
const progressToNextTier = extraBudget % extraBudgetInterval
const nextTierThreshold = extraBudgetInterval
```

**Stati tier:**
- ✅ Raggiunto: Verde, icona checkmark, importo evidenziato
- 🎯 Attivo: Blu, progress bar, motivazionale "Altri €X!"
- ⚪ Locked: Grigio, non ancora raggiungibile

**Gamification:** Badge bronze/silver/gold/platinum per tier

---

### **Widget 4: Anticipo vs Maturato** (Priority: MEDIUM)

**Visual:** Comparison bar chart con proiezione

```
┌─────────────────────────────────────────────────┐
│ 💵 Anticipo vs Provvigioni Maturate              │
├─────────────────────────────────────────────────┤
│                                                 │
│  Anticipo ricevuto finora (gen-dic):           │
│  ██████████████████ €42,000                    │
│                                                 │
│  Provvigioni maturate (oggi):                   │
│  ███████████████████████████ €67,400           │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │  Conguaglio stimato fine anno:          │  │
│  │  +€25,400 a tuo favore  ✅              │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  📈 Proiezione fine anno: €80,880              │
│     (basata su trend attuale)                   │
│                                                 │
│  ⚠️ Ricorda: conguaglio finale a dicembre     │
└─────────────────────────────────────────────────┘
```

**Dati necessari:**
- `monthlyAdvance` (€3,500)
- `totalCommissions` (calcolato da Widget 1)
- `currentMonth` (1-12 per calcolare anticipo ricevuto finora)
- `currentBudget` + trend per proiezione

**Calcoli:**
```typescript
const currentMonth = new Date().getMonth() + 1 // 1-12
const advanceReceivedSoFar = monthlyAdvance * currentMonth
const annualAdvance = monthlyAdvance * 12
const settlement = totalCommissions - annualAdvance

// Proiezione fine anno (linear trend)
const monthsElapsed = currentMonth
const avgMonthlyBudget = currentBudget / monthsElapsed
const projectedYearlyBudget = avgMonthlyBudget * 12
const projectedCommissions = calculateCommissions(projectedYearlyBudget)
const projectedSettlement = projectedCommissions - annualAdvance
```

**Colori:**
- Conguaglio positivo: Verde ✅ "+€X a tuo favore"
- Conguaglio negativo: Arancione ⚠️ "Devi restituire €X"
- Pareggio: Grigio "In pareggio esatto"

**Note legali:** Piccolo disclaimer "Proiezione stimata, dati definitivi a fine anno"

---

## 📐 Layout Dashboard Proposto

### **Opzione A: Grid 2×2 (Desktop), 1 colonna (Mobile)**

```
Desktop (≥768px):
┌──────────────────────┬──────────────────────┐
│  Budget Widget       │  Orders Widget       │
│  (esistente)         │  (esistente)         │
├──────────────────────┼──────────────────────┤
│  Provvigioni         │  Prossimo Bonus      │
│  Maturate            │  Progressivo         │
├──────────────────────┼──────────────────────┤
│  Premi Extra-Budget  │  Anticipo vs         │
│  (Tier System)       │  Maturato            │
├──────────────────────┴──────────────────────┤
│  Target Visualization Widget (esistente)    │
│  (full width)                                │
└──────────────────────────────────────────────┘

Mobile (<768px): Stack verticale 1 colonna
```

### **Opzione B: Tab System (Meno cluttered)**

```
┌──────────────────────────────────────────────┐
│  Tabs: [ Panoramica ] [ Provvigioni ] [ ... ]│
├──────────────────────────────────────────────┤
│                                              │
│  Tab Panoramica:                             │
│  - Budget Widget                             │
│  - Orders Widget                             │
│  - Target Visualization                      │
│                                              │
│  Tab Provvigioni:                            │
│  - Provvigioni Maturate (grande)             │
│  - Prossimo Bonus                            │
│  - Premi Extra-Budget                        │
│  - Anticipo vs Maturato                      │
│                                              │
└──────────────────────────────────────────────┘
```

### **Opzione C: Single Super-Widget Collapsabile**

```
┌─────────────────────────────────────────────────┐
│ 💰 Provvigioni & Premi (2024)                ▼ │
├─────────────────────────────────────────────────┤
│                                                 │
│  €67,400 maturate      +€25,400 conguaglio   │
│                                                 │
│  ┌─ Breakdown ────────────────────────────┐   │
│  │  Base 18%:       €54,000              │   │
│  │  Bonus (4):      €20,000              │   │
│  │  Premi (1):       €6,000              │   │
│  └───────────────────────────────────────┘   │
│                                                 │
│  ┌─ Prossimo Bonus ───────────────────────┐   │
│  │  ██████████████░░░░░  €65k/€75k (87%) │   │
│  │  Mancano €9,750 → ~4 ordini           │   │
│  └───────────────────────────────────────┘   │
│                                                 │
│  ┌─ Premi Extra-Budget ────────────────────┐  │
│  │  ✅ Tier 1  🎯 Tier 2  ⚪ Tier 3       │  │
│  │  +€50k prog €50k/€100k                 │  │
│  └───────────────────────────────────────┘   │
│                                                 │
│  [ Vedi Dettagli Completi → ]                  │
└─────────────────────────────────────────────────┘
```

---

## 🎨 Design System

**Colors (semantic):**
- Primary Blue: #3498db (actions, progress)
- Success Green: #27ae60 (goals reached, positive)
- Warning Yellow: #f39c12 (attention needed)
- Danger Red: #e74c3c (critical, negative)
- Gray Neutral: #95a5a6 (inactive, disabled)

**Typography:**
- Title: 20px bold (#2c3e50)
- Amount Large: 32px bold (#2c3e50)
- Amount Small: 16px semibold (#7f8c8d)
- Body Text: 14px regular (#666)
- Helper Text: 12px regular (#999)

**Spacing:**
- Card padding: 20px
- Gap between widgets: 20px
- Section margins: 16px
- Icon size: 24px
- Border radius: 12px (modern, rounded)

**Animations:**
- Progress bars: 0.3s ease-out
- Hover effects: 0.2s ease
- Number counters: Animated counting up (motivational)

---

## 🔒 Privacy Toggle Integration

**Widget visibility based on `hideCommissions` flag:**

```typescript
if (user.hideCommissions) {
  // Hide all commission-related widgets
  // Show only: Budget, Orders, Target (no money amounts)
  return <SimplifiedDashboard />
}

// Show full commission widgets
return <FullCommissionsDashboard />
```

**Setting location:** Profile page (Plan 16-03)

**Default:** `hideCommissions: false` (show all)

---

## 📊 Backend API Requirements

### **Existing APIs (Already Available):**
- ✅ `GET /api/users/me/target` - Returns all commission config fields
- ✅ `GET /api/metrics/budget` - Returns currentBudget, progress
- ✅ `GET /api/metrics/orders` - Returns order counts

### **New API Needed (Optional Enhancement):**

```typescript
GET /api/metrics/commissions

Response:
{
  "totalCommissions": 67400,     // Calculated
  "baseCommission": 54000,       // currentBudget * commissionRate
  "totalBonuses": 20000,         // Bonus progressivi
  "totalExtraRewards": 6000,     // Premi extra-budget
  "nextBonusProgress": {
    "current": 65250,
    "target": 75000,
    "remaining": 9750,
    "percent": 87
  },
  "settlement": {
    "advanceReceived": 42000,    // monthlyAdvance * 12
    "maturated": 67400,
    "balance": 25400,            // positive = owed to agent
    "projected": 80880           // Year-end projection
  },
  "extraBudgetTiers": [
    { "tier": 1, "threshold": 50000, "reward": 6000, "reached": true },
    { "tier": 2, "threshold": 100000, "reward": 12000, "reached": false }
  ]
}
```

**Pro:** Backend calculations, consistent, cacheable
**Con:** More backend work, might be overkill

**Alternative:** Calculate everything in frontend (simpler for MVP)

---

## 🚀 Implementation Priority

### **Phase 1: Core Widgets (MVP)**
1. Widget Provvigioni Maturate (HIGH) - 2h
2. Widget Prossimo Bonus (HIGH) - 1.5h
3. Layout Grid 2×2 + Responsive - 0.5h

**Total: ~4 hours**

### **Phase 2: Advanced Features**
4. Widget Premi Extra-Budget (MEDIUM) - 2h
5. Widget Anticipo vs Maturato (MEDIUM) - 1.5h
6. Privacy toggle integration - 0.5h

**Total: ~4 hours**

### **Phase 3: Polish**
7. Animations & transitions - 1h
8. Hover tooltips & modals - 1h
9. Mobile optimization - 1h

**Total: ~3 hours**

---

## ✅ Acceptance Criteria

**Widget deve mostrare:**
- ✅ Importi corretti basati su currentBudget reale
- ✅ Calcoli matematici corretti (base + bonus + premi)
- ✅ Formattazione italiana (€54.000,00)
- ✅ Progress bars smooth e animate
- ✅ Colori semantici (verde=positivo, rosso=negativo)
- ✅ Responsive (desktop 2 col, mobile 1 col)
- ✅ Privacy mode rispettato (nascondi se hideCommissions=true)
- ✅ Tooltip informativi su hover
- ✅ Motivazionale: "Mancano solo €X!", "Altri Y ordini!"

**User Story:**
> "Come agente Komet, quando apro la dashboard voglio vedere subito quanto ho maturato in provvigioni questo anno, quanto manca al prossimo bonus, e se sto guadagnando più dell'anticipo, così posso essere motivato a chiudere più ordini."

---

## 🤔 Decision Points

**Domande per l'utente:**

1. **Layout preferito?**
   - Opzione A: Grid 2×2 (tutti widget sempre visibili)
   - Opzione B: Tab system (separare panoramica/provvigioni)
   - Opzione C: Super-widget collapsabile (meno clutter)

2. **Priorità widget?**
   - Implementare tutti e 4 subito?
   - O iniziare con 2 core (Maturate + Prossimo Bonus)?

3. **Calcoli frontend o backend?**
   - Frontend: Più semplice, meno richieste HTTP
   - Backend: Più robusto, consistente, cacheable

4. **Animazioni?**
   - Heavy (confetti, counter animations, smooth transitions)
   - Light (solo progress bars animate)
   - Minimal (no animations)

---

*Documento creato: 2026-01-18*
*Basato su: Phase 16-02 commission wizard structure*
