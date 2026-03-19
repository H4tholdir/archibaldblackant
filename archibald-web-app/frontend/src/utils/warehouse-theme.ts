import type { MatchLevel } from '../services/warehouse-matching';

export type WarehouseThemeLevel = MatchLevel | 'none';

export type LevelColors = {
  backgroundLight: string;
  backgroundMid: string;
  borderColor: string;
  accentColor: string;
  buttonBackground: string;
};

export const WAREHOUSE_LEVEL_COLORS: Record<WarehouseThemeLevel, LevelColors> = {
  none:         { backgroundLight: '#f8fafc', backgroundMid: '#f1f5f9', borderColor: '#e2e8f0', accentColor: '#64748b', buttonBackground: '#64748b' },
  exact:        { backgroundLight: '#f0fdf4', backgroundMid: '#d1fae5', borderColor: '#34d399', accentColor: '#059669', buttonBackground: '#059669' },
  'figura-gambo': { backgroundLight: '#eff6ff', backgroundMid: '#dbeafe', borderColor: '#60a5fa', accentColor: '#2563eb', buttonBackground: '#2563eb' },
  figura:       { backgroundLight: '#fffbeb', backgroundMid: '#fef3c7', borderColor: '#fbbf24', accentColor: '#d97706', buttonBackground: '#d97706' },
  description:  { backgroundLight: '#fff7ed', backgroundMid: '#ffedd5', borderColor: '#fb923c', accentColor: '#ea580c', buttonBackground: '#ea580c' },
};

export const WAREHOUSE_LEVEL_LABELS: Record<WarehouseThemeLevel, string> = {
  none: 'Nessun match',
  exact: 'Match esatto',
  'figura-gambo': 'Stessa figura + gambo',
  figura: 'Stessa figura',
  description: 'Descrizione simile',
};

export function bestMatchLevel(matches: { level: MatchLevel }[]): WarehouseThemeLevel {
  if (matches.some(m => m.level === 'exact')) return 'exact';
  if (matches.some(m => m.level === 'figura-gambo')) return 'figura-gambo';
  if (matches.some(m => m.level === 'figura')) return 'figura';
  if (matches.some(m => m.level === 'description')) return 'description';
  return 'none';
}

export function isAutoSelected(level: MatchLevel): boolean {
  return level === 'exact' || level === 'figura-gambo';
}
