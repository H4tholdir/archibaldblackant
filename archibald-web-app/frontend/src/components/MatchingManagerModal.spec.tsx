import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MatchingManagerModal } from './MatchingManagerModal';

vi.mock('../services/sub-client-matches.service', () => ({
  getMatchesForSubClient: vi.fn(),
  getMatchesForCustomer: vi.fn(),
  addCustomerMatch: vi.fn().mockResolvedValue(undefined),
  removeCustomerMatch: vi.fn().mockResolvedValue(undefined),
  addSubClientMatch: vi.fn().mockResolvedValue(undefined),
  removeSubClientMatch: vi.fn().mockResolvedValue(undefined),
  upsertSkipModal: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/subclients.service', () => ({
  getSubclients: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/customers.service', () => ({
  customerService: { searchCustomers: vi.fn().mockResolvedValue([]) },
}));

import {
  getMatchesForSubClient,
  getMatchesForCustomer,
  removeCustomerMatch,
  upsertSkipModal,
} from '../services/sub-client-matches.service';

const emptyMatch = { customerProfileIds: [], subClientCodices: [], skipModal: false };

const subClientProps = {
  mode: 'subclient' as const,
  subClientCodice: 'C00001',
  entityName: 'Rossi Srl',
  onConfirm: vi.fn(),
  onSkip: vi.fn(),
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMatchesForSubClient).mockResolvedValue(emptyMatch);
  vi.mocked(getMatchesForCustomer).mockResolvedValue(emptyMatch);
});

describe('MatchingManagerModal', () => {
  it('loads and displays existing matches on open (mode=subclient)', async () => {
    vi.mocked(getMatchesForSubClient).mockResolvedValue({
      customerProfileIds: ['PROF-1'],
      subClientCodices: ['C00002'],
      skipModal: false,
    });

    render(<MatchingManagerModal {...subClientProps} />);

    await waitFor(() =>
      expect(getMatchesForSubClient).toHaveBeenCalledWith('C00001'),
    );
    // chips for the resolved IDs are shown in the section
    await screen.findByText('PROF-1');
    await screen.findByText('C00002');
  });

  it('calls removeCustomerMatch on confirm after removing a chip (mode=subclient)', async () => {
    vi.mocked(getMatchesForSubClient).mockResolvedValue({
      customerProfileIds: ['PROF-1'],
      subClientCodices: [],
      skipModal: false,
    });

    render(<MatchingManagerModal {...subClientProps} />);
    await screen.findByText('PROF-1');

    // Remove the chip (index 1: index 0 is the header close button)
    const allXButtons = screen.getAllByText('✕', { selector: 'button' });
    fireEvent.click(allXButtons[1]);

    // Confirm
    const confirmBtn = screen.getByText(/conferma/i);
    fireEvent.click(confirmBtn);

    await waitFor(() =>
      expect(removeCustomerMatch).toHaveBeenCalledWith('C00001', 'PROF-1'),
    );
  });

  it('calls onSkip with current matches when the skip button is clicked', async () => {
    render(<MatchingManagerModal {...subClientProps} />);
    await waitFor(() => expect(screen.queryByText('Caricamento...')).toBeNull());

    fireEvent.click(screen.getByText(/Salta/i));

    expect(subClientProps.onSkip).toHaveBeenCalledWith({ customerProfileIds: [], subClientCodices: [] });
  });

  it('calls upsertSkipModal when skip checkbox is checked on confirm', async () => {
    render(<MatchingManagerModal {...subClientProps} />);
    await waitFor(() => expect(screen.queryByText('Caricamento...')).toBeNull());

    fireEvent.click(screen.getByRole('checkbox'));

    fireEvent.click(screen.getByText(/conferma/i));

    await waitFor(() =>
      expect(upsertSkipModal).toHaveBeenCalledWith('subclient', 'C00001', true),
    );
  });
});
