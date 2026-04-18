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
