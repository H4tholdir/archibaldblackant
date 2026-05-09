import type { FieldParser } from '../types';

function detectNumberFormat(value: string): 'en' | 'it' {
  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');

  if (lastComma === -1 && lastDot === -1) return 'en';
  if (lastComma === -1) return 'en';
  if (lastDot === -1) {
    const parts = value.split(',');
    if (parts.length === 2 && parts[1].length <= 2) return 'it';
    return 'en';
  }

  if (lastDot > lastComma) return 'en';
  return 'it';
}

function normalizeNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const cleaned = trimmed.replace(/[€$£\s]/g, '');
  if (!cleaned) return undefined;

  const format = detectNumberFormat(cleaned);

  let normalized: string;
  if (format === 'en') {
    normalized = cleaned.replace(/,/g, '');
  } else {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  }

  const num = Number(normalized);
  return Number.isNaN(num) ? undefined : num;
}

const parseDate: FieldParser = (raw) => {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const dateTimeMatch = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i,
  );
  if (dateTimeMatch) {
    const [, p1, p2, year, hourStr, min, sec, ampm] = dateTimeMatch;
    const { month, day } = disambiguateMDY(parseInt(p1, 10), parseInt(p2, 10));
    let hour = parseInt(hourStr, 10);
    if (ampm) {
      const upper = ampm.toUpperCase();
      if (upper === 'PM' && hour < 12) hour += 12;
      if (upper === 'AM' && hour === 12) hour = 0;
    }
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const hh = String(hour).padStart(2, '0');
    return `${year}-${mm}-${dd}T${hh}:${min}:${sec}`;
  }

  const dateOnlyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dateOnlyMatch) {
    const [, p1, p2, year] = dateOnlyMatch;
    const { month, day } = disambiguateMDY(parseInt(p1, 10), parseInt(p2, 10));
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  }

  return trimmed;
};

function disambiguateMDY(p1: number, p2: number): { month: number; day: number } {
  if (p1 > 12) return { month: p2, day: p1 };
  if (p2 > 12) return { month: p1, day: p2 };
  // ERP in Italian mode (Accept-Language: it-IT) uses DD/MM/YYYY.
  // When both parts are ≤ 12 the order is ambiguous — default to Italian (p1=day, p2=month).
  return { month: p2, day: p1 };
}

const parseNumber: FieldParser = (raw) => {
  return normalizeNumber(raw);
};

// ERP customer profile IDs are formatted as XX.YYY (e.g. '55.220', '1.610').
// Three broken formats can arrive depending on ERP locale and JS float handling:
//   '55,220'  — EN mode (comma = thousands separator from VPS)
//   '55.220'  — correct
//   '55.22'   — truncated by JS Number() losing trailing zero
//   '55220'   — no dot (left by old parseNumber path in EN mode)
// Normalize all to canonical XX.YYY (dot + exactly 3 digits).
const parseErpId: FieldParser = (raw) => {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const noComma = trimmed.replace(/,/g, '');
  if (/^\d+\.\d+$/.test(noComma)) {
    const [int, dec] = noComma.split('.');
    return int + '.' + dec.padEnd(3, '0');
  }
  if (/^\d+$/.test(noComma) && noComma.length > 3) {
    return noComma.slice(0, -3) + '.' + noComma.slice(-3);
  }
  return noComma;
};

const parseBoolean: FieldParser = (raw) => {
  const lower = raw.trim().toLowerCase();
  if (lower === 'sì' || lower === 'si' || lower === 'yes' || lower === '1' || lower === 'true') return true;
  if (lower === 'no' || lower === '0' || lower === 'false' || lower === '') return false;
  return undefined;
};

const parseCurrency: FieldParser = (raw) => {
  return normalizeNumber(raw);
};

export { parseDate, parseNumber, parseBoolean, parseCurrency, parseErpId, normalizeNumber, detectNumberFormat, disambiguateMDY };
