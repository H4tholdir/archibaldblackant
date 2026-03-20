import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// --- mock API e servizi ---
vi.mock('../services/customers.service', () => ({
  customerService: {
    syncCustomers: vi.fn().mockResolvedValue(undefined),
    searchCustomers: vi.fn().mockResolvedValue([]),
    getHiddenCustomers: vi.fn().mockResolvedValue([]),
    setCustomerHidden: vi.fn().mockResolvedValue(undefined),
    getCustomerById: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('../services/products.service', () => ({
  productService: { searchProducts: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../services/prices.service', () => ({
  priceService: { getPriceForProduct: vi.fn().mockResolvedValue(null) },
}));
vi.mock('../services/orders.service', () => ({
  orderService: {
    getPendingOrders: vi.fn().mockResolvedValue([]),
    savePendingOrder: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../services/toast.service', () => ({
  toastService: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('../api/warehouse', () => ({
  batchRelease: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../api/fresis-history', () => ({
  getFresisHistory: vi.fn().mockResolvedValue([]),
}));
vi.mock('../api/orders-history', () => ({
  getOrderHistory: vi.fn().mockResolvedValue([]),
}));
vi.mock('../api/fresis-discounts', () => ({
  getDiscountForArticle: vi.fn().mockResolvedValue(null),
}));
vi.mock('../utils/customer-completeness', () => ({
  checkCustomerCompleteness: vi.fn().mockReturnValue({ ok: true, missing: [] }),
}));
vi.mock('../contexts/WebSocketContext', () => ({
  useWebSocketContext: vi.fn().mockReturnValue({ subscribe: vi.fn().mockReturnValue(() => {}) }),
}));
vi.mock('../api/customer-full-history', () => ({
  getCustomerFullHistory: vi.fn(),
}));
vi.mock('../services/sub-client-matches.service', () => ({
  getMatchesForCustomer: vi.fn(),
  getMatchesForSubClient: vi.fn(),
  addCustomerMatch: vi.fn().mockResolvedValue(undefined),
  removeCustomerMatch: vi.fn().mockResolvedValue(undefined),
  addSubClientMatch: vi.fn().mockResolvedValue(undefined),
  removeSubClientMatch: vi.fn().mockResolvedValue(undefined),
  upsertSkipModal: vi.fn().mockResolvedValue(undefined),
}));

import OrderFormSimple from './OrderFormSimple';
import { getCustomerFullHistory } from '../api/customer-full-history';
import { getMatchesForCustomer } from '../services/sub-client-matches.service';
import type { CustomerFullHistoryOrder } from '../api/customer-full-history';

const DIRECT_CUSTOMER_SEARCH = {
  id: 'CUST-001',
  name: 'Indelli Enrico',
  city: 'Salerno',
  customerType: null,
  isHidden: false,
};

const DIRECT_CUSTOMER_FULL = {
  customerProfile: 'CUST-001',
  internalId: null,
  name: 'Indelli Enrico',
  vatNumber: '12345678901',
  fiscalCode: null,
  sdi: null,
  pec: null,
  email: null,
  phone: null,
  mobile: null,
  url: null,
  attentionTo: null,
  street: null,
  logisticsAddress: null,
  postalCode: null,
  city: 'Salerno',
  customerType: null,
  type: null,
  deliveryTerms: null,
  description: null,
  lastOrderDate: null,
  actualOrderCount: 0,
  actualSales: 0,
  previousOrderCount1: 0,
  previousSales1: 0,
  previousOrderCount2: 0,
  previousSales2: 0,
  externalAccountNumber: null,
  ourAccountNumber: null,
  hash: 'abc',
  lastSync: 0,
  createdAt: 0,
  updatedAt: 0,
  botStatus: null,
  photoUrl: null,
  vatValidatedAt: null,
};

const HISTORY_ORDERS: CustomerFullHistoryOrder[] = [
  {
    source: 'orders',
    orderId: 'o1',
    orderNumber: '001',
    orderDate: '2026-01-01',
    totalAmount: 100,
    orderDiscountPercent: 0,
    customerProfileId: 'CUST-001',
    articles: [
      { articleCode: 'A001', articleDescription: 'Serei DIA', quantity: 5, unitPrice: 10, discountPercent: 0, vatPercent: 22, lineTotalWithVat: 61 },
      { articleCode: 'B002', articleDescription: 'Cemento', quantity: 2, unitPrice: 5, discountPercent: 0, vatPercent: 22, lineTotalWithVat: 12.2 },
    ],
  },
];

const MATCHES_NO_SKIP = {
  customerProfileIds: ['CUST-001'],
  subClientCodices: [],
  skipModal: false,
};

const MATCHES_SKIP = {
  customerProfileIds: ['CUST-001'],
  subClientCodices: [],
  skipModal: true,
};

function renderWithRouter() {
  return render(
    <MemoryRouter>
      <OrderFormSimple />
    </MemoryRouter>,
  );
}

async function selectDirectCustomer() {
  const { customerService } = await import('../services/customers.service');
  vi.mocked(customerService.searchCustomers).mockResolvedValue([DIRECT_CUSTOMER_SEARCH] as any);
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true, data: DIRECT_CUSTOMER_FULL }),
  });
  window.HTMLElement.prototype.scrollIntoView = vi.fn();

  const searchInput = screen.getByPlaceholderText(/cerca cliente/i);
  await userEvent.type(searchInput, 'Indelli');
  await waitFor(() => expect(screen.getByText('Indelli Enrico')).toBeInTheDocument());
  await userEvent.click(screen.getByText('Indelli Enrico'));
  await waitFor(() => expect(screen.getByText(/Cliente selezionato/i)).toBeInTheDocument());
}

describe('OrderFormSimple — I più venduti con multimatching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCustomerFullHistory).mockResolvedValue(HISTORY_ORDERS);
  });

  test('click "I più venduti" apre MatchingManagerModal quando skip=false', async () => {
    vi.mocked(getMatchesForCustomer).mockResolvedValue(MATCHES_NO_SKIP);
    renderWithRouter();
    await selectDirectCustomer();

    const btn = screen.getByRole('button', { name: /più venduti/i });
    await userEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/conferma e apri storico/i)).toBeInTheDocument();
    });
  });

  test('dopo conferma matching, modale più venduti mostra articoli aggregati da getCustomerFullHistory', async () => {
    vi.mocked(getMatchesForCustomer).mockResolvedValue(MATCHES_NO_SKIP);
    renderWithRouter();
    await selectDirectCustomer();

    await userEvent.click(screen.getByRole('button', { name: /più venduti/i }));
    await waitFor(() => expect(screen.getByText(/conferma e apri storico/i)).toBeInTheDocument());

    const confirmBtn = screen.getByRole('button', { name: /conferma e apri storico/i });
    await userEvent.click(confirmBtn);

    await waitFor(() => {
      expect(getCustomerFullHistory).toHaveBeenCalledWith(
        expect.objectContaining({ customerProfileIds: ['CUST-001'] })
      );
      expect(screen.getByText('A001')).toBeInTheDocument();
      expect(screen.getByText('B002')).toBeInTheDocument();
    });
  });

  test('click "I più venduti" con skip=true bypassa MatchingManagerModal', async () => {
    vi.mocked(getMatchesForCustomer).mockResolvedValue(MATCHES_SKIP);
    renderWithRouter();
    await selectDirectCustomer();

    await userEvent.click(screen.getByRole('button', { name: /più venduti/i }));

    await waitFor(() => {
      expect(getCustomerFullHistory).toHaveBeenCalled();
      expect(screen.getByText('A001')).toBeInTheDocument();
    });
  });

  test('pulsante "Modifica collegamenti" è presente nella modale più venduti', async () => {
    vi.mocked(getMatchesForCustomer).mockResolvedValue(MATCHES_SKIP);
    renderWithRouter();
    await selectDirectCustomer();

    await userEvent.click(screen.getByRole('button', { name: /più venduti/i }));
    await waitFor(() => expect(screen.getByText('A001')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: /modifica collegamenti/i })).toBeInTheDocument();
  });

  test('click "Modifica collegamenti" riapre MatchingManagerModal forzatamente', async () => {
    vi.mocked(getMatchesForCustomer).mockResolvedValue(MATCHES_SKIP);
    renderWithRouter();
    await selectDirectCustomer();

    await userEvent.click(screen.getByRole('button', { name: /più venduti/i }));
    await waitFor(() => expect(screen.getByText('A001')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /modifica collegamenti/i }));

    await waitFor(() => {
      expect(screen.getByText(/conferma e apri storico/i)).toBeInTheDocument();
      expect(screen.queryByText('A001')).toBeNull();
    });
  });
});
