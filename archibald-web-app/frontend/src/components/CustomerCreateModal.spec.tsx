import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock di tutti i moduli esterni usati da CustomerCreateModal
vi.mock('../services/customers.service', () => ({
  customerService: {
    createCustomer: vi.fn(),
    updateCustomer: vi.fn(),
    startEditInteractiveSession: vi.fn().mockResolvedValue({ sessionId: 'test-session' }),
    cancelInteractiveSession: vi.fn().mockResolvedValue(undefined),
    submitVatNumber: vi.fn(),
    saveCustomer: vi.fn(),
  },
}));
vi.mock('../api/operations', () => ({
  waitForJobViaWebSocket: vi.fn(),
}));
vi.mock('../contexts/WebSocketContext', () => ({
  useWebSocketContext: () => ({ socket: null, isConnected: false, subscribe: vi.fn().mockReturnValue(vi.fn()) }),
}));
vi.mock('../services/customer-addresses', () => ({
  getCustomerAddresses: vi.fn().mockResolvedValue([]),
}));

import { CustomerCreateModal } from './CustomerCreateModal';
import { customerService } from '../services/customers.service';
import type { Customer } from '../types/customer';

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    customerProfile: '55.041',
    name: 'Dr. Elio Verace Centro Medico',
    vatNumber: '02633070657',
    vatValidatedAt: '2024-01-01T00:00:00.000Z', // porta alla decisione show-validated-check → vat-edit-check
    pec: 'elioverace@pec.it',
    sdi: '',
    street: 'Corso Giuseppe Garibaldi, 7',
    postalCode: '84095',
    phone: '+39089865921',
    mobile: '+39 333 111 2222',
    email: 'info@verace.it',
    url: 'https://verace.it',
    deliveryTerms: 'FedEx',
    ...overrides,
  } as Customer;
}

describe('CustomerCreateModal — campi mobile e url', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra il campo mobile (pre-popolato) quando si modifica un cliente esistente', async () => {
    const user = userEvent.setup();
    render(
      <CustomerCreateModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        editCustomer={makeCustomer()}
      />,
    );

    // La modale inizia dallo step vat-edit-check o field[0].
    // Avanza fino a trovare il campo mobile usando il bottone Avanti.
    // Il campo mobile è dopo "phone" nell'array FIELDS_BEFORE_ADDRESS_QUESTION.
    let mobileInput: HTMLInputElement | null = null;
    for (let i = 0; i < 15 && !mobileInput; i++) {
      mobileInput = screen.queryByDisplayValue('+39 333 111 2222') as HTMLInputElement | null;
      if (!mobileInput) {
        const next = screen.queryByRole('button', { name: /avanti|next|continua|salta/i });
        if (next) await user.click(next);
      }
    }

    expect(mobileInput).toBeInTheDocument();
  });

  it('mostra il campo url (pre-popolato) quando si modifica un cliente esistente', async () => {
    const user = userEvent.setup();
    render(
      <CustomerCreateModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        editCustomer={makeCustomer()}
      />,
    );

    let urlInput: HTMLInputElement | null = null;
    for (let i = 0; i < 15 && !urlInput; i++) {
      urlInput = screen.queryByDisplayValue('https://verace.it') as HTMLInputElement | null;
      if (!urlInput) {
        const next = screen.queryByRole('button', { name: /avanti|next|continua|salta/i });
        if (next) await user.click(next);
      }
    }

    expect(urlInput).toBeInTheDocument();
  });
});

describe('CustomerCreateModal — payload di salvataggio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('include mobile e url nel payload updateCustomer (non azzerati a stringa vuota)', async () => {
    const user = userEvent.setup();
    (customerService.updateCustomer as ReturnType<typeof vi.fn>).mockResolvedValue({ taskId: null });

    render(
      <CustomerCreateModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        editCustomer={makeCustomer({ postalCode: '' })}
      />,
    );

    // Naviga: vat-edit-check → Salta → 12 campi (Avanti×12) → indirizzi (Avanti×1) → riepilogo
    const clickByName = async (nameRegex: RegExp) => {
      const btn = screen.queryByRole('button', { name: nameRegex });
      if (btn) await user.click(btn);
    };

    await clickByName(/salta/i); // vat-edit-check → field 0
    for (let i = 0; i < 13; i++) { // 12 campi + step indirizzi → riepilogo
      await clickByName(/^avanti$/i);
    }

    await user.click(screen.getByRole('button', { name: /salva modifiche/i }));

    await waitFor(() => {
      expect(customerService.updateCustomer).toHaveBeenCalledWith(
        '55.041',
        expect.objectContaining({
          mobile: '+39 333 111 2222',
          url: 'https://verace.it',
        }),
      );
    });
  });
});
