interface ValidationStatusProps {
  status: "idle" | "validating" | "success" | "error";
  message?: string;
  errors?: string[];
  suggestions?: string[];
}

export function ValidationStatus({
  status,
  message,
  errors,
  suggestions,
}: ValidationStatusProps) {
  if (status === "idle") {
    return null;
  }

  return (
    <div
      className={`validation-status validation-${status}`}
      role="status"
      aria-live="polite"
    >
      {status === "validating" && (
        <div className="validation-spinner">
          <span className="spinner" />
          <span className="validation-message">{message}</span>
        </div>
      )}

      {status === "success" && (
        <div className="validation-success">
          <span className="validation-icon">✓</span>
          <span className="validation-message">{message}</span>
        </div>
      )}

      {status === "error" && (
        <div className="validation-error">
          <span className="validation-icon">✗</span>
          <div className="validation-content">
            <div className="validation-message">{message}</div>
            {errors && errors.length > 0 && (
              <ul className="validation-errors">
                {errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            )}
            {suggestions && suggestions.length > 0 && (
              <div className="validation-suggestions">
                <strong>Suggestions:</strong>
                <ul>
                  {suggestions.map((suggestion, index) => (
                    <li key={index}>{suggestion}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
