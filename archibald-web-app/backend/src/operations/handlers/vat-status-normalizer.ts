type VatStatus = 'validated' | 'invalid' | 'unknown';

function normalizeVatStatus(raw: string | undefined | null): VatStatus {
  if (!raw || raw.trim() === '') return 'unknown';
  const normalized = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
  if (normalized === 'SI' || normalized === 'YES' || normalized === 'TRUE' || normalized === '1') {
    return 'validated';
  }
  if (normalized === 'NO' || normalized === 'FALSE' || normalized === '0') {
    return 'invalid';
  }
  return 'unknown';
}

export { normalizeVatStatus, type VatStatus };
