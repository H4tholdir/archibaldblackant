import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CustomerList } from './CustomerList';

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

const mockCustomers = [
  { erpId: 'A001', name: 'Rossi Mario', city: 'Napoli', phone: '081 123', lastOrderDate: null, createdAt: Date.now() },
  { erpId: 'B002', name: 'Bianchi Srl', city: 'Milano', phone: null, lastOrderDate: '2024-01-01', createdAt: Date.now() - 400 * 86_400_000 },
];

beforeEach(() => {
  mockNavigate.mockClear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: { customers: mockCustomers } }),
  }));
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
});
