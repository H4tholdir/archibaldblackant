import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OrderItemsList } from './OrderItemsList';
import type { OrderItem } from '../../types/order';

const mockItems: OrderItem[] = [
  {
    id: '1',
    productId: 'p1',
    productName: 'Product 1',
    article: 'ART001',
    description: 'Description 1',
    variantId: 'v1',
    quantity: 5,
    packageContent: '5 pezzi',
    unitPrice: 10,
    subtotal: 50,
    discount: 0,
    subtotalAfterDiscount: 50,
    vat: 11,
    total: 61,
  },
  {
    id: '2',
    productId: 'p2',
    productName: 'Product 2',
    article: 'ART002',
    description: 'Description 2',
    variantId: 'v2',
    quantity: 2,
    packageContent: '1 pezzo',
    unitPrice: 100,
    discountType: 'percentage',
    discountValue: 10,
    subtotal: 200,
    discount: 20,
    subtotalAfterDiscount: 180,
    vat: 39.6,
    total: 219.6,
  },
];

describe('OrderItemsList', () => {
  test('renders empty state when no items', () => {
    const onEditItem = vi.fn();
    const onDeleteItem = vi.fn();

    render(
      <OrderItemsList
        items={[]}
        onEditItem={onEditItem}
        onDeleteItem={onDeleteItem}
      />
    );

    expect(
      screen.getByText(/Nessun articolo inserito/i)
    ).toBeInTheDocument();
  });

  test('displays list of items with details', () => {
    const onEditItem = vi.fn();
    const onDeleteItem = vi.fn();

    render(
      <OrderItemsList
        items={mockItems}
        onEditItem={onEditItem}
        onDeleteItem={onDeleteItem}
      />
    );

    expect(screen.getByText('Product 1')).toBeInTheDocument();
    expect(screen.getByText('Codice: ART001')).toBeInTheDocument();
    expect(screen.getByText('Product 2')).toBeInTheDocument();
    expect(screen.getByText('Codice: ART002')).toBeInTheDocument();
    expect(screen.getByText('Articoli (2)')).toBeInTheDocument();
  });

  test('shows item totals correctly', () => {
    const onEditItem = vi.fn();
    const onDeleteItem = vi.fn();

    render(
      <OrderItemsList
        items={mockItems}
        onEditItem={onEditItem}
        onDeleteItem={onDeleteItem}
      />
    );

    expect(screen.getByText('€10.00')).toBeInTheDocument(); // Unit price
    expect(screen.getByText('€61.00')).toBeInTheDocument(); // Total for item 1
    expect(screen.getByText('€100.00')).toBeInTheDocument(); // Unit price
    expect(screen.getByText('-€20.00')).toBeInTheDocument(); // Discount
    expect(screen.getByText('€219.60')).toBeInTheDocument(); // Total for item 2
  });

  test('shows inline discount if present', () => {
    const onEditItem = vi.fn();
    const onDeleteItem = vi.fn();

    render(
      <OrderItemsList
        items={mockItems}
        onEditItem={onEditItem}
        onDeleteItem={onDeleteItem}
      />
    );

    expect(screen.getByText('-€20.00')).toBeInTheDocument();
  });

  test('calls onDeleteItem when delete button clicked after confirmation', () => {
    const onEditItem = vi.fn();
    const onDeleteItem = vi.fn();

    // Mock window.confirm
    global.confirm = vi.fn(() => true);

    render(
      <OrderItemsList
        items={mockItems}
        onEditItem={onEditItem}
        onDeleteItem={onDeleteItem}
      />
    );

    const deleteButtons = screen.getAllByLabelText(/Elimina/);
    fireEvent.click(deleteButtons[0]);

    expect(global.confirm).toHaveBeenCalledWith(
      "Rimuovere Product 1 dall'ordine?"
    );
    expect(onDeleteItem).toHaveBeenCalledWith('1');
  });

  test('does not call onDeleteItem when delete cancelled', () => {
    const onEditItem = vi.fn();
    const onDeleteItem = vi.fn();

    // Mock window.confirm to return false
    global.confirm = vi.fn(() => false);

    render(
      <OrderItemsList
        items={mockItems}
        onEditItem={onEditItem}
        onDeleteItem={onDeleteItem}
      />
    );

    const deleteButtons = screen.getAllByLabelText(/Elimina/);
    fireEvent.click(deleteButtons[0]);

    expect(global.confirm).toHaveBeenCalled();
    expect(onDeleteItem).not.toHaveBeenCalled();
  });

  test('opens edit modal when edit button clicked', () => {
    const onEditItem = vi.fn();
    const onDeleteItem = vi.fn();

    render(
      <OrderItemsList
        items={mockItems}
        onEditItem={onEditItem}
        onDeleteItem={onDeleteItem}
      />
    );

    const editButtons = screen.getAllByLabelText(/Modifica/);
    fireEvent.click(editButtons[0]);

    expect(screen.getByText('Modifica Articolo')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantità')).toBeInTheDocument();
  });

  test('calls onEditItem when edit modal saved', () => {
    const onEditItem = vi.fn();
    const onDeleteItem = vi.fn();

    render(
      <OrderItemsList
        items={mockItems}
        onEditItem={onEditItem}
        onDeleteItem={onDeleteItem}
      />
    );

    const editButtons = screen.getAllByLabelText(/Modifica/);
    fireEvent.click(editButtons[0]);

    // Change quantity
    const quantityInput = screen.getByLabelText('Quantità');
    fireEvent.change(quantityInput, { target: { value: '10' } });

    // Save
    const saveButton = screen.getByText('Salva');
    fireEvent.click(saveButton);

    expect(onEditItem).toHaveBeenCalledWith('1', expect.objectContaining({
      quantity: 10,
    }));
  });

  test('closes edit modal when cancel clicked', () => {
    const onEditItem = vi.fn();
    const onDeleteItem = vi.fn();

    render(
      <OrderItemsList
        items={mockItems}
        onEditItem={onEditItem}
        onDeleteItem={onDeleteItem}
      />
    );

    const editButtons = screen.getAllByLabelText(/Modifica/);
    fireEvent.click(editButtons[0]);

    expect(screen.getByText('Modifica Articolo')).toBeInTheDocument();

    const cancelButton = screen.getByText('Annulla');
    fireEvent.click(cancelButton);

    expect(screen.queryByText('Modifica Articolo')).not.toBeInTheDocument();
  });
});
