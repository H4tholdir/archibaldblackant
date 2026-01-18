import { useState } from "react";

interface TargetWizardProps {
  isOpen: boolean;
  onComplete: (target: number, currency: string) => void;
}

export function TargetWizard({ isOpen, onComplete }: TargetWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [targetAmount, setTargetAmount] = useState<string>("");
  const [currency, setCurrency] = useState<string>("EUR");
  const [error, setError] = useState<string>("");

  if (!isOpen) return null;

  const formatCurrency = (amount: number, currencyCode: string) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: currencyCode,
    }).format(amount);
  };

  const handleContinueFromStep2 = () => {
    const amount = parseFloat(targetAmount);
    if (!targetAmount || isNaN(amount) || amount <= 0) {
      setError("L'obiettivo deve essere maggiore di zero");
      return;
    }
    setError("");
    setStep(3);
  };

  const handleConfirm = () => {
    const amount = parseFloat(targetAmount);
    if (amount > 0 && ["EUR", "USD", "GBP"].includes(currency)) {
      onComplete(amount, currency);
    }
  };

  const getCurrencyLabel = (currencyCode: string) => {
    switch (currencyCode) {
      case "EUR":
        return "EUR - Euro";
      case "USD":
        return "USD - Dollaro";
      case "GBP":
        return "GBP - Sterlina";
      default:
        return currencyCode;
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "16px",
          padding: "40px",
          maxWidth: "500px",
          width: "90%",
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
        }}
      >
        {/* Step Indicator */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "12px",
            marginBottom: "32px",
          }}
        >
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor:
                  s < step
                    ? "#27ae60"
                    : s === step
                      ? "#3498db"
                      : "#bdc3c7",
                transition: "background-color 0.3s",
              }}
            />
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div>
            <div
              style={{
                fontSize: "64px",
                textAlign: "center",
                marginBottom: "24px",
              }}
            >
              🎯
            </div>
            <h2
              style={{
                fontSize: "24px",
                fontWeight: "bold",
                color: "#2c3e50",
                marginBottom: "16px",
                textAlign: "center",
              }}
            >
              Benvenuto in Archibald Black Ant! 👋
            </h2>
            <p
              style={{
                fontSize: "16px",
                color: "#7f8c8d",
                lineHeight: "1.6",
                textAlign: "center",
                marginBottom: "32px",
              }}
            >
              Imposta il tuo obiettivo mensile per monitorare i tuoi progressi e
              raggiungere i tuoi traguardi.
            </p>
            <button
              onClick={() => setStep(2)}
              style={{
                width: "100%",
                backgroundColor: "#3498db",
                color: "#fff",
                padding: "12px 24px",
                borderRadius: "8px",
                border: "none",
                fontSize: "16px",
                fontWeight: "600",
                cursor: "pointer",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "#2980b9")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "#3498db")
              }
            >
              Inizia
            </button>
          </div>
        )}

        {/* Step 2: Target Input */}
        {step === 2 && (
          <div>
            <h2
              style={{
                fontSize: "24px",
                fontWeight: "bold",
                color: "#2c3e50",
                marginBottom: "16px",
                textAlign: "center",
              }}
            >
              Qual è il tuo obiettivo mensile?
            </h2>
            <p
              style={{
                fontSize: "14px",
                color: "#7f8c8d",
                lineHeight: "1.6",
                textAlign: "center",
                marginBottom: "24px",
              }}
            >
              Questo obiettivo ti aiuterà a visualizzare i tuoi progressi nella
              dashboard.
            </p>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#2c3e50",
                  marginBottom: "8px",
                }}
              >
                Valuta
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px",
                  fontSize: "16px",
                  borderRadius: "8px",
                  border: "2px solid #e0e0e0",
                  backgroundColor: "#fff",
                  cursor: "pointer",
                  transition: "border 0.2s",
                }}
                onFocus={(e) => (e.currentTarget.style.border = "2px solid #3498db")}
                onBlur={(e) => (e.currentTarget.style.border = "2px solid #e0e0e0")}
              >
                <option value="EUR">{getCurrencyLabel("EUR")}</option>
                <option value="USD">{getCurrencyLabel("USD")}</option>
                <option value="GBP">{getCurrencyLabel("GBP")}</option>
              </select>
            </div>

            <div style={{ marginBottom: "8px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#2c3e50",
                  marginBottom: "8px",
                }}
              >
                Obiettivo mensile
              </label>
              <input
                type="number"
                value={targetAmount}
                onChange={(e) => {
                  setTargetAmount(e.target.value);
                  setError("");
                }}
                placeholder="10000"
                min="1"
                step="100"
                style={{
                  width: "100%",
                  padding: "12px",
                  fontSize: "18px",
                  borderRadius: "8px",
                  border: error ? "2px solid #e74c3c" : "2px solid #e0e0e0",
                  marginBottom: "8px",
                  transition: "border 0.2s",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => !error && (e.currentTarget.style.border = "2px solid #3498db")}
                onBlur={(e) => !error && (e.currentTarget.style.border = "2px solid #e0e0e0")}
              />
              {error && (
                <p
                  style={{
                    fontSize: "14px",
                    color: "#e74c3c",
                    marginBottom: "16px",
                  }}
                >
                  {error}
                </p>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                marginTop: "24px",
              }}
            >
              <button
                onClick={() => setStep(1)}
                style={{
                  flex: 1,
                  backgroundColor: "transparent",
                  color: "#7f8c8d",
                  padding: "12px 24px",
                  border: "1px solid #e0e0e0",
                  borderRadius: "8px",
                  fontSize: "16px",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "#f8f9fa")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                Indietro
              </button>
              <button
                onClick={handleContinueFromStep2}
                style={{
                  flex: 2,
                  backgroundColor: "#3498db",
                  color: "#fff",
                  padding: "12px 24px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "16px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "#2980b9")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "#3498db")
                }
              >
                Continua
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirmation */}
        {step === 3 && (
          <div>
            <h2
              style={{
                fontSize: "24px",
                fontWeight: "bold",
                color: "#2c3e50",
                marginBottom: "16px",
                textAlign: "center",
              }}
            >
              Conferma il tuo obiettivo
            </h2>

            <div
              style={{
                backgroundColor: "#f8f9fa",
                borderRadius: "12px",
                padding: "24px",
                marginBottom: "16px",
              }}
            >
              <div style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    fontSize: "14px",
                    color: "#7f8c8d",
                    marginBottom: "4px",
                  }}
                >
                  Obiettivo mensile
                </div>
                <div
                  style={{
                    fontSize: "28px",
                    fontWeight: "bold",
                    color: "#2c3e50",
                  }}
                >
                  {formatCurrency(parseFloat(targetAmount), currency)}
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    fontSize: "14px",
                    color: "#7f8c8d",
                    marginBottom: "4px",
                  }}
                >
                  Valuta
                </div>
                <div
                  style={{
                    fontSize: "18px",
                    fontWeight: "600",
                    color: "#2c3e50",
                  }}
                >
                  {getCurrencyLabel(currency)}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "14px",
                  color: "#7f8c8d",
                }}
              >
                <span style={{ fontSize: "16px" }}>📅</span>
                <span>A partire da oggi</span>
              </div>
            </div>

            <p
              style={{
                fontSize: "14px",
                color: "#7f8c8d",
                lineHeight: "1.6",
                textAlign: "center",
                marginBottom: "24px",
              }}
            >
              Potrai sempre modificare questo obiettivo dal tuo profilo.
            </p>

            <div
              style={{
                display: "flex",
                gap: "12px",
              }}
            >
              <button
                onClick={() => setStep(2)}
                style={{
                  flex: 1,
                  backgroundColor: "transparent",
                  color: "#7f8c8d",
                  padding: "12px 24px",
                  border: "1px solid #e0e0e0",
                  borderRadius: "8px",
                  fontSize: "16px",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "#f8f9fa")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                Indietro
              </button>
              <button
                onClick={handleConfirm}
                style={{
                  flex: 2,
                  backgroundColor: "#27ae60",
                  color: "#fff",
                  padding: "12px 24px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "16px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "#229954")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "#27ae60")
                }
              >
                Conferma
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
