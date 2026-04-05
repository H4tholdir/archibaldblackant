import { describe, expect, test, vi } from 'vitest';
import { buildKometImageUrl } from './komet-web-scraper';

describe('buildKometImageUrl', () => {
  test('builds correct URL for H1.314.016', () => {
    const url = buildKometImageUrl('H1.314.016');
    expect(url).toBe('https://www.kometdental.com/uploads/03di_H1_314_016_450.png');
  });

  test('builds correct URL for KP6801.314.018', () => {
    const url = buildKometImageUrl('KP6801.314.018');
    expect(url).toBe('https://www.kometdental.com/uploads/03di_KP6801_314_018_450.png');
  });

  test('returns null for malformed product id', () => {
    expect(buildKometImageUrl('H1314016')).toBeNull();
  });
});
