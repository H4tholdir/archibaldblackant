import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AppointmentTypeManager } from './AppointmentTypeManager';
import * as apptTypesApi from '../api/appointment-types';
import type { AppointmentType } from '../types/agenda';

const SYSTEM_TYPE: AppointmentType = {
  id: 1,
  userId: null,
  label: 'Visita cliente',
  emoji: '🏢',
  colorHex: '#2563eb',
  isSystem: true,
  sortOrder: 1,
};

const USER_TYPE: AppointmentType = {
  id: 2,
  userId: 'u1',
  label: 'Riunione interna',
  emoji: '📋',
  colorHex: '#10b981',
  isSystem: false,
  sortOrder: 8,
};

describe('AppointmentTypeManager', () => {
  beforeEach(() => {
    vi.spyOn(apptTypesApi, 'listAppointmentTypes').mockResolvedValue([SYSTEM_TYPE, USER_TYPE]);
    vi.spyOn(apptTypesApi, 'createAppointmentType').mockResolvedValue(USER_TYPE);
    vi.spyOn(apptTypesApi, 'updateAppointmentType').mockResolvedValue(USER_TYPE);
    vi.spyOn(apptTypesApi, 'deleteAppointmentType').mockResolvedValue();
  });

  test('AppointmentTypeManager — renderizza senza crash (smoke test)', async () => {
    render(<AppointmentTypeManager onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('Tipi di appuntamento')).toBeInTheDocument());
  });

  test('AppointmentTypeManager — tipo sistema non mostra il pulsante elimina', async () => {
    render(<AppointmentTypeManager onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(SYSTEM_TYPE.label)).toBeInTheDocument());

    const rows = screen.getAllByText('✏️');
    expect(rows).toHaveLength(2);

    const deleteButtons = screen.queryAllByText('🗑');
    expect(deleteButtons).toHaveLength(1);
  });

  test('AppointmentTypeManager — tipo sistema mostra il pulsante rinomina', async () => {
    render(<AppointmentTypeManager onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(SYSTEM_TYPE.label)).toBeInTheDocument());

    const renameButtons = screen.getAllByText('✏️');
    expect(renameButtons.length).toBeGreaterThanOrEqual(1);
  });

  test('AppointmentTypeManager — tipo utente mostra il pulsante elimina', async () => {
    render(<AppointmentTypeManager onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(USER_TYPE.label)).toBeInTheDocument());

    const deleteButtons = screen.getAllByText('🗑');
    expect(deleteButtons).toHaveLength(1);
  });
});
