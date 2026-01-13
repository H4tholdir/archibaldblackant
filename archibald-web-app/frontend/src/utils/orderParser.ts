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
  matchType: "exact" | "base_pattern" | "fuzzy" | "not_found";
  confidence: number;
  product?: {
    id: string;
    name: string;
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
    reason: "exact" | "base_match" | "fuzzy_match" | "phonetic";
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
    result.customerId = customerIdMatch[1];
  }

  // Extract customer name
  const customerNameMatch = normalized.match(
    /(?:cliente|nome cliente|nome)\s+([a-z\sàèéìòù]+?)(?:\s*,|\s+articolo|$)/i,
  );
  if (customerNameMatch) {
    result.customerName = capitalizeWords(customerNameMatch[1].trim());
  }

  // Extract items
  const itemsText = normalized.match(/articolo\s+.+/i)?.[0] || "";
  result.items = parseItems(itemsText);

  return result;
}

/**
 * Parse multiple items from voice input
 * Example: "articolo SF1000 quantità 5, articolo TD1272 punto 314 quantità 2"
 */
function parseItems(itemsText: string): OrderItem[] {
  const items: OrderItem[] = [];

  // Split by "articolo" keyword
  const itemParts = itemsText.split(/(?:,\s*)?articolo\s+/i).filter(Boolean);

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
  // Extract article code (first word/phrase before quantity/price)
  const codeMatch = text.match(/^([a-z0-9\s.]+?)(?:\s+(?:quantità|prezzo)|$)/i);
  if (!codeMatch) return null;

  const articleCode = normalizeArticleCode(codeMatch[1].trim());

  // Extract quantity
  const quantityMatch = text.match(/quantità\s+(\d+)/i);
  const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 1;

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
 * Example: "SF mille" -> "SF1000"
 * Example: "H250E 104 040" -> "H250E 104 040"
 */
function normalizeArticleCode(code: string): string {
  return code
    .replace(/\s+punto\s+/gi, ".")
    .replace(/\s+trattino\s+/gi, "-")
    .replace(/\s+slash\s+/gi, "/")
    .replace(/mille/gi, "1000")
    .replace(/cento/gi, "100")
    .toUpperCase()
    .trim();
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
