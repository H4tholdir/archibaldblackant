import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { CustomerInlineSection } from './CustomerInlineSection';
import type { SectionField } from './CustomerInlineSection';

vi.mock('../api/operations', () => ({
  enqueueOperation: vi.fn(),
  pollJobUntilDone: vi.fn(),
}));
vi.mock('../services/toast.service', () => ({
  toastService: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('../contexts/OperationTrackingContext', () => ({
  useOperationTracking: () => ({ trackOperation: vi.fn() }),
}));

import { enqueueOperation, pollJobUntilDone } from '../api/operations';

const pecField: SectionField = { key: 'pec', label: 'PEC', value: 'mario@pec.it', type: 'email' };
const sdiField: SectionField = { key: 'sdi', label: 'SDI', value: null };

const baseProps = {
  title: 'Dati Fiscali',
  fields: [pecField, sdiField],
  erpId: '55.261',
  customerName: 'Mario Rossi S.r.l.',
  onSaved: vi.fn(),
};

describe('CustomerInlineSection', () => {
  beforeEach(() => vi.clearAllMocks());

  test('renders in view mode by default showing field values', () => {
    render(<CustomerInlineSection {...baseProps} />);
    expect(screen.getByText('Dati Fiscali')).toBeDefined();
    expect(screen.getByText('mario@pec.it')).toBeDefined();
    expect(screen.getByText('✏ Modifica')).toBeDefined();
  });

  test('shows dash for null field values in view mode', () => {
    render(<CustomerInlineSection {...baseProps} />);
    expect(screen.getByText('—')).toBeDefined();
  });

  test('switches to edit mode on click Modifica showing inputs', () => {
    render(<CustomerInlineSection {...baseProps} />);
    fireEvent.click(screen.getByText('✏ Modifica'));
    expect(screen.getByDisplayValue('mario@pec.it')).toBeDefined();
    expect(screen.getByText('✓ Salva sezione')).toBeDefined();
  });

  test('returns to view mode on click Annulla', () => {
    render(<CustomerInlineSection {...baseProps} />);
    fireEvent.click(screen.getByText('✏ Modifica'));
    fireEvent.click(screen.getByText('Annulla'));
    expect(screen.getByText('✏ Modifica')).toBeDefined();
    expect(screen.queryByDisplayValue('mario@pec.it')).toBeNull();
  });

  test('calls enqueueOperation with customerProfile and changed field value', async () => {
    (enqueueOperation as ReturnType<typeof vi.fn>).mockResolvedValue({ jobId: 'j1', success: true });
    (pollJobUntilDone as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<CustomerInlineSection {...baseProps} />);
    fireEvent.click(screen.getByText('✏ Modifica'));
    fireEvent.change(screen.getByDisplayValue('mario@pec.it'), { target: { value: 'nuovo@pec.it' } });
    fireEvent.click(screen.getByText('✓ Salva sezione'));

    await waitFor(() => {
      expect(enqueueOperation).toHaveBeenCalledWith(
        'update-customer',
        expect.objectContaining({ erpId: '55.261', pec: 'nuovo@pec.it' }),
      );
    });
  });

  test('calls onSaved after successful bot job', async () => {
    const onSaved = vi.fn();
    (enqueueOperation as ReturnType<typeof vi.fn>).mockResolvedValue({ jobId: 'j1', success: true });
    (pollJobUntilDone as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<CustomerInlineSection {...baseProps} onSaved={onSaved} />);
    fireEvent.click(screen.getByText('✏ Modifica'));
    fireEvent.click(screen.getByText('✓ Salva sezione'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  test('shows error and stays in edit mode when job fails', async () => {
    (enqueueOperation as ReturnType<typeof vi.fn>).mockResolvedValue({ jobId: 'j1', success: true });
    (pollJobUntilDone as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Bot timeout'));

    render(<CustomerInlineSection {...baseProps} />);
    fireEvent.click(screen.getByText('✏ Modifica'));
    fireEvent.click(screen.getByText('✓ Salva sezione'));

    await waitFor(() => expect(screen.getByText('Bot timeout')).toBeDefined());
    expect(screen.queryByText('✏ Modifica')).toBeNull();
  });

  test('sends postalCodeCity (not city) when city field is saved', async () => {
    const cityField: SectionField = { key: 'city', label: 'Città', value: 'Napoli' };
    (enqueueOperation as ReturnType<typeof vi.fn>).mockResolvedValue({ jobId: 'j1', success: true });
    (pollJobUntilDone as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<CustomerInlineSection {...baseProps} fields={[cityField]} />);
    fireEvent.click(screen.getByText('✏ Modifica'));
    fireEvent.click(screen.getByText('✓ Salva sezione'));

    await waitFor(() => {
      expect(enqueueOperation).toHaveBeenCalledWith(
        'update-customer',
        expect.objectContaining({ postalCodeCity: 'Napoli' }),
      );
    });
    const call = (enqueueOperation as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(call[1])).not.toContain('city');
  });

  test('shows hasError styling when hasError prop is true', () => {
    render(<CustomerInlineSection {...baseProps} hasError />);
    expect(screen.getByText('⚠ Dati Fiscali')).toBeDefined();
  });

  test('readonly fields show value but no input in edit mode', () => {
    const roField: SectionField = { key: 'vatValidatedAt', label: 'IVA Validata', value: 'Sì', readOnly: true };
    render(<CustomerInlineSection {...baseProps} fields={[roField]} />);
    fireEvent.click(screen.getByText('✏ Modifica'));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Sì')).toBeDefined();
  });
});
