import { describe, test, expect, vi } from 'vitest';
import { listUpcomingCourseEventsForCity, createCourseEvent, deleteCourseEvent } from './course-events';

describe('listUpcomingCourseEventsForCity', () => {
  test('restituisce corsi per città e data futura', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{
      id: 1, title: 'Corso Massironi', instructor: 'Massironi',
      city: 'Castellammare di Stabia', provincia: 'NA',
      event_date: '2026-07-15', cost_eur: '500.00',
      product_categories: ['Frese carburo'], threshold_eur: '1500.00',
      notes: null, is_active: true,
    }] }) } as any;
    const result = await listUpcomingCourseEventsForCity(pool, 'Castellammare di Stabia', 60);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Corso Massironi');
    expect(result[0].thresholdEur).toBe(1500);
  });

  test('restituisce array vuoto se nessun corso', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as any;
    const result = await listUpcomingCourseEventsForCity(pool, 'Milano', 60);
    expect(result).toHaveLength(0);
  });
});

describe('createCourseEvent', () => {
  test('chiama INSERT e ritorna evento creato', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{
      id: 1, title: 'Nuovo corso', instructor: null, city: 'Napoli', provincia: 'NA',
      event_date: '2026-08-01', cost_eur: '300.00', product_categories: [],
      threshold_eur: null, notes: null, is_active: true,
      created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
    }] }) } as any;
    const result = await createCourseEvent(pool, {
      title: 'Nuovo corso', city: 'Napoli', eventDate: '2026-08-01',
      costEur: 300, productCategories: [], isActive: true,
    });
    expect(result.title).toBe('Nuovo corso');
    expect(result.costEur).toBe(300);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});
