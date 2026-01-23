import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuantityInput } from './QuantityInput';
import type { ProductVariant } from '../../db/schema';

describe('QuantityInput', () => {
  const mockVariant: ProductVariant = {
    id: 1,
    productId: 'prod-1',
    variantId: 'var-1',
    multipleQty: 5,
    minQty: 10,
    maxQty: 100,
    packageContent: '5 colli',
  };

  test('renders number input', () => {
    render(
      <QuantityInput
        productId="prod-1"
        variant={mockVariant}
        value={10}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Quantità')).toBeInTheDocument();
  });

  test('displays variant constraints', () => {
    render(
      <QuantityInput
        productId="prod-1"
        variant={mockVariant}
        value={10}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText(/Confezione:/)).toBeInTheDocument();
    expect(screen.getByText(/5 colli/)).toBeInTheDocument();
    expect(screen.getByText(/Range:/)).toBeInTheDocument();
    expect(screen.getByText(/10 - 100 unità/)).toBeInTheDocument();
    expect(screen.getByText(/Multiplo:/)).toBeInTheDocument();
    expect(screen.getByText(/5/)).toBeInTheDocument();
  });

  test('validates quantity below minQty', async () => {
    const onChange = vi.fn();
    render(
      <QuantityInput
        productId="prod-1"
        variant={mockVariant}
        value={5}
        onChange={onChange}
      />
    );

    const input = screen.getByLabelText('Quantità');
    await userEvent.clear(input);
    await userEvent.type(input, '5');

    expect(screen.getByText('Quantità minima: 10')).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(5, false);
  });

  test('validates quantity above maxQty', async () => {
    const onChange = vi.fn();
    render(
      <QuantityInput
        productId="prod-1"
        variant={mockVariant}
        value={10}
        onChange={onChange}
      />
    );

    const input = screen.getByLabelText('Quantità');
    await userEvent.clear(input);
    await userEvent.type(input, '150');

    expect(screen.getByText('Quantità massima: 100')).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(150, false);
  });

  test('validates quantity not multiple of multipleQty', async () => {
    const onChange = vi.fn();
    render(
      <QuantityInput
        productId="prod-1"
        variant={mockVariant}
        value={10}
        onChange={onChange}
      />
    );

    const input = screen.getByLabelText('Quantità');
    await userEvent.clear(input);
    await userEvent.type(input, '17');

    expect(screen.getByText('Quantità deve essere multiplo di 5')).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(17, false);
  });

  test('accepts valid quantity', async () => {
    const onChange = vi.fn();
    render(
      <QuantityInput
        productId="prod-1"
        variant={mockVariant}
        value={10}
        onChange={onChange}
      />
    );

    const input = screen.getByLabelText('Quantità');
    await userEvent.clear(input);
    await userEvent.type(input, '20');

    // No error message should be displayed
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(20, true);
  });

  test('displays package content info', () => {
    render(
      <QuantityInput
        productId="prod-1"
        variant={mockVariant}
        value={10}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText(/Confezione:/)).toBeInTheDocument();
    expect(screen.getByText(/5 colli/)).toBeInTheDocument();
  });

  test('calls onChange with validity flag', async () => {
    const onChange = vi.fn();
    render(
      <QuantityInput
        productId="prod-1"
        variant={mockVariant}
        value={10}
        onChange={onChange}
      />
    );

    const input = screen.getByLabelText('Quantità');

    // Valid quantity
    await userEvent.clear(input);
    await userEvent.type(input, '20');
    expect(onChange).toHaveBeenCalledWith(20, true);

    // Invalid quantity (not multiple)
    await userEvent.clear(input);
    await userEvent.type(input, '22');
    expect(onChange).toHaveBeenCalledWith(22, false);
  });

  test('shows no validation error when variant is null', async () => {
    const onChange = vi.fn();
    render(
      <QuantityInput
        productId="prod-1"
        variant={null}
        value={10}
        onChange={onChange}
      />
    );

    const input = screen.getByLabelText('Quantità');
    await userEvent.clear(input);
    await userEvent.type(input, '10');

    // No validation error should appear (variant not selected yet)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(10, true);
  });

  test('handles invalid input (non-numeric)', async () => {
    const onChange = vi.fn();
    render(
      <QuantityInput
        productId="prod-1"
        variant={mockVariant}
        value={10}
        onChange={onChange}
      />
    );

    const input = screen.getByLabelText('Quantità');
    await userEvent.clear(input);
    await userEvent.type(input, 'abc');

    expect(screen.getByText('Quantità non valida')).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(0, false);
  });

  test('disabled state prevents input', () => {
    render(
      <QuantityInput
        productId="prod-1"
        variant={mockVariant}
        value={10}
        onChange={vi.fn()}
        disabled={true}
      />
    );

    const input = screen.getByLabelText('Quantità');
    expect(input).toBeDisabled();
  });

  test('updates input value when prop changes', () => {
    const { rerender } = render(
      <QuantityInput
        productId="prod-1"
        variant={mockVariant}
        value={10}
        onChange={vi.fn()}
      />
    );

    const input = screen.getByLabelText('Quantità') as HTMLInputElement;
    expect(input.value).toBe('10');

    rerender(
      <QuantityInput
        productId="prod-1"
        variant={mockVariant}
        value={20}
        onChange={vi.fn()}
      />
    );

    expect(input.value).toBe('20');
  });

  test('has proper ARIA attributes', () => {
    render(
      <QuantityInput
        productId="prod-1"
        variant={mockVariant}
        value={5} // Invalid
        onChange={vi.fn()}
      />
    );

    const input = screen.getByLabelText('Quantità');

    // Input should have proper ARIA attributes
    expect(input).toHaveAttribute('aria-label', 'Quantità');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'quantity-error-prod-1');

    // Error should have proper role
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
