import type { CustomerValidationResult } from "../utils/orderParser";

interface CustomerSuggestionsProps {
  validationResult: CustomerValidationResult;
  onSuggestionClick?: (customerId: string, customerName: string) => void;
}

export function CustomerSuggestions({
  validationResult,
  onSuggestionClick,
}: CustomerSuggestionsProps) {
  // Don't render if exact match or no validation result
  if (!validationResult || validationResult.matchType === "exact") {
    return null;
  }

  return (
    <div className="customer-suggestions">
      {/* Phonetic/Fuzzy Match - Show suggestions */}
      {(validationResult.matchType === "phonetic" ||
        validationResult.matchType === "fuzzy") &&
        validationResult.suggestions.length > 0 && (
          <div className="customer-validation-result">
            <span className="result-icon">⚠️</span>
            <div className="result-content">
              <div className="result-message">
                {validationResult.error || "Cliente non trovato esattamente."}
              </div>
              <div className="customer-suggestions-list">
                {validationResult.suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    className="customer-suggestion-item"
                    onClick={() =>
                      onSuggestionClick?.(suggestion.id, suggestion.name)
                    }
                  >
                    <div className="suggestion-info">
                      <strong>{suggestion.name}</strong>
                      {suggestion.vatNumber && (
                        <span className="suggestion-vat">
                          P.IVA: {suggestion.vatNumber}
                        </span>
                      )}
                      <span className="suggestion-confidence">
                        {suggestion.confidence}% match
                      </span>
                    </div>
                    <span className="suggestion-action">Seleziona</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

      {/* Not Found */}
      {validationResult.matchType === "not_found" && (
        <div className="customer-validation-result result-not-found">
          <span className="result-icon">✗</span>
          <div className="result-content">
            <div className="result-message">Cliente non trovato</div>
            <div className="result-hint">
              Riprova o seleziona dalla lista
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
