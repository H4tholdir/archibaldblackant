import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArrivalBanner } from './ArrivalBanner';

describe('ArrivalBanner', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  test('non si mostra se navigationStartedAt è null', () => {
    const { container } = render(
      <ArrivalBanner customerName="Dr. Rossi" navigationStartedAt={null} minMinutesBeforePrompt={5} onConfirm={vi.fn()} onDismiss={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('non si mostra se trascorsi meno di minMinutesBeforePrompt minuti', () => {
    const startedAt = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { container } = render(
      <ArrivalBanner customerName="Dr. Rossi" navigationStartedAt={startedAt} minMinutesBeforePrompt={5} onConfirm={vi.fn()} onDismiss={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('si mostra se trascorsi più di minMinutesBeforePrompt minuti', () => {
    const startedAt = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    render(
      <ArrivalBanner customerName="Dr. Rossi" navigationStartedAt={startedAt} minMinutesBeforePrompt={5} onConfirm={vi.fn()} onDismiss={vi.fn()} />
    );
    expect(screen.getByText(/Dr\. Rossi/)).toBeInTheDocument();
    expect(screen.getByText(/Sei arrivato/i)).toBeInTheDocument();
  });

  test('chiama onConfirm al click "Segna visitato"', () => {
    const onConfirm = vi.fn();
    const startedAt = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    render(
      <ArrivalBanner customerName="Dr. Rossi" navigationStartedAt={startedAt} minMinutesBeforePrompt={5} onConfirm={onConfirm} onDismiss={vi.fn()} />
    );
    fireEvent.click(screen.getByText(/Segna visitato/i));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test('chiama onDismiss al click "Non ancora"', () => {
    const onDismiss = vi.fn();
    const startedAt = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    render(
      <ArrivalBanner customerName="Dr. Rossi" navigationStartedAt={startedAt} minMinutesBeforePrompt={5} onConfirm={vi.fn()} onDismiss={onDismiss} />
    );
    fireEvent.click(screen.getByText(/Non ancora/i));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
