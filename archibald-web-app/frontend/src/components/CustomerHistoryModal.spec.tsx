import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CustomerHistoryModal } from './CustomerHistoryModal';
import type { CustomerFullHistoryOrder } from '../api/customer-full-history';

vi.mock('../api/customer-full-history', () => ({
  getCustomerFullHistory: vi.fn(),
}));
vi.mock('../services/prices.service', () => ({
  priceService: { getPriceAndVat: vi.fn().mockResolvedValue(null) },
}));

import { getCustomerFullHistory } from '../api/customer-full-history';

const mockOrder = (overrides: Partial<CustomerFullHistoryOrder> = {}): CustomerFullHistoryOrder => ({
  source: 'orders',
  orderId: 'ORD-1',
  orderNumber: 'OF001',
  orderDate: '2024-01-10',
  orderDiscountPercent: 0,
  totalAmount: 100,
  articles: [
    {
      articleCode: 'ART001',
      articleDescription: 'Articolo Uno',
      quantity: 2,
      unitPrice: 10,
      discountPercent: 0,
      lineTotalWithVat: 20,
      vatPercent: 22,
    },
  ],
  ...overrides,
});

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  customerName: 'Cliente Test',
  customerProfileIds: ['PROF-1'],
  subClientCodices: [],
  isFresisClient: false,
  currentOrderItems: [],
  onAddArticle: vi.fn(),
  onAddOrder: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCustomerFullHistory).mockResolvedValue([]);
});

describe('CustomerHistoryModal', () => {
  it('renders nothing when isOpen is false', () => {
    render(<CustomerHistoryModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Storico acquisti')).toBeNull();
  });

  it('calls getCustomerFullHistory with customerProfileIds and subClientCodices when opened', async () => {
    const profileIds = ['PROF-1', 'PROF-2'];
    const codices = ['C00001'];
    render(
      <CustomerHistoryModal
        {...defaultProps}
        customerProfileIds={profileIds}
        subClientCodices={codices}
      />,
    );
    await waitFor(() =>
      expect(getCustomerFullHistory).toHaveBeenCalledWith({
        customerProfileIds: profileIds,
        customerName: 'Cliente Test',
        subClientCodices: codices,
      }),
    );
  });

  it('filters orders by search query matching article code', async () => {
    vi.mocked(getCustomerFullHistory).mockResolvedValue([
      mockOrder({ orderNumber: 'OF001', articles: [{ articleCode: 'ART001', articleDescription: 'Primo', quantity: 1, unitPrice: 10, discountPercent: 0, lineTotalWithVat: 12.2, vatPercent: 22 }] }),
      mockOrder({ orderId: 'ORD-2', orderNumber: 'OF002', totalAmount: 50, articles: [{ articleCode: 'ZZZ999', articleDescription: 'Secondo', quantity: 1, unitPrice: 5, discountPercent: 0, lineTotalWithVat: 6.1, vatPercent: 22 }] }),
    ]);

    render(<CustomerHistoryModal {...defaultProps} />);
    await screen.findByText('OF001');
    await screen.findByText('OF002');

    const searchInput = screen.getByPlaceholderText(/cerca/i);
    fireEvent.change(searchInput, { target: { value: 'ART001' } });

    expect(screen.getByText('OF001')).toBeDefined();
    expect(screen.queryByText('OF002')).toBeNull();
  });

  it('shows error message when fetch fails', async () => {
    vi.mocked(getCustomerFullHistory).mockRejectedValue(new Error('network error'));

    render(<CustomerHistoryModal {...defaultProps} />);

    await screen.findByText(/errore nel caricamento/i);
  });
});
