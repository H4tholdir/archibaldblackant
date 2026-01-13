import type { OrderItem } from "../types/order";

interface ParsedOrder {
  customerId?: string;
  customerName?: string;
  items: OrderItem[];
}

// Enhanced parsing results with confidence scoring
export interface ParsedOrderWithConfidence {
  customerId?: string;
  customerIdConfidence?: number;
  customerName?: string;
  customerNameConfidence?: number;
  items: ParsedOrderItem[];
}

export interface ParsedOrderItem extends OrderItem {
  articleCodeConfidence?: number;
  quantityConfidence?: number;
  validationErrors?: string[];
  suggestions?: string[];
  needsDisambiguation?: boolean;
  packageSolutions?: PackageSolution[];
}

export interface PackageSolution {
  totalPackages: number;
  breakdown: Array<{
    variantId: string;
    packageContent: number;
    count: number;
  }>;
  isOptimal: boolean; // Fewest packages
}

export interface ArticleValidationResult {
  matchType: "exact" | "normalized" | "base_pattern" | "fuzzy" | "not_found";
  confidence: number;
  product?: {
    id: string;
    name: string;
    description?: string;
    packageContent?: string;
    minQty?: number;
    multipleQty?: number;
    maxQty?: number;
  };
  basePattern?: string; // "845.104" for partial matches
  suggestions: Array<{
    code: string;
    variant?: string; // Last part (016, 023, etc.)
    packageInfo?: string; // "K2 - 5pz"
    confidence: number;
    reason: "exact" | "normalized" | "base_match" | "fuzzy_match" | "phonetic";
  }>;
  error?: string;
}

export interface CustomerValidationResult {
  matchType: "exact" | "phonetic" | "fuzzy" | "not_found";
  confidence: number;
  customer?: {
    id: string;
    name: string;
    vatNumber?: string;
    email?: string;
  };
  suggestions: Array<{
    id: string;
    name: string;
    confidence: number;
    reason: "exact" | "phonetic" | "fuzzy";
    vatNumber?: string;
  }>;
  error?: string;
}

/**
 * Parse spoken order into structured data
 * Examples:
 * - "cliente Mario Rossi, articolo SF1000 quantità 5"
 * - "nome cliente Fresis, articolo TD1272 punto 314 quantità 2"
 */
export function parseVoiceOrder(transcript: string): ParsedOrder {
  const result: ParsedOrder = {
    items: [],
  };

  // Normalize transcript
  const normalized = transcript.toLowerCase().replace(/\s+/g, " ").trim();

  // Extract customer ID
  const customerIdMatch = normalized.match(
    /(?:cliente id|codice cliente|id cliente)\s+([a-z0-9]+)/i,
  );
  if (customerIdMatch) {
    result.customerId = customerIdMatch[1].toUpperCase();
  }

  // Extract customer name
  const customerNameMatch = normalized.match(
    /(?:cliente|nome cliente|nome)\s+([a-z\sàèéìòù]+?)(?:\s*,|\s+(?:articolo|articoli|aggiungi|aggiungere|poi|ancora|inserisci|metti)|$)/i,
  );
  if (customerNameMatch) {
    result.customerName = capitalizeWords(customerNameMatch[1].trim());
  }

  // Extract items (supports multiple trigger keywords)
  // Keywords: articolo, articoli, aggiungi, aggiungere, poi, ancora, inserisci, metti
  const itemsText = normalized.match(/(?:articolo|articoli|aggiungi|aggiungere|poi|ancora|inserisci|metti)\s+.+/i)?.[0] || "";
  result.items = parseItems(itemsText);

  return result;
}

/**
 * Parse multiple items from voice input
 * Supports multiple trigger keywords: articolo, articoli, aggiungi, poi, ancora, inserisci, metti
 * Example: "articolo SF1000 quantità 5, poi TD1272 punto 314 quantità 2"
 */
function parseItems(itemsText: string): OrderItem[] {
  const items: OrderItem[] = [];

  // Split by any item trigger keyword
  const itemParts = itemsText.split(/(?:,\s*)?(?:articolo|articoli|aggiungi|aggiungere|poi|ancora|inserisci|metti)\s+/i).filter(Boolean);

  for (const part of itemParts) {
    const item = parseSingleItem(part);
    if (item) {
      items.push(item);
    }
  }

  return items;
}

/**
 * Parse single item from voice input
 * Example: "SF1000 quantità 5 prezzo 150"
 */
function parseSingleItem(text: string): OrderItem | null {
  // Extract quantity (supports both "quantità X" and "X pezzi/pz")
  // Match either: "quantità 10" or "10 pezzi" or "10pz"
  const quantityMatch = text.match(
    /(?:quantità\s+(\d+))|(?:(\d+)\s+(?:pezz[io]|pz)\b)/i,
  );
  const quantity = quantityMatch
    ? parseInt(quantityMatch[1] || quantityMatch[2], 10)
    : 1;

  // Extract article code (everything before quantity/price keywords)
  // Remove only explicit quantity patterns (not bare numbers that might be part of article code)
  let textForCode = text;
  if (quantityMatch) {
    // Remove the matched quantity pattern
    textForCode = text.replace(quantityMatch[0], "").trim();
  } else {
    // No quantity pattern found, just remove "quantità" keyword if present
    textForCode = text.replace(/\bquantità\b/gi, "").trim();
  }

  const codeMatch = textForCode.match(/^([a-z0-9\s.\-]+?)(?:\s+prezzo|$)/i);
  if (!codeMatch) return null;

  const articleCode = normalizeArticleCode(codeMatch[1].trim());

  // Extract price
  const priceMatch = text.match(/prezzo\s+([\d,]+)/i);
  const price = priceMatch ? parseFloat(priceMatch[1].replace(",", ".")) : 0;

  // Extract description (everything after article code but before quantity/price)
  const descMatch = text.match(
    new RegExp(
      `${escapeRegex(articleCode)}\\s+(.+?)(?:\\s+(?:quantità|prezzo)|$)`,
      "i",
    ),
  );
  const description = descMatch ? capitalizeWords(descMatch[1].trim()) : "";

  return {
    articleCode,
    description,
    quantity,
    price,
  };
}

/**
 * Normalize article code from speech
 * Example: "TD1272 punto 314" -> "TD1272.314"
 * Example: "H71 104 032" -> "H71.104.032" (COMMON CASE - no punto)
 * Example: "SF mille" -> "SF1000"
 * Example: "H250E 104 040" -> "H250E.104.040"
 */
function normalizeArticleCode(code: string): string {
  let normalized = code
    // Handle explicit keywords first
    .replace(/\s+punto\s+/gi, ".")
    .replace(/\s+trattino\s+/gi, "-")
    .replace(/\s+slash\s+/gi, "/")
    .replace(/mille/gi, "1000")
    .replace(/cento/gi, "100");

  // CRITICAL: Handle spaces as implicit dots for numeric sequences
  // Pattern: "H71 104 032" → "H71.104.032"
  // Pattern: "SF 1000" → "SF.1000"
  // Pattern: "H250E 104 040" → "H250E.104.040"
  // Note: "SF mille" → "SF1000" (no space after keyword replacement, so no dot added)

  // First pass: Handle 3-number sequences (most specific)
  const threeNumPattern = /([A-Z]+\d*)\s+(\d+)\s+(\d+)/gi;
  normalized = normalized.replace(threeNumPattern, "$1.$2.$3");

  // Second pass: Handle 2-number sequences (less specific)
  // Only if there's a space - this preserves "SF1000" from keyword replacement
  const twoNumPattern = /([A-Z]+\d*)\s+(\d+)/gi;
  normalized = normalized.replace(twoNumPattern, "$1.$2");

  // Handle remaining single spaces between digits (e.g., "H71.104 032")
  normalized = normalized.replace(/(\d+)\s+(\d+)/g, "$1.$2");

  // Replace hyphens between number segments with dots (e.g., "TD.1272-314" → "TD.1272.314")
  normalized = normalized.replace(/(\d+)-(\d+)/g, "$1.$2");

  return normalized.toUpperCase().trim();
}

/**
 * Capitalize first letter of each word
 */
function capitalizeWords(text: string): string {
  return text
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Detect mixed-package solutions for a given quantity
 * Returns multiple packaging options when applicable
 *
 * Example: qty=7 with variants [K2:5pz, K3:1pz]
 * - Solution A: 7×K3 = 7 packages
 * - Solution B: 1×K2 + 2×K3 = 3 packages (optimal)
 */
export function detectMixedPackageSolutions(
  quantity: number,
  variants: Array<{
    id: string;
    name: string;
    packageContent?: string;
    multipleQty?: number;
  }>,
): { needsDisambiguation: boolean; solutions: PackageSolution[] } {
  const solutions: PackageSolution[] = [];

  // Solution 1: Single variant (largest package that divides evenly - fewest packages)
  // Variants are sorted DESC by multipleQty, so iterate normally to prefer larger packages
  for (const variant of variants) {
    const multiple = variant.multipleQty || 1;
    if (quantity % multiple === 0) {
      solutions.push({
        totalPackages: quantity / multiple,
        breakdown: [
          {
            variantId: variant.id,
            packageContent: multiple,
            count: quantity / multiple,
          },
        ],
        isOptimal: false, // Will be marked later
      });
      break; // Only one single-variant solution (prefer largest)
    }
  }

  // Solution 2: Mixed packages (if 2+ variants available)
  if (variants.length >= 2) {
    const large = variants[0]; // Highest multipleQty
    const small = variants[variants.length - 1]; // Smallest multipleQty

    const largeMultiple = large.multipleQty || 1;
    const smallMultiple = small.multipleQty || 1;

    // Try: maximize large packages, fill remainder with small
    const largeCount = Math.floor(quantity / largeMultiple);
    const remainder = quantity % largeMultiple;

    // Only add mixed solution if there's a remainder AND it can be filled with small packages
    if (remainder > 0 && remainder % smallMultiple === 0 && largeCount > 0) {
      const smallCount = remainder / smallMultiple;
      solutions.push({
        totalPackages: largeCount + smallCount,
        breakdown: [
          {
            variantId: large.id,
            packageContent: largeMultiple,
            count: largeCount,
          },
          {
            variantId: small.id,
            packageContent: smallMultiple,
            count: smallCount,
          },
        ],
        isOptimal: false,
      });
    }
  }

  // Mark optimal solution (fewest packages)
  if (solutions.length > 0) {
    const minPackages = Math.min(...solutions.map((s) => s.totalPackages));
    solutions.forEach((s) => {
      s.isOptimal = s.totalPackages === minPackages;
    });
  }

  return {
    needsDisambiguation: solutions.length > 1,
    solutions: solutions.sort((a, b) => a.totalPackages - b.totalPackages), // Optimal first
  };
}

/**
 * Validate article code with fuzzy matching
 * Uses backend API for Levenshtein-based search
 *
 * Example: "H129FSQ104023" → suggests "H129FSQ.104.023" (98%), "H129FSQ.104.016" (85%)
 */
export async function validateArticleCode(
  code: string,
): Promise<ArticleValidationResult> {
  try {
    // Call backend fuzzy search API
    const response = await fetch(
      `/api/products/search?q=${encodeURIComponent(code)}&limit=5`,
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success || !data.data || data.data.length === 0) {
      return {
        matchType: "not_found",
        confidence: 0.0,
        suggestions: [],
        error: `Articolo "${code}" non trovato`,
      };
    }

    const results = data.data;
    const bestMatch = results[0];

    // Exact or normalized match (confidence >= 95%)
    if (bestMatch.confidence >= 95) {
      return {
        matchType: bestMatch.matchReason === "exact" ? "exact" : "normalized",
        confidence: bestMatch.confidence / 100,
        product: {
          id: bestMatch.id,
          name: bestMatch.name,
          description: bestMatch.description,
          packageContent: bestMatch.packageContent,
          multipleQty: bestMatch.multipleQty,
        },
        // Include other results as alternative suggestions (if any)
        suggestions: results.slice(1).map((r: any) => ({
          code: r.name,
          confidence: r.confidence,
          reason: r.matchReason,
          packageInfo: r.packageContent
            ? `${r.id.slice(-2)} - ${r.packageContent}pz`
            : r.id.slice(-2),
        })),
      };
    }

    // Check for base pattern match (for variant errors like H129FSQ.104.023 → H129FSQ.104.016)
    const parts = code.split(".");
    if (parts.length >= 2) {
      const basePattern = parts.slice(0, 2).join(".");
      const variantsForBase = results.filter((r: any) =>
        r.name.startsWith(basePattern),
      );

      if (variantsForBase.length > 0) {
        return {
          matchType: "base_pattern",
          confidence: 0.7,
          basePattern,
          suggestions: variantsForBase.map((r: any) => ({
            code: r.name,
            variant: r.name.split(".")[2] || "",
            packageInfo: r.packageContent
              ? `${r.id.slice(-2)} - ${r.packageContent}pz`
              : r.id.slice(-2),
            confidence: r.confidence,
            reason: "base_match",
          })),
          error: `Variante .${parts[2]} non trovata per ${basePattern}`,
        };
      }
    }

    // Normalized or fuzzy match (confidence >= 70%)
    if (bestMatch.confidence >= 70) {
      return {
        matchType:
          bestMatch.matchReason === "normalized" ? "normalized" : "fuzzy",
        confidence: bestMatch.confidence / 100,
        product: {
          id: bestMatch.id,
          name: bestMatch.name,
          description: bestMatch.description,
          packageContent: bestMatch.packageContent,
          multipleQty: bestMatch.multipleQty,
        },
        suggestions: results.slice(1).map((r: any) => ({
          code: r.name,
          confidence: r.confidence,
          reason: r.matchReason,
          packageInfo: r.packageContent
            ? `${r.id.slice(-2)} - ${r.packageContent}pz`
            : r.id.slice(-2),
        })),
      };
    }

    // Multiple fuzzy matches (confidence < 70%)
    return {
      matchType: "fuzzy",
      confidence: bestMatch.confidence / 100,
      suggestions: results.map((r: any) => ({
        code: r.name,
        confidence: r.confidence,
        reason: r.matchReason,
        packageInfo: r.packageContent
          ? `${r.id.slice(-2)} - ${r.packageContent}pz`
          : r.id.slice(-2),
      })),
      error: `Articolo "${code}" non trovato. Forse intendevi:`,
    };
  } catch (error) {
    console.error("Error validating article code:", error);
    return {
      matchType: "not_found",
      confidence: 0.0,
      suggestions: [],
      error: `Errore durante la ricerca dell'articolo "${code}"`,
    };
  }
}

/**
 * Validate customer name with fuzzy matching
 * Uses backend API for phonetic and Levenshtein-based search
 *
 * Example: "Fresis" → suggests "Francis" (95%), "Frances" (90%), "Francesca" (85%)
 */
export async function validateCustomerName(
  name: string,
): Promise<CustomerValidationResult> {
  try {
    // Call backend fuzzy search API
    const response = await fetch(
      `/api/customers/search?q=${encodeURIComponent(name)}&limit=5`,
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success || !data.data || data.data.length === 0) {
      return {
        matchType: "not_found",
        confidence: 0.0,
        suggestions: [],
        error: `Cliente "${name}" non trovato`,
      };
    }

    const results = data.data;
    const bestMatch = results[0];

    // Exact or phonetic match (confidence >= 95%)
    if (bestMatch.confidence >= 95) {
      return {
        matchType: bestMatch.matchReason === "exact" ? "exact" : "phonetic",
        confidence: bestMatch.confidence / 100, // Convert from percentage
        customer: {
          id: bestMatch.id,
          name: bestMatch.name,
          vatNumber: bestMatch.vatNumber,
          email: bestMatch.email,
        },
        suggestions: [],
      };
    }

    // Phonetic or fuzzy match (confidence >= 70%)
    if (bestMatch.confidence >= 70) {
      return {
        matchType: bestMatch.matchReason === "phonetic" ? "phonetic" : "fuzzy",
        confidence: bestMatch.confidence / 100,
        customer: {
          id: bestMatch.id,
          name: bestMatch.name,
          vatNumber: bestMatch.vatNumber,
          email: bestMatch.email,
        },
        suggestions: results.slice(1).map((r: any) => ({
          id: r.id,
          name: r.name,
          confidence: r.confidence,
          reason: r.matchReason,
          vatNumber: r.vatNumber,
        })),
      };
    }

    // Multiple fuzzy matches (confidence < 70%)
    return {
      matchType: "fuzzy",
      confidence: bestMatch.confidence / 100,
      suggestions: results.map((r: any) => ({
        id: r.id,
        name: r.name,
        confidence: r.confidence,
        reason: r.matchReason,
        vatNumber: r.vatNumber,
      })),
      error: `Cliente "${name}" non trovato. Forse intendevi:`,
    };
  } catch (error) {
    console.error("Error validating customer name:", error);
    return {
      matchType: "not_found",
      confidence: 0.0,
      suggestions: [],
      error: `Errore durante la ricerca del cliente "${name}"`,
    };
  }
}

/**
 * Get suggestions for partial voice input
 */
export function getVoiceSuggestions(transcript: string): string[] {
  const suggestions: string[] = [];

  if (!transcript) {
    return [
      "Di' 'cliente' seguito dal nome",
      "Di' 'articolo' seguito dal codice e quantità",
    ];
  }

  const normalized = transcript.toLowerCase();

  if (!normalized.includes("cliente")) {
    suggestions.push("Aggiungi 'cliente [nome]'");
  }

  if (!normalized.includes("articolo")) {
    suggestions.push("Aggiungi 'articolo [codice] quantità [numero]'");
  }

  return suggestions;
}

/**
 * Transcript segment with optional entity metadata
 */
export interface TranscriptSegment {
  text: string;
  entity?: {
    type: "customer" | "article" | "quantity" | "price";
    confidence: number;
  };
}

/**
 * Highlight recognized entities in transcript
 * Returns array of segments with entity metadata for rendering
 */
export function highlightEntities(
  transcript: string,
  parsedOrder: ParsedOrderWithConfidence,
): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const entities: Array<{
    start: number;
    end: number;
    type: "customer" | "article" | "quantity" | "price";
    confidence: number;
  }> = [];

  // Find customer name position
  if (
    parsedOrder.customerName &&
    parsedOrder.customerNameConfidence !== undefined
  ) {
    const lowerTranscript = transcript.toLowerCase();
    const lowerName = parsedOrder.customerName.toLowerCase();
    const index = lowerTranscript.indexOf(lowerName);

    if (index !== -1) {
      entities.push({
        start: index,
        end: index + parsedOrder.customerName.length,
        type: "customer",
        confidence: parsedOrder.customerNameConfidence,
      });
    }
  }

  // Find article codes and quantities
  for (const item of parsedOrder.items) {
    const lowerTranscript = transcript.toLowerCase();

    // Find article code
    if (item.articleCode && item.articleCodeConfidence !== undefined) {
      const lowerCode = item.articleCode.toLowerCase();
      const index = lowerTranscript.indexOf(lowerCode);

      if (index !== -1) {
        entities.push({
          start: index,
          end: index + item.articleCode.length,
          type: "article",
          confidence: item.articleCodeConfidence,
        });
      }
    }

    // Find quantity - search after "quantità" keyword to avoid false matches
    if (item.quantity && item.quantityConfidence !== undefined) {
      const quantityStr = item.quantity.toString();
      const quantitaIndex = lowerTranscript.indexOf("quantità");

      // Search for quantity after "quantità" keyword
      const searchStart = quantitaIndex !== -1 ? quantitaIndex : 0;
      const index = transcript.indexOf(quantityStr, searchStart);

      if (index !== -1) {
        entities.push({
          start: index,
          end: index + quantityStr.length,
          type: "quantity",
          confidence: item.quantityConfidence,
        });
      }
    }
  }

  // No entities found - return plain text
  if (entities.length === 0) {
    return [{ text: transcript }];
  }

  // Sort entities by start position
  entities.sort((a, b) => a.start - b.start);

  // Build segments
  let currentPos = 0;

  for (const entity of entities) {
    // Add plain text before entity
    if (entity.start > currentPos) {
      segments.push({ text: transcript.slice(currentPos, entity.start) });
    }

    // Add entity segment
    segments.push({
      text: transcript.slice(entity.start, entity.end),
      entity: {
        type: entity.type,
        confidence: entity.confidence,
      },
    });

    currentPos = entity.end;
  }

  // Add remaining plain text
  if (currentPos < transcript.length) {
    segments.push({ text: transcript.slice(currentPos) });
  }

  return segments;
}
