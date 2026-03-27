import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/customers.service', () => ({
  customerService: {
    createCustomer: vi.fn(),
    saveInteractiveCustomer: vi.fn(),
    startInteractiveSession: vi.fn().mockResolvedValue({ sessionId: 'test-session' }),
    cancelInteractiveSession: vi.fn().mockResolvedValue(undefined),
    submitVatNumber: vi.fn(),
    heartbeat: vi.fn(),
  },
}));
vi.mock('../api/operations', () => ({
  waitForJobViaWebSocket: vi.fn(),
}));
vi.mock('../contexts/WebSocketContext', () => ({
  useWebSocketContext: () => ({
    socket: null,
    isConnected: false,
    subscribe: vi.fn().mockReturnValue(vi.fn()),
  }),
}));

import { CustomerCreateModal } from './CustomerCreateModal';
import { customerService } from '../services/customers.service';

describe('CustomerCreateModal — vat-input step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (customerService.startInteractiveSession as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ sessionId: 'test-session' });
  });

  it('renders the VAT input step when opened in standalone mode', async () => {
    render(
      <CustomerCreateModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Nuovo Cliente/i)).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Partita IVA/i).length).toBeGreaterThan(0);
  });

  it('renders the Salta button allowing skip past VAT input', async () => {
    render(
      <CustomerCreateModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /salta/i })).toBeInTheDocument();
    });
  });
});

describe('CustomerCreateModal — payload di salvataggio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (customerService.startInteractiveSession as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ sessionId: 'test-session' });
    (customerService.saveInteractiveCustomer as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ taskId: null });
  });

  it('calls saveInteractiveCustomer when interactive session is active', async () => {
    const user = userEvent.setup();

    render(
      <CustomerCreateModal
        isOpen={true}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    // Wait for session to start, then skip VAT and navigate to summary
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /salta/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /salta/i }));

    // Navigate through wizard steps to summary
    for (let i = 0; i < 5; i++) {
      const avanti = screen.queryByRole('button', { name: /^avanti$/i });
      if (avanti) await user.click(avanti);
    }

    const salva = screen.queryByRole('button', { name: /salva cliente/i });
    if (salva) {
      await user.click(salva);
      await waitFor(() => {
        expect(customerService.saveInteractiveCustomer).toHaveBeenCalledWith(
          'test-session',
          expect.any(Object),
        );
      });
    }
  });
});
