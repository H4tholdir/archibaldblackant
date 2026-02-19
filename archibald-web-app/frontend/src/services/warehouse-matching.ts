import type { WarehouseItem } from "../types/warehouse";
import { getWarehouseItems } from "../api/warehouse";

/**
 * Parsed article code structure
 */
export interface ArticleCodeParts {
  raw: string; // Original code
  figura: string; // First part (e.g., "H129FSQ", "801")
  gambo: string | null; // Second part (e.g., "104", "314")
  misura: string | null; // Third part (e.g., "023", "014")
}

/**
 * Match level (from strongest to weakest)
 */
export type MatchLevel =
  | "exact" // 100% - Same article code
  | "figura-gambo" // 80% - Same figura + gambo, different misura
  | "figura" // 60% - Same figura, different gambo/misura
  | "description"; // 50% - Fuzzy description match

/**
 * Warehouse match result
 */
export interface WarehouseMatch {
  item: WarehouseItem;
  level: MatchLevel;
  score: number; // 0-100
  availableQty: number; // quantity - reserved
  reason: string; // Human-readable explanation
}

/**
 * Parse article code into parts (figura.gambo.misura)
 *
 * Examples:
 * - "H129FSQ.104.023" → figura: "H129FSQ", gambo: "104", misura: "023"
 * - "801.314.014" → figura: "801", gambo: "314", misura: "014"
 * - "BCR1.000.000" → figura: "BCR1", gambo: "000", misura: "000"
 * - "322200" → figura: "322200", gambo: null, misura: null (no dots)
 */
export function parseArticleCode(code: string): ArticleCodeParts {
  const normalized = code.trim().toUpperCase();
  const parts = normalized.split(".");

  if (parts.length >= 3) {
    // Standard format: FIGURA.GAMBO.MISURA
    return {
      raw: normalized,
      figura: parts[0],
      gambo: parts[1],
      misura: parts[2],
    };
  }

  if (parts.length === 2) {
    // Two parts: FIGURA.GAMBO (no misura)
    return {
      raw: normalized,
      figura: parts[0],
      gambo: parts[1],
      misura: null,
    };
  }

  // Single part (no dots): treat as figura only
  return {
    raw: normalized,
    figura: normalized,
    gambo: null,
    misura: null,
  };
}

/**
 * Normalize text for fuzzy matching (remove punctuation, lowercase, etc.)
 */
function normalizeTextForMatching(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9\s]/g, " ") // Remove punctuation
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();
}

/**
 * Calculate similarity between two strings (0-1)
 * Uses Levenshtein distance
 * Exported for testing
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeTextForMatching(str1);
  const s2 = normalizeTextForMatching(str2);

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  // Levenshtein distance
  const matrix: number[][] = [];
  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1, // deletion
        );
      }
    }
  }

  const distance = matrix[s2.length][s1.length];
  const maxLength = Math.max(s1.length, s2.length);
  return 1 - distance / maxLength;
}

/**
 * Find matches in warehouse for given article code and description
 *
 * @param articleCode - Article code to search (e.g., "H129FSQ.104.023")
 * @param description - Optional description for fuzzy matching
 * @param minScore - Minimum score threshold (0-100, default 50)
 * @returns Array of matches sorted by score (highest first)
 */
export async function findWarehouseMatches(
  articleCode: string,
  description?: string,
  minScore = 50,
): Promise<WarehouseMatch[]> {
  // Get all warehouse items (not sold and not reserved)
  // 🔧 FIX #2: Filter out reserved items as well as sold items
  const allWarehouseItems = await getWarehouseItems();
  const allItems = allWarehouseItems.filter(
    (item) => !item.soldInOrder && !item.reservedForOrder,
  );

  if (allItems.length === 0) {
    return [];
  }

  // Parse input article code
  const inputParts = parseArticleCode(articleCode);
  const matches: WarehouseMatch[] = [];

  for (const item of allItems) {
    const itemParts = parseArticleCode(item.articleCode);
    const availableQty = item.quantity; // TODO: subtract reserved quantity
    let match: WarehouseMatch | null = null;

    // Level 1: Exact match (100%)
    if (inputParts.raw === itemParts.raw) {
      match = {
        item,
        level: "exact",
        score: 100,
        availableQty,
        reason: "Match esatto - stesso codice articolo",
      };
    }
    // Level 2: Figura + Gambo (80%)
    else if (
      inputParts.figura === itemParts.figura &&
      inputParts.gambo !== null &&
      inputParts.gambo === itemParts.gambo &&
      inputParts.misura !== itemParts.misura
    ) {
      match = {
        item,
        level: "figura-gambo",
        score: 80,
        availableQty,
        reason: `Stessa figura + gambo, misura diversa (${itemParts.misura} vs ${inputParts.misura})`,
      };
    }
    // Level 3: Solo Figura (60%)
    else if (
      inputParts.figura === itemParts.figura &&
      (inputParts.gambo !== itemParts.gambo ||
        inputParts.misura !== itemParts.misura)
    ) {
      const differences: string[] = [];
      if (inputParts.gambo !== itemParts.gambo) {
        differences.push(
          `gambo diverso (${itemParts.gambo} vs ${inputParts.gambo})`,
        );
      }
      if (inputParts.misura !== itemParts.misura) {
        differences.push(
          `misura diversa (${itemParts.misura} vs ${inputParts.misura})`,
        );
      }
      match = {
        item,
        level: "figura",
        score: 60,
        availableQty,
        reason: `Stessa figura, ${differences.join(", ")}`,
      };
    }
    // Level 4: Fuzzy description (50% if similarity > 0.7)
    else if (description && item.description) {
      const similarity = calculateSimilarity(description, item.description);
      if (similarity >= 0.7) {
        match = {
          item,
          level: "description",
          score: Math.round(similarity * 50), // 0.7-1.0 → 35-50 points
          availableQty,
          reason: `Descrizione simile (${Math.round(similarity * 100)}%)`,
        };
      }
    }

    if (match && match.score >= minScore) {
      matches.push(match);
    }
  }

  // Sort by score (descending), then by availableQty (descending)
  return matches.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return b.availableQty - a.availableQty;
  });
}

/**
 * Get total available quantity for an article code (across all matches)
 */
export async function getTotalAvailableQuantity(
  articleCode: string,
): Promise<number> {
  const matches = await findWarehouseMatches(articleCode);
  return matches.reduce((sum, match) => sum + match.availableQty, 0);
}

/**
 * Check if article has exact match in warehouse
 */
export async function hasExactMatch(articleCode: string): Promise<boolean> {
  const matches = await findWarehouseMatches(articleCode);
  return matches.some((match) => match.level === "exact");
}
