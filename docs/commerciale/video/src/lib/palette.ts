// src/lib/palette.ts
export const palette = {
  // Backgrounds
  bg:              '#F2F2F7',
  bgDark:          '#1C1C1E',
  bgCard:          '#FFFFFF',
  bgCardDark:      '#2C2C2E',

  // Apple System Colors
  blue:            '#007AFF',
  green:           '#34C759',
  orange:          '#FF9500',
  red:             '#FF3B30',
  purple:          '#5856D6',
  yellow:          '#FFCC00',
  teal:            '#5AC8FA',

  // Text
  textPrimary:     '#1C1C1E',
  textSecondary:   '#3A3A3C',
  textMuted:       '#8E8E93',
  textWhite:       '#FFFFFF',
  textWhiteDim:    'rgba(255,255,255,0.60)',
  textWhiteFaint:  'rgba(255,255,255,0.35)',

  // Separators
  divider:         '#E5E5EA',
  dividerDark:     'rgba(255,255,255,0.12)',

  // Legacy aliases (backward compat con scene esistenti)
  card:            '#FFFFFF',
  darkBg:          '#1C1C1E',
} as const;

export type PaletteKey = keyof typeof palette;
