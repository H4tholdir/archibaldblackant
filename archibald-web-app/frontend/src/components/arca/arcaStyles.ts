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
  windowBg: "#D4D0C8",
  fieldBg: "#FFFFFF",
  labelColor: "#000000",
  borderLight: "#D4D0C8",
  borderDark: "#808080",
  shapeBorder: "#A2A2A2",
  linkBlue: "#0000CC",
  readOnlySpecialBg: "#C0C0C0",
  expenseDescGreen: "#008000",
  gridBorderSilver: "#C0C0C0",
  gridBorderColLight: "#D0D0D0",
  navyHeaderBorder: "#404080",
} as const;

export const ARCA_GRID = {
  elencoRowHeight: 18,
  elencoHeaderHeight: 22,
  righeRowHeight: 14,
  righeHeaderHeight: 18,
  cellPadding: "1px 4px",
  headerPadding: "2px 6px",
} as const;

export const ARCA_FONT: CSSProperties = {
  fontFamily: "Arial, Tahoma, sans-serif",
  fontSize: "8pt",
};

export const arcaHeaderRow: CSSProperties = {
  ...ARCA_FONT,
  backgroundColor: ARCA_COLORS.headerBg,
  color: ARCA_COLORS.headerText,
  fontWeight: "bold",
  padding: ARCA_GRID.headerPadding,
  height: ARCA_GRID.elencoHeaderHeight,
  borderRight: `1px solid ${ARCA_COLORS.gridBorderColLight}`,
  userSelect: "none",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export const arcaNavyHeader: CSSProperties = {
  ...ARCA_FONT,
  backgroundColor: ARCA_COLORS.navyHeader,
  color: ARCA_COLORS.navyHeaderText,
  fontWeight: "bold",
  padding: ARCA_GRID.headerPadding,
  height: ARCA_GRID.righeHeaderHeight,
  borderRight: `1px solid ${ARCA_COLORS.navyHeaderBorder}`,
  whiteSpace: "nowrap",
};

export function arcaRowStyle(index: number, selected: boolean): CSSProperties {
  if (selected) {
    return {
      ...ARCA_FONT,
      backgroundColor: ARCA_COLORS.selectionBg,
      color: ARCA_COLORS.selectionText,
      padding: ARCA_GRID.cellPadding,
      height: ARCA_GRID.elencoRowHeight,
      borderBottom: `1px solid ${ARCA_COLORS.gridBorderSilver}`,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
  return {
    ...ARCA_FONT,
    backgroundColor:
      index % 2 === 0 ? ARCA_COLORS.rowEven : ARCA_COLORS.rowOdd,
    color: "#000",
    padding: ARCA_GRID.cellPadding,
    height: ARCA_GRID.elencoRowHeight,
    borderBottom: `1px solid ${ARCA_COLORS.gridBorderSilver}`,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

export const arcaSunkenInput: CSSProperties = {
  ...ARCA_FONT,
  borderWidth: "2px",
  borderStyle: "solid",
  borderColor: "#808080 #FFFFFF #FFFFFF #808080",
  backgroundColor: ARCA_COLORS.fieldBg,
  padding: "1px 3px",
  outline: "none",
  boxSizing: "border-box",
};

export const arcaReadOnlyInput: CSSProperties = {
  ...arcaSunkenInput,
  backgroundColor: "#FFFFFF",
  color: "#000",
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
  padding: "0 1px",
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
  backgroundColor: ARCA_COLORS.windowBg,
  padding: "4px",
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

export function formatArcaDecimal(value: number, decimals = 6): string {
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
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

export const arcaReadOnlySpecialInput: CSSProperties = {
  ...arcaSunkenInput,
  backgroundColor: ARCA_COLORS.readOnlySpecialBg,
  color: "#FF0000",
  height: "21px",
};

export const arcaTransparentField: CSSProperties = {
  ...ARCA_FONT,
  backgroundColor: "transparent",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "#808080 #FFFFFF #FFFFFF #808080",
  padding: "1px 3px",
  outline: "none",
  boxSizing: "border-box",
  height: "21px",
};

export const arcaExpenseDesc: CSSProperties = {
  ...ARCA_FONT,
  color: ARCA_COLORS.expenseDescGreen,
  fontStyle: "italic",
};

export function arcaGridCell(width: number, align: "left" | "right" | "center" = "left"): CSSProperties {
  return {
    width,
    textAlign: align,
    borderRight: `1px solid ${ARCA_COLORS.gridBorderColLight}`,
    overflow: "hidden",
    textOverflow: "ellipsis",
    boxSizing: "border-box",
    padding: ARCA_GRID.cellPadding,
  };
}

export const arcaEtchedBorder: CSSProperties = {
  border: `1px solid ${ARCA_COLORS.shapeBorder}`,
  boxShadow: "inset 1px 1px 0 #fff",
  padding: "4px 6px",
  marginBottom: "2px",
  position: "relative",
};

export const arcaSectionLabel: CSSProperties = {
  ...ARCA_FONT,
  fontWeight: "bold",
  backgroundColor: ARCA_COLORS.windowBg,
  padding: "0 3px",
  position: "absolute",
  top: "-7px",
  left: "6px",
  fontSize: "10px",
};

export const arcaGreyHeader: CSSProperties = {
  ...ARCA_FONT,
  backgroundColor: "#C0C0C0",
  color: "#000",
  padding: "1px 6px",
  fontWeight: "normal",
  fontStyle: "italic",
  marginBottom: "1px",
};

export const arcaDescriptionRed: CSSProperties = {
  ...ARCA_FONT,
  color: ARCA_COLORS.comeConvenuto,
  fontStyle: "italic",
  marginLeft: "4px",
};
