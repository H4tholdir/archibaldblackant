import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { CustomerSidebar } from './CustomerSidebar';
import type { Customer } from '../types/customer';

const baseCustomer: Customer = {
  customerProfile: '55.261',
  internalId: null,
  name: 'Mario Rossi S.r.l.',
  vatNumber: 'IT08246131216',
  vatValidatedAt: '2026-01-01T00:00:00Z',
  pec: 'mario@pec.it',
  sdi: null,
  phone: '081 1234567',
  mobile: '333 1234567',
  email: 'info@rossi.it',
  url: null,
  street: 'Via Roma 12',
  postalCode: '80100',
  city: 'Napoli',
  county: 'NA',
  state: null,
  country: 'Italy',
  attentionTo: null,
  logisticsAddress: null,
  customerType: null,
  type: null,
  deliveryTerms: null,
  description: null,
  fiscalCode: null,
  lastOrderDate: '2026-01-15T10:00:00Z',
  actualOrderCount: 47,
  actualSales: 12340,
  previousOrderCount1: 40, previousSales1: 10000,
  previousOrderCount2: 35, previousSales2: 9000,
  externalAccountNumber: null, ourAccountNumber: null,
  hash: '', lastSync: 0, createdAt: 0, updatedAt: 0,
  botStatus: 'placed', photoUrl: null,
  sector: 'Florovivaismo', priceGroup: null, lineDiscount: null,
  paymentTerms: '30gg DFFM', notes: null, nameAlias: null,
};

describe('CustomerSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  });

  test('renders customer initials when no photoUrl', () => {
    render(<CustomerSidebar customer={baseCustomer} onNewOrder={vi.fn()} />);
    expect(screen.getByText('MR')).toBeDefined();
  });

  test('renders customer name', () => {
    render(<CustomerSidebar customer={baseCustomer} onNewOrder={vi.fn()} />);
    expect(screen.getByText('Mario Rossi S.r.l.')).toBeDefined();
  });

  test('renders order count stat', () => {
    render(<CustomerSidebar customer={baseCustomer} onNewOrder={vi.fn()} />);
    expect(screen.getByText('47')).toBeDefined();
  });

  test('renders call button with mobile number', () => {
    render(<CustomerSidebar customer={baseCustomer} onNewOrder={vi.fn()} />);
    expect(screen.getByTestId('sidebar-call')).toBeDefined();
    expect(screen.getByText('333 1234567')).toBeDefined();
  });

  test('renders WhatsApp button', () => {
    render(<CustomerSidebar customer={baseCustomer} onNewOrder={vi.fn()} />);
    expect(screen.getByTestId('sidebar-whatsapp')).toBeDefined();
  });

  test('renders email button', () => {
    render(<CustomerSidebar customer={baseCustomer} onNewOrder={vi.fn()} />);
    expect(screen.getByTestId('sidebar-email')).toBeDefined();
  });

  test('renders maps button', () => {
    render(<CustomerSidebar customer={baseCustomer} onNewOrder={vi.fn()} />);
    expect(screen.getByTestId('sidebar-maps')).toBeDefined();
  });

  test('does not render call button when phone and mobile are null', () => {
    render(<CustomerSidebar customer={{ ...baseCustomer, phone: null, mobile: null }} onNewOrder={vi.fn()} />);
    expect(screen.queryByTestId('sidebar-call')).toBeNull();
  });

  test('calls onNewOrder when new order button is clicked', () => {
    const onNewOrder = vi.fn();
    render(<CustomerSidebar customer={baseCustomer} onNewOrder={onNewOrder} />);
    fireEvent.click(screen.getByTestId('sidebar-new-order'));
    expect(onNewOrder).toHaveBeenCalled();
  });

  test('returns null on mobile viewport (< 641px)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });
    const { container } = render(<CustomerSidebar customer={baseCustomer} onNewOrder={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
