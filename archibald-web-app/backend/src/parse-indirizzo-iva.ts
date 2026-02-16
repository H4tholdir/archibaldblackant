import type { VatAddressInfo } from "./types";

function toTitleCase(text: string): string {
  if (!text) return text;
  return text
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bS\.R\.L\.?/g, "S.r.l.")
    .replace(/\bS\.P\.A\.?/g, "S.p.a.")
    .replace(/\bS\.N\.C\.?/g, "S.n.c.")
    .replace(/\bS\.A\.S\.?/g, "S.a.s.")
    .replace(/\bSrl\b/g, "S.r.l.")
    .replace(/\bSpa\b/g, "S.p.a.")
    .replace(/\bSnc\b/g, "S.n.c.")
    .replace(/\bSas\b/g, "S.a.s.");
}

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
    result.companyName = toTitleCase(nonMetaLines[0]);
  }

  if (nonMetaLines.length >= 2) {
    result.street = toTitleCase(nonMetaLines[1]);
  }

  if (nonMetaLines.length >= 3) {
    const capCityLine = nonMetaLines[2];
    const capMatch = capCityLine.match(/^(\d{5})\s+(.+)$/);
    if (capMatch) {
      result.postalCode = capMatch[1];
      result.city = toTitleCase(capMatch[2].trim());
    } else {
      result.city = toTitleCase(capCityLine);
    }
  }

  return result;
}
