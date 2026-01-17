/**
 * Italian Fiscal Data Validators
 * Validates P.IVA, Codice Fiscale, SDI, and PEC
 */

/**
 * Validates Italian VAT number (Partita IVA)
 * Format: 11 numeric digits with Luhn checksum
 */
export function validatePartitaIVA(piva: string): { valid: boolean; error?: string } {
  // Remove spaces and non-numeric characters
  const cleaned = piva.replace(/\s/g, "");

  // Check length
  if (cleaned.length !== 11) {
    return { valid: false, error: "La Partita IVA deve essere di 11 cifre" };
  }

  // Check if all numeric
  if (!/^\d{11}$/.test(cleaned)) {
    return { valid: false, error: "La Partita IVA deve contenere solo numeri" };
  }

  // Luhn algorithm check (last digit is checksum)
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let digit = parseInt(cleaned[i], 10);
    if (i % 2 === 0) {
      // Even positions (0-indexed)
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  const lastDigit = parseInt(cleaned[10], 10);

  if (checkDigit !== lastDigit) {
    return { valid: false, error: "Partita IVA non valida (checksum errato)" };
  }

  return { valid: true };
}

/**
 * Validates Italian Fiscal Code (Codice Fiscale)
 * Format: 16 alphanumeric characters (RSSMRA80A01H501U)
 */
export function validateCodiceFiscale(cf: string): { valid: boolean; error?: string } {
  // Remove spaces and convert to uppercase
  const cleaned = cf.replace(/\s/g, "").toUpperCase();

  // Check length
  if (cleaned.length !== 16) {
    return { valid: false, error: "Il Codice Fiscale deve essere di 16 caratteri" };
  }

  // Check format: 6 letters + 2 digits + 1 letter + 2 digits + 1 letter + 3 digits + 1 letter
  const pattern = /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/;
  if (!pattern.test(cleaned)) {
    return {
      valid: false,
      error: "Formato Codice Fiscale non valido",
    };
  }

  // Check checksum (last character)
  const evenMap: { [key: string]: number } = {
    "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
    A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11,
    M: 12, N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19, U: 20, V: 21,
    W: 22, X: 23, Y: 24, Z: 25,
  };

  const oddMap: { [key: string]: number } = {
    "0": 1, "1": 0, "2": 5, "3": 7, "4": 9, "5": 13, "6": 15, "7": 17, "8": 19, "9": 21,
    A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4,
    M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10,
    W: 22, X: 25, Y: 24, Z: 23,
  };

  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const char = cleaned[i];
    if (i % 2 === 0) {
      // Odd position (1-indexed, so even in 0-indexed)
      sum += oddMap[char] ?? 0;
    } else {
      // Even position (1-indexed, so odd in 0-indexed)
      sum += evenMap[char] ?? 0;
    }
  }

  const expectedCheck = String.fromCharCode(65 + (sum % 26)); // A=65
  const actualCheck = cleaned[15];

  if (expectedCheck !== actualCheck) {
    return { valid: false, error: "Codice Fiscale non valido (checksum errato)" };
  }

  return { valid: true };
}

/**
 * Validates SDI (Sistema di Interscambio) code
 * Format: 7 alphanumeric characters
 */
export function validateSDI(sdi: string): { valid: boolean; error?: string } {
  // Remove spaces and convert to uppercase
  const cleaned = sdi.replace(/\s/g, "").toUpperCase();

  // Check length
  if (cleaned.length !== 7) {
    return { valid: false, error: "Il codice SDI deve essere di 7 caratteri" };
  }

  // Check alphanumeric
  if (!/^[A-Z0-9]{7}$/.test(cleaned)) {
    return { valid: false, error: "Il codice SDI deve contenere solo lettere e numeri" };
  }

  return { valid: true };
}

/**
 * Validates PEC (Posta Elettronica Certificata)
 * Format: standard email format
 */
export function validatePEC(pec: string): { valid: boolean; error?: string } {
  // Basic email regex
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(pec)) {
    return { valid: false, error: "Formato PEC non valido" };
  }

  return { valid: true };
}

/**
 * Validates Italian postal code (CAP)
 * Format: 5 numeric digits
 */
export function validateCAP(cap: string): { valid: boolean; error?: string } {
  // Remove spaces
  const cleaned = cap.replace(/\s/g, "");

  // Check length
  if (cleaned.length !== 5) {
    return { valid: false, error: "Il CAP deve essere di 5 cifre" };
  }

  // Check if all numeric
  if (!/^\d{5}$/.test(cleaned)) {
    return { valid: false, error: "Il CAP deve contenere solo numeri" };
  }

  return { valid: true };
}
