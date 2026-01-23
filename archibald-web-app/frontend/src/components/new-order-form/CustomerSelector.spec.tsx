// @ts-nocheck
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomerSelector } from './CustomerSelector';
import type { Customer } from '../../db/schema';

describe('CustomerSelector', () => {
  const mockCustomers: Customer[] = [
    {
      id: '1',
      name: 'Mario Rossi',
      code: 'MR001',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '2',
      name: 'Luigi Verdi',
      code: 'LV002',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '3',
      name: 'Maria Bianchi',
      code: 'MB003',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders input with placeholder', () => {
    render(<CustomerSelector onSelect={vi.fn()} />);
    expect(
      screen.getByPlaceholderText('Cerca cliente per nome...')
    ).toBeInTheDocument();
  });

  test('renders label', () => {
    render(<CustomerSelector onSelect={vi.fn()} />);
    expect(screen.getByLabelText('Cerca cliente')).toBeInTheDocument();
  });

  test('typing triggers debounced search after 300ms', async () => {
    const mockSearch = vi.fn().mockResolvedValue([mockCustomers[0]]);

    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText('Cerca cliente per nome...');
    await userEvent.type(input, 'mario');

    // Search should NOT be called immediately
    expect(mockSearch).not.toHaveBeenCalled();

    // Wait for debounce (300ms + buffer)
    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('mario'), {
      timeout: 500,
    });
  });

  test('displays filtered results in dropdown', async () => {
    const mockSearch = vi.fn().mockResolvedValue(mockCustomers);

    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText('Cerca cliente per nome...');
    await userEvent.type(input, 'mario');

    await waitFor(() => screen.getByText('Mario Rossi'));

    expect(screen.getByText('Mario Rossi')).toBeInTheDocument();
    expect(screen.getByText('Codice: MR001')).toBeInTheDocument();
  });

  test('clicking result selects customer and closes dropdown', async () => {
    const onSelect = vi.fn();
    const mockSearch = vi.fn().mockResolvedValue([mockCustomers[0]]);

    render(<CustomerSelector onSelect={onSelect} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText('Cerca cliente per nome...');
    await userEvent.type(input, 'mario');

    await waitFor(() => screen.getByText('Mario Rossi'));

    const result = screen.getByText('Mario Rossi');
    await userEvent.click(result);

    expect(onSelect).toHaveBeenCalledWith(mockCustomers[0]);

    // Dropdown should be closed (result no longer visible in dropdown)
    await waitFor(() => {
      const dropdown = screen.queryByRole('listbox');
      expect(dropdown).not.toBeInTheDocument();
    });
  });

  test('shows loading state during search', async () => {
    const mockSearch = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 100))
      );

    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText('Cerca cliente per nome...');
    await userEvent.type(input, 'mario');

    // Wait for debounce
    await waitFor(() => expect(mockSearch).toHaveBeenCalled(), {
      timeout: 500,
    });

    // Loading indicator should appear
    expect(screen.getByText('Ricerca in corso...')).toBeInTheDocument();
  });

  test('shows error message on search failure', async () => {
    const mockSearch = vi.fn().mockRejectedValue(new Error('Network error'));

    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText('Cerca cliente per nome...');
    await userEvent.type(input, 'mario');

    await waitFor(
      () => {
        expect(screen.getByText('Errore durante la ricerca')).toBeInTheDocument();
      },
      { timeout: 500 }
    );
  });

  test('displays selected customer confirmation', async () => {
    const mockSearch = vi.fn().mockResolvedValue([mockCustomers[0]]);

    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText('Cerca cliente per nome...');
    await userEvent.type(input, 'mario');

    await waitFor(() => screen.getByText('Mario Rossi'));

    const result = screen.getByText('Mario Rossi');
    await userEvent.click(result);

    await waitFor(() => {
      expect(
        screen.getByText(/✅ Cliente selezionato:/)
      ).toBeInTheDocument();
      expect(screen.getByText('Mario Rossi')).toBeInTheDocument();
    });
  });

  test('escape key closes dropdown', async () => {
    const mockSearch = vi.fn().mockResolvedValue(mockCustomers);

    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText('Cerca cliente per nome...');
    await userEvent.type(input, 'mario');

    await waitFor(() => screen.getByRole('listbox'));

    // Press Escape
    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => {
      const dropdown = screen.queryByRole('listbox');
      expect(dropdown).not.toBeInTheDocument();
    });
  });

  test('arrow keys navigate dropdown items', async () => {
    const mockSearch = vi.fn().mockResolvedValue(mockCustomers);

    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText('Cerca cliente per nome...');
    await userEvent.type(input, 'a'); // Search for 'a' to get all 3

    await waitFor(() => screen.getByRole('listbox'));

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);

    // First option not highlighted initially
    expect(options[0]).toHaveAttribute('aria-selected', 'false');

    // Press ArrowDown
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    // First option should be highlighted
    await waitFor(() => {
      expect(options[0]).toHaveAttribute('aria-selected', 'true');
    });

    // Press ArrowDown again
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    // Second option should be highlighted
    await waitFor(() => {
      expect(options[1]).toHaveAttribute('aria-selected', 'true');
    });

    // Press ArrowUp
    fireEvent.keyDown(input, { key: 'ArrowUp' });

    // First option highlighted again
    await waitFor(() => {
      expect(options[0]).toHaveAttribute('aria-selected', 'true');
    });
  });

  test('Enter key selects highlighted item', async () => {
    const onSelect = vi.fn();
    const mockSearch = vi.fn().mockResolvedValue(mockCustomers);

    render(<CustomerSelector onSelect={onSelect} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText('Cerca cliente per nome...');
    await userEvent.type(input, 'a');

    await waitFor(() => screen.getByRole('listbox'));

    // Arrow down to first item
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    // Press Enter
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(mockCustomers[0]);
    });
  });

  test('clears results when search query is empty', async () => {
    const mockSearch = vi.fn().mockResolvedValue(mockCustomers);

    render(<CustomerSelector onSelect={vi.fn()} searchFn={mockSearch} />);

    const input = screen.getByPlaceholderText('Cerca cliente per nome...');

    // Type to trigger search
    await userEvent.type(input, 'mario');
    await waitFor(() => screen.getByRole('listbox'));

    // Clear input
    await userEvent.clear(input);

    // Dropdown should be closed
    await waitFor(() => {
      const dropdown = screen.queryByRole('listbox');
      expect(dropdown).not.toBeInTheDocument();
    });
  });

  test('disabled state prevents input', () => {
    render(<CustomerSelector onSelect={vi.fn()} disabled={true} />);

    const input = screen.getByPlaceholderText('Cerca cliente per nome...');
    expect(input).toBeDisabled();
  });
});
