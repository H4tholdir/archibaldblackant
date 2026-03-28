import type { FieldParser } from '../types';

const parseDate: FieldParser = (raw) => {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed;
};

const parseNumber: FieldParser = (raw) => {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.replace(/\./g, '').replace(',', '.');
  const num = Number(normalized);
  return Number.isNaN(num) ? undefined : num;
};

const parseBoolean: FieldParser = (raw) => {
  const lower = raw.trim().toLowerCase();
  if (lower === 'sì' || lower === 'si' || lower === 'yes' || lower === '1' || lower === 'true') return true;
  if (lower === 'no' || lower === '0' || lower === 'false' || lower === '') return false;
  return undefined;
};

const parseCurrency: FieldParser = (raw) => {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const cleaned = trimmed
    .replace(/[€$£\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const num = Number(cleaned);
  return Number.isNaN(num) ? trimmed : trimmed;
};

export { parseDate, parseNumber, parseBoolean, parseCurrency };
