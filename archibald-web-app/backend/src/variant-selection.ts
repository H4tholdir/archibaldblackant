export type VariantMatchReason =
  | "variant-id"
  | "article+package+multiple"
  | "article+package"
  | "article+multiple"
  | "package+multiple+suffix"
  | "package+suffix"
  | "multiple+suffix"
  | "article"
  | "package"
  | "multiple"
  | "suffix"
  | "single-row";

export interface VariantMatchInputs {
  variantId?: string | null;
  variantSuffix: string;
  packageContent?: string | number | null;
  multipleQty?: string | number | null;
  articleName?: string | null;
}

export interface VariantRowSnapshot {
  index: number;
  cellTexts: string[];
  rowId?: string | null;
}

export interface VariantHeaderIndices {
  contentIndex: number;
  packIndex: number;
  multipleIndex: number;
}

export interface VariantCandidate extends VariantRowSnapshot {
  rowText: string;
  fullIdMatch: boolean;
  articleNameMatch: boolean;
  suffixMatch: boolean;
  packageMatch: boolean;
  multipleMatch: boolean;
  inputPackageNum: number | null;
  inputMultipleNum: number | null;
  suffixCellIndex: number;
  contentIndex: number;
  packIndex: number;
  multipleIndex: number;
  contentValue: string;
  packValue: string;
  multipleValue: string;
  suffixNeighborValue: string;
}

export interface VariantSelectionChoice {
  chosen: VariantCandidate | null;
  reason: VariantMatchReason | null;
}

function normalizeText(text: string): string {
  return text.trim().toLowerCase();
}

export function normalizeLookupText(text: string): string {
  return normalizeText(text)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLocaleNumber(text: string): number | null {
  const match = text
    .replace(/\s/g, "")
    .replace(",", ".")
    .match(/-?\d+(?:\.\d+)?/);

  if (!match) {
    return null;
  }

  const num = Number.parseFloat(match[0]);
  return Number.isFinite(num) ? num : null;
}

function matchesSuffix(text: string, suffix: string): boolean {
  const normalized = normalizeText(text);
  return normalized === suffix || normalized.endsWith(suffix);
}

function detectSuffixColumnIndex(
  rows: VariantRowSnapshot[],
  suffix: string,
): number | null {
  if (!suffix) return null;
  const counts = new Map<number, number>();

  for (const row of rows) {
    for (let idx = 0; idx < row.cellTexts.length; idx++) {
      if (matchesSuffix(row.cellTexts[idx] || "", suffix)) {
        counts.set(idx, (counts.get(idx) || 0) + 1);
      }
    }
  }

  let bestIndex: number | null = null;
  let bestCount = 0;
  for (const [idx, count] of counts.entries()) {
    if (count > bestCount) {
      bestIndex = idx;
      bestCount = count;
    }
  }

  return bestIndex;
}

function numbersEqual(a: number | null, b: number | null): boolean {
  if (a === null || b === null) {
    return false;
  }
  return Math.abs(a - b) < 0.01;
}

export function computeVariantHeaderIndices(
  headerTexts: string[],
): VariantHeaderIndices {
  let contentIndex = -1;
  let packIndex = -1;
  let multipleIndex = -1;

  for (let idx = 0; idx < headerTexts.length; idx++) {
    const text = normalizeText(headerTexts[idx] || "");

    if (
      contentIndex === -1 &&
      (text.includes("conten") || text.includes("contenuto"))
    ) {
      contentIndex = idx;
    }

    if (packIndex === -1 && (text.includes("pacco") || text.includes("pacc"))) {
      packIndex = idx;
    }

    if (multipleIndex === -1 && text.includes("mult")) {
      multipleIndex = idx;
    }
  }

  return { contentIndex, packIndex, multipleIndex };
}

function detectDataColumnIndices(
  rows: VariantRowSnapshot[],
  articleName?: string | null,
): VariantHeaderIndices & { articleNameIndex: number } {
  let articleNameIndex = -1;
  let packIndex = -1;
  let contentIndex = -1;
  let multipleIndex = -1;

  if (rows.length === 0) {
    return { contentIndex, packIndex, multipleIndex, articleNameIndex };
  }

  const kSuffixPattern = /^K\d+$/i;
  for (const row of rows) {
    for (let i = 0; i < row.cellTexts.length; i++) {
      if (kSuffixPattern.test((row.cellTexts[i] || "").trim())) {
        packIndex = i;
        break;
      }
    }
    if (packIndex >= 0) break;
  }

  if (packIndex >= 1) {
    const candidate = (rows[0].cellTexts[packIndex - 1] || "").trim();
    if (/^\d+$/.test(candidate)) {
      contentIndex = packIndex - 1;
    }
  }

  const decimalPattern = /^\d+[,.]?\d*$/;
  for (let i = (rows[0]?.cellTexts.length || 0) - 1; i >= 0; i--) {
    const text = (rows[0].cellTexts[i] || "").trim();
    if (text.includes(",") && decimalPattern.test(text.replace(",", "."))) {
      multipleIndex = i;
      break;
    }
  }

  if (articleName) {
    const normalizedArticle = articleName.trim().toLowerCase();
    for (const row of rows) {
      for (let i = 0; i < row.cellTexts.length; i++) {
        if (
          (row.cellTexts[i] || "").trim().toLowerCase() === normalizedArticle
        ) {
          articleNameIndex = i;
          break;
        }
      }
      if (articleNameIndex >= 0) break;
    }
  }

  if (articleNameIndex === -1) {
    for (const row of rows) {
      for (let i = 0; i < row.cellTexts.length; i++) {
        const text = (row.cellTexts[i] || "").trim();
        if (/^\w+\.\d+\.\d+/.test(text)) {
          articleNameIndex = i;
          break;
        }
      }
      if (articleNameIndex >= 0) break;
    }
  }

  return { contentIndex, packIndex, multipleIndex, articleNameIndex };
}

export function buildVariantCandidates(
  rows: VariantRowSnapshot[],
  headerIndices: VariantHeaderIndices,
  inputs: VariantMatchInputs,
): VariantCandidate[] {
  const suffix = normalizeText(String(inputs.variantSuffix || ""));
  const variantIdText = normalizeText(String(inputs.variantId || ""));
  const packageNum = parseLocaleNumber(String(inputs.packageContent ?? ""));
  const multipleNum = parseLocaleNumber(String(inputs.multipleQty ?? ""));
  const suffixColumnHint = detectSuffixColumnIndex(rows, suffix);
  const packageColumnHint =
    suffixColumnHint !== null && suffixColumnHint > 0
      ? suffixColumnHint - 1
      : null;

  const dataIndices = detectDataColumnIndices(rows, inputs.articleName);
  const effectiveContentIndex =
    dataIndices.contentIndex >= 0
      ? dataIndices.contentIndex
      : headerIndices.contentIndex;
  const effectiveMultipleIndex =
    dataIndices.multipleIndex >= 0
      ? dataIndices.multipleIndex
      : headerIndices.multipleIndex;
  const articleNameIndex = dataIndices.articleNameIndex;
  const normalizedArticleName = inputs.articleName
    ? inputs.articleName.trim().toLowerCase()
    : null;

  return rows
    .map((row) => {
      const cellTexts = row.cellTexts.map((text) => text || "");
      const rowText = normalizeText(cellTexts.join(" "));

      const fullIdMatch = variantIdText
        ? rowText.includes(variantIdText)
        : false;

      const articleNameMatch =
        normalizedArticleName !== null &&
        articleNameIndex >= 0 &&
        articleNameIndex < cellTexts.length
          ? cellTexts[articleNameIndex].trim().toLowerCase() ===
            normalizedArticleName
          : false;

      let suffixMatch = false;
      let packageMatch = false;
      let multipleMatch = false;
      let suffixCellIndex = -1;

      if (
        suffix &&
        suffixColumnHint !== null &&
        suffixColumnHint < cellTexts.length &&
        matchesSuffix(cellTexts[suffixColumnHint], suffix)
      ) {
        suffixCellIndex = suffixColumnHint;
        suffixMatch = true;
      } else {
        for (let idx = 0; idx < cellTexts.length; idx++) {
          if (suffix && matchesSuffix(cellTexts[idx], suffix)) {
            suffixCellIndex = idx;
            suffixMatch = true;
            break;
          }
        }
      }

      // If we matched the suffix, try to confirm package via the neighbor cell.
      if (suffixCellIndex >= 0) {
        const neighborIndex = suffixCellIndex - 1;
        if (neighborIndex >= 0) {
          const neighborNum = parseLocaleNumber(cellTexts[neighborIndex]);
          packageMatch = numbersEqual(neighborNum, packageNum);
        }
      } else if (
        headerIndices.packIndex >= 0 &&
        headerIndices.packIndex < cellTexts.length &&
        suffix
      ) {
        if (matchesSuffix(cellTexts[headerIndices.packIndex], suffix)) {
          suffixMatch = true;
          suffixCellIndex = headerIndices.packIndex;
        }
      } else if (suffix) {
        const anyIndex = cellTexts.findIndex((text) =>
          matchesSuffix(text, suffix),
        );
        if (anyIndex >= 0) {
          suffixMatch = true;
          suffixCellIndex = anyIndex;
        }
      }

      if (!packageMatch && packageNum !== null) {
        if (
          packageColumnHint !== null &&
          packageColumnHint >= 0 &&
          packageColumnHint < cellTexts.length
        ) {
          const hintedPackageNum = parseLocaleNumber(
            cellTexts[packageColumnHint],
          );
          packageMatch = numbersEqual(hintedPackageNum, packageNum);
        }

        if (
          !packageMatch &&
          effectiveContentIndex >= 0 &&
          effectiveContentIndex < cellTexts.length
        ) {
          const contentNum = parseLocaleNumber(
            cellTexts[effectiveContentIndex],
          );
          packageMatch = numbersEqual(contentNum, packageNum);
        }

        if (!packageMatch) {
          packageMatch = cellTexts.some((text) => {
            const value = parseLocaleNumber(text);
            return numbersEqual(value, packageNum);
          });
        }
      }

      if (
        multipleNum !== null &&
        effectiveMultipleIndex >= 0 &&
        effectiveMultipleIndex < cellTexts.length
      ) {
        const multipleValue = parseLocaleNumber(
          cellTexts[effectiveMultipleIndex],
        );
        multipleMatch = numbersEqual(multipleValue, multipleNum);
      }

      const effectivePackIndex =
        dataIndices.packIndex >= 0
          ? dataIndices.packIndex
          : headerIndices.packIndex;

      return {
        ...row,
        cellTexts,
        rowText,
        fullIdMatch,
        articleNameMatch,
        suffixMatch,
        packageMatch,
        multipleMatch,
        inputPackageNum: packageNum,
        inputMultipleNum: multipleNum,
        suffixCellIndex,
        contentIndex: effectiveContentIndex,
        packIndex: effectivePackIndex,
        multipleIndex: effectiveMultipleIndex,
        contentValue:
          effectiveContentIndex >= 0 &&
          effectiveContentIndex < cellTexts.length
            ? cellTexts[effectiveContentIndex]
            : "",
        packValue:
          effectivePackIndex >= 0 && effectivePackIndex < cellTexts.length
            ? cellTexts[effectivePackIndex]
            : "",
        multipleValue:
          effectiveMultipleIndex >= 0 &&
          effectiveMultipleIndex < cellTexts.length
            ? cellTexts[effectiveMultipleIndex]
            : "",
        suffixNeighborValue:
          suffixCellIndex > 0 ? cellTexts[suffixCellIndex - 1] : "",
      } satisfies VariantCandidate;
    })
    .filter((candidate) => candidate.cellTexts.length >= 4);
}

function scoreVariantCandidate(candidate: VariantCandidate): number {
  let score = 0;
  if (candidate.fullIdMatch) score += 10_000;
  if (candidate.articleNameMatch) score += 20_000;
  if (candidate.suffixMatch) score += 1_000;
  if (candidate.packageMatch) score += 600;
  if (candidate.multipleMatch) score += 400;

  // Tie-breakers: prefer rows whose numeric values align more tightly
  // with the input signals when present.
  const inputPackage = candidate.inputPackageNum;
  if (inputPackage !== null) {
    const contentNum = parseLocaleNumber(candidate.contentValue);
    const neighborNum = parseLocaleNumber(candidate.suffixNeighborValue);
    if (numbersEqual(contentNum, inputPackage)) score += 120;
    if (numbersEqual(neighborNum, inputPackage)) score += 80;
  }

  const inputMultiple = candidate.inputMultipleNum;
  if (inputMultiple !== null) {
    const multipleNum = parseLocaleNumber(candidate.multipleValue);
    if (numbersEqual(multipleNum, inputMultiple)) score += 90;
  }

  return score;
}

export function chooseBestVariantCandidate(
  candidates: VariantCandidate[],
): VariantSelectionChoice {
  if (candidates.length === 0) {
    return { chosen: null, reason: null };
  }

  const sorted = [...candidates].sort((a, b) => {
    const diff = scoreVariantCandidate(b) - scoreVariantCandidate(a);
    if (diff !== 0) return diff;

    // Deterministic tie-breakers: prefer stricter matches and stable ordering.
    const aStrict =
      Number(a.fullIdMatch) * 16 +
      Number(a.articleNameMatch) * 8 +
      Number(a.suffixMatch) * 4 +
      Number(a.packageMatch) * 2 +
      Number(a.multipleMatch);
    const bStrict =
      Number(b.fullIdMatch) * 16 +
      Number(b.articleNameMatch) * 8 +
      Number(b.suffixMatch) * 4 +
      Number(b.packageMatch) * 2 +
      Number(b.multipleMatch);
    if (bStrict !== aStrict) return bStrict - aStrict;

    return a.index - b.index;
  });

  const chosen = sorted[0] || null;
  if (!chosen) return { chosen: null, reason: null };

  let reason: VariantMatchReason = "single-row";
  if (chosen.fullIdMatch) {
    reason = "variant-id";
  } else if (
    chosen.articleNameMatch &&
    chosen.packageMatch &&
    chosen.multipleMatch
  ) {
    reason = "article+package+multiple";
  } else if (chosen.articleNameMatch && chosen.packageMatch) {
    reason = "article+package";
  } else if (chosen.articleNameMatch && chosen.multipleMatch) {
    reason = "article+multiple";
  } else if (
    chosen.suffixMatch &&
    chosen.packageMatch &&
    chosen.multipleMatch
  ) {
    reason = "package+multiple+suffix";
  } else if (chosen.packageMatch && chosen.suffixMatch) {
    reason = "package+suffix";
  } else if (chosen.multipleMatch && chosen.suffixMatch) {
    reason = "multiple+suffix";
  } else if (chosen.articleNameMatch) {
    reason = "article";
  } else if (candidates.length === 1) {
    reason = "single-row";
  } else if (chosen.packageMatch) {
    reason = "package";
  } else if (chosen.multipleMatch) {
    reason = "multiple";
  } else if (chosen.suffixMatch) {
    reason = "suffix";
  }

  return { chosen, reason };
}

export type TextMatchReason = "exact" | "contains" | "single-row";

export interface TextMatchCandidate extends VariantRowSnapshot {
  rowText: string;
  normalizedTexts: string[];
  normalizedCombined: string;
  exactMatch: boolean;
  containsMatch: boolean;
}

export interface TextMatchChoice {
  chosen: TextMatchCandidate | null;
  reason: TextMatchReason | null;
}

export function buildTextMatchCandidates(
  rows: VariantRowSnapshot[],
  query: string,
): TextMatchCandidate[] {
  const normalizedQuery = normalizeLookupText(query);
  const trimmedQuery = normalizeText(query);

  return rows.map((row) => {
    const cellTexts = row.cellTexts.map((text) => text || "");
    const rowText = normalizeText(cellTexts.join(" "));
    const normalizedTexts = cellTexts.map((text) => normalizeLookupText(text));
    const normalizedCombined = normalizeLookupText(cellTexts.join(" "));

    const exactMatch = trimmedQuery
      ? cellTexts.some((text) => normalizeText(text) === trimmedQuery)
      : false;

    const containsMatch = normalizedQuery
      ? normalizedCombined.includes(normalizedQuery) ||
        normalizedQuery.includes(normalizedCombined)
      : false;

    return {
      ...row,
      cellTexts,
      rowText,
      normalizedTexts,
      normalizedCombined,
      exactMatch,
      containsMatch,
    } satisfies TextMatchCandidate;
  });
}

export function chooseBestTextMatchCandidate(
  candidates: TextMatchCandidate[],
): TextMatchChoice {
  if (candidates.length === 0) {
    return { chosen: null, reason: null };
  }

  // Exact matches: prefer the one with shortest combined text (most specific)
  const exactMatches = candidates.filter((candidate) => candidate.exactMatch);
  if (exactMatches.length === 1) {
    return { chosen: exactMatches[0], reason: "exact" };
  }
  if (exactMatches.length > 1) {
    exactMatches.sort(
      (a, b) => a.normalizedCombined.length - b.normalizedCombined.length,
    );
    return { chosen: exactMatches[0], reason: "exact" };
  }

  // Contains matches: prefer the one whose text is closest in length to the query
  const containsMatches = candidates.filter(
    (candidate) => candidate.containsMatch,
  );
  if (containsMatches.length === 1) {
    return { chosen: containsMatches[0], reason: "contains" };
  }
  if (containsMatches.length > 1) {
    // Pick the candidate whose best-matching cell is closest in length to the query
    const queryLen = candidates[0]
      ? normalizeLookupText(candidates[0].normalizedCombined).length
      : 0;
    containsMatches.sort((a, b) => {
      // Prefer candidates where a single cell exactly matches the query
      const aHasExactCell = a.normalizedTexts.some((t) =>
        t.includes(normalizeLookupText(a.normalizedCombined)),
      );
      const bHasExactCell = b.normalizedTexts.some((t) =>
        t.includes(normalizeLookupText(b.normalizedCombined)),
      );
      if (aHasExactCell !== bHasExactCell) return aHasExactCell ? -1 : 1;
      // Then prefer shorter combined text (more specific match)
      return a.normalizedCombined.length - b.normalizedCombined.length;
    });
    return { chosen: containsMatches[0], reason: "contains" };
  }

  if (candidates.length === 1) {
    return { chosen: candidates[0], reason: "single-row" };
  }

  return { chosen: null, reason: null };
}
