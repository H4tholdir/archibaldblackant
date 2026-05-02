import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreflightModal } from './PreflightModal';
import type { PreflightChange } from '../api/preflight';

const priceChange: PreflightChange = {
  articleCode: 'H123.314',
  type: 'price_changed',
  oldPrice: 10.0,
  newPrice: 12.5,
};

const discontinuedChange: PreflightChange = {
  articleCode: 'H456.789',
  type: 'discontinued',
  suggestedAlternative: { code: 'H999.001', name: 'Alternativa A' },
};

describe('PreflightModal', () => {
  it('renders both changes', () => {
    render(
      <PreflightModal
        changes={[priceChange, discontinuedChange]}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('H123.314')).toBeDefined();
    expect(screen.getByText('H456.789')).toBeDefined();
  });

  it('defaults all decisions to "keep"', () => {
    const onConfirm = vi.fn();
    render(
      <PreflightModal
        changes={[priceChange]}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Conferma e invia'));
    expect(onConfirm).toHaveBeenCalledWith({ 'H123.314': 'keep' });
  });

  it('updates decision when "Aggiorna al nuovo catalogo" is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <PreflightModal
        changes={[priceChange]}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Aggiorna al nuovo catalogo'));
    fireEvent.click(screen.getByText('Conferma e invia'));
    expect(onConfirm).toHaveBeenCalledWith({ 'H123.314': 'update' });
  });

  it('calls onClose when Annulla is clicked', () => {
    const onClose = vi.fn();
    render(
      <PreflightModal
        changes={[priceChange]}
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText('Annulla'));
    expect(onClose).toHaveBeenCalled();
  });

  it('returns null when changes is empty', () => {
    const { container } = render(
      <PreflightModal changes={[]} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
