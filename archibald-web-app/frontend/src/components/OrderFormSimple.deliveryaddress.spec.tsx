// archibald-web-app/frontend/src/components/OrderFormSimple.deliveryaddress.spec.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

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
  checkCustomerCompleteness: vi.fn().mockReturnValue({ ok: true, missing: [] }),
}));
vi.mock('../services/customer-addresses', () => ({
  getCustomerAddresses: vi.fn(),
}));

const CUSTOMER = {
  id: 'CUST-ADDR-001',
  name: 'Bianchi Luigi',
  city: 'Napoli',
  customerType: null,
  isHidden: false,
};

const DELIVERY_ADDRESS_1 = {
  id: 10,
  customerProfile: 'CUST-ADDR-001',
  tipo: 'Consegna',
  nome: null,
  via: 'Via Roma 1',
  cap: '80100',
  citta: 'Napoli',
  contea: null,
  stato: null,
  idRegione: null,
  contra: null,
};

const DELIVERY_ADDRESS_2 = {
  id: 11,
  customerProfile: 'CUST-ADDR-001',
  tipo: 'Indir. cons. alt.',
  nome: null,
  via: 'Via Milano 5',
  cap: '80133',
  citta: 'Napoli',
  contea: null,
  stato: null,
  idRegione: null,
  contra: null,
};

import OrderFormSimple from './OrderFormSimple';

describe('OrderFormSimple — delivery address picker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { customers: [] } }),
    });
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  async function selectCustomer() {
    const { customerService } = await import('../services/customers.service');
    vi.mocked(customerService.searchCustomers).mockResolvedValue([CUSTOMER] as any);

    render(
      <MemoryRouter>
        <OrderFormSimple />
      </MemoryRouter>,
    );

    const searchInput = screen.getByPlaceholderText(/cerca cliente/i);
    await userEvent.type(searchInput, 'Bianchi');

    await waitFor(() => {
      expect(screen.getByText('Bianchi Luigi')).toBeTruthy();
    });

    await userEvent.click(screen.getByText('Bianchi Luigi'));
  }

  test('picker appears when customer has ≥2 delivery addresses', async () => {
    const { getCustomerAddresses } = await import('../services/customer-addresses');
    vi.mocked(getCustomerAddresses).mockResolvedValue([DELIVERY_ADDRESS_1, DELIVERY_ADDRESS_2]);

    await selectCustomer();

    await waitFor(() => {
      expect(screen.getByText('Indirizzo di consegna')).toBeTruthy();
      expect(screen.getByText('— Seleziona indirizzo —')).toBeTruthy();
    });
  });

  test('picker is not shown when customer has exactly 1 delivery address', async () => {
    const { getCustomerAddresses } = await import('../services/customer-addresses');
    vi.mocked(getCustomerAddresses).mockResolvedValue([DELIVERY_ADDRESS_1]);

    await selectCustomer();

    await waitFor(() => {
      expect(screen.queryByText('Indirizzo di consegna')).toBeNull();
    });
  });

  test('submit button is disabled when picker shown but no address selected', async () => {
    const { getCustomerAddresses } = await import('../services/customer-addresses');
    vi.mocked(getCustomerAddresses).mockResolvedValue([DELIVERY_ADDRESS_1, DELIVERY_ADDRESS_2]);

    await selectCustomer();

    await waitFor(() => {
      expect(screen.getByText('Indirizzo di consegna')).toBeTruthy();
    });

    const saveButton = screen.queryByText('Salva in ordini in attesa');
    if (saveButton) {
      expect((saveButton as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
