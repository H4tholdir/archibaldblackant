// @ts-nocheck
import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DiscountSystem } from "./DiscountSystem";

vi.mock("../../hooks/useKeyboardScroll", () => ({
  useKeyboardScroll: () => ({
    keyboardHeight: 0,
    keyboardOpen: false,
    scrollFieldIntoView: vi.fn(),
    keyboardPaddingStyle: {},
    modalOverlayKeyboardStyle: {},
  }),
}));

describe("DiscountSystem", () => {
  test("renders with header", () => {
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

  test("renders percentage discount input in non-reverse mode", () => {
    const onChange = vi.fn();
    const onReverseCalculate = vi.fn();

    render(
      <DiscountSystem
        orderSubtotal={200}
        onChange={onChange}
        onReverseCalculate={onReverseCalculate}
      />,
    );

    const input = screen.getByLabelText("Sconto Globale (%)");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "number");
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

    const valueInput = screen.getByLabelText("Sconto Globale (%)");
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

    expect(
      screen.getByText("Totale Desiderato (con IVA)"),
    ).toBeInTheDocument();
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

    expect(
      screen.getByText(/Sconto calcolato: 25\.00%/),
    ).toBeInTheDocument();
    expect(screen.getByText(/50,00.*€/)).toBeInTheDocument();
  });
});
