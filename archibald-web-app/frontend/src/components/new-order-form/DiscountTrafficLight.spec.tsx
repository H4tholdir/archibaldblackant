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
    expect(screen.getByText('Limite sconto rispettato')).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('Sconto effettivo documento') && content.includes('0.1%'))).toBeInTheDocument();
  });

  test('verde per sconto esattamente 20%', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={20} />);
    expect(screen.getByText('Limite sconto rispettato')).toBeInTheDocument();
  });

  test('giallo per sconto 20.1%', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={20.1} />);
    expect(screen.getByText('Limite sconto critico')).toBeInTheDocument();
  });

  test('giallo per sconto esattamente 25%', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={25} />);
    expect(screen.getByText('Limite sconto critico')).toBeInTheDocument();
  });

  test('rosso per sconto 25.1%', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={25.1} />);
    expect(screen.getByText('Limite sconto in approvazione')).toBeInTheDocument();
  });

  test('mostra percentuale formattata a 1 decimale', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={22.567} />);
    expect(screen.getByText((content) => content.includes('Sconto effettivo documento') && content.includes('22.6%'))).toBeInTheDocument();
  });
});
