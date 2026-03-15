import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CustomerHistoryModal } from './CustomerHistoryModal';
import type { CustomerFullHistoryOrder } from '../api/customer-full-history';

vi.mock('../api/customer-full-history', () => ({
  getCustomerFullHistory: vi.fn(),
}));
vi.mock('../services/prices.service', () => ({
  priceService: {
    getPriceAndVat: vi.fn().mockResolvedValue(null),
    getPriceAndVatBatch: vi.fn().mockResolvedValue(new Map()),
  },
}));

import { getCustomerFullHistory } from '../api/customer-full-history';
import { priceService } from '../services/prices.service';

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

  it('badge ×N increments correctly on each click', async () => {
    vi.mocked(getCustomerFullHistory).mockResolvedValue([
      mockOrder({ articles: [{ articleCode: 'ART001', articleDescription: 'Articolo Uno', quantity: 1, unitPrice: 10, discountPercent: 0, lineTotalWithVat: 12.2, vatPercent: 22 }] }),
    ]);

    render(<CustomerHistoryModal {...defaultProps} isFresisClient={true} />);

    await screen.findByText('ART001');
    const addBtns = screen.getAllByText('+ Aggiungi');
    fireEvent.click(addBtns[0]);

    // Cart counter appears when addedCount > 0
    await waitFor(() => expect(document.getElementById('cart-counter')).not.toBeNull());

    // Second click: button now shows "Aggiunto" text; click it again
    const aggiuntoBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('Aggiunto'));
    expect(aggiuntoBtn).toBeDefined();
    fireEvent.click(aggiuntoBtn!);

    // Counter now shows 2 articles
    await waitFor(() =>
      expect(document.getElementById('cart-counter')?.textContent).toMatch(/2/),
    );
  });

  it('buildPendingItem uses current list price for non-Fresis clients', async () => {
    const listPrice = 20;
    vi.mocked(priceService.getPriceAndVat).mockResolvedValue({ price: listPrice, vat: 22 });
    vi.mocked(getCustomerFullHistory).mockResolvedValue([
      mockOrder({ articles: [{ articleCode: 'ART001', articleDescription: 'Test', quantity: 1, unitPrice: 10, discountPercent: 0, lineTotalWithVat: 12.2, vatPercent: 22 }] }),
    ]);

    const onAddArticle = vi.fn();
    render(<CustomerHistoryModal {...defaultProps} isFresisClient={false} onAddArticle={onAddArticle} />);

    await screen.findByText('ART001');
    const addBtns = screen.getAllByText('+ Aggiungi');
    fireEvent.click(addBtns[0]);

    await waitFor(
      () => expect(onAddArticle).toHaveBeenCalledWith(
        expect.objectContaining({ price: listPrice }),
        false,
      ),
      { timeout: 3000 },
    );
  });

  it('shows ⚠ warning when historical unit price exceeds current list price', async () => {
    vi.mocked(priceService.getPriceAndVatBatch).mockResolvedValue(
      new Map([['ART001', { price: 5, vat: 22 }]]),
    );
    vi.mocked(getCustomerFullHistory).mockResolvedValue([
      mockOrder({ articles: [{ articleCode: 'ART001', articleDescription: 'Test', quantity: 1, unitPrice: 10, discountPercent: 0, lineTotalWithVat: 12.2, vatPercent: 22 }] }),
    ]);

    render(<CustomerHistoryModal {...defaultProps} />);

    await waitFor(() =>
      expect(screen.getByTitle(/Prezzo storico superiore al listino attuale/)).toBeDefined(),
    );
  });

  it('shows "Modifica collegamenti" button when onEditMatching prop is provided', async () => {
    const onEditMatching = vi.fn();
    render(<CustomerHistoryModal {...defaultProps} onEditMatching={onEditMatching} />);

    const editBtn = await screen.findByText(/modifica collegamenti/i);
    fireEvent.click(editBtn);

    expect(onEditMatching).toHaveBeenCalledOnce();
  });

  it('does not show "Modifica collegamenti" button when onEditMatching is not provided', () => {
    render(<CustomerHistoryModal {...defaultProps} />);
    expect(screen.queryByText(/modifica collegamenti/i)).toBeNull();
  });

  it('shows — in listino columns when getPriceAndVatBatch returns null for code', async () => {
    vi.mocked(priceService.getPriceAndVatBatch).mockResolvedValue(
      new Map([['ART001', null]]),
    );
    vi.mocked(getCustomerFullHistory).mockResolvedValue([mockOrder()]);

    render(<CustomerHistoryModal {...defaultProps} />);

    await screen.findByText('ART001');
    await waitFor(() => {
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(2);
    });
  });
});
