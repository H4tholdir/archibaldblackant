# Promotion Advisor — Design Spec

**Data**: 2026-04-13  
**Stato**: Approvato per implementazione

---

## Contesto e obiettivo

Komet rilascia periodicamente promozioni sui propri prodotti (bundle, quantità minime, soglie di spesa con omaggio). Queste promozioni vengono comunicate tramite PDF di marketing.

L'obiettivo è creare un sistema che permetta all'admin di caricare un PDF di promozione e configurare un "Promotion Advisor": un banner informativo che appare automaticamente nel form di creazione ordine quando l'agente inserisce un articolo che rientra nella promozione, suggerendo di proporla al cliente con i punti di forza e il risparmio effettivo.

Il sistema è **puramente informativo** — non modifica i prezzi dell'ordine né aggiunge articoli automaticamente.

---

## Analisi promozioni reali (6 PDF analizzati)

| Promo | Meccanica | Trigger | Prezzo bundle |
|-------|-----------|---------|---------------|
| AperiSONIC | Bundle: manipolo + 5 inserti | SF1LM/SF1LS + pattern `SF` | 1.649€ |
| 8 inserti sonici | Quantità: 8 inserti da catalogo sonico | Pattern `SF` | 899€ |
| DIAO & Synea Power Edition | Bundle fisso: WK-900LT + 4 conf. DIAO | Codici KP* + WK-900LT.000 | 1.390€ |
| Rocky & Synea Power Edition | Bundle fisso: WK-900LT + 4 conf. CERC Rocky | Codici CERC* + WK-900LT.000 | 1.390€ |
| OS30 O-Drive | Bundle: manipolo OS30 + 4 dischi | Codice OS30 + dischi | 1.399€ |
| Laboratorio 2025 | Soglia spesa 450€+ → omaggio porta strumenti | Pattern `.104.` (gambi HP lab) | — |

**Conclusione chiave**: tutte le meccaniche diverse si riducono al medesimo bisogno UX — ricordare all'agente di proporre la promo. La struttura dati è uniforme.

---

## Architettura generale

```
Admin (carica promo)  →  DB system.promotions  →  Banner nell'ordine
```

Tre componenti principali:
1. **`PromotionsAdminSection`** — pannello in AdminPage per creare/modificare/eliminare promozioni
2. **`PromotionAdvisor`** — banner(s) nel form ordine, layout adattivo mobile/desktop
3. **Backend REST** — CRUD promozioni + upload/download PDF

---

## Modello dati

### Tabella `system.promotions` (migration 056)

```sql
CREATE TABLE system.promotions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  tagline       TEXT,
  valid_from    DATE NOT NULL,
  valid_to      DATE NOT NULL,
  pdf_key       TEXT,
  trigger_rules JSONB NOT NULL DEFAULT '[]',
  selling_points TEXT[] NOT NULL DEFAULT '{}',
  promo_price   NUMERIC(10,2),
  list_price    NUMERIC(10,2),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
```

### Tipo `TriggerRule`

```typescript
type TriggerRule =
  | { type: 'exact';    value: string }  // match esatto su article.id: "WK-900LT.000"
  | { type: 'contains'; value: string }  // sottostringa su article.id: ".104." | "SF"
```

Due tipi coprono tutti i casi reali:
- **`exact`**: bundle con articoli specifici (es. CERC.314.014, WK-900LT.000)
- **`contains`**: promo generiche su famiglie/gambi (es. tutti gli inserti sonici `SF*`, tutti i gambi HP lab `.104.`)

### Tipo `Promotion` (frontend)

```typescript
interface Promotion {
  id: string
  name: string
  tagline: string
  validFrom: string         // ISO date
  validTo: string
  pdfKey: string | null
  triggerRules: TriggerRule[]
  sellingPoints: string[]
  promoPrice: number | null
  listPrice: number | null
  isActive: boolean
}
```

Risparmio calcolato lato frontend: `savings = listPrice - promoPrice`, `savingsPercent = round((savings / listPrice) * 100)`.

---

## API Backend

Nuovo router `createPromotionsRouter(deps)` in `src/routes/promotions.router.ts`.

```
GET    /api/promotions              → lista tutte (solo admin)
POST   /api/promotions              → crea (solo admin)
PATCH  /api/promotions/:id          → modifica (solo admin)
DELETE /api/promotions/:id          → elimina (solo admin)
GET    /api/promotions/active       → solo attive e non scadute (tutti gli agenti autenticati)
POST   /api/promotions/:id/pdf      → upload PDF (multipart, solo admin)
GET    /api/promotions/:id/pdf      → serve PDF (tutti gli agenti autenticati)
```

`GET /api/promotions/active` filtra: `is_active = true AND valid_from <= today AND valid_to >= today`.

Il PDF viene salvato nella directory locale del backend sul VPS: `uploads/promotions/<uuid>.pdf`. `pdf_key` è il nome del file (es. `"<uuid>.pdf"`). Il backend serve il file tramite `GET /api/promotions/:id/pdf`.

Quando una promozione viene eliminata (`DELETE /api/promotions/:id`), il backend cancella anche il file PDF corrispondente dal filesystem prima di rimuovere il record dal DB.

---

## Frontend — PromotionAdvisor

### Logica di matching

```typescript
function matchesTrigger(articleId: string, rules: TriggerRule[]): boolean {
  return rules.some(rule =>
    rule.type === 'exact'
      ? articleId === rule.value
      : articleId.includes(rule.value)
  )
}
```

### Hook `usePromotions`

- Fetch `GET /api/promotions/active` all'apertura del form ordine (una sola richiesta)
- Cache in memoria per la durata della sessione
- Restituisce `activePromotions: Promotion[]`

### Integrazione in `OrderFormSimple.tsx`

```typescript
const { activePromotions } = usePromotions()

const triggeredPromotions = useMemo(() =>
  activePromotions.filter(promo =>
    items.some(item => matchesTrigger(item.id, promo.triggerRules))
  ), [items, activePromotions])

{hasModule('promotion-advisor') && triggeredPromotions.length > 0 && (
  <PromotionAdvisor
    promotions={triggeredPromotions}
    isMobile={isMobile}
  />
)}
```

Posizionamento: **sotto la lista articoli**, sopra la sezione sconto globale.

### Layout adattivo

- **Mobile** (`isMobile = true`): banner inline, uno sotto l'altro nel flusso dell'ordine
- **Desktop** (`isMobile = false`): sidebar panel a destra della lista articoli (grid 2 colonne)

### Comportamento banner

- Appare quando almeno un articolo nel carrello matcha un trigger
- Scompare se l'articolo trigger viene rimosso dal carrello
- La **X** chiude il banner per la sessione corrente (stato locale `dismissedIds: Set<string>`)
- Al prossimo ordine i banner riappaiono
- Con 2+ promozioni attive: ogni promo ha un colore distinto (prima: ambra, seconda: azzurro, terza+: viola)
- **"Vedi PDF"**: apre il PDF in una modale (se mobile) o nuova tab (se desktop)

---

## Frontend — PromotionsAdminSection

### Lista promozioni

- Verde con dot verde = attiva (oggi è nell'intervallo date + `is_active = true`)
- Grigio con dot grigio = scaduta o disattivata
- Azioni: Modifica, Elimina (con confirm inline — no `window.confirm`)

### Form creazione/modifica

Campi:
1. **Nome** (required)
2. **Tagline** (opzionale)
3. **Valida dal / Valida fino al** (required, date picker)
4. **PDF upload** — drag & drop o click, mostra nome file + dimensione se già caricato
5. **Articoli trigger**:
   - Campo ricerca articolo (cerca per codice/nome nel catalogo `shared.products`) → aggiunge chip blu `exact`
   - Campo testo libero "contiene" → aggiunge chip gialla `contains` (es. `.104.`, `SF`)
   - Ogni chip ha la X per rimuoverla
6. **Selling points** — lista editabile di bullet point (aggiungi/rimuovi/riordina)
7. **Prezzo promozione** (opzionale, number input)
8. **Prezzo di listino** (opzionale, number input) — se entrambi compilati mostra calcolo risparmio in tempo reale
9. **Toggle Attiva/Disattiva**

---

## Struttura file

```
backend/src/
  db/migrations/056-promotions.sql
  db/repositories/promotions.repository.ts
  routes/promotions.router.ts

frontend/src/
  types/promotion.ts
  services/promotions.service.ts
  hooks/usePromotions.ts
  components/new-order-form/
    PromotionAdvisor.tsx
    PromotionAdvisor.spec.tsx
  components/admin/
    PromotionsAdminSection.tsx
    PromotionsAdminSection.spec.tsx
```

---

## Modulo

Aggiunto in `AdminModulesSection.tsx`:

```typescript
{ name: 'promotion-advisor', label: '🏷️ Promotion Advisor', description: 'Mostra banner promozioni Komet attive durante la creazione ordine' }
```

Abilitabile per ruolo e con override per singolo utente, come il semaforo sconto.

---

## Testing

- **Unit** (`PromotionAdvisor.spec.tsx`): `matchesTrigger` con exact/contains, rendering con 0/1/2+ promo, dismiss behavior
- **Unit** (`promotions.repository.spec.ts`): filtro `active` con date boundary, inserimento/aggiornamento JSONB trigger_rules
- **Integration** (`promotions.router.spec.ts`): CRUD completo, auth guard admin, endpoint `/active`

---

## Fuori scope

- Applicazione automatica del prezzo bundle sull'ordine
- Notifiche push quando scade una promo
- Analytics su quante volte un banner è stato visualizzato/chiuso
- Import automatico promozioni da PDF tramite AI (potenziale futuro)
