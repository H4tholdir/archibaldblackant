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

  // Boundary: colore e valore visualizzato devono sempre essere coerenti
  test('verde per 20.04% — mostrato come "20.0%", NON giallo (bug floating point)', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={20.04} />);
    expect(screen.getByText('Range di sconto approvato')).toBeInTheDocument();
    expect(screen.getByText('20.0%')).toBeInTheDocument();
  });

  test('verde per imprecisione IEEE 754 oltre la soglia (es. 20 + epsilon)', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={20.000000000003} />);
    expect(screen.getByText('Range di sconto approvato')).toBeInTheDocument();
  });

  test('giallo per 20.05% — mostrato come "20.1%"', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={20.05} />);
    expect(
      screen.getByText('Range di sconto critico, fai attenzione sei al limite della scontistica.'),
    ).toBeInTheDocument();
    expect(screen.getByText('20.1%')).toBeInTheDocument();
  });

  test('giallo per 25.04% — mostrato come "25.0%", NON rosso', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={25.04} />);
    expect(
      screen.getByText('Range di sconto critico, fai attenzione sei al limite della scontistica.'),
    ).toBeInTheDocument();
    expect(screen.getByText('25.0%')).toBeInTheDocument();
  });

  test('rosso per 25.05% — mostrato come "25.1%"', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={25.05} />);
    expect(
      screen.getByText("Hai superato il limite sconto, l'ordine sarà soggetto ad approvazione."),
    ).toBeInTheDocument();
    expect(screen.getByText('25.1%')).toBeInTheDocument();
  });
});
