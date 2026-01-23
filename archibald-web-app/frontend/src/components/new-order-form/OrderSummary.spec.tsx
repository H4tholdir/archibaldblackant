import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderSummary } from "./OrderSummary";

describe("OrderSummary", () => {
  test("displays order totals with no discount", () => {
    render(
      <OrderSummary
        itemsSubtotal={200}
        globalDiscount={0}
        subtotalAfterGlobalDiscount={200}
        vat={44}
        total={244}
      />,
    );

    expect(screen.getByText("Riepilogo Ordine")).toBeInTheDocument();
    expect(screen.getByText("€200.00")).toBeInTheDocument(); // Items subtotal
    expect(screen.getByText("€44.00")).toBeInTheDocument(); // VAT
    expect(screen.getByText("€244.00")).toBeInTheDocument(); // Total
  });

  test("displays global discount when present", () => {
    render(
      <OrderSummary
        itemsSubtotal={200}
        globalDiscount={20}
        subtotalAfterGlobalDiscount={180}
        vat={39.6}
        total={219.6}
      />,
    );

    expect(screen.getByText("-€20.00")).toBeInTheDocument(); // Global discount
    expect(screen.getByText("€180.00")).toBeInTheDocument(); // Subtotal after discount
    expect(screen.getByText("€39.60")).toBeInTheDocument(); // VAT
    expect(screen.getByText("€219.60")).toBeInTheDocument(); // Total
  });

  test("displays all calculation fields correctly", () => {
    render(
      <OrderSummary
        itemsSubtotal={150}
        globalDiscount={15}
        subtotalAfterGlobalDiscount={135}
        vat={29.7}
        total={164.7}
      />,
    );

    expect(screen.getByText("Subtotale Articoli")).toBeInTheDocument();
    expect(screen.getByText("Sconto Globale")).toBeInTheDocument();
    expect(screen.getByText("Subtotale (dopo sconto)")).toBeInTheDocument();
    expect(screen.getByText("IVA (22%)")).toBeInTheDocument();
    expect(screen.getByText("Totale")).toBeInTheDocument();
  });

  test("formats currency values correctly", () => {
    render(
      <OrderSummary
        itemsSubtotal={123.456}
        globalDiscount={12.345}
        subtotalAfterGlobalDiscount={111.11}
        vat={24.44}
        total={135.55}
      />,
    );

    // Should round to 2 decimal places
    expect(screen.getByText("€123.46")).toBeInTheDocument();
    expect(screen.getByText("-€12.35")).toBeInTheDocument();
    expect(screen.getByText("€111.11")).toBeInTheDocument();
    expect(screen.getByText("€24.44")).toBeInTheDocument();
    expect(screen.getByText("€135.55")).toBeInTheDocument();
  });
});
