import type { MatchLevel } from '../services/warehouse-matching';

export type WarehouseThemeLevel = MatchLevel | 'none';

export type LevelColors = {
  bg: string;        // sfondo leggero (row tint, card bg)
  bgMid: string;     // sfondo medio (header, banner)
  border: string;    // bordo principale
  accent: string;    // colore testo/icone
  btnBg: string;     // sfondo bottone CTA
};

export const WAREHOUSE_LEVEL_COLORS: Record<WarehouseThemeLevel, LevelColors> = {
  none:         { bg: '#f8fafc', bgMid: '#f1f5f9', border: '#e2e8f0', accent: '#64748b', btnBg: '#64748b' },
  exact:        { bg: '#f0fdf4', bgMid: '#d1fae5', border: '#34d399', accent: '#059669', btnBg: '#059669' },
  'figura-gambo': { bg: '#eff6ff', bgMid: '#dbeafe', border: '#60a5fa', accent: '#2563eb', btnBg: '#2563eb' },
  figura:       { bg: '#fffbeb', bgMid: '#fef3c7', border: '#fbbf24', accent: '#d97706', btnBg: '#d97706' },
  description:  { bg: '#fff7ed', bgMid: '#ffedd5', border: '#fb923c', accent: '#ea580c', btnBg: '#ea580c' },
};

export const WAREHOUSE_LEVEL_LABELS: Record<WarehouseThemeLevel, string> = {
  none: 'Nessun match',
  exact: 'Match esatto',
  'figura-gambo': 'Stessa figura + gambo',
  figura: 'Stessa figura',
  description: 'Descrizione simile',
};

/** Restituisce il level più alto trovato in un array di match */
export function bestMatchLevel(matches: { level: MatchLevel }[]): WarehouseThemeLevel {
  if (matches.some(m => m.level === 'exact')) return 'exact';
  if (matches.some(m => m.level === 'figura-gambo')) return 'figura-gambo';
  if (matches.some(m => m.level === 'figura')) return 'figura';
  if (matches.some(m => m.level === 'description')) return 'description';
  return 'none';
}

/** True se il livello è pre-selezionato di default (exact e figura-gambo) */
export function isAutoSelected(level: MatchLevel): boolean {
  return level === 'exact' || level === 'figura-gambo';
}
