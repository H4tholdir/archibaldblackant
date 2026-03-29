import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { CustomerHistoryModal } from './CustomerHistoryModal';
import type { CustomerFullHistoryOrder } from '../api/customer-full-history';

vi.mock('../api/customer-full-history', () => ({
  getCustomerFullHistory: vi.fn(),
}));
vi.mock('../services/prices.service', () => ({
  priceService: {
    getPriceAndVat: vi.fn().mockResolvedValue(null),
    getPriceAndVatBatch: vi.fn().mockResolvedValue(new Map()),
    fuzzyMatchArticleCode: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('../services/warehouse-matching', () => ({
  findWarehouseMatchesBatch: vi.fn().mockResolvedValue(new Map()),
}));

import { getCustomerFullHistory } from '../api/customer-full-history';
import { priceService } from '../services/prices.service';
import { findWarehouseMatchesBatch } from '../services/warehouse-matching';

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
  customerErpIds: ['PROF-1'],
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
        customerErpIds={profileIds}
        subClientCodices={codices}
      />,
    );
    await waitFor(() =>
      expect(getCustomerFullHistory).toHaveBeenCalledWith({
        customerErpIds: profileIds,
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
    const addBtn = screen.getAllByRole('button', { name: '+ Aggiungi' })[0];
    fireEvent.click(addBtn);

    // Cart counter appears when addedCount > 0
    await waitFor(() => expect(document.getElementById('cart-counter')).not.toBeNull());

    // Button shows "Aggiunto ✓" (green flash state)
    expect(screen.getByText('Aggiunto ✓')).toBeDefined();

    // Second click on the same button element (still valid DOM ref)
    fireEvent.click(addBtn);

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
    const addBtns = screen.getAllByRole('button', { name: '+ Aggiungi' });
    fireEvent.click(addBtns[0]);

    await waitFor(
      () => expect(onAddArticle).toHaveBeenCalledWith(
        expect.objectContaining({ price: listPrice }),
        false,
      ),
      { timeout: 3000 },
    );
  });

  it('shows "Modifica collegamenti" button when onEditMatching prop is provided', async () => {
    const onEditMatching = vi.fn();
    render(<CustomerHistoryModal {...defaultProps} onEditMatching={onEditMatching} />);

    const editBtn = await screen.findByText(/modifica collegamenti/i);
    fireEvent.click(editBtn);

    expect(onEditMatching).toHaveBeenCalledOnce();
  });

  it('does not show "Modifica collegamenti" button when onEditMatching is not provided', async () => {
    render(<CustomerHistoryModal {...defaultProps} />);
    expect(screen.queryByText(/modifica collegamenti/i)).toBeNull();
    await act(async () => {});
  });

  it('shows substitution indicator when fuzzy match found for Fresis article', async () => {
    const oldCode = 'OLD-123';
    const newCode = 'NEW-124';
    vi.mocked(priceService.getPriceAndVatBatch).mockResolvedValue(new Map([[oldCode, null]]));
    vi.mocked(priceService.fuzzyMatchArticleCode).mockResolvedValue(newCode);
    vi.mocked(getCustomerFullHistory).mockResolvedValue([
      mockOrder({ source: 'fresis', orderId: 'F-1', articles: [{ articleCode: oldCode, articleDescription: 'Old Article', quantity: 1, unitPrice: 10, discountPercent: 0, lineTotalWithVat: 10, vatPercent: 22 }] }),
    ]);

    render(<CustomerHistoryModal {...defaultProps} isFresisClient={true} />);

    await screen.findByText(oldCode);
    await waitFor(() => expect(screen.getByText(`→ ${newCode}`)).toBeDefined());
  });

  it('uses substitute code when copying Fresis order with stale article code', async () => {
    const oldCode = 'OLD-123';
    const newCode = 'NEW-124';
    vi.mocked(priceService.getPriceAndVatBatch).mockResolvedValue(new Map([[oldCode, null]]));
    vi.mocked(priceService.fuzzyMatchArticleCode).mockResolvedValue(newCode);
    vi.mocked(getCustomerFullHistory).mockResolvedValue([
      mockOrder({ source: 'fresis', orderId: 'F-1', articles: [{ articleCode: oldCode, articleDescription: 'Old Article', quantity: 1, unitPrice: 10, discountPercent: 0, lineTotalWithVat: 10, vatPercent: 22 }] }),
    ]);

    const onAddOrder = vi.fn();
    render(<CustomerHistoryModal {...defaultProps} isFresisClient={true} onAddOrder={onAddOrder} />);

    await screen.findByText(oldCode);
    await waitFor(() => expect(screen.getByText(`→ ${newCode}`)).toBeDefined());

    fireEvent.click(screen.getAllByRole('button', { name: /Copia tutto l'ordine/ })[0]);
    await waitFor(() =>
      expect(onAddOrder).toHaveBeenCalledWith(
        [expect.objectContaining({ articleCode: newCode })],
        false,
      ),
    );
  });

  it('skips Fresis article and shows "non nel catalogo" when no fuzzy match found', async () => {
    const staleCode = 'GONE-999';
    vi.mocked(priceService.getPriceAndVatBatch).mockResolvedValue(new Map([[staleCode, null]]));
    vi.mocked(priceService.fuzzyMatchArticleCode).mockResolvedValue(null);
    vi.mocked(getCustomerFullHistory).mockResolvedValue([
      mockOrder({ source: 'fresis', orderId: 'F-2', articles: [{ articleCode: staleCode, articleDescription: 'Gone Article', quantity: 1, unitPrice: 10, discountPercent: 0, lineTotalWithVat: 10, vatPercent: 22 }] }),
    ]);

    const onAddOrder = vi.fn();
    render(<CustomerHistoryModal {...defaultProps} isFresisClient={true} onAddOrder={onAddOrder} />);

    await screen.findByText(staleCode);
    await waitFor(() => expect(screen.getByText('non nel catalogo')).toBeDefined());

    fireEvent.click(screen.getAllByRole('button', { name: /Copia tutto l'ordine/ })[0]);
    await waitFor(() => expect(onAddOrder).toHaveBeenCalledWith([], false));
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

  it('filters orders by customerProfileId when client dropdown is changed', async () => {
    const orderA = mockOrder({ orderId: 'A', orderNumber: 'OF-A', customerAccountNum: 'PROF-A', customerRagioneSociale: 'Rossi SRL' });
    const orderB = mockOrder({ orderId: 'B', orderNumber: 'OF-B', customerAccountNum: 'PROF-B', customerRagioneSociale: 'Bianchi SPA' });
    vi.mocked(getCustomerFullHistory).mockResolvedValue([orderA, orderB]);

    render(<CustomerHistoryModal {...defaultProps} />);
    await screen.findByText('OF-A');
    await screen.findByText('OF-B');
    await act(async () => {});

    const clientSelect = screen.getByRole('combobox', { name: /filtra per cliente/i });
    fireEvent.change(clientSelect, { target: { value: 'customer:PROF-A' } });

    expect(screen.getByText('OF-A')).toBeDefined();
    expect(screen.queryByText('OF-B')).toBeNull();
  });

  it('filters orders by subClientCodice when client dropdown is changed', async () => {
    const orderA = mockOrder({ orderId: 'A', orderNumber: 'OF-A', subClientCodice: 'SC-1', subClientRagioneSociale: 'Sub Uno' });
    const orderB = mockOrder({ orderId: 'B', orderNumber: 'OF-B', subClientCodice: 'SC-2', subClientRagioneSociale: 'Sub Due' });
    vi.mocked(getCustomerFullHistory).mockResolvedValue([orderA, orderB]);

    render(<CustomerHistoryModal {...defaultProps} />);
    await screen.findByText('OF-A');
    await screen.findByText('OF-B');

    const clientSelect = screen.getByRole('combobox', { name: /filtra per cliente/i });
    fireEvent.change(clientSelect, { target: { value: 'subclient:SC-1' } });

    expect(screen.getByText('OF-A')).toBeDefined();
    expect(screen.queryByText('OF-B')).toBeNull();
  });

  it('filters orders by customerCity when city dropdown is changed', async () => {
    const orderMi = mockOrder({ orderId: 'MI', orderNumber: 'OF-MI', customerCity: 'Milano' });
    const orderRo = mockOrder({ orderId: 'RO', orderNumber: 'OF-RO', customerCity: 'Roma' });
    vi.mocked(getCustomerFullHistory).mockResolvedValue([orderMi, orderRo]);

    render(<CustomerHistoryModal {...defaultProps} />);
    await screen.findByText('OF-MI');
    await screen.findByText('OF-RO');
    await act(async () => {});

    const citySelect = screen.getByRole('combobox', { name: /filtra per città/i });
    fireEvent.change(citySelect, { target: { value: 'Milano' } });

    expect(screen.getByText('OF-MI')).toBeDefined();
    expect(screen.queryByText('OF-RO')).toBeNull();
  });

  it('includes order when subClientCity matches city filter even if customerCity does not', async () => {
    const order = mockOrder({ orderId: 'X', orderNumber: 'OF-X', customerCity: 'Roma', subClientCity: 'Milano' });
    vi.mocked(getCustomerFullHistory).mockResolvedValue([order]);

    render(<CustomerHistoryModal {...defaultProps} />);
    await screen.findByText('OF-X');
    await act(async () => {});

    const citySelect = screen.getByRole('combobox', { name: /filtra per città/i });
    fireEvent.change(citySelect, { target: { value: 'Milano' } });

    expect(screen.getByText('OF-X')).toBeDefined();
  });

  it('applies client and city filters with AND logic', async () => {
    const orderAMi = mockOrder({ orderId: '1', orderNumber: 'OF-A-MI', customerAccountNum: 'PROF-A', customerCity: 'Milano' });
    const orderARo = mockOrder({ orderId: '2', orderNumber: 'OF-A-RO', customerAccountNum: 'PROF-A', customerCity: 'Roma' });
    const orderBMi = mockOrder({ orderId: '3', orderNumber: 'OF-B-MI', customerAccountNum: 'PROF-B', customerCity: 'Milano' });
    vi.mocked(getCustomerFullHistory).mockResolvedValue([orderAMi, orderARo, orderBMi]);

    render(<CustomerHistoryModal {...defaultProps} />);
    await screen.findByText('OF-A-MI');
    await screen.findByText('OF-A-RO');
    await screen.findByText('OF-B-MI');

    fireEvent.change(screen.getByRole('combobox', { name: /filtra per cliente/i }), { target: { value: 'customer:PROF-A' } });
    fireEvent.change(screen.getByRole('combobox', { name: /filtra per città/i }), { target: { value: 'Milano' } });

    expect(screen.getByText('OF-A-MI')).toBeDefined();
    expect(screen.queryByText('OF-A-RO')).toBeNull();
    expect(screen.queryByText('OF-B-MI')).toBeNull();
  });

  it('resets client and city filters when modal is closed and reopened', async () => {
    const orderA = mockOrder({ orderId: 'A', orderNumber: 'OF-A', customerAccountNum: 'PROF-A', customerRagioneSociale: 'Rossi SRL' });
    const orderB = mockOrder({ orderId: 'B', orderNumber: 'OF-B', customerAccountNum: 'PROF-B', customerRagioneSociale: 'Bianchi SPA' });
    vi.mocked(getCustomerFullHistory).mockResolvedValue([orderA, orderB]);

    const { rerender } = render(<CustomerHistoryModal {...defaultProps} />);
    await screen.findByText('OF-A');

    fireEvent.change(screen.getByRole('combobox', { name: /filtra per cliente/i }), { target: { value: 'customer:PROF-A' } });
    expect(screen.queryByText('OF-B')).toBeNull();

    rerender(<CustomerHistoryModal {...defaultProps} isOpen={false} />);
    rerender(<CustomerHistoryModal {...defaultProps} isOpen={true} />);

    await screen.findByText('OF-B');
    expect((screen.getByRole('combobox', { name: /filtra per cliente/i }) as HTMLSelectElement).value).toBe('');
    expect(screen.getByText('OF-A')).toBeDefined();
    expect(screen.getByText('OF-B')).toBeDefined();
  });

  it('shows order with no customerProfileId and no subClientCodice only when client filter is empty', async () => {
    const orderWithClient = mockOrder({ orderId: 'A', orderNumber: 'OF-A', customerAccountNum: 'PROF-A' });
    const orderNoClient = mockOrder({ orderId: 'B', orderNumber: 'OF-B' });
    vi.mocked(getCustomerFullHistory).mockResolvedValue([orderWithClient, orderNoClient]);

    render(<CustomerHistoryModal {...defaultProps} />);
    await screen.findByText('OF-A');
    await screen.findByText('OF-B');
    await act(async () => {});

    fireEvent.change(screen.getByRole('combobox', { name: /filtra per cliente/i }), { target: { value: 'customer:PROF-A' } });

    expect(screen.getByText('OF-A')).toBeDefined();
    expect(screen.queryByText('OF-B')).toBeNull();
  });

  it('uses warehouse article code when dialog confirms selection with different code', async () => {
    const requestedCode = '8801.314.012';
    const warehouseCode = '8801.314.023';
    vi.mocked(findWarehouseMatchesBatch).mockResolvedValue(
      new Map([[requestedCode, [{
        item: { id: 1, articleCode: warehouseCode, description: 'DIA gr F', quantity: 10, boxName: 'SCATOLO 1', uploadedAt: '2024-01-01' },
        level: 'figura-gambo' as const,
        score: 80,
        availableQty: 10,
        reason: 'Stessa figura + gamba',
      }]]]),
    );
    vi.mocked(getCustomerFullHistory).mockResolvedValue([
      mockOrder({
        source: 'fresis',
        articles: [{ articleCode: requestedCode, articleDescription: 'DIA gr F', quantity: 5, unitPrice: 8.62, discountPercent: 50, lineTotalWithVat: 26.29, vatPercent: 22 }],
      }),
    ]);

    const onAddArticle = vi.fn();
    render(<CustomerHistoryModal {...defaultProps} isFresisClient={true} onAddArticle={onAddArticle} />);

    await screen.findByText(requestedCode);
    await waitFor(() => expect(findWarehouseMatchesBatch).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole('button', { name: '+ Aggiungi' })[0]);

    await screen.findByText('Articoli trovati in magazzino');
    const confirmBtn = await screen.findByRole('button', { name: /Aggiungi \(5 da mag\.\)/ });
    fireEvent.click(confirmBtn);

    await waitFor(() =>
      expect(onAddArticle).toHaveBeenCalledWith(
        expect.objectContaining({ articleCode: warehouseCode }),
        false,
      ),
    );
  });

  it('shows each city only once in the city dropdown when multiple orders share the same city', async () => {
    const city = 'Milano';
    const order1 = mockOrder({ orderId: '1', orderNumber: 'OF-1', customerCity: city });
    const order2 = mockOrder({ orderId: '2', orderNumber: 'OF-2', customerCity: city });
    vi.mocked(getCustomerFullHistory).mockResolvedValue([order1, order2]);

    render(<CustomerHistoryModal {...defaultProps} />);
    await screen.findByText('OF-1');

    const citySelect = screen.getByRole('combobox', { name: /filtra per città/i });
    const milanOptions = Array.from((citySelect as HTMLSelectElement).querySelectorAll('option')).filter((o) => o.value === city);
    expect(milanOptions).toHaveLength(1);
  });
});
