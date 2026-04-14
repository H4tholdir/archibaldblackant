import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiscountTrafficLight } from './DiscountTrafficLight.tsx';

describe('DiscountTrafficLight', () => {
  test('non renderizza nulla a sconto 0', () => {
    const { container } = render(<DiscountTrafficLight effectiveDiscountPercent={0} />);
    expect(container.firstChild).toBeNull();
  });

  test('verde per sconto 0.1%', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={0.1} />);
    expect(screen.getByText('Range di sconto approvato')).toBeInTheDocument();
  });

  test('verde per sconto esattamente 20%', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={20} />);
    expect(screen.getByText('Range di sconto approvato')).toBeInTheDocument();
  });

  test('giallo per sconto 20.1%', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={20.1} />);
    expect(
      screen.getByText('Range di sconto critico, fai attenzione sei al limite della scontistica.'),
    ).toBeInTheDocument();
  });

  test('giallo per sconto esattamente 25%', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={25} />);
    expect(
      screen.getByText('Range di sconto critico, fai attenzione sei al limite della scontistica.'),
    ).toBeInTheDocument();
  });

  test('rosso per sconto 25.1%', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={25.1} />);
    expect(
      screen.getByText("Hai superato il limite sconto, l'ordine sarà soggetto ad approvazione."),
    ).toBeInTheDocument();
  });

  test('mostra percentuale formattata a 1 decimale', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={22.567} />);
    expect(screen.getByText('22.6%')).toBeInTheDocument();
  });
});
