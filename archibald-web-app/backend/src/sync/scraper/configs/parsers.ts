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

// ERP IDs use '.' as Italian thousands separator (e.g. '54.352'=54352, '1.610'=1610).
// JS float conversion drops trailing zeros: '54.280'→'54.28', '48.900'→'48.9'.
// Fix: if fewer than 3 digits follow the dot, pad with trailing zeros before stripping.
const parseErpId: FieldParser = (raw) => {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const match = trimmed.match(/^(\d+)\.(\d{1,3})$/);
  if (match) {
    const [, before, after] = match;
    return before + after.padEnd(3, '0');
  }
  const num = parseInt(trimmed, 10);
  return isNaN(num) ? trimmed : String(num);
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
