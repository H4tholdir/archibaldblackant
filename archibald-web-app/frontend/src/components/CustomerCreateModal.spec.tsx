import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/customers.service', () => ({
  customerService: {
    checkVat: vi.fn().mockResolvedValue({ valid: true, name: 'ACME SRL' }),
    beginInteractiveSession: vi.fn().mockResolvedValue({ sessionId: 'test-session' }),
    createCustomer: vi.fn().mockResolvedValue({ taskId: 'task-1' }),
    saveInteractiveCustomer: vi.fn().mockResolvedValue({ customer: null, taskId: 'task-1' }),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    cancelInteractiveSession: vi.fn().mockResolvedValue(undefined),
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
    (customerService.checkVat as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ valid: true, name: 'ACME SRL' });
    (customerService.beginInteractiveSession as ReturnType<typeof vi.fn>)
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
    (customerService.checkVat as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ valid: true, name: 'ACME SRL' });
    (customerService.beginInteractiveSession as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ sessionId: 'test-session' });
    (customerService.saveInteractiveCustomer as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ customer: null, taskId: null });
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

describe('CustomerCreateModal — autofill e VAT check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (customerService.checkVat as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ valid: true, name: 'ACME SRL' });
    (customerService.beginInteractiveSession as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ sessionId: 'test-session' });
  });

  it('autofill nome da vat-check quando campo vuoto', async () => {
    const user = userEvent.setup();
    render(<CustomerCreateModal isOpen={true} onClose={vi.fn()} onSaved={vi.fn()} />);

    const vatInput = screen.getByPlaceholderText(/06104510653/i);
    await user.type(vatInput, '12345678901');
    await user.click(screen.getByRole('button', { name: /Verifica/i }));

    await waitFor(() => {
      // Siamo passati ad anagrafica — deve esserci il campo nome
      expect(screen.getByPlaceholderText(/Rossi Dr\. Mario/i)).toBeInTheDocument();
    });

    // Il campo nome deve essere pre-compilato con ACME SRL (da checkVat mock)
    const nameInput = screen.getByPlaceholderText(/Rossi Dr\. Mario/i) as HTMLInputElement;
    expect(nameInput.value).toBe('ACME SRL');
  });

  it('salta VAT e avanza ad anagrafica senza chiamare checkVat', async () => {
    const user = userEvent.setup();
    render(<CustomerCreateModal isOpen={true} onClose={vi.fn()} onSaved={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Salta/i }));

    await waitFor(() => {
      expect(screen.getByText(/Nome \/ Ragione/i)).toBeInTheDocument();
    });
    expect(customerService.checkVat).not.toHaveBeenCalled();
    expect(customerService.beginInteractiveSession).not.toHaveBeenCalled();
  });

  it('mostra errore se checkVat risponde valid:false', async () => {
    (customerService.checkVat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ valid: false });

    const user = userEvent.setup();
    render(<CustomerCreateModal isOpen={true} onClose={vi.fn()} onSaved={vi.fn()} />);

    const vatInput = screen.getByPlaceholderText(/06104510653/i);
    await user.type(vatInput, '12345678901');
    await user.click(screen.getByRole('button', { name: /Verifica/i }));

    await waitFor(() => {
      expect(screen.getByText(/P\.IVA non valida/i)).toBeInTheDocument();
    });
    // Rimane sul passo VAT
    expect(screen.queryByText(/Nome \/ Ragione/i)).not.toBeInTheDocument();
  });
});
