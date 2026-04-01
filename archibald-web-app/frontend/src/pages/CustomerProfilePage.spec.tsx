import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerProfilePage } from './CustomerProfilePage';
import { getCustomerFullHistory } from '../api/customer-full-history';
import type { CustomerFullHistoryOrder } from '../api/customer-full-history';
import { enqueueOperation } from '../api/operations';

vi.mock('../services/customers.service', () => ({
  customerService: {
    getPhotoUrl: vi.fn().mockResolvedValue(null),
    uploadPhoto: vi.fn().mockResolvedValue(undefined),
    deletePhoto: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../api/customer-full-history', () => ({
  getCustomerFullHistory: vi.fn().mockResolvedValue([]),
}));
vi.mock('../services/customer-addresses', () => ({
  getCustomerAddresses: vi.fn().mockResolvedValue([]),
  addCustomerAddress: vi.fn(),
  deleteCustomerAddress: vi.fn(),
}));
vi.mock('../api/operations', () => ({
  enqueueOperation: vi.fn().mockResolvedValue({ jobId: 'j1' }),
  pollJobUntilDone: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../contexts/OperationTrackingContext', () => ({
  useOperationTracking: () => ({ trackOperation: vi.fn() }),
}));
vi.mock('../components/CustomerListSidebar', () => ({
  CustomerListSidebar: () => <div data-testid="sidebar" />,
}));
vi.mock('../components/PhotoCropModal', () => ({
  PhotoCropModal: () => <div data-testid="photo-crop-modal" />,
}));

const mockCustomer = {
  erpId: 'A001', name: 'Rossi Mario', vatNumber: '06104510653',
  fiscalCode: null, pec: 'rossi@pec.it', sdi: null, email: 'rossi@test.it',
  phone: '081 552 1234', mobile: null, url: null, attentionTo: null,
  street: 'Via Roma 12', postalCode: '80100', city: 'Napoli',
  county: 'NA', state: null, country: 'Italy',
  deliveryTerms: 'Standard', sector: 'Florovivaismo',
  lineDiscount: 'N/A', paymentTerms: '30gg DFFM', notes: null,
  lastOrderDate: '2025-10-15', createdAt: Date.now(),
};

function renderProfile(erpId = 'A001') {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: mockCustomer }),
  }));
  vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('fake-jwt') });
  return render(
    <MemoryRouter initialEntries={[`/customers/${erpId}`]}>
      <Routes>
        <Route path="/customers/:erpId" element={<CustomerProfilePage />} />
      </Routes>
    </MemoryRouter>
  );
}

function getModifyButton() {
  const modifyButtons = screen.getAllByRole('button').filter(btn => btn.textContent?.includes('Modifica'));
  return modifyButtons[modifyButtons.length - 1];
}

describe('CustomerProfilePage — shell', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('renderizza il nome del cliente dopo il caricamento', async () => {
    renderProfile();
    await waitFor(() => expect(screen.getAllByText('Rossi Mario').length).toBeGreaterThan(0));
  });

  test('mostra lo stato di caricamento prima del fetch', () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})));
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue('fake-jwt') });
    render(
      <MemoryRouter initialEntries={['/customers/A001']}>
        <Routes><Route path="/customers/:erpId" element={<CustomerProfilePage />} /></Routes>
      </MemoryRouter>
    );
    expect(screen.getByText(/Caricamento/i)).toBeInTheDocument();
  });
});

describe('CustomerProfilePage — ProfileHero', () => {
  test('mostra le iniziali dell avatar quando non c è foto', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('RM')); // iniziali Rossi Mario
  });

  test('pulsante 📷 apre l input file', async () => {
    renderProfile();
    await waitFor(() => screen.getAllByText('Rossi Mario'));
    const photoBtn = screen.getByRole('button', { name: /📷/i });
    expect(photoBtn).toBeInTheDocument();
  });

  test('quick action Ordine è presente', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('Ordine'));
  });

  test('quick action Chiama è presente', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('Chiama'));
  });

  test('quick action WhatsApp è assente quando mobile è null', async () => {
    renderProfile(); // mockCustomer.mobile === null
    await waitFor(() => screen.getAllByText('Rossi Mario'));
    expect(screen.queryByText('WhatsApp')).toBeNull();
  });
});

describe('CustomerProfilePage — sezioni dati', () => {
  test('mostra il telefono nella sezione Contatti', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('081 552 1234'));
  });

  test('mostra Via Roma 12 nella sezione Indirizzo', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('Via Roma 12'));
  });

  test('mostra Florovivaismo nella sezione Anagrafica', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('Florovivaismo'));
  });
});

describe('CustomerProfilePage — edit mode + FAB', () => {
  test('FAB non visibile in view mode', async () => {
    renderProfile();
    await waitFor(() => screen.getAllByText('Rossi Mario'));
    expect(screen.queryByText(/Salva/)).toBeNull();
  });

  test('entra in edit mode al click su Modifica', async () => {
    renderProfile();
    await waitFor(() => getModifyButton());
    fireEvent.click(getModifyButton());
    expect(screen.getByText(/Modalità modifica attiva/)).toBeInTheDocument();
  });

  test('FAB appare dopo aver modificato un campo', async () => {
    renderProfile();
    await waitFor(() => getModifyButton());
    fireEvent.click(getModifyButton());
    const phoneInput = screen.getByDisplayValue('081 552 1234');
    fireEvent.change(phoneInput, { target: { value: '099 999 9999' } });
    expect(screen.getByText(/Salva \(1\)/)).toBeInTheDocument();
  });

  test('modifica due campi → FAB mostra (2)', async () => {
    renderProfile();
    await waitFor(() => getModifyButton());
    fireEvent.click(getModifyButton());
    fireEvent.change(screen.getByDisplayValue('081 552 1234'), { target: { value: '099 999 9999' } });
    fireEvent.change(screen.getByDisplayValue('rossi@test.it'), { target: { value: 'nuovo@email.it' } });
    expect(screen.getByText(/Salva \(2\)/)).toBeInTheDocument();
  });

  test('Annulla ripristina view mode e FAB sparisce', async () => {
    renderProfile();
    await waitFor(() => getModifyButton());
    fireEvent.click(getModifyButton());
    fireEvent.change(screen.getByDisplayValue('081 552 1234'), { target: { value: '099 999 9999' } });
    fireEvent.click(screen.getByText('Annulla modifiche'));
    expect(screen.queryByText(/Salva/)).toBeNull();
    expect(screen.queryByText(/Modalità modifica/)).toBeNull();
  });

  test('tap FAB chiama enqueueOperation una sola volta con tutti i campi', async () => {
    vi.mocked(enqueueOperation).mockClear();
    renderProfile();
    await waitFor(() => getModifyButton());
    fireEvent.click(getModifyButton());
    fireEvent.change(screen.getByDisplayValue('081 552 1234'), { target: { value: '099 111' } });
    fireEvent.change(screen.getByDisplayValue('rossi@test.it'), { target: { value: 'x@y.it' } });
    fireEvent.click(screen.getByText(/Salva \(2\)/));
    await waitFor(() => {
      expect(enqueueOperation).toHaveBeenCalledTimes(1);
      expect(enqueueOperation).toHaveBeenCalledWith('update-customer', expect.objectContaining({
        erpId: 'A001',
        phone: '099 111',
        email: 'x@y.it',
      }));
    });
  });
});

describe('CustomerProfilePage — Storico ordini', () => {
  const currentYear = new Date().getFullYear();
  const mockOrders: CustomerFullHistoryOrder[] = [
    { orderId: 'ORD-1', orderNumber: '12345', orderDate: `${currentYear}-03-01`, totalAmount: 250.00, orderDiscountPercent: 0, source: 'orders', articles: [] },
    { orderId: 'ORD-2', orderNumber: '12300', orderDate: `${currentYear - 1}-06-15`, totalAmount: 180.50, orderDiscountPercent: 0, source: 'orders', articles: [] },
  ];

  function renderProfileWithOrders() {
    vi.mocked(getCustomerFullHistory).mockResolvedValue(mockOrders);
    return renderProfile();
  }

  test('mostra ordini dell anno corrente per default', async () => {
    renderProfileWithOrders();
    await waitFor(() => screen.getByText('N° 12345'));
    expect(screen.queryByText('N° 12300')).toBeNull();
  });

  test('chip "Anno scorso" mostra ordini anno precedente', async () => {
    renderProfileWithOrders();
    await waitFor(() => screen.getByText('Anno scorso'));
    fireEvent.click(screen.getByText('Anno scorso'));
    await waitFor(() => expect(screen.getByText('N° 12300')).toBeInTheDocument());
    expect(screen.queryByText('N° 12345')).toBeNull();
  });

  test('chip "Tutto" mostra tutti gli ordini', async () => {
    renderProfileWithOrders();
    await waitFor(() => screen.getByText('Tutto'));
    fireEvent.click(screen.getByText('Tutto'));
    await waitFor(() => {
      expect(screen.getByText('N° 12345')).toBeInTheDocument();
      expect(screen.getByText('N° 12300')).toBeInTheDocument();
    });
  });
});

describe('CustomerProfilePage — indirizzi alternativi', () => {
  const mockAddresses = [
    { id: 1, erpId: 'A001', tipo: 'Consegna', nome: 'Magazzino Nord', via: 'Via Po 5', cap: '20100', citta: 'Milano', contea: null, stato: null, idRegione: null, contra: null },
  ];

  beforeEach(async () => {
    const mod = await import('../services/customer-addresses');
    vi.mocked(mod.getCustomerAddresses).mockResolvedValue(mockAddresses);
  });

  test('mostra l indirizzo alternativo', async () => {
    renderProfile();
    await waitFor(() => screen.getByText('Magazzino Nord'));
  });

  test('pulsante elimina chiama deleteCustomerAddress dopo conferma', async () => {
    const mod = await import('../services/customer-addresses');
    renderProfile();
    await waitFor(() => screen.getByText('Magazzino Nord'));
    fireEvent.click(screen.getByRole('button', { name: /Elimina/i }));
    // Inline confirm
    fireEvent.click(screen.getByRole('button', { name: /Conferma/i }));
    await waitFor(() => expect(vi.mocked(mod.deleteCustomerAddress)).toHaveBeenCalledWith('A001', 1));
  });
});
