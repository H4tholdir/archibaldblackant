import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppointmentForm } from './AppointmentForm';
import * as appointmentsApi from '../api/appointments';
import type { AppointmentType } from '../types/agenda';

const TYPES: AppointmentType[] = [
  { id: 1, userId: null, label: 'Visita cliente', emoji: '🏢', colorHex: '#2563eb', isSystem: true, sortOrder: 1 },
  { id: 2, userId: null, label: 'Chiamata',       emoji: '📞', colorHex: '#10b981', isSystem: true, sortOrder: 2 },
];

describe('AppointmentForm', () => {
  beforeEach(() => {
    vi.spyOn(appointmentsApi, 'createAppointment').mockResolvedValue({
      id: 'new-1', userId: 'a', title: 'Test', startAt: '', endAt: '',
      allDay: false, customerErpId: null, customerName: null, location: null,
      typeId: null, typeLabel: null, typeEmoji: null, typeColorHex: null,
      notes: null, icsUid: 'uid-1', googleEventId: null, createdAt: '', updatedAt: '',
    });
  });

  test('renderizza campi principali', () => {
    render(
      <MemoryRouter>
        <AppointmentForm types={TYPES} onSaved={() => {}} onCancel={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/Titolo/i)).toBeInTheDocument();
    expect(screen.getByText('🏢 Visita cliente')).toBeInTheDocument();
    expect(screen.getByText('📞 Chiamata')).toBeInTheDocument();
  });

  test('chiama createAppointment con i dati corretti al submit', async () => {
    render(
      <MemoryRouter>
        <AppointmentForm types={TYPES} onSaved={() => {}} onCancel={() => {}} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText(/Titolo/i), { target: { value: 'Visita test' } });
    fireEvent.click(screen.getByRole('button', { name: /Salva/i }));
    await waitFor(() => expect(appointmentsApi.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Visita test' }),
    ));
  });

  test('chiama onCancel quando si preme Annulla', () => {
    const onCancel = vi.fn();
    render(
      <MemoryRouter>
        <AppointmentForm types={TYPES} onSaved={() => {}} onCancel={onCancel} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Annulla/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
