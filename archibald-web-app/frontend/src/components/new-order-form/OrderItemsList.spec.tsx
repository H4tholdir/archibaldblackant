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

describe('OrderItemsList', () => {
  it('renders item productName', () => {
    render(<OrderItemsList items={[BASE_ITEM]} onEditItem={() => {}} onDeleteItem={() => {}} />);
    expect(screen.getByText('Test')).toBeTruthy();
  });
});
