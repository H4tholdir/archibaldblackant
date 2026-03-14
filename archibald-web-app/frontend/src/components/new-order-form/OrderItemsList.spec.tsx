import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderItemsList } from './OrderItemsList';
import type { OrderItem } from '../../types/order';

const BASE_ITEM: OrderItem = {
  id: 'item-1',
  productId: 'P001',
  article: 'P001',
  productName: 'Test',
  description: '',
  variantId: '',
  quantity: 1,
  packageContent: '',
  unitPrice: 10,
  subtotal: 10,
  discount: 0,
  subtotalAfterDiscount: 10,
  vat: 2.2,
  total: 12.2,
};

const SECOND_ITEM: OrderItem = {
  ...BASE_ITEM,
  id: 'item-2',
  productName: 'Secondo',
};

describe('OrderItemsList', () => {
  it('renders item productName', () => {
    render(<OrderItemsList items={[BASE_ITEM]} onEditItem={() => {}} onDeleteItem={() => {}} />);
    expect(screen.getByText('Test')).toBeTruthy();
  });

  describe('newItemIds', () => {
    it('shows ✓ nuovo badge for rows included in newItemIds', () => {
      render(
        <OrderItemsList
          items={[BASE_ITEM, SECOND_ITEM]}
          onEditItem={() => {}}
          onDeleteItem={() => {}}
          newItemIds={new Set(['item-1'])}
        />,
      );
      expect(screen.getAllByText('✓ nuovo')).toHaveLength(1);
    });

    it('does not show ✓ nuovo badge for rows not in newItemIds', () => {
      render(
        <OrderItemsList
          items={[BASE_ITEM, SECOND_ITEM]}
          onEditItem={() => {}}
          onDeleteItem={() => {}}
          newItemIds={new Set(['item-1'])}
        />,
      );
      // Only item-1 is new — item-2 should not have the badge
      const rows = screen.getAllByRole('row');
      const secondRow = rows.find((r) => r.textContent?.includes('Secondo'));
      expect(secondRow?.textContent).not.toContain('✓ nuovo');
    });

    it('shows no badge when newItemIds is empty', () => {
      render(
        <OrderItemsList
          items={[BASE_ITEM]}
          onEditItem={() => {}}
          onDeleteItem={() => {}}
          newItemIds={new Set()}
        />,
      );
      expect(screen.queryByText('✓ nuovo')).toBeNull();
    });

    it('shows no badge when newItemIds is omitted', () => {
      render(
        <OrderItemsList
          items={[BASE_ITEM]}
          onEditItem={() => {}}
          onDeleteItem={() => {}}
        />,
      );
      expect(screen.queryByText('✓ nuovo')).toBeNull();
    });
  });
});
