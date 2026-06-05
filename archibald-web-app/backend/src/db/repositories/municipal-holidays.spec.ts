import { describe, test, expect, vi } from 'vitest';
import { isHolidayForCity, listHolidaysForDate } from './municipal-holidays';

const USER_ID = 'user-1';

describe('isHolidayForCity', () => {
  test('restituisce true se comune + data matchano una festa con confidence verified', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ comune: 'Napoli', holiday_name: 'San Gennaro', confidence: 'verified', is_override: false }],
      }),
    } as any;
    const result = await isHolidayForCity(pool, USER_ID, 'Napoli', 9, 19);
    expect(result).toMatchObject({ isHoliday: true, confidence: 'verified', name: 'San Gennaro' });
  });

  test('restituisce false se nessuna corrispondenza', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as any;
    const result = await isHolidayForCity(pool, USER_ID, 'Milano', 6, 15);
    expect(result).toMatchObject({ isHoliday: false });
  });
});
