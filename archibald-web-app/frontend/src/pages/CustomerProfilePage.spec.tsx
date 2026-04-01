import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomerProfilePage } from './CustomerProfilePage';

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
