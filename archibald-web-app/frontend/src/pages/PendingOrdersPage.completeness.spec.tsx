import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../hooks/usePendingSync', () => ({
  usePendingSync: () => ({
    pendingOrders: [
      {
        id: 'order-1',
        customerId: 'CUST-001',
        customerName: 'Rossi Mario',
        items: [],
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        jobStatus: 'idle',
        jobProgress: 0,
      },
    ],
    isSyncing: false,
    staleJobIds: new Set(),
    refetch: vi.fn(),
    trackJobs: vi.fn(),
  }),
}));

vi.mock('../api/operations', () => ({
  enqueueOperation: vi.fn().mockResolvedValue({ jobId: 'job-1' }),
}));

vi.mock('../api/pending-orders', () => ({
  savePendingOrder: vi.fn().mockResolvedValue(undefined),
  deletePendingOrder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../api/warehouse', () => ({
  batchTransfer: vi.fn().mockResolvedValue(undefined),
  batchRelease: vi.fn().mockResolvedValue(undefined),
  batchMarkSold: vi.fn().mockResolvedValue(undefined),
  batchReturnSold: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../api/fresis-discounts', () => ({
  getFresisDiscounts: vi.fn().mockResolvedValue([]),
}));

vi.mock('../api/fresis-history', () => ({
  archiveOrders: vi.fn().mockResolvedValue(undefined),
  reassignMergedOrderId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../api/customers', () => ({
  getCustomers: vi.fn().mockResolvedValue({ data: { customers: [] } }),
}));

vi.mock('../services/toast.service', () => ({
  toastService: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../services/pdf-export.service', () => ({
  pdfExportService: {
    downloadOrderPDF: vi.fn(),
    printOrderPDF: vi.fn(),
    getOrderPDFBlob: vi.fn().mockReturnValue(new Blob()),
    getOrderPDFFileName: vi.fn().mockReturnValue('order.pdf'),
  },
}));

vi.mock('../services/share.service', () => ({
  shareService: {
    shareViaWhatsApp: vi.fn().mockResolvedValue(undefined),
    sendEmail: vi.fn().mockResolvedValue(undefined),
    uploadToDropbox: vi.fn().mockResolvedValue({ path: '/order.pdf' }),
  },
}));

vi.mock('../contexts/OperationTrackingContext', () => ({
  useOperationTracking: () => ({
    trackOperation: vi.fn(),
  }),
}));

vi.mock('../utils/customer-completeness', () => ({
  checkCustomerCompleteness: vi.fn().mockReturnValue({ ok: false, missing: ['P.IVA non validata'] }),
}));

vi.mock('../utils/fresis-constants', () => ({
  isFresis: vi.fn().mockReturnValue(false),
  FRESIS_DEFAULT_DISCOUNT: 63,
}));

vi.mock('../utils/order-merge', () => ({
  mergeFresisPendingOrders: vi.fn(),
  applyFresisLineDiscounts: vi.fn().mockImplementation((items: unknown[]) => items),
}));

vi.mock('../utils/format-currency', () => ({
  formatCurrency: vi.fn((v: number) => `${v}`),
}));

vi.mock('../utils/order-calculations', () => ({
  calculateShippingCosts: vi.fn().mockReturnValue({ cost: 0, tax: 0 }),
  archibaldLineAmount: vi.fn().mockReturnValue(0),
  SHIPPING_THRESHOLD: 500,
}));

vi.mock('../components/EmailShareDialog', () => ({
  EmailShareDialog: () => null,
}));

vi.mock('../components/JobProgressBar', () => ({
  JobProgressBar: () => null,
}));

const mockCustomer = {
  customerProfile: 'CUST-001',
  internalId: null,
  name: 'Rossi Mario',
  vatNumber: null,
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

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({
    data: {
      customers: [mockCustomer],
    },
  }),
});

import { PendingOrdersPage } from './PendingOrdersPage';

describe('PendingOrdersPage — completeness badge', () => {
  test('renders page without error when orders are present', () => {
    render(
      <MemoryRouter>
        <PendingOrdersPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Ordini in Attesa (1)')).toBeTruthy();
  });

  test('shows incomplete badge when checkCustomerCompleteness returns ok: false', async () => {
    render(
      <MemoryRouter>
        <PendingOrdersPage />
      </MemoryRouter>,
    );

    const { waitFor } = await import('@testing-library/react');
    await waitFor(() => {
      expect(screen.getByText('⚠ Cliente incompleto')).toBeTruthy();
    });
  });
});
