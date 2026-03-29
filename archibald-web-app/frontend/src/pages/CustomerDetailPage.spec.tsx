import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerDetailPage } from './CustomerDetailPage';

vi.mock('../components/CustomerSidebar', () => ({
  CustomerSidebar: ({ customer }: { customer: { name: string } }) => (
    <div data-testid="mock-sidebar">{customer.name}</div>
  ),
}));
vi.mock('../components/CustomerInlineSection', () => ({
  CustomerInlineSection: ({ title }: { title: string }) => (
    <div data-testid={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}>{title}</div>
  ),
}));
vi.mock('../utils/customer-completeness', () => ({
  checkCustomerCompleteness: () => ({ ok: true, missing: [], missingFields: [] }),
}));

const mockCustomer = {
  erpId: '55.261',
  accountNum: null,
  name: 'Mario Rossi S.r.l.',
  vatNumber: 'IT08246131216',
  vatValidatedAt: '2026-01-01T00:00:00Z',
  pec: 'mario@pec.it', sdi: null,
  phone: '081 1234567', mobile: '333 1234567',
  email: 'info@rossi.it', url: null,
  street: 'Via Roma 12', postalCode: '80100', city: 'Napoli',
  county: 'NA', state: null, country: 'Italy',
  attentionTo: null, logisticsAddress: null, customerType: null, type: null,
  deliveryTerms: null, description: null, fiscalCode: null,
  lastOrderDate: '2026-01-15T10:00:00Z',
  actualOrderCount: 47, actualSales: 12340,
  previousOrderCount1: 40, previousSales1: 10000,
  previousOrderCount2: 35, previousSales2: 9000,
  externalAccountNumber: null, ourAccountNumber: null,
  hash: '', lastSync: 0, createdAt: 0, updatedAt: 0,
  botStatus: 'placed' as const, photoUrl: null,
  sector: 'Florovivaismo', priceGroup: null, lineDiscount: null,
  paymentTerms: '30gg DFFM', notes: null, nameAlias: null,
};

const renderPage = (profile = '55.261') =>
  render(
    <MemoryRouter initialEntries={[`/customers/${profile}`]}>
      <Routes>
        <Route path="/customers/:erpId" element={<CustomerDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('CustomerDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: mockCustomer }),
    });
    const store: Record<string, string> = { archibald_jwt: 'mock-jwt' };
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: (k: string) => store[k] ?? null },
      configurable: true,
    });
  });

  test('shows loading state initially', () => {
    renderPage();
    expect(screen.getByText(/caricamento/i)).toBeDefined();
  });

  test('renders customer name in topbar after data loads', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Mario Rossi S.r.l.').length).toBeGreaterThanOrEqual(1);
    });
  });

  test('renders back button to /customers', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/← clienti/i)).toBeDefined();
    });
  });

  test('renders CustomerSidebar after data loads', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('mock-sidebar')).toBeDefined();
    });
  });

  test('renders Dati tab button', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Dati')).toBeDefined();
    });
  });

  test('renders Anagrafica section in Dati tab', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('section-anagrafica')).toBeDefined();
    });
  });

  test('shows error banner when customer fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/errore nel caricamento/i)).toBeDefined();
    });
  });
});
