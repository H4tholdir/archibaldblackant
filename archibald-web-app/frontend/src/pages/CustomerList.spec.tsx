import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CustomerList, formatRelativeTime, orderChipStyle } from './CustomerList';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate, useSearchParams: () => [new URLSearchParams(), vi.fn()] };
});

vi.mock('../services/customers.service', () => ({
  customerService: { getPhotoUrl: vi.fn().mockResolvedValue(null) },
}));

vi.mock('../components/CustomerCreateModal', () => ({
  CustomerCreateModal: () => <div data-testid="create-modal" />,
}));

vi.mock('../contexts/WebSocketContext', () => ({
  useWebSocketContext: () => ({ socket: null, isConnected: false, subscribe: vi.fn().mockReturnValue(() => {}) }),
}));

const mockMyCustomers = [
  { erpId: 'A001', name: 'Rossi Mario', city: 'Napoli', phone: '081 123', lastOrderDate: '2025-12-01', createdAt: Date.now() },
  { erpId: 'B002', name: 'Bianchi Srl', city: 'Milano', phone: null, lastOrderDate: '2024-01-01', createdAt: Date.now() - 400 * 86_400_000 },
];

function makeFetch(customers: typeof mockMyCustomers) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: { customers } }),
  });
}

beforeEach(() => {
  mockNavigate.mockClear();
  vi.stubGlobal('fetch', makeFetch(mockMyCustomers));
  vi.stubGlobal('localStorage', {
    getItem: vi.fn().mockImplementation((key: string) => key === 'archibald_jwt' ? 'fake-jwt' : null),
    setItem: vi.fn(),
  });
});

describe('CustomerList', () => {
  test('renderizza i clienti', async () => {
    render(<MemoryRouter><CustomerList /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Rossi Mario')).toBeInTheDocument());
    expect(screen.getByText('Bianchi Srl')).toBeInTheDocument();
  });

  test('click su un cliente naviga a /customers/:erpId', async () => {
    render(<MemoryRouter><CustomerList /></MemoryRouter>);
    await waitFor(() => screen.getByText('Rossi Mario'));
    fireEvent.click(screen.getByText('Rossi Mario'));
    expect(mockNavigate).toHaveBeenCalledWith('/customers/A001');
  });

  test('badge "inattivo" per cliente con lastOrderDate > 180gg', async () => {
    render(<MemoryRouter><CustomerList /></MemoryRouter>);
    await waitFor(() => screen.getByText('Rossi Mario'));
    expect(screen.getByText('inattivo')).toBeInTheDocument();
  });

  test('pulsante Nuovo Cliente apre CustomerCreateModal', async () => {
    render(<MemoryRouter><CustomerList /></MemoryRouter>);
    await waitFor(() => screen.getByText('Rossi Mario'));
    fireEvent.click(screen.getByRole('button', { name: /Nuovo Cliente/i }));
    expect(screen.getByTestId('create-modal')).toBeInTheDocument();
  });

  test('ricerca invia search param al fetch', async () => {
    render(<MemoryRouter><CustomerList /></MemoryRouter>);
    await waitFor(() => screen.getByPlaceholderText(/Cerca/));
    fireEvent.change(screen.getByPlaceholderText(/Cerca/), { target: { value: 'rossi' } });
    await waitFor(() => {
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
      const lastUrl = calls[calls.length - 1][0] as string;
      expect(lastUrl).toContain('search=rossi');
    }, { timeout: 600 });
  });

  test('fetch iniziale usa mine=true', async () => {
    render(<MemoryRouter><CustomerList /></MemoryRouter>);
    await waitFor(() => {
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
      const firstUrl = calls[0][0] as string;
      expect(firstUrl).toContain('mine=true');
    });
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-26'));
  });
  afterEach(() => { vi.useRealTimers(); });

  test.each([
    ['null',            null,         '—'],
    ['oggi (0 gg)',     '26/04/2026', '1 gg. fa'],
    ['15 giorni fa',    '11/04/2026', '15 gg. fa'],
    ['6 settimane fa',  '15/03/2026', '6 sett. fa'],
    ['5 mesi fa',       '2025-11-01', '5 mesi fa'],
    ['1 mese fa',       '25/02/2026', '1 mese fa'],
    ['1 anno fa',       '2025-04-25', '1 anno fa'],
    ['2 anni fa',       '2024-01-01', '2 anni fa'],
    ['data invalida',   'xyz',        '—'],
  ])('%s → %s', (_label, input, expected) => {
    expect(formatRelativeTime(input)).toBe(expected);
  });
});

describe('orderChipStyle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-26'));
  });
  afterEach(() => { vi.useRealTimers(); });

  test.each([
    ['null → grigio',       null,         '#f1f5f9', '#64748b'],
    ['data invalida → grigio', 'xyz',     '#f1f5f9', '#64748b'],
    ['oggi → verde',        '26/04/2026', '#dcfce7', '#15803d'],
    ['89 gg → verde',       '27/01/2026', '#dcfce7', '#15803d'],
    ['90 gg → ambra',       '26/01/2026', '#fef3c7', '#92400e'],
    ['179 gg → ambra',      '2025-10-29', '#fef3c7', '#92400e'],
    ['180 gg → rosso',      '2025-10-28', '#fee2e2', '#b91c1c'],
    ['> 1 anno → rosso',    '2025-04-25', '#fee2e2', '#b91c1c'],
  ])('%s', (_label, input, expectedBg, expectedColor) => {
    const style = orderChipStyle(input);
    expect(style).toEqual({ bg: expectedBg, color: expectedColor });
  });
});
