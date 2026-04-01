import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CustomerListSidebar } from './CustomerListSidebar';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockCustomers = [
  { erpId: 'A001', name: 'Rossi Mario', city: 'Napoli' },
  { erpId: 'B002', name: 'Bianchi Srl', city: 'Milano' },
];

beforeEach(() => {
  mockNavigate.mockClear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: { customers: mockCustomers } }),
  }));
  vi.stubGlobal('localStorage', {
    getItem: vi.fn().mockReturnValue('fake-jwt'),
    setItem: vi.fn(),
  });
});

describe('CustomerListSidebar', () => {
  test('renderizza la lista clienti', async () => {
    render(<MemoryRouter><CustomerListSidebar /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Rossi Mario')).toBeInTheDocument());
    expect(screen.getByText('Bianchi Srl')).toBeInTheDocument();
  });

  test('click su un cliente naviga a /customers/:erpId', async () => {
    render(<MemoryRouter><CustomerListSidebar /></MemoryRouter>);
    await waitFor(() => screen.getByText('Rossi Mario'));
    fireEvent.click(screen.getByText('Rossi Mario'));
    expect(mockNavigate).toHaveBeenCalledWith('/customers/A001');
  });

  test('il cliente attivo ha sfondo eff6ff', async () => {
    render(<MemoryRouter><CustomerListSidebar activeErpId="A001" /></MemoryRouter>);
    await waitFor(() => screen.getByText('Rossi Mario'));
    const row = screen.getByText('Rossi Mario').closest('div[data-customer-row]') as HTMLElement;
    expect(row.style.background).toBe('rgb(239, 246, 255)');
  });

  test('ricerca filtra la lista via fetch', async () => {
    render(<MemoryRouter><CustomerListSidebar /></MemoryRouter>);
    await waitFor(() => screen.getByPlaceholderText('Cerca…'));
    fireEvent.change(screen.getByPlaceholderText('Cerca…'), { target: { value: 'rossi' } });
    await waitFor(() => {
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
      const lastUrl = calls[calls.length - 1][0] as string;
      expect(lastUrl).toContain('search=rossi');
    }, { timeout: 600 });
  });
});
