import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { CustomerQuickFix } from './CustomerQuickFix';

vi.mock('../api/operations', () => ({
  enqueueOperation: vi.fn(),
  pollJobUntilDone: vi.fn(),
}));

vi.mock('../services/toast.service', () => ({
  toastService: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../hooks/useKeyboardScroll', () => ({
  useKeyboardScroll: () => ({
    keyboardHeight: 0,
    keyboardOpen: false,
    scrollFieldIntoView: vi.fn(),
    keyboardPaddingStyle: {},
    modalOverlayKeyboardStyle: {},
  }),
}));

import { enqueueOperation, pollJobUntilDone } from '../api/operations';

const baseProps = {
  customerProfile: '55.261',
  customerName: 'Mario Rossi S.r.l.',
  missingFields: ['pec_or_sdi'] as const,
  onSaved: vi.fn(),
  onDismiss: vi.fn(),
};

describe('CustomerQuickFix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders bottom sheet when viewport width is below 1024', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    render(<CustomerQuickFix {...baseProps} />);
    expect(screen.getByTestId('quickfix-sheet')).toBeDefined();
    expect(screen.queryByTestId('quickfix-modal')).toBeNull();
  });

  test('renders spotlight modal when viewport width is 1024 or above', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    render(<CustomerQuickFix {...baseProps} />);
    expect(screen.getByTestId('quickfix-modal')).toBeDefined();
    expect(screen.queryByTestId('quickfix-sheet')).toBeNull();
  });

  test('shows PEC and SDI fields when pec_or_sdi is missing', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    render(<CustomerQuickFix {...baseProps} missingFields={['pec_or_sdi']} />);
    expect(screen.getByPlaceholderText('PEC')).toBeDefined();
    expect(screen.getByPlaceholderText('SDI')).toBeDefined();
  });

  test('shows vatNumber field when vatValidatedAt is missing', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    render(<CustomerQuickFix {...baseProps} missingFields={['vatValidatedAt']} />);
    expect(screen.getByPlaceholderText('P.IVA')).toBeDefined();
  });

  test('shows validation error when submitting with both pec and sdi empty', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    render(<CustomerQuickFix {...baseProps} missingFields={['pec_or_sdi']} />);
    fireEvent.click(screen.getByText(/Salva e continua/i));
    await waitFor(() => {
      expect(screen.getByText(/Inserisci PEC o SDI/i)).toBeDefined();
    });
    expect(enqueueOperation).not.toHaveBeenCalled();
  });

  test('calls enqueueOperation with customerProfile and pec when pec is filled', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    (enqueueOperation as ReturnType<typeof vi.fn>).mockResolvedValue({ jobId: 'job-123', success: true });
    (pollJobUntilDone as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<CustomerQuickFix {...baseProps} missingFields={['pec_or_sdi']} />);
    fireEvent.change(screen.getByPlaceholderText('PEC'), { target: { value: 'mario@pec.it' } });
    fireEvent.click(screen.getByText(/Salva e continua/i));

    await waitFor(() => {
      expect(enqueueOperation).toHaveBeenCalledWith(
        'update-customer',
        expect.objectContaining({ customerProfile: '55.261', pec: 'mario@pec.it' }),
      );
    });
  });

  test('calls onSaved after successful job completion', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    const onSaved = vi.fn();
    (enqueueOperation as ReturnType<typeof vi.fn>).mockResolvedValue({ jobId: 'job-123', success: true });
    (pollJobUntilDone as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<CustomerQuickFix {...baseProps} missingFields={['pec_or_sdi']} onSaved={onSaved} />);
    fireEvent.change(screen.getByPlaceholderText('PEC'), { target: { value: 'mario@pec.it' } });
    fireEvent.click(screen.getByText(/Salva e continua/i));

    await waitFor(() => { expect(onSaved).toHaveBeenCalled(); });
  });

  test('shows error message and re-enables form when job fails', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    (enqueueOperation as ReturnType<typeof vi.fn>).mockResolvedValue({ jobId: 'job-123', success: true });
    (pollJobUntilDone as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Bot unreachable'));

    render(<CustomerQuickFix {...baseProps} missingFields={['pec_or_sdi']} />);
    fireEvent.change(screen.getByPlaceholderText('PEC'), { target: { value: 'mario@pec.it' } });
    fireEvent.click(screen.getByText(/Salva e continua/i));

    await waitFor(() => {
      expect(screen.getByText('Bot unreachable')).toBeDefined();
    });
    const btn = screen.getByText(/Salva e continua/i);
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  test('calls onDismiss when Annulla is clicked', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    const onDismiss = vi.fn();
    render(<CustomerQuickFix {...baseProps} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText('Annulla'));
    expect(onDismiss).toHaveBeenCalled();
  });

  test('sends postalCodeCity (not city key) when city field is submitted', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    (enqueueOperation as ReturnType<typeof vi.fn>).mockResolvedValue({ jobId: 'job-123', success: true });
    (pollJobUntilDone as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<CustomerQuickFix {...baseProps} missingFields={['city']} />);
    fireEvent.change(screen.getByPlaceholderText('Città'), { target: { value: 'Napoli' } });
    fireEvent.click(screen.getByText(/Salva e continua/i));

    await waitFor(() => {
      expect(enqueueOperation).toHaveBeenCalledWith(
        'update-customer',
        expect.objectContaining({ postalCodeCity: 'Napoli' }),
      );
    });
  });
});
