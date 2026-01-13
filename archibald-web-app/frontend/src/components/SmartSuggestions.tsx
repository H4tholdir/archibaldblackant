import type { ArticleValidationResult } from "../utils/orderParser";

interface SmartSuggestionsProps {
  validationResult?: ArticleValidationResult;
  suggestions: string[];
  priority: "high" | "medium" | "low";
  onSuggestionClick?: (suggestion: string) => void;
}

export function SmartSuggestions({
  validationResult,
  suggestions,
  priority,
  onSuggestionClick,
}: SmartSuggestionsProps) {
  // Don't render if no content
  if (!validationResult && suggestions.length === 0) {
    return null;
  }

  return (
    <div className={`smart-suggestions suggestions-${priority}`}>
      {/* Validation Result Section */}
      {validationResult && (
        <div
          className={`validation-result result-${validationResult.matchType}`}
        >
          {(validationResult.matchType === "exact" ||
            validationResult.matchType === "normalized") && (
            <div className="result-exact">
              <span className="result-icon">✓</span>
              <span className="result-message">Articolo trovato</span>
            </div>
          )}

          {validationResult.matchType === "base_pattern" && (
            <div className="result-base-pattern">
              <span className="result-icon">⚠️</span>
              <div className="result-content">
                <div className="result-message">
                  Variante non trovata per {validationResult.basePattern}
                </div>
                <div className="result-suggestions-list">
                  {validationResult.suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      className="suggestion-item"
                      onClick={() => onSuggestionClick?.(suggestion.code)}
                    >
                      <div className="suggestion-info">
                        <strong>{suggestion.code}</strong>
                        {suggestion.packageInfo && (
                          <span className="suggestion-package">
                            {suggestion.packageInfo}
                          </span>
                        )}
                      </div>
                      <span className="suggestion-action">Seleziona</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {validationResult.matchType === "fuzzy" && (
            <div className="result-fuzzy">
              <span className="result-icon">⚠️</span>
              <div className="result-content">
                <div className="result-message">Articolo simile a:</div>
                <div className="result-suggestions-list">
                  {validationResult.suggestions
                    .slice(0, 3)
                    .map((suggestion, index) => (
                      <button
                        key={index}
                        className="suggestion-item"
                        onClick={() => onSuggestionClick?.(suggestion.code)}
                      >
                        <div className="suggestion-info">
                          <strong>{suggestion.code}</strong>
                          {suggestion.packageInfo && (
                            <span className="suggestion-package">
                              {suggestion.packageInfo}
                            </span>
                          )}
                          <span className="suggestion-confidence">
                            {Math.round(suggestion.confidence * 100)}% match
                          </span>
                        </div>
                        <span className="suggestion-action">Seleziona</span>
                      </button>
                    ))}
                </div>
              </div>
            </div>
          )}

          {validationResult.matchType === "not_found" && (
            <div className="result-not-found">
              <span className="result-icon">✗</span>
              <div className="result-content">
                <div className="result-message">Articolo non trovato</div>
                <div className="result-hint">Riprova o scrivi manualmente</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* General Suggestions Section */}
      {suggestions.length > 0 && (
        <ul className="suggestions-list">
          {suggestions.map((suggestion, index) => (
            <li key={index} className="suggestion-text">
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
