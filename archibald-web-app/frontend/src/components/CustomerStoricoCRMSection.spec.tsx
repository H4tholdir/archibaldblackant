import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CustomerStoricoCRMSection } from './CustomerStoricoCRMSection';
import type { Customer } from '../types/customer';

const baseCustomer: Customer = {
  erpId: '55.258',
  name: 'Lab. D.B.S. Snc',
  accountNum: '1002319',
  vatNumber: null, fiscalCode: null, sdi: null, pec: null,
  email: null, phone: null, mobile: null, url: null,
  attentionTo: null, street: null, logisticsAddress: null,
  postalCode: null, city: null, customerType: null, type: null,
  deliveryTerms: null, description: null, lastOrderDate: null,
  actualOrderCount: 0, actualSales: 0,
  previousOrderCount1: 0, previousSales1: 0,
  previousOrderCount2: 0, previousSales2: 0,
  externalAccountNumber: null, ourAccountNumber: null,
  hash: '', lastSync: 0, createdAt: 0, updatedAt: 0,
  vatValidatedAt: null, erpDetailReadAt: null,
};

const customerWithExclusivity: Customer = {
  ...baseCustomer,
  exclusivityDaysRemaining: 273,
  exclusivityEndDate: '2027-02-07',
  exclusivityStartDate: '2026-02-07',
  exclusivitySalesForecast: 400,
  exclusivitySalesActual: 268.86,
  crmAccountCommercial: 'IN00042395',
  crmContactType: 'Debitor',
  altreInfoSyncedAt: '2026-05-10T06:00:00Z',
};

const customerWithExpiredExclusivity: Customer = {
  ...baseCustomer,
  exclusivityDaysRemaining: 20,
  exclusivityEndDate: '2026-05-30',
  altreInfoSyncedAt: '2026-05-10T06:00:00Z',
};

describe('CustomerStoricoCRMSection', () => {
  test('non renderizza nulla se cliente non ha dati esclusività né CRM', () => {
    const { container } = render(<CustomerStoricoCRMSection customer={baseCustomer} />);
    expect(container.firstChild).toBeNull();
  });

  test('mostra badge esclusività attiva quando exclusivityDaysRemaining > 0', () => {
    render(<CustomerStoricoCRMSection customer={customerWithExclusivity} />);
    expect(screen.getByTestId('exclusivity-badge')).toBeDefined();
    expect(screen.getByText(/07\/02\/2027/)).toBeDefined();
  });

  test('mostra badge arancio/rosso quando esclusività scade entro 30 giorni', () => {
    render(<CustomerStoricoCRMSection customer={customerWithExpiredExclusivity} />);
    const badge = screen.getByTestId('exclusivity-badge');
    // Il colore di allerta indica scadenza imminente
    expect(badge).toBeDefined();
    expect(badge.textContent).toMatch(/scad/i);
  });

  test('mostra previsione e realizzato esclusività', () => {
    render(<CustomerStoricoCRMSection customer={customerWithExclusivity} />);
    // formatCurrency(400) = "400 €", formatCurrency(268.86) = "269 €" (0 decimali)
    expect(screen.getByText(/Previsione/i)).toBeDefined();
    expect(screen.getByText(/Realizzato/i)).toBeDefined();
  });

  test('mostra account commerciale CRM', () => {
    render(<CustomerStoricoCRMSection customer={customerWithExclusivity} />);
    expect(screen.getByText('IN00042395')).toBeDefined();
  });

  test('non mostra link mappa se lat/lon sono 0 o null', () => {
    render(<CustomerStoricoCRMSection customer={customerWithExclusivity} />);
    expect(screen.queryByText(/mappa/i)).toBeNull();
  });

  test('mostra link mappa se lat/lon sono valorizzati', () => {
    const customerWithGeo: Customer = {
      ...customerWithExclusivity,
      geoLatitude: 40.8518,
      geoLongitude: 14.2681,
    };
    render(<CustomerStoricoCRMSection customer={customerWithGeo} />);
    expect(screen.getByText(/mappa/i)).toBeDefined();
  });
});
