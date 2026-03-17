// archibald-web-app/frontend/src/components/OrderFormSimple.completeness.spec.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// Mock all heavy dependencies that OrderFormSimple uses
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
  productService: {
    searchProducts: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../services/prices.service', () => ({
  priceService: {
    getPriceForProduct: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('../services/orders.service', () => ({
  orderService: {
    getPendingOrders: vi.fn().mockResolvedValue([]),
    savePendingOrder: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../services/toast.service', () => ({
  toastService: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
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
  checkCustomerCompleteness: vi.fn().mockReturnValue({ ok: false, missing: ['P.IVA non validata', 'PEC o SDI mancante'] }),
}));

const INCOMPLETE_RICH_CUSTOMER = {
  customerProfile: 'CUST-001',
  internalId: null,
  name: 'Rossi Mario',
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
  city: null,
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

const CUSTOMER_SEARCH_RESULT = {
  id: 'CUST-001',
  name: 'Rossi Mario',
  city: null,
  customerType: null,
  isHidden: false,
};

import OrderFormSimple from './OrderFormSimple';

describe('OrderFormSimple — completeness banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: INCOMPLETE_RICH_CUSTOMER,
      }),
    });
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  test('renders without error and banner is not shown initially', () => {
    render(
      <MemoryRouter>
        <OrderFormSimple />
      </MemoryRouter>,
    );
    expect(screen.getByText(/nuovo ordine/i)).toBeTruthy();
    expect(screen.queryByText(/P\.IVA non validata/)).toBeNull();
  });

  test('shows completeness banner after customer selection with incomplete data', async () => {
    const { customerService } = await import('../services/customers.service');
    vi.mocked(customerService.searchCustomers).mockResolvedValue([CUSTOMER_SEARCH_RESULT] as any);

    render(
      <MemoryRouter>
        <OrderFormSimple />
      </MemoryRouter>,
    );

    const searchInput = screen.getByPlaceholderText(/cerca cliente/i);
    await userEvent.type(searchInput, 'Rossi');

    await waitFor(() => {
      expect(screen.getByText('Rossi Mario')).toBeTruthy();
    });

    await userEvent.click(screen.getByText('Rossi Mario'));

    await waitFor(() => {
      expect(screen.getByText(/P\.IVA non validata/)).toBeTruthy();
    });
  });

  test('fetches completeness via direct customer endpoint, not search endpoint', async () => {
    const { customerService } = await import('../services/customers.service');
    vi.mocked(customerService.searchCustomers).mockResolvedValue([CUSTOMER_SEARCH_RESULT] as any);

    render(
      <MemoryRouter>
        <OrderFormSimple />
      </MemoryRouter>,
    );

    const searchInput = screen.getByPlaceholderText(/cerca cliente/i);
    await userEvent.type(searchInput, 'Rossi');

    await waitFor(() => {
      expect(screen.getByText('Rossi Mario')).toBeTruthy();
    });

    await userEvent.click(screen.getByText('Rossi Mario'));

    await screen.findByText(/P\.IVA non validata/);

    const completenessCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      ([url]: unknown[]) => typeof url === 'string' && url.includes('/api/customers/'),
    );
    const calledUrl = completenessCall?.[0] as string;
    expect(calledUrl).toBe('/api/customers/CUST-001');
    expect(calledUrl).not.toContain('search=');
  });
});
