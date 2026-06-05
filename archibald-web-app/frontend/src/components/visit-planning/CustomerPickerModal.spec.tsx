import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomerPickerModal } from './CustomerPickerModal';

describe('CustomerPickerModal', () => {
  test('mostra campo ricerca quando aperta', () => {
    render(
      <CustomerPickerModal
        sessionId="sess-1"
        stopDate="2026-06-06"
        onAdded={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText(/cerca/i)).toBeInTheDocument();
  });

  test('chiama onClose al click Annulla', () => {
    const onClose = vi.fn();
    render(
      <CustomerPickerModal
        sessionId="sess-1"
        stopDate="2026-06-06"
        onAdded={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByText(/Annulla/));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
