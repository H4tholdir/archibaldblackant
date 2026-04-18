# Inline Edit Mini-Panel — Articoli Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando un filtro anomalia è attivo nella pagina Articoli, ogni card prodotto mostra una mini-banda colorata sotto l'header con il campo mancante; dopo il salvataggio la card sparisce dalla lista.

**Architecture:** Tre props nuove su `ProductCard` (`inlineEditMode`, `onSaveSuccess`); `ArticoliList` le passa in base al filtro attivo e rimuove la card dallo state al salvataggio. Nuova funzione `addFresisDiscountForProduct` in `fresis-discounts.ts` per il filtro sconto.

**Tech Stack:** React 19, TypeScript strict, Vitest + Testing Library, API REST esistente

---

## File map

| File | Tipo | Responsabilità |
|------|------|----------------|
| `frontend/src/api/fresis-discounts.ts` | Modify | Aggiunge `addFresisDiscountForProduct` |
| `frontend/src/api/fresis-discounts.spec.ts` | Create | Unit test per `addFresisDiscountForProduct` |
| `frontend/src/components/ProductCard.tsx` | Modify | Aggiunge props inline edit + 3 mini-panel + stato discount |
| `frontend/src/components/ProductCard.spec.tsx` | Create | Test mini-panel: render, validazione, callback save |
| `frontend/src/pages/ArticoliList.tsx` | Modify | Passa `inlineEditMode`/`onSaveSuccess`; gestisce `handleInlineSaveSuccess` |

---

## Task 1: `addFresisDiscountForProduct` in `fresis-discounts.ts`

**Files:**
- Modify: `archibald-web-app/frontend/src/api/fresis-discounts.ts`
- Create: `archibald-web-app/frontend/src/api/fresis-discounts.spec.ts`

- [ ] **Step 1: Scrivi il test fallente**

Crea `archibald-web-app/frontend/src/api/fresis-discounts.spec.ts`:

```ts
import { describe, expect, test, vi, beforeEach } from "vitest";
import { addFresisDiscountForProduct } from "./fresis-discounts";
import { fetchWithRetry } from "../utils/fetch-with-retry";

vi.mock("../utils/fetch-with-retry", () => ({
  fetchWithRetry: vi.fn(),
}));

describe("addFresisDiscountForProduct", () => {
  const token = "test-token";
  const productId = "TD4041.000.";
  const discountPercent = 63;

  beforeEach(() => {
    vi.mocked(fetchWithRetry).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);
  });

  test("POSTa a /api/fresis-history/discounts con id, articleCode e discountPercent", async () => {
    await addFresisDiscountForProduct(token, productId, discountPercent);

    expect(fetchWithRetry).toHaveBeenCalledWith(
      "/api/fresis-history/discounts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ id: productId, articleCode: productId, discountPercent }),
      }),
    );
  });

  test("lancia errore se la risposta non è ok", async () => {
    vi.mocked(fetchWithRetry).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Server error" }),
    } as Response);

    await expect(
      addFresisDiscountForProduct(token, productId, discountPercent),
    ).rejects.toThrow("Server error");
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

```bash
npm test --prefix archibald-web-app/frontend -- fresis-discounts.spec
```

Atteso: FAIL con "addFresisDiscountForProduct is not a function"

- [ ] **Step 3: Implementa la funzione**

In `archibald-web-app/frontend/src/api/fresis-discounts.ts`, aggiungi alla fine del file (prima dell'ultima riga vuota):

```ts
export async function addFresisDiscountForProduct(
  token: string,
  productId: string,
  discountPercent: number,
): Promise<void> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/fresis-history/discounts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: productId, articleCode: productId, discountPercent }),
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as { error?: string }).error || `HTTP ${response.status}`);
  }
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

```bash
npm test --prefix archibald-web-app/frontend -- fresis-discounts.spec
```

Atteso: PASS (2 test)

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/api/fresis-discounts.ts \
        archibald-web-app/frontend/src/api/fresis-discounts.spec.ts
git commit -m "feat(products): addFresisDiscountForProduct con test"
```

---

## Task 2: ProductCard — mini-panel (TDD)

**Files:**
- Create: `archibald-web-app/frontend/src/components/ProductCard.spec.tsx`
- Modify: `archibald-web-app/frontend/src/components/ProductCard.tsx`

- [ ] **Step 1: Scrivi tutti i test fallenti per il mini-panel**

Crea `archibald-web-app/frontend/src/components/ProductCard.spec.tsx`:

```tsx
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { ProductCard } from "./ProductCard";
import type { Product } from "../api/products";
import { updateProductVat, updateProductPrice } from "../api/products";
import { addFresisDiscountForProduct } from "../api/fresis-discounts";

vi.mock("../api/products", async () => {
  const actual = await vi.importActual<typeof import("../api/products")>("../api/products");
  return {
    ...actual,
    updateProductVat: vi.fn(),
    updateProductPrice: vi.fn(),
  };
});

vi.mock("../api/fresis-discounts", () => ({
  addFresisDiscountForProduct: vi.fn(),
}));

const mockProduct: Product = {
  id: "TEST001",
  name: "TEST001",
  description: "Test product",
};

beforeEach(() => {
  vi.mocked(updateProductVat).mockResolvedValue({ success: true });
  vi.mocked(updateProductPrice).mockResolvedValue({ success: true });
  vi.mocked(addFresisDiscountForProduct).mockResolvedValue();
});

describe("ProductCard — inlineEditMode='vat'", () => {
  test("mostra il mini-panel con label 'IVA mancante' e input placeholder 'es. 22'", () => {
    render(
      <ProductCard product={mockProduct} expanded={false} onToggle={vi.fn()} inlineEditMode="vat" />,
    );
    expect(screen.getByText("IVA mancante")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("es. 22")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva" })).toBeInTheDocument();
  });

  test("non mostra il mini-panel quando inlineEditMode è undefined", () => {
    render(<ProductCard product={mockProduct} expanded={false} onToggle={vi.fn()} />);
    expect(screen.queryByText("IVA mancante")).not.toBeInTheDocument();
  });

  test("chiama updateProductVat e onSaveSuccess dopo salvataggio valido", async () => {
    const onSaveSuccess = vi.fn();
    const user = userEvent.setup();

    render(
      <ProductCard
        product={mockProduct}
        expanded={false}
        onToggle={vi.fn()}
        inlineEditMode="vat"
        onSaveSuccess={onSaveSuccess}
      />,
    );

    await user.type(screen.getByPlaceholderText("es. 22"), "22");
    await user.click(screen.getByRole("button", { name: "Salva" }));

    await waitFor(() =>
      expect(updateProductVat).toHaveBeenCalledWith("", "TEST001", 22),
    );
    expect(onSaveSuccess).toHaveBeenCalledOnce();
  });

  test("mostra errore per IVA > 100 senza chiamare l'API", async () => {
    const user = userEvent.setup();

    render(
      <ProductCard product={mockProduct} expanded={false} onToggle={vi.fn()} inlineEditMode="vat" />,
    );

    await user.type(screen.getByPlaceholderText("es. 22"), "150");
    await user.click(screen.getByRole("button", { name: "Salva" }));

    expect(screen.getByText("Valore non valido (0–100)")).toBeInTheDocument();
    expect(updateProductVat).not.toHaveBeenCalled();
  });
});

describe("ProductCard — inlineEditMode='price'", () => {
  test("mostra il mini-panel con label 'Prezzo mancante' e input placeholder 'es. 285.00'", () => {
    render(
      <ProductCard product={mockProduct} expanded={false} onToggle={vi.fn()} inlineEditMode="price" />,
    );
    expect(screen.getByText("Prezzo mancante")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("es. 285.00")).toBeInTheDocument();
  });

  test("chiama updateProductPrice e onSaveSuccess dopo salvataggio valido", async () => {
    const onSaveSuccess = vi.fn();
    const user = userEvent.setup();

    render(
      <ProductCard
        product={mockProduct}
        expanded={false}
        onToggle={vi.fn()}
        inlineEditMode="price"
        onSaveSuccess={onSaveSuccess}
      />,
    );

    await user.type(screen.getByPlaceholderText("es. 285.00"), "285");
    await user.click(screen.getByRole("button", { name: "Salva" }));

    await waitFor(() =>
      expect(updateProductPrice).toHaveBeenCalledWith("", "TEST001", 285),
    );
    expect(onSaveSuccess).toHaveBeenCalledOnce();
  });

  test("mostra errore per prezzo negativo senza chiamare l'API", async () => {
    const user = userEvent.setup();

    render(
      <ProductCard product={mockProduct} expanded={false} onToggle={vi.fn()} inlineEditMode="price" />,
    );

    await user.type(screen.getByPlaceholderText("es. 285.00"), "-5");
    await user.click(screen.getByRole("button", { name: "Salva" }));

    expect(screen.getByText("Valore non valido (≥ 0)")).toBeInTheDocument();
    expect(updateProductPrice).not.toHaveBeenCalled();
  });
});

describe("ProductCard — inlineEditMode='discount'", () => {
  test("mostra il mini-panel con label 'Sconto Fresis' e input placeholder 'es. 63'", () => {
    render(
      <ProductCard product={mockProduct} expanded={false} onToggle={vi.fn()} inlineEditMode="discount" />,
    );
    expect(screen.getByText("Sconto Fresis")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("es. 63")).toBeInTheDocument();
  });

  test("chiama addFresisDiscountForProduct e onSaveSuccess dopo salvataggio valido", async () => {
    const onSaveSuccess = vi.fn();
    const user = userEvent.setup();

    render(
      <ProductCard
        product={mockProduct}
        expanded={false}
        onToggle={vi.fn()}
        inlineEditMode="discount"
        onSaveSuccess={onSaveSuccess}
      />,
    );

    await user.type(screen.getByPlaceholderText("es. 63"), "63");
    await user.click(screen.getByRole("button", { name: "Salva" }));

    await waitFor(() =>
      expect(addFresisDiscountForProduct).toHaveBeenCalledWith("", "TEST001", 63),
    );
    expect(onSaveSuccess).toHaveBeenCalledOnce();
  });

  test("mostra errore per sconto > 100 senza chiamare l'API", async () => {
    const user = userEvent.setup();

    render(
      <ProductCard product={mockProduct} expanded={false} onToggle={vi.fn()} inlineEditMode="discount" />,
    );

    await user.type(screen.getByPlaceholderText("es. 63"), "150");
    await user.click(screen.getByRole("button", { name: "Salva" }));

    expect(screen.getByText("Valore non valido (0–100)")).toBeInTheDocument();
    expect(addFresisDiscountForProduct).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

```bash
npm test --prefix archibald-web-app/frontend -- ProductCard.spec
```

Atteso: FAIL — le props `inlineEditMode` e `onSaveSuccess` non esistono su `ProductCard`

- [ ] **Step 3: Implementa le modifiche a `ProductCard.tsx`**

Sostituisci l'intero contenuto di `archibald-web-app/frontend/src/components/ProductCard.tsx` con la versione aggiornata:

**3a. Aggiungi import** in cima al file, dopo la riga esistente degli import:
```ts
import { addFresisDiscountForProduct } from "../api/fresis-discounts";
```

**3b. Aggiorna l'interfaccia `ProductCardProps`:**
```ts
interface ProductCardProps {
  product: Product;
  expanded: boolean;
  onToggle: () => void;
  inlineEditMode?: "vat" | "price" | "discount";
  onSaveSuccess?: () => void;
}
```

**3c. Aggiorna la firma della funzione:**
```ts
export function ProductCard({
  product,
  expanded,
  onToggle,
  inlineEditMode,
  onSaveSuccess,
}: ProductCardProps) {
```

**3d. Aggiungi nuovo state** dopo le righe `const [savedPrice, setSavedPrice] = useState<number | null>(null);`:
```ts
const [discountInput, setDiscountInput] = useState("");
const [savingDiscount, setSavingDiscount] = useState(false);
const [discountError, setDiscountError] = useState("");
```

**3e. Aggiungi l'handler** dopo la funzione `formatDateString` (prima del `return`):
```ts
const handleMiniPanelSave = async (e: React.MouseEvent) => {
  e.stopPropagation();
  const token = localStorage.getItem("archibald_jwt") || "";

  if (inlineEditMode === "vat") {
    const parsed = parseFloat(vatInput);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      setVatError("Valore non valido (0–100)");
      return;
    }
    setSavingVat(true);
    setVatError("");
    try {
      await updateProductVat(token, product.id, parsed);
      onSaveSuccess?.();
    } catch (err: unknown) {
      setVatError(err instanceof Error ? err.message : "Errore salvataggio");
    } finally {
      setSavingVat(false);
    }
  } else if (inlineEditMode === "price") {
    const parsed = parseFloat(priceInput);
    if (isNaN(parsed) || parsed < 0) {
      setPriceError("Valore non valido (≥ 0)");
      return;
    }
    setSavingPrice(true);
    setPriceError("");
    try {
      await updateProductPrice(token, product.id, parsed);
      onSaveSuccess?.();
    } catch (err: unknown) {
      setPriceError(err instanceof Error ? err.message : "Errore salvataggio");
    } finally {
      setSavingPrice(false);
    }
  } else if (inlineEditMode === "discount") {
    const parsed = parseFloat(discountInput);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      setDiscountError("Valore non valido (0–100)");
      return;
    }
    setSavingDiscount(true);
    setDiscountError("");
    try {
      await addFresisDiscountForProduct(token, product.id, parsed);
      onSaveSuccess?.();
    } catch (err: unknown) {
      setDiscountError(err instanceof Error ? err.message : "Errore salvataggio");
    } finally {
      setSavingDiscount(false);
    }
  }
};
```

**3f. Aggiungi il mini-panel JSX** subito dopo la chiusura del `{/* Card Header */}` `</div>` e prima dell'`{/* Expanded Details */}` `{expanded && ...}`:

```tsx
{/* Inline Edit Mini-Panel */}
{inlineEditMode && (() => {
  const cfg =
    inlineEditMode === "vat"
      ? {
          bgColor: "#fff8e1",
          borderColor: "#ffc107",
          labelColor: "#f57f17",
          label: "IVA mancante",
          placeholder: "es. 22",
          unit: "%",
          btnColor: "#f9a825",
          inputWidth: "80px",
          value: vatInput,
          onChange: (v: string) => { setVatInput(v); setVatError(""); },
          saving: savingVat,
          error: vatError,
        }
      : inlineEditMode === "price"
      ? {
          bgColor: "#fce4ec",
          borderColor: "#e91e63",
          labelColor: "#880e4f",
          label: "Prezzo mancante",
          placeholder: "es. 285.00",
          unit: "EUR",
          btnColor: "#e91e63",
          inputWidth: "110px",
          value: priceInput,
          onChange: (v: string) => { setPriceInput(v); setPriceError(""); },
          saving: savingPrice,
          error: priceError,
        }
      : {
          bgColor: "#f3e5f5",
          borderColor: "#9c27b0",
          labelColor: "#6a1b9a",
          label: "Sconto Fresis",
          placeholder: "es. 63",
          unit: "%",
          btnColor: "#9c27b0",
          inputWidth: "80px",
          value: discountInput,
          onChange: (v: string) => { setDiscountInput(v); setDiscountError(""); },
          saving: savingDiscount,
          error: discountError,
        };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        borderTop: `2px solid ${cfg.borderColor}`,
        backgroundColor: cfg.bgColor,
        padding: "10px 18px",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "10px",
        fontSize: "13px",
      }}
    >
      <span style={{ fontWeight: 700, color: cfg.labelColor, minWidth: "100px" }}>
        {cfg.label}
      </span>
      <input
        autoComplete="off"
        type="number"
        min={0}
        max={inlineEditMode !== "price" ? 100 : undefined}
        step={inlineEditMode === "price" ? 0.01 : 1}
        placeholder={cfg.placeholder}
        value={cfg.value}
        onChange={(e) => cfg.onChange(e.target.value)}
        style={{
          width: cfg.inputWidth,
          padding: "4px 8px",
          fontSize: "13px",
          border: `1.5px solid ${cfg.error ? "#c62828" : "#bbb"}`,
          borderRadius: "6px",
          outline: "none",
        }}
      />
      <span style={{ fontSize: "13px", color: "#666" }}>{cfg.unit}</span>
      <button
        disabled={cfg.saving || !cfg.value}
        onClick={handleMiniPanelSave}
        style={{
          padding: "4px 14px",
          fontSize: "13px",
          fontWeight: 600,
          backgroundColor: cfg.saving ? "#bdbdbd" : cfg.btnColor,
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          cursor: cfg.saving ? "not-allowed" : "pointer",
        }}
      >
        {cfg.saving ? "..." : "Salva"}
      </button>
      {cfg.error && (
        <span style={{ color: "#c62828", fontSize: "12px" }}>{cfg.error}</span>
      )}
    </div>
  );
})()}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

```bash
npm test --prefix archibald-web-app/frontend -- ProductCard.spec
```

Atteso: PASS (9 test)

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/ProductCard.tsx \
        archibald-web-app/frontend/src/components/ProductCard.spec.tsx
git commit -m "feat(products): inline edit mini-panel su ProductCard (IVA, prezzo, sconto)"
```

---

## Task 3: ArticoliList — wire up `inlineEditMode` e `onSaveSuccess`

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/ArticoliList.tsx`

- [ ] **Step 1: Aggiungi `handleInlineSaveSuccess`**

In `ArticoliList.tsx`, aggiungi questa funzione dopo `handleToggleDiscountFilter` (riga ~190):

```ts
const handleInlineSaveSuccess = (productId: string) => {
  setProducts((prev) => prev.filter((p) => p.id !== productId));
  if (vatFilterActive) setNoVatCount((prev) => Math.max(0, prev - 1));
  if (priceFilterActive) setZeroPriceCount((prev) => Math.max(0, prev - 1));
  if (discountFilterActive) setMissingDiscountCount((prev) => Math.max(0, prev - 1));
};
```

- [ ] **Step 2: Aggiorna il render di `ProductCard` nel product list**

Sostituisci il blocco `products.map(...)` (riga ~715) con:

```tsx
{products.map((product) => (
  <ProductCard
    key={product.id}
    product={product}
    expanded={false}
    onToggle={() => handleCardClick(product)}
    inlineEditMode={
      vatFilterActive
        ? "vat"
        : priceFilterActive
        ? "price"
        : discountFilterActive
        ? "discount"
        : undefined
    }
    onSaveSuccess={
      vatFilterActive || priceFilterActive || discountFilterActive
        ? () => handleInlineSaveSuccess(product.id)
        : undefined
    }
  />
))}
```

- [ ] **Step 3: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Atteso: nessun errore TypeScript

- [ ] **Step 4: Esegui tutti i test frontend**

```bash
npm test --prefix archibald-web-app/frontend
```

Atteso: tutti i test passano (inclusi i nuovi ProductCard.spec e fresis-discounts.spec)

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/pages/ArticoliList.tsx
git commit -m "feat(products): ArticoliList passa inlineEditMode e rimuove card post-save"
```

---

## Verifica finale manuale

Dopo l'implementazione, verificare manualmente su `http://localhost:5173/products`:

1. Attivare filtro "Senza IVA" → le card mostrano la banda gialla con input `%`
2. Inserire un valore (es. 22), cliccare Salva → card sparisce, contatore decrementato
3. Attivare filtro "Prezzo = 0" → banda rosa con input `EUR`
4. Attivare filtro "Sconto Fresis" → banda viola con input `%`
5. Verificare che il click sull'input non espanda la card
6. Verificare che un valore invalido (es. 150 per IVA) mostri il messaggio di errore
