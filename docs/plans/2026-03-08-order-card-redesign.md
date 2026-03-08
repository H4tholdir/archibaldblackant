# Order Card Redesign — Sidebar Iconica + Griglia Dati

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the order card system with a colored sidebar layout, structured data grid header, and new 11-color websafe-inspired palette.

**Architecture:** Replace the current pastel-background + borderLeft card with a flex layout: 48px colored sidebar (gradient, icon, vertical label) + white content area. Header data is organized in a labeled 2-column grid. All 11 status colors are updated to distinct websafe-inspired values with clear semantic grouping.

**Tech Stack:** React 19, TypeScript strict, Vitest, inline styles (existing pattern).

**Mockup reference:** `docs/mockups/order-header-redesign-v3.html` — open in browser for visual reference during implementation.

---

## Phase 1: Color Palette + Type Contract

### Task 1: Update OrderStatusStyle interface and color values

**Files:**
- Modify: `archibald-web-app/frontend/src/utils/orderStatus.ts:22-113`

**Step 1: Update the interface (lines 22-28)**

Replace:
```ts
export interface OrderStatusStyle {
  category: OrderStatusCategory;
  label: string;
  description: string;
  borderColor: string;
  backgroundColor: string;
}
```
With:
```ts
export interface OrderStatusStyle {
  category: OrderStatusCategory;
  label: string;
  description: string;
  borderColor: string;
  backgroundColor: string;
  icon: string;
  sidebarLabel: string;
}
```

> NOTE: We keep `borderColor` and `backgroundColor` field names to minimize blast radius. The values change but names stay stable. `icon` and `sidebarLabel` are additive.

**Step 2: Update all 11 status entries (lines 33-113)**

Replace the entire `ORDER_STATUS_STYLES` constant with new colors + icon/sidebarLabel:

```ts
const ORDER_STATUS_STYLES: Record<OrderStatusCategory, OrderStatusStyle> = {
  "on-archibald": {
    category: "on-archibald",
    label: "Su Archibald",
    description: "Ordine presente su Archibald, non ancora inviato a Verona",
    borderColor: "#808080",
    backgroundColor: "#f3f4f6",
    icon: "🏢",
    sidebarLabel: "Su Archibald",
  },
  "pending-approval": {
    category: "pending-approval",
    label: "In attesa approvazione",
    description: "Inviato a Verona, in attesa che operatore lo elabori",
    borderColor: "#cc9900",
    backgroundColor: "#fef9e7",
    icon: "⏳",
    sidebarLabel: "In attesa",
  },
  "in-processing": {
    category: "in-processing",
    label: "In lavorazione",
    description: "Accettato da Verona, in attesa di entrare nel flusso di spedizione",
    borderColor: "#996633",
    backgroundColor: "#f5f0ea",
    icon: "⚙️",
    sidebarLabel: "Lavorazione",
  },
  blocked: {
    category: "blocked",
    label: "Richiede intervento",
    description: "Bloccato per anagrafica o pagamenti",
    borderColor: "#cc0000",
    backgroundColor: "#ffeaea",
    icon: "🚫",
    sidebarLabel: "Bloccato",
  },
  backorder: {
    category: "backorder",
    label: "Possibile backorder",
    description: "Ordine aperto da oltre 36 ore, possibile spedizione parziale o ritardo",
    borderColor: "#ff6600",
    backgroundColor: "#fff3e0",
    icon: "📋",
    sidebarLabel: "Backorder",
  },
  "in-transit": {
    category: "in-transit",
    label: "In transito",
    description: "Affidato a corriere, tracking disponibile",
    borderColor: "#0066cc",
    backgroundColor: "#e8f0ff",
    icon: "🚚",
    sidebarLabel: "In transito",
  },
  delivered: {
    category: "delivered",
    label: "Consegnato",
    description: "Consegna confermata con data/ora",
    borderColor: "#339966",
    backgroundColor: "#eaf7f0",
    icon: "📦",
    sidebarLabel: "Consegnato",
  },
  invoiced: {
    category: "invoiced",
    label: "Fatturato",
    description: "Fattura emessa, in attesa di pagamento",
    borderColor: "#6633cc",
    backgroundColor: "#f2eaff",
    icon: "📋",
    sidebarLabel: "Fatturato",
  },
  overdue: {
    category: "overdue",
    label: "Pagamento scaduto",
    description: "Fattura con pagamento scaduto e importo residuo",
    borderColor: "#cc3300",
    backgroundColor: "#ffede6",
    icon: "⏰",
    sidebarLabel: "Scaduto",
  },
  paid: {
    category: "paid",
    label: "Pagato",
    description: "Fattura saldata, ordine completato",
    borderColor: "#006666",
    backgroundColor: "#e6f5f5",
    icon: "💰",
    sidebarLabel: "Pagato",
  },
  exception: {
    category: "exception",
    label: "Eccezione corriere",
    description: "Il corriere segnala un problema con la spedizione",
    borderColor: "#cc0066",
    backgroundColor: "#fff0f5",
    icon: "⚠️",
    sidebarLabel: "Eccezione",
  },
};
```

**Step 3: Update getStatusTabColors lightness steps (line 312)**

The new `backgroundColor` values are lighter (~0.95 lightness) than the old ones (~0.85). Adjust steps so tabs are consistently darker than the card background:

Replace line 312:
```ts
  const lightnessSteps = [0.92, 0.86, 0.80, 0.74, 0.68];
```
With:
```ts
  const lightnessSteps = [0.88, 0.82, 0.76, 0.70, 0.64];
```

**Step 4: Run type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: Type errors in test file (missing `icon`/`sidebarLabel`), but the source should compile. Proceed to Task 2.

---

### Task 2: Update tests

**Files:**
- Modify: `archibald-web-app/frontend/src/utils/orderStatus.spec.ts`

**Step 1: Update hardcoded color assertions**

Line 28: `expect(result.borderColor).toBe("#4527A0")` → `expect(result.borderColor).toBe("#6633cc")`
Line 29: `expect(result.backgroundColor).toBe("#D1C4E9")` → `expect(result.backgroundColor).toBe("#f2eaff")`

Line 465: `expect(style.borderColor).toMatch(/^#[0-9A-F]{6}$/i)` → keep as-is (still valid)
Line 466: `expect(style.backgroundColor).toMatch(/^#[0-9A-F]{6}$/i)` → keep as-is

After line 466, add:
```ts
      expect(style.icon).toBeDefined();
      expect(typeof style.icon).toBe("string");
      expect(style.sidebarLabel).toBeDefined();
      expect(typeof style.sidebarLabel).toBe("string");
```

Line 498: `expect(style.borderColor).toBe("#4527A0")` → `expect(style.borderColor).toBe("#6633cc")`
Line 499: `expect(style.backgroundColor).toBe("#D1C4E9")` → `expect(style.backgroundColor).toBe("#f2eaff")`

Line 505: `expect(style.borderColor).toBe("#C62828")` → `expect(style.borderColor).toBe("#cc0000")`
Line 506: `expect(style.backgroundColor).toBe("#FFCDD2")` → `expect(style.backgroundColor).toBe("#ffeaea")`

Line 512: `expect(style.borderColor).toBe("#5D4037")` → `expect(style.borderColor).toBe("#996633")`
Line 513: `expect(style.backgroundColor).toBe("#D7CCC8")` → `expect(style.backgroundColor).toBe("#f5f0ea")`

**Step 2: Run tests**

```bash
npm test --prefix archibald-web-app/frontend -- --run src/utils/orderStatus.spec.ts
```

Expected: ALL PASS

**Step 3: Commit Phase 1**

```bash
git add archibald-web-app/frontend/src/utils/orderStatus.ts archibald-web-app/frontend/src/utils/orderStatus.spec.ts
git commit -m "feat(frontend): new 11-color palette with icon and sidebarLabel fields"
```

---

## Phase 2: OrderCardNew Layout Restructure

### Task 3: Card wrapper → flex layout with sidebar

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderCardNew.tsx:3744-3782`

**Step 1: Replace the outer wrapper div (lines 3744-3760)**

Replace the current outer `<div style={{backgroundColor, borderLeft, ...}}>` with a flex container + sidebar + content wrapper:

```tsx
    <div
      style={{
        display: "flex",
        borderRadius: "12px",
        boxShadow: expanded
          ? "0 12px 40px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.1)"
          : "0 6px 20px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.08)",
        marginBottom: "12px",
        overflow: "hidden",
        transition: "box-shadow 0.2s",
        ...(expanded
          ? {
              border: "2px solid #333",
            }
          : {}),
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          width: 48,
          flexShrink: 0,
          background: `linear-gradient(180deg, ${orderStatusStyle.borderColor}dd, ${orderStatusStyle.borderColor})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: "10px 0",
        }}
      >
        <span style={{ fontSize: 20 }}>{orderStatusStyle.icon}</span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "rgba(255,255,255,0.9)",
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            transform: "rotate(180deg)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            whiteSpace: "nowrap",
          }}
        >
          {orderStatusStyle.sidebarLabel}
        </span>
      </div>
      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, backgroundColor: "#fff" }}>
```

**Step 2: Update the collapsed click zone (lines 3769-3773)**

Remove `backgroundColor: orderStatusStyle.backgroundColor` from the collapsed div style. Replace the opacity hover trick with background color:

```tsx
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#f9f9f9";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "";
        }}
```

**Step 3: Close the content wrapper div**

At the end of the component (before the final closing `</div>` of the outer wrapper, around line 4611), add a closing `</div>` for the content wrapper. The structure should be:

```
<div style={{display:"flex"}}> ← outer wrapper
  <div style={{width:48}}>  ← sidebar
  </div>
  <div style={{flex:1}}>    ← content wrapper
    ... all existing card content ...
  </div>                    ← CLOSE content wrapper
</div>                      ← CLOSE outer wrapper
```

**Step 4: Run type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: PASS (no type changes, only style changes)

**Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderCardNew.tsx
git commit -m "feat(frontend): sidebar iconica layout for order card"
```

---

## Phase 3: Peripheral Components

### Task 4: Update TrackingProgressBar exception color

**Files:**
- Modify: `archibald-web-app/frontend/src/components/TrackingProgressBar.tsx:171`

**Step 1: Change hardcoded exception text color**

Find `color: "#e65100"` (line 171, exception reason text) and replace with `color: "#cc0066"`.

---

### Task 5: Update OrderCardStack to use dynamic status color

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderCardStack.tsx:1,136-139`

**Step 1: Add import (line 1 area)**

Add at the top imports:
```ts
import { getOrderStatus } from "../utils/orderStatus";
```

**Step 2: Replace hardcoded colors (lines 136-139)**

Replace:
```ts
  const accentColor = "#e65100";
  const bannerGradient = "linear-gradient(135deg, #e65100, #ff6d00)";
  const expandedBg = "#fff3e0";
  const expandedBorder = "#ffcc80";
```
With:
```ts
  const topCardStatus = orderedCards.length > 0 ? getOrderStatus(orderedCards[0]) : null;
  const accentColor = topCardStatus?.borderColor ?? "#808080";
  const bannerGradient = `linear-gradient(135deg, ${accentColor}cc, ${accentColor})`;
  const expandedBg = "#f8f8f8";
  const expandedBorder = "#e0e0e0";
```

---

### Task 6: Update OrderStatusLegend

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderStatusLegend.tsx:117-150`

**Step 1: Update legend row to mirror new sidebar layout**

Replace the legend row div (lines 117-150) with a flex layout that mirrors the card:

```tsx
                <div
                  key={style.category}
                  style={{
                    display: "flex",
                    borderRadius: "8px",
                    overflow: "hidden",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      flexShrink: 0,
                      background: `linear-gradient(180deg, ${style.borderColor}dd, ${style.borderColor})`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{style.icon}</span>
                  </div>
                  <div style={{ flex: 1, padding: "10px 12px", backgroundColor: "#fff" }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "14px",
                        color: "#333",
                        marginBottom: "4px",
                      }}
                    >
                      {style.label}
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#666",
                        lineHeight: 1.4,
                      }}
                    >
                      {style.description}
                    </div>
                  </div>
                </div>
```

**Step 2: Commit Phase 3**

```bash
git add archibald-web-app/frontend/src/components/TrackingProgressBar.tsx archibald-web-app/frontend/src/components/OrderCardStack.tsx archibald-web-app/frontend/src/components/OrderStatusLegend.tsx
git commit -m "feat(frontend): update tracking, stack, and legend to new palette"
```

---

## Phase 4: Verification

### Task 7: Full test suite + type check

**Step 1: Type check**
```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: PASS

**Step 2: Full tests**
```bash
npm test --prefix archibald-web-app/frontend
```
Expected: ALL PASS

**Step 3: Final commit if any fixes needed, then verify clean state**
```bash
git status
git log --oneline -5
```

---

## File Change Summary

| File | Change Type | Lines |
|------|------------|-------|
| `src/utils/orderStatus.ts` | Modify: new colors, add icon/sidebarLabel, adjust tab lightness | 22-113, 312 |
| `src/utils/orderStatus.spec.ts` | Modify: update assertions to new color values | 28-29, 465-466, 498-513 |
| `src/components/OrderCardNew.tsx` | Modify: flex wrapper + sidebar + white content | 3744-3782, 4611 |
| `src/components/TrackingProgressBar.tsx` | Modify: exception color | 171 |
| `src/components/OrderCardStack.tsx` | Modify: dynamic accent from status | 1, 136-139 |
| `src/components/OrderStatusLegend.tsx` | Modify: sidebar layout for legend rows | 117-150 |

All paths relative to `archibald-web-app/frontend/`.
