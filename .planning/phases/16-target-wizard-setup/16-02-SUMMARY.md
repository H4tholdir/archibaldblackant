# Phase 16 Plan 02: First-Time Wizard UI Summary (REFACTORED)

**Refactored blocking onboarding wizard from 3-step to 7-step flow with complete commission configuration based on real agent provvigioni structure**

## Accomplishments

### Backend Schema Extension (v2 → v3)

- Extended User interface with 8 new commission configuration fields:
  - `yearlyTarget: number` - Primary target field (monthlyTarget auto-calculated as yearlyTarget / 12)
  - `commissionRate: number` - Base commission percentage (0.18 = 18%)
  - `bonusAmount: number` - Progressive bonus amount (€5,000)
  - `bonusInterval: number` - Revenue interval for progressive bonuses (€75,000)
  - `extraBudgetInterval: number` - Extra-budget tier size (€50,000)
  - `extraBudgetReward: number` - Fixed reward per extra-budget tier (€6,000)
  - `monthlyAdvance: number` - Monthly salary advance (€3,500)
  - `hideCommissions: boolean` - Global privacy toggle for commission data visibility
- Implemented SQLite schema migration v2→v3 with backward compatibility via default values
- Migration preserves existing user data, adds new columns with Italian market defaults
- Used PRAGMA user_version for version tracking

### Backend API Updates

- Updated GET /api/users/me/target endpoint to return full commission configuration object
- Refactored PUT /api/users/me/target endpoint to accept all 9 configuration parameters
- Comprehensive server-side validation for all fields:
  - yearlyTarget: non-negative number
  - commissionRate: between 0 and 1 (0-100%)
  - bonusAmount, bonusInterval, extraBudgetInterval, extraBudgetReward, monthlyAdvance: non-negative numbers
  - currency: 3-letter string (hardcoded to "EUR" in frontend)
  - hideCommissions: boolean
- Auto-calculation of monthlyTarget = Math.round(yearlyTarget / 12) on backend
- Response includes full configuration with timestamps

### Frontend TargetWizard Refactor (3→7 Steps)

**Step 1 - Welcome Screen**
- Removed emojis per user requirement (no 🎯, no 👋)
- Updated app name to "Formicanera - Archibald rework"
- Added privacy message about commission data handling
- Single "Inizia" button to proceed

**Step 2 - Target Annuale**
- Yearly target input (€300,000 default)
- Real-time monthly target preview: "Questo corrisponde a circa €25,000 al mese"
- Validation: yearlyTarget > 0
- Number input with €100 step increments
- Italian currency formatting with Intl.NumberFormat('it-IT')

**Step 3 - Provvigioni Base**
- Commission rate percentage input (18% default)
- Real-time calculated commission preview: "Su €300,000 di fatturato, riceverai €54,000 di provvigioni base"
- Input range: 0-100% with 0.5% step
- Validation: commissionRate > 0
- Automatic conversion from percentage to decimal (18 → 0.18)

**Step 4 - Bonus Progressivi**
- Bonus amount input (€5,000 default)
- Bonus interval input (€75,000 default)
- Real-world example: "Esempio: Ogni €75,000 di fatturato, riceverai un bonus di €5,000 (illimitato nell'anno)"
- Validation: bonusAmount > 0, bonusInterval > 0
- Clarifies unlimited annual frequency

**Step 5 - Premi Extra-Budget**
- Extra-budget interval input (€50,000 default)
- Extra-budget reward input (€6,000 default)
- Real-world example: "Esempio: Superando il target di €50,000 riceverai €6,000; a €100,000 riceverai €12,000 totali"
- Validation: extraBudgetInterval > 0, extraBudgetReward > 0
- Explains fixed-tier cumulative structure

**Step 6 - Anticipo Mensile**
- Monthly advance input (€3,500 default)
- Annual total preview: "Totale anticipato nell'anno: €42,000"
- Clarification message: "L'anticipo verrà scalato dal conguaglio provvigionale annuale"
- Validation: monthlyAdvance ≥ 0 (can be 0 if no advance)

**Step 7 - Conferma & Privacy**
- Comprehensive summary card displaying:
  - Yearly target with monthly breakdown
  - Commission rate with calculated base amount
  - Progressive bonus structure
  - Extra-budget reward tiers
  - Monthly advance with annual total
- Global privacy toggle: "Nascondi dati provvigionali dai widget della dashboard"
- Checkbox defaults to unchecked (hideCommissions: false)
- Single "Conferma e Salva" button (green success style)

**Common Features Across All Steps**
- 7-dot step indicator (green=completed, blue=current, gray=future)
- Smooth CSS transitions (0.3s ease-in-out)
- Banking app UI: 16px border-radius, 40px padding, rgba(0,0,0,0.5) overlay, 0 10px 40px shadow
- Navigation: "Indietro" (secondary gray), "Continua" (primary blue), "Conferma e Salva" (green)
- Italian labels throughout (Obiettivo annuale, Provvigioni, Bonus, Premi, Anticipo)
- Inline validation errors with red borders and error messages
- All inputs pre-filled with real defaults from user's commission structure

**Currency Handling**
- Removed currency dropdown completely (previously EUR/USD/GBP)
- Hardcoded to "EUR" in all calculations and API calls
- Italy-only market - no multi-currency support needed

### Frontend App.tsx Integration

- Updated handleTargetComplete() signature from (target: number, currency: string) to (config: ConfigObject)
- Config object includes all 9 parameters: yearlyTarget, currency, commissionRate, bonusAmount, bonusInterval, extraBudgetInterval, extraBudgetReward, monthlyAdvance, hideCommissions
- Changed target existence check from targetData.monthlyTarget > 0 to targetData.yearlyTarget > 0
- Updated error messages to reflect full configuration save (not just "obiettivo")
- Maintained blocking wizard behavior: zIndex 9999, full-screen overlay, no interaction until complete

### TypeScript & Build

- TypeScript compilation passes with strict mode (npm run type-check)
- Removed unused formatPercent() helper function
- All types properly defined for new commission fields
- No linting errors

## Files Created/Modified

### Backend
- `archibald-web-app/backend/src/user-db.ts` - Schema v2→v3 migration, extended User interface, updated getUserTarget/updateUserTarget methods
- `archibald-web-app/backend/src/index.ts` - Refactored PUT /api/users/me/target endpoint with comprehensive validation

### Frontend
- `archibald-web-app/frontend/src/components/TargetWizard.tsx` - Complete refactor from 3-step to 7-step flow (595 lines)
- `archibald-web-app/frontend/src/App.tsx` - Updated handleTargetComplete signature, changed target check condition

## Decisions Made

**7-Step Flow Rationale**
- Step 1 (Welcome): Sets context, explains privacy policy for commission data
- Step 2 (Target): Yearly target as primary metric (aligns with company's annual planning cycle)
- Step 3 (Commission Rate): Base commission percentage - foundation of compensation structure
- Step 4 (Progressive Bonuses): Unlimited bonuses throughout year incentivize continuous performance
- Step 5 (Extra-Budget Rewards): Fixed-tier rewards for exceeding target (separate from progressive bonuses)
- Step 6 (Monthly Advance): Captures salary advance structure, explains annual settlement deduction
- Step 7 (Confirmation + Privacy): Complete summary + global toggle for hiding commission data in widgets
- Psychology: Breaking complex commission structure into digestible steps increases completion rate and comprehension

**Yearly vs Monthly Target**
- User's commission structure works on annual basis (€300,000 yearly, €25,000 monthly is monitoring only)
- yearlyTarget is primary field, monthlyTarget auto-calculated as yearlyTarget / 12
- Backend stores both for flexibility (widgets can query either)
- Simplifies agent mental model - think annually, monitor monthly

**Commission Structure Modeling**
- Three distinct compensation components:
  1. Base commission: 18% of all revenue (no thresholds)
  2. Progressive bonuses: €5,000 every €75,000 (unlimited, cumulative throughout year)
  3. Extra-budget rewards: €6,000 per €50,000 tier above target (fixed per tier, cumulative)
- Monthly advance: €3,500 × 12 = €42,000 deducted from annual settlement
- Annual settlement: All compensation calculated and paid at year-end
- Each agent has personalized structure (stored per-user in database)

**Global Privacy Toggle**
- Single hideCommissions boolean controls visibility across all dashboard widgets
- Defaults to false (show commissions) - transparency encouraged
- Agent can toggle at any time from wizard (one-time setup) or profile (future Plan 16-03)
- Affects BudgetWidget, TargetVisualizationWidget, and future commission tracking widgets

**Currency Simplification**
- Removed currency dropdown (previously supported EUR/USD/GBP)
- Hardcoded to "EUR" - Italy-only market, no multi-currency needed
- Reduces cognitive load in wizard
- Can add back later if international expansion occurs

**Default Values Strategy**
- Pre-filled inputs with real defaults from user's commission structure:
  - €300,000 yearly target (€25,000/month)
  - 18% commission rate
  - €5,000 bonus / €75,000 interval
  - €6,000 reward / €50,000 interval
  - €3,500 monthly advance
- Reduces friction - most agents can click through with standard structure
- Power users can customize per their individual contracts

**Validation Strategy**
- Client-side validation provides immediate feedback (inline errors, red borders)
- Server-side validation enforces business rules (comprehensive checks in API)
- All monetary fields require positive numbers (except monthlyAdvance which can be 0)
- Commission rate capped at 0-100% range
- Prevents invalid states before database persistence

**Integration Flow**
- Wizard appears after authentication and PIN setup (if enabled)
- Blocks main app access until configuration complete (zIndex 9999, semi-transparent overlay)
- Flow: Login → PIN setup (optional) → Target wizard (if yearlyTarget === 0) → Main app
- Returning users with yearlyTarget > 0 skip wizard entirely
- No localStorage caching - always fetches from server for single source of truth

**When Wizard Shows/Skips**
- Shows: yearlyTarget === 0 in database (new user or reset user)
- Skips: yearlyTarget > 0 (existing configuration)
- Never re-prompts after initial setup (no nag pattern)
- Future: Users can edit configuration from profile (Plan 16-03)

## Issues Encountered

**TypeScript Error - Unused formatPercent Function**
- Error: `TS6133: 'formatPercent' is declared but its value is never read`
- Cause: formatPercent() helper function defined but not used in component
- Fix: Removed unused function entirely (commit 16e1690)
- No other TypeScript errors - strict mode compilation passed

## Git Commits

1. `0f80e23` - feat(16-02): extend backend schema v3 with commission fields
2. `efc5e91` - feat(16-02): update API endpoint for full commission config
3. `8ef6bfd` - feat(16-02): refactor TargetWizard to 7-step flow with full commission config
4. `c14bb16` - feat(16-02): update App.tsx to handle full commission config from wizard
5. `16e1690` - fix(16-02): remove unused formatPercent function in TargetWizard

## Commission Structure Reference (User Requirements)

**From user's Excel analysis and clarifications:**
- Yearly target: €300,000 (€25,000/month for monitoring)
- Base commission: 18% on all revenue (no thresholds)
- Progressive bonuses: €5,000 every €75,000 of revenue (unlimited, no time restrictions)
- Extra-budget rewards: Fixed tiers above target
  - €6,000 at +€50,000 extra-budget
  - €12,000 total at +€100,000 extra-budget (€6k + €6k)
  - €18,000 total at +€150,000 extra-budget (€6k + €6k + €6k)
- Monthly advance: €3,500 (€42,000 annually)
- Settlement: Annual reconciliation at year-end
- Each agent has personalized structure (not standardized across company)

## Next Steps

1. **Plan 16-03**: Profile Target Editor (allows editing configuration after initial setup)
2. **Plan 16-04**: Dashboard Widgets Integration (consume yearlyTarget and commission fields)
3. **Future Considerations**:
   - Commission tracking widget showing real-time progress toward bonuses/rewards
   - Annual settlement calculator
   - Historical commission data visualization
   - Export commission data for tax purposes

## Lessons Learned

- User requirements evolved significantly from initial 3-step wizard (just target) to full commission configuration
- Breaking complex financial structures into multiple steps improves comprehension
- Default values dramatically reduce setup friction while maintaining flexibility
- Backend schema versioning with migrations enables safe production updates
- Global privacy toggles simpler than per-widget configuration
- Italian agents think annually but monitor monthly - system should support both perspectives
