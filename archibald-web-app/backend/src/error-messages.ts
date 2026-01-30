/**
 * Error messages in italiano for user-facing errors
 */
export const ERROR_MESSAGES = {
  // Order sync errors
  ORDER_NOT_FOUND: "Ordine non trovato",
  ORDER_ARCHIBALD_ID_MISSING:
    "Ordine non ancora sincronizzato con Archibald. Esegui prima la sincronizzazione dell'ordine.",
  SYNC_IN_PROGRESS: "Sincronizzazione già in corso per questo ordine",
  SYNC_TIMEOUT: "Timeout durante la sincronizzazione. Riprova più tardi.",

  // Download errors
  DOWNLOAD_FAILED: "Errore durante il download del PDF da Archibald",
  DOWNLOAD_TIMEOUT: "Timeout durante il download del PDF",
  PDF_NOT_FOUND: "File PDF non trovato dopo il download",

  // Parsing errors
  PARSING_FAILED: "Errore durante la lettura del PDF",
  PARSING_TIMEOUT: "Timeout durante la lettura del PDF",
  INVALID_PDF_FORMAT: "Formato PDF non valido o non riconosciuto",
  TOO_MANY_ARTICLES: "Troppi articoli nel PDF (massimo 1000)",

  // Data validation errors
  INVALID_DATA: "Dati non validi nel PDF",
  NEGATIVE_VALUES: "Valori negativi trovati nei dati",
  MISSING_REQUIRED_FIELDS: "Campi obbligatori mancanti",

  // System errors
  FILESYSTEM_ERROR: "Errore di sistema durante la scrittura dei file",
  DATABASE_ERROR: "Errore durante il salvataggio nel database",
  PYTHON_NOT_FOUND: "Python non disponibile. Contatta il supporto tecnico.",
  PDFPLUMBER_NOT_FOUND:
    "Libreria PDF non disponibile. Contatta il supporto tecnico.",

  // Generic
  UNKNOWN_ERROR: "Errore sconosciuto",
  INTERNAL_ERROR: "Errore interno del server",
} as const;

export type ErrorMessageKey = keyof typeof ERROR_MESSAGES;

/**
 * Get user-facing error message from error object
 */
export function getUserErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Check if error message is a known key
    if (error.message in ERROR_MESSAGES) {
      return ERROR_MESSAGES[error.message as ErrorMessageKey];
    }
    // Return error message as-is if it's already in italiano
    return error.message;
  }
  return ERROR_MESSAGES.UNKNOWN_ERROR;
}
