// @ts-nocheck
import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderSummary } from "./OrderSummary";
import { formatCurrency } from "../../utils/format-currency";

const fc = (amount: number) => formatCurrency(amount).replace(/\u00a0/g, " ");

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
    expect(screen.getByText(fc(200))).toBeInTheDocument();
    expect(screen.getByText(fc(44))).toBeInTheDocument();
    expect(screen.getByText(fc(244))).toBeInTheDocument();
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

    expect(screen.getByText(`-${fc(20)}`)).toBeInTheDocument();
    expect(screen.getByText(fc(180))).toBeInTheDocument();
    expect(screen.getByText(fc(39.6))).toBeInTheDocument();
    expect(screen.getByText(fc(219.6))).toBeInTheDocument();
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

    expect(screen.getByText(fc(123.456))).toBeInTheDocument();
    expect(screen.getByText(`-${fc(12.345)}`)).toBeInTheDocument();
    expect(screen.getByText(fc(111.11))).toBeInTheDocument();
    expect(screen.getByText(fc(24.44))).toBeInTheDocument();
    expect(screen.getByText(fc(135.55))).toBeInTheDocument();
  });
});
