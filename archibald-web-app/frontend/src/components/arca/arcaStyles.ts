import type { CSSProperties } from "react";
import type { ArcaData } from "../../types/arca-data";

export const ARCA_COLORS = {
  headerBg: "#336699",
  headerText: "#FFFFFF",
  rowEven: "#FFFFFF",
  rowOdd: "#FFFFF0",
  selectionBg: "#0000CC",
  selectionText: "#FFFFFF",
  navyHeader: "#000080",
  navyHeaderText: "#FFFFFF",
  inputBorder: "#808080",
  highlightBg: "#C0FFC0",
  comeConvenuto: "#FF0000",
  tabActive: "#FFFFFF",
  tabInactive: "#D4D0C8",
  tabBorder: "#808080",
  windowBg: "#ECE9D8",
  fieldBg: "#FFFFFF",
  labelColor: "#000000",
  borderLight: "#D4D0C8",
  borderDark: "#808080",
  linkBlue: "#0000CC",
} as const;

export const ARCA_FONT: CSSProperties = {
  fontFamily: "'Segoe UI', Tahoma, sans-serif",
  fontSize: "11px",
};

export const arcaHeaderRow: CSSProperties = {
  ...ARCA_FONT,
  backgroundColor: ARCA_COLORS.headerBg,
  color: ARCA_COLORS.headerText,
  fontWeight: "bold",
  padding: "4px 8px",
  userSelect: "none",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export const arcaNavyHeader: CSSProperties = {
  ...ARCA_FONT,
  backgroundColor: ARCA_COLORS.navyHeader,
  color: ARCA_COLORS.navyHeaderText,
  fontWeight: "bold",
  padding: "3px 6px",
  whiteSpace: "nowrap",
};

export function arcaRowStyle(index: number, selected: boolean): CSSProperties {
  if (selected) {
    return {
      ...ARCA_FONT,
      backgroundColor: ARCA_COLORS.selectionBg,
      color: ARCA_COLORS.selectionText,
      padding: "3px 8px",
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
  return {
    ...ARCA_FONT,
    backgroundColor:
      index % 2 === 0 ? ARCA_COLORS.rowEven : ARCA_COLORS.rowOdd,
    color: "#000",
    padding: "3px 8px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

export const arcaSunkenInput: CSSProperties = {
  ...ARCA_FONT,
  border: "2px inset #808080",
  backgroundColor: ARCA_COLORS.fieldBg,
  padding: "2px 4px",
  outline: "none",
  boxSizing: "border-box",
};

export const arcaReadOnlyInput: CSSProperties = {
  ...arcaSunkenInput,
  backgroundColor: "#F0F0F0",
  color: "#333",
};

export const arcaHighlightInput: CSSProperties = {
  ...arcaSunkenInput,
  backgroundColor: ARCA_COLORS.highlightBg,
  fontWeight: "bold",
};

export const arcaLabel: CSSProperties = {
  ...ARCA_FONT,
  color: ARCA_COLORS.labelColor,
  whiteSpace: "nowrap",
  padding: "2px 4px",
};

export const arcaTab = (active: boolean): CSSProperties => ({
  ...ARCA_FONT,
  padding: "4px 12px",
  backgroundColor: active ? ARCA_COLORS.tabActive : ARCA_COLORS.tabInactive,
  border: `1px solid ${ARCA_COLORS.tabBorder}`,
  borderBottom: active ? "1px solid #FFFFFF" : `1px solid ${ARCA_COLORS.tabBorder}`,
  cursor: "pointer",
  fontWeight: active ? "bold" : "normal",
  marginBottom: active ? "-1px" : "0",
  position: "relative" as const,
  zIndex: active ? 1 : 0,
});

export const arcaPanel: CSSProperties = {
  border: `1px solid ${ARCA_COLORS.tabBorder}`,
  backgroundColor: ARCA_COLORS.tabActive,
  padding: "8px",
};

export const arcaComeConvenuto: CSSProperties = {
  ...ARCA_FONT,
  color: ARCA_COLORS.comeConvenuto,
  fontWeight: "bold",
  fontStyle: "italic",
};

export function formatArcaCurrency(value: number | undefined): string {
  if (value == null) return "";
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatArcaDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function parseArcaDataFromOrder(arcaDataStr: string | null | undefined): ArcaData | null {
  if (!arcaDataStr) return null;
  try {
    return JSON.parse(arcaDataStr) as ArcaData;
  } catch {
    return null;
  }
}
