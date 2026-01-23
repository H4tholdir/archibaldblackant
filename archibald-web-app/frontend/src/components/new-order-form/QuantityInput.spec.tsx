import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { QuantityInput } from "./QuantityInput";
import type { ProductVariant } from "../../db/schema";

const mockVariant: ProductVariant = {
  id: 1,
  productId: "P1",
  variantId: "V1",
  multipleQty: 10,
  minQty: 10,
  maxQty: 100,
  packageContent: "100 pezzi per confezione",
};

const mockVariantNoMultiple: ProductVariant = {
  id: 2,
  productId: "P2",
  variantId: "V2",
  multipleQty: 1,
  minQty: 1,
  maxQty: 500,
  packageContent: "50 pezzi per scatola",
};

describe("QuantityInput", () => {
  test("renders number input", () => {
    render(
      <QuantityInput
        productId="P1"
        variant={null}
        value={10}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Quantità");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "number");
  });

  test("displays current value", () => {
    render(
      <QuantityInput
        productId="P1"
        variant={null}
        value={25}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Quantità") as HTMLInputElement;
    expect(input.value).toBe("25");
  });

  test("displays variant constraints when variant provided", () => {
    render(
      <QuantityInput
        productId="P1"
        variant={mockVariant}
        value={10}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/Confezione:/i)).toBeInTheDocument();
    expect(screen.getByText(/100 pezzi per confezione/i)).toBeInTheDocument();
    expect(screen.getByText(/Range:/i)).toBeInTheDocument();
    expect(screen.getByText(/10 - 100 unità/i)).toBeInTheDocument();
    expect(screen.getByText(/Multiplo:/i)).toBeInTheDocument();
    expect(screen.getByText(/10/i)).toBeInTheDocument();
  });

  test("does not display multiplo when multipleQty is 1", () => {
    render(
      <QuantityInput
        productId="P2"
        variant={mockVariantNoMultiple}
        value={10}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/Confezione:/i)).toBeInTheDocument();
    expect(screen.getByText(/Range:/i)).toBeInTheDocument();
    expect(screen.queryByText(/Multiplo:/i)).not.toBeInTheDocument();
  });

  test("validates quantity below minQty", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <QuantityInput
        productId="P1"
        variant={mockVariant}
        value={10}
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText("Quantità");
    await user.clear(input);
    await user.type(input, "5");

    expect(screen.getByText(/Quantità minima: 10/i)).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(5, false);
  });

  test("validates quantity above maxQty", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <QuantityInput
        productId="P1"
        variant={mockVariant}
        value={10}
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText("Quantità");
    await user.clear(input);
    await user.type(input, "150");

    expect(screen.getByText(/Quantità massima: 100/i)).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(150, false);
  });

  test("validates quantity not multiple of multipleQty", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <QuantityInput
        productId="P1"
        variant={mockVariant}
        value={10}
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText("Quantità");
    await user.clear(input);
    await user.type(input, "15");

    expect(
      screen.getByText(/Quantità deve essere multiplo di 10/i),
    ).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(15, false);
  });

  test("accepts valid quantity", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <QuantityInput
        productId="P1"
        variant={mockVariant}
        value={10}
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText("Quantità");
    await user.clear(input);
    await user.type(input, "20");

    expect(screen.queryByText(/Quantità minima/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Quantità massima/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Quantità deve essere multiplo/i),
    ).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(20, true);
  });

  test("shows error for invalid input (NaN)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <QuantityInput
        productId="P1"
        variant={mockVariant}
        value={10}
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText("Quantità");
    await user.clear(input);
    await user.type(input, "abc");

    expect(screen.getByText(/Quantità non valida/i)).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(0, false);
  });

  test("shows error for zero or negative quantity", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <QuantityInput
        productId="P1"
        variant={mockVariant}
        value={10}
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText("Quantità");
    await user.clear(input);
    await user.type(input, "0");

    expect(screen.getByText(/Quantità non valida/i)).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(0, false);
  });

  test("input has correct HTML attributes based on variant", () => {
    render(
      <QuantityInput
        productId="P1"
        variant={mockVariant}
        value={10}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Quantità") as HTMLInputElement;
    expect(input).toHaveAttribute("min", "10");
    expect(input).toHaveAttribute("max", "100");
    expect(input).toHaveAttribute("step", "10");
  });

  test("input has default attributes when no variant", () => {
    render(
      <QuantityInput
        productId="P1"
        variant={null}
        value={10}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Quantità") as HTMLInputElement;
    expect(input).toHaveAttribute("min", "1");
    expect(input).toHaveAttribute("step", "1");
  });

  test("validation error has correct ARIA attributes", async () => {
    const user = userEvent.setup();

    render(
      <QuantityInput
        productId="P1"
        variant={mockVariant}
        value={10}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Quantità");
    await user.clear(input);
    await user.type(input, "5");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "quantity-error-P1");

    const errorMessage = screen.getByRole("alert");
    expect(errorMessage).toHaveAttribute("id", "quantity-error-P1");
  });

  test("no ARIA error attributes when valid", async () => {
    const user = userEvent.setup();

    render(
      <QuantityInput
        productId="P1"
        variant={mockVariant}
        value={10}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Quantità");
    await user.clear(input);
    await user.type(input, "20");

    expect(input).toHaveAttribute("aria-invalid", "false");
  });

  test("disabled prop disables input", () => {
    render(
      <QuantityInput
        productId="P1"
        variant={mockVariant}
        value={10}
        onChange={vi.fn()}
        disabled={true}
      />,
    );

    const input = screen.getByLabelText("Quantità");
    expect(input).toBeDisabled();
  });

  test("updates value when prop changes", () => {
    const { rerender } = render(
      <QuantityInput
        productId="P1"
        variant={mockVariant}
        value={10}
        onChange={vi.fn()}
      />,
    );

    let input = screen.getByLabelText("Quantità") as HTMLInputElement;
    expect(input.value).toBe("10");

    rerender(
      <QuantityInput
        productId="P1"
        variant={mockVariant}
        value={20}
        onChange={vi.fn()}
      />,
    );

    input = screen.getByLabelText("Quantità") as HTMLInputElement;
    expect(input.value).toBe("20");
  });

  test("no constraints shown when variant is null", () => {
    render(
      <QuantityInput
        productId="P1"
        variant={null}
        value={10}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByText(/Confezione:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Range:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Multiplo:/i)).not.toBeInTheDocument();
  });
});
