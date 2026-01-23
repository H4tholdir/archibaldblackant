// @ts-nocheck
import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DiscountSystem } from "./DiscountSystem";

describe("DiscountSystem", () => {
  test("renders with no discount initially", () => {
    const onChange = vi.fn();
    const onReverseCalculate = vi.fn();

    render(
      <DiscountSystem
        orderSubtotal={200}
        onChange={onChange}
        onReverseCalculate={onReverseCalculate}
      />,
    );

    expect(screen.getByText("Sconto Globale")).toBeInTheDocument();
  });

  test("allows switching between percentage and amount discount", () => {
    const onChange = vi.fn();
    const onReverseCalculate = vi.fn();

    render(
      <DiscountSystem
        orderSubtotal={200}
        onChange={onChange}
        onReverseCalculate={onReverseCalculate}
      />,
    );

    const typeSelect = screen.getByLabelText("Tipo Sconto Globale");
    fireEvent.change(typeSelect, { target: { value: "amount" } });

    expect(onChange).toHaveBeenCalledWith({
      discountType: "amount",
      discountValue: 0,
    });
  });

  test("calls onChange when discount value changes", () => {
    const onChange = vi.fn();
    const onReverseCalculate = vi.fn();

    render(
      <DiscountSystem
        orderSubtotal={200}
        discountType="percentage"
        discountValue={0}
        onChange={onChange}
        onReverseCalculate={onReverseCalculate}
      />,
    );

    const valueInput = screen.getByLabelText("Valore Sconto");
    fireEvent.change(valueInput, { target: { value: "10" } });

    expect(onChange).toHaveBeenCalledWith({
      discountType: "percentage",
      discountValue: 10,
    });
  });

  test("shows reverse calculation mode when enabled", () => {
    const onChange = vi.fn();
    const onReverseCalculate = vi.fn();

    render(
      <DiscountSystem
        orderSubtotal={200}
        onChange={onChange}
        onReverseCalculate={onReverseCalculate}
        reverseMode={true}
      />,
    );

    expect(screen.getByText("Totale Desiderato (con IVA)")).toBeInTheDocument();
  });

  test("calls onReverseCalculate when target total changes in reverse mode", () => {
    const onChange = vi.fn();
    const onReverseCalculate = vi.fn();

    render(
      <DiscountSystem
        orderSubtotal={200}
        onChange={onChange}
        onReverseCalculate={onReverseCalculate}
        reverseMode={true}
      />,
    );

    const targetInput = screen.getByLabelText("Totale Desiderato (con IVA)");
    fireEvent.change(targetInput, { target: { value: "183" } });

    expect(onReverseCalculate).toHaveBeenCalledWith(183);
  });

  test("displays calculated discount in reverse mode", () => {
    const onChange = vi.fn();
    const onReverseCalculate = vi.fn();

    render(
      <DiscountSystem
        orderSubtotal={200}
        onChange={onChange}
        onReverseCalculate={onReverseCalculate}
        reverseMode={true}
        calculatedDiscountPercent={25}
        calculatedDiscountAmount={50}
      />,
    );

    expect(screen.getByText(/Sconto calcolato: 25.00%/)).toBeInTheDocument();
    expect(screen.getByText(/€50.00/)).toBeInTheDocument();
  });
});
