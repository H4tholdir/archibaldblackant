import type { VatAddressInfo } from "./types";

export function parseIndirizzoIva(raw: string): VatAddressInfo {
  const empty: VatAddressInfo = {
    companyName: "",
    street: "",
    postalCode: "",
    city: "",
    vatStatus: "",
    internalId: "",
  };

  if (!raw || raw.trim().length === 0) return empty;

  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return empty;

  const result: VatAddressInfo = { ...empty };

  const nonMetaLines: string[] = [];

  for (const line of lines) {
    const statoMatch = line.match(/^Stato:\s*(.+)$/i);
    if (statoMatch) {
      result.vatStatus = statoMatch[1].trim();
      continue;
    }

    const idMatch = line.match(/^Id:\s*(.+)$/i);
    if (idMatch) {
      result.internalId = idMatch[1].trim();
      continue;
    }

    nonMetaLines.push(line);
  }

  if (nonMetaLines.length >= 1) {
    result.companyName = nonMetaLines[0];
  }

  if (nonMetaLines.length >= 2) {
    result.street = nonMetaLines[1];
  }

  if (nonMetaLines.length >= 3) {
    const capCityLine = nonMetaLines[2];
    const capMatch = capCityLine.match(/^(\d{5})\s+(.+)$/);
    if (capMatch) {
      result.postalCode = capMatch[1];
      result.city = capMatch[2].trim();
    } else {
      result.city = capCityLine;
    }
  }

  return result;
}
