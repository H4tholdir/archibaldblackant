import { useState } from "react";

interface TargetWizardProps {
  isOpen: boolean;
  onComplete: (config: {
    yearlyTarget: number;
    currency: string;
    commissionRate: number;
    bonusAmount: number;
    bonusInterval: number;
    extraBudgetInterval: number;
    extraBudgetReward: number;
    monthlyAdvance: number;
    hideCommissions: boolean;
  }) => void;
}

export function TargetWizard({ isOpen, onComplete }: TargetWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7>(1);

  // Form state
  const [yearlyTarget, setYearlyTarget] = useState<string>("300000");
  const [commissionRate, setCommissionRate] = useState<string>("18");
  const [bonusAmount, setBonusAmount] = useState<string>("5000");
  const [bonusInterval, setBonusInterval] = useState<string>("75000");
  const [extraBudgetInterval, setExtraBudgetInterval] = useState<string>("50000");
  const [extraBudgetReward, setExtraBudgetReward] = useState<string>("6000");
  const [monthlyAdvance, setMonthlyAdvance] = useState<string>("3500");
  const [hideCommissions, setHideCommissions] = useState<boolean>(false);

  const [error, setError] = useState<string>("");

  if (!isOpen) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  const formatPercent = (rate: number) => {
    return `${(rate * 100).toFixed(0)}%`;
  };

  const handleConfirm = () => {
    const config = {
      yearlyTarget: parseFloat(yearlyTarget),
      currency: "EUR",
      commissionRate: parseFloat(commissionRate) / 100,
      bonusAmount: parseFloat(bonusAmount),
      bonusInterval: parseFloat(bonusInterval),
      extraBudgetInterval: parseFloat(extraBudgetInterval),
      extraBudgetReward: parseFloat(extraBudgetReward),
      monthlyAdvance: parseFloat(monthlyAdvance),
      hideCommissions,
    };
    onComplete(config);
  };

  const validateStep2 = () => {
    const amount = parseFloat(yearlyTarget);
    if (!yearlyTarget || isNaN(amount) || amount <= 0) {
      setError("L'obiettivo deve essere maggiore di zero");
      return false;
    }
    setError("");
    return true;
  };

  const validateStep3 = () => {
    const rate = parseFloat(commissionRate);
    if (!commissionRate || isNaN(rate) || rate <= 0 || rate > 100) {
      setError("La percentuale deve essere tra 0 e 100");
      return false;
    }
    setError("");
    return true;
  };

  const validateStep4 = () => {
    const bonus = parseFloat(bonusAmount);
    const interval = parseFloat(bonusInterval);
    if (isNaN(bonus) || bonus < 0) {
      setError("L'importo bonus deve essere maggiore o uguale a zero");
      return false;
    }
    if (isNaN(interval) || interval <= 0) {
      setError("L'intervallo deve essere maggiore di zero");
      return false;
    }
    setError("");
    return true;
  };

  const validateStep5 = () => {
    const interval = parseFloat(extraBudgetInterval);
    const reward = parseFloat(extraBudgetReward);
    if (isNaN(interval) || interval <= 0) {
      setError("L'intervallo deve essere maggiore di zero");
      return false;
    }
    if (isNaN(reward) || reward < 0) {
      setError("L'importo premio deve essere maggiore o uguale a zero");
      return false;
    }
    setError("");
    return true;
  };

  const validateStep6 = () => {
    const advance = parseFloat(monthlyAdvance);
    if (isNaN(advance) || advance < 0) {
      setError("L'anticipo deve essere maggiore o uguale a zero");
      return false;
    }
    setError("");
    return true;
  };

  const handleNext = () => {
    let isValid = true;
    if (step === 2) isValid = validateStep2();
    else if (step === 3) isValid = validateStep3();
    else if (step === 4) isValid = validateStep4();
    else if (step === 5) isValid = validateStep5();
    else if (step === 6) isValid = validateStep6();

    if (isValid && step < 7) {
      setStep((step + 1) as any);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setError("");
      setStep((step - 1) as any);
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
          maxWidth: "600px",
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
        }}
      >
        {/* Step Indicator */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "8px",
            marginBottom: "32px",
          }}
        >
          {[1, 2, 3, 4, 5, 6, 7].map((s) => (
            <div
              key={s}
              style={{
                width: "10px",
                height: "10px",
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
            <h2
              style={{
                fontSize: "24px",
                fontWeight: "bold",
                color: "#2c3e50",
                marginBottom: "16px",
                textAlign: "center",
              }}
            >
              Benvenuto in Formicanera
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
              Configura il tuo sistema di monitoraggio vendite e provvigioni.
              <br />
              Tutti i dati sono privati e visibili solo a te.
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

        {/* Step 2: Target Annuale */}
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
              Obiettivo Annuale di Fatturato
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
              Questo è il tuo target di vendita per l'anno (senza IVA).
            </p>

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
                Target annuale (€)
              </label>
              <input
                type="number"
                value={yearlyTarget}
                onChange={(e) => {
                  setYearlyTarget(e.target.value);
                  setError("");
                }}
                placeholder="300000"
                min="1"
                step="1000"
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
              {yearlyTarget && !error && (
                <p style={{ fontSize: "14px", color: "#7f8c8d", marginBottom: "16px" }}>
                  Target mensile: {formatCurrency(parseFloat(yearlyTarget) / 12)}
                </p>
              )}
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

            <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
              <button
                onClick={handleBack}
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
                onClick={handleNext}
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

        {/* Step 3: Provvigioni Base */}
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
              Percentuale Provvigioni Base
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
              Su tutto il fatturato annuale, indipendentemente dal target.
            </p>

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
                Percentuale (%)
              </label>
              <input
                type="number"
                value={commissionRate}
                onChange={(e) => {
                  setCommissionRate(e.target.value);
                  setError("");
                }}
                placeholder="18"
                min="0"
                max="100"
                step="0.1"
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
              {commissionRate && yearlyTarget && !error && (
                <p style={{ fontSize: "14px", color: "#7f8c8d", marginBottom: "16px" }}>
                  Su {formatCurrency(parseFloat(yearlyTarget))}: circa {formatCurrency(parseFloat(yearlyTarget) * (parseFloat(commissionRate) / 100))}
                </p>
              )}
              {error && (
                <p style={{ fontSize: "14px", color: "#e74c3c", marginBottom: "16px" }}>
                  {error}
                </p>
              )}
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
              <button onClick={handleBack} style={{ flex: 1, backgroundColor: "transparent", color: "#7f8c8d", padding: "12px 24px", border: "1px solid #e0e0e0", borderRadius: "8px", fontSize: "16px", cursor: "pointer", transition: "background 0.2s" }} onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8f9fa")} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}>
                Indietro
              </button>
              <button onClick={handleNext} style={{ flex: 2, backgroundColor: "#3498db", color: "#fff", padding: "12px 24px", borderRadius: "8px", border: "none", fontSize: "16px", fontWeight: "600", cursor: "pointer", transition: "background 0.2s" }} onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#2980b9")} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#3498db")}>
                Continua
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Bonus Progressivi */}
        {step === 4 && (
          <div>
            <h2 style={{ fontSize: "24px", fontWeight: "bold", color: "#2c3e50", marginBottom: "16px", textAlign: "center" }}>
              Bonus Progressivi
            </h2>
            <p style={{ fontSize: "14px", color: "#7f8c8d", lineHeight: "1.6", textAlign: "center", marginBottom: "24px" }}>
              Ricevi un bonus ogni volta che raggiungi una soglia di fatturato.
            </p>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#2c3e50", marginBottom: "8px" }}>
                Importo bonus (€)
              </label>
              <input type="number" value={bonusAmount} onChange={(e) => { setBonusAmount(e.target.value); setError(""); }} placeholder="5000" min="0" step="100" style={{ width: "100%", padding: "12px", fontSize: "18px", borderRadius: "8px", border: error ? "2px solid #e74c3c" : "2px solid #e0e0e0", transition: "border 0.2s", boxSizing: "border-box" }} onFocus={(e) => !error && (e.currentTarget.style.border = "2px solid #3498db")} onBlur={(e) => !error && (e.currentTarget.style.border = "2px solid #e0e0e0")} />
            </div>

            <div style={{ marginBottom: "8px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#2c3e50", marginBottom: "8px" }}>
                Ogni (€ di fatturato)
              </label>
              <input type="number" value={bonusInterval} onChange={(e) => { setBonusInterval(e.target.value); setError(""); }} placeholder="75000" min="1" step="1000" style={{ width: "100%", padding: "12px", fontSize: "18px", borderRadius: "8px", border: error ? "2px solid #e74c3c" : "2px solid #e0e0e0", marginBottom: "8px", transition: "border 0.2s", boxSizing: "border-box" }} onFocus={(e) => !error && (e.currentTarget.style.border = "2px solid #3498db")} onBlur={(e) => !error && (e.currentTarget.style.border = "2px solid #e0e0e0")} />
              {bonusAmount && bonusInterval && !error && (
                <p style={{ fontSize: "14px", color: "#7f8c8d", marginBottom: "16px" }}>
                  Esempio: Ogni {formatCurrency(parseFloat(bonusInterval))} ricevi {formatCurrency(parseFloat(bonusAmount))}
                </p>
              )}
              {error && <p style={{ fontSize: "14px", color: "#e74c3c", marginBottom: "16px" }}>{error}</p>}
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
              <button onClick={handleBack} style={{ flex: 1, backgroundColor: "transparent", color: "#7f8c8d", padding: "12px 24px", border: "1px solid #e0e0e0", borderRadius: "8px", fontSize: "16px", cursor: "pointer", transition: "background 0.2s" }} onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8f9fa")} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}>Indietro</button>
              <button onClick={handleNext} style={{ flex: 2, backgroundColor: "#3498db", color: "#fff", padding: "12px 24px", borderRadius: "8px", border: "none", fontSize: "16px", fontWeight: "600", cursor: "pointer", transition: "background 0.2s" }} onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#2980b9")} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#3498db")}>Continua</button>
            </div>
          </div>
        )}

        {/* Step 5: Premi Extra-Budget */}
        {step === 5 && (
          <div>
            <h2 style={{ fontSize: "24px", fontWeight: "bold", color: "#2c3e50", marginBottom: "16px", textAlign: "center" }}>Premi Extra-Budget</h2>
            <p style={{ fontSize: "14px", color: "#7f8c8d", lineHeight: "1.6", textAlign: "center", marginBottom: "24px" }}>Premio per ogni scaglione oltre il target annuale.</p>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#2c3e50", marginBottom: "8px" }}>Premio ogni (€ oltre target)</label>
              <input type="number" value={extraBudgetInterval} onChange={(e) => { setExtraBudgetInterval(e.target.value); setError(""); }} placeholder="50000" min="1" step="1000" style={{ width: "100%", padding: "12px", fontSize: "18px", borderRadius: "8px", border: error ? "2px solid #e74c3c" : "2px solid #e0e0e0", transition: "border 0.2s", boxSizing: "border-box" }} onFocus={(e) => !error && (e.currentTarget.style.border = "2px solid #3498db")} onBlur={(e) => !error && (e.currentTarget.style.border = "2px solid #e0e0e0")} />
            </div>

            <div style={{ marginBottom: "8px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#2c3e50", marginBottom: "8px" }}>Importo premio (€)</label>
              <input type="number" value={extraBudgetReward} onChange={(e) => { setExtraBudgetReward(e.target.value); setError(""); }} placeholder="6000" min="0" step="100" style={{ width: "100%", padding: "12px", fontSize: "18px", borderRadius: "8px", border: error ? "2px solid #e74c3c" : "2px solid #e0e0e0", marginBottom: "8px", transition: "border 0.2s", boxSizing: "border-box" }} onFocus={(e) => !error && (e.currentTarget.style.border = "2px solid #3498db")} onBlur={(e) => !error && (e.currentTarget.style.border = "2px solid #e0e0e0")} />
              {extraBudgetInterval && extraBudgetReward && yearlyTarget && !error && (
                <p style={{ fontSize: "14px", color: "#7f8c8d", marginBottom: "16px" }}>
                  Esempio: A {formatCurrency(parseFloat(yearlyTarget) + parseFloat(extraBudgetInterval))} ricevi {formatCurrency(parseFloat(extraBudgetReward))}
                </p>
              )}
              {error && <p style={{ fontSize: "14px", color: "#e74c3c", marginBottom: "16px" }}>{error}</p>}
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
              <button onClick={handleBack} style={{ flex: 1, backgroundColor: "transparent", color: "#7f8c8d", padding: "12px 24px", border: "1px solid #e0e0e0", borderRadius: "8px", fontSize: "16px", cursor: "pointer", transition: "background 0.2s" }} onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8f9fa")} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}>Indietro</button>
              <button onClick={handleNext} style={{ flex: 2, backgroundColor: "#3498db", color: "#fff", padding: "12px 24px", borderRadius: "8px", border: "none", fontSize: "16px", fontWeight: "600", cursor: "pointer", transition: "background 0.2s" }} onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#2980b9")} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#3498db")}>Continua</button>
            </div>
          </div>
        )}

        {/* Step 6: Anticipo Mensile */}
        {step === 6 && (
          <div>
            <h2 style={{ fontSize: "24px", fontWeight: "bold", color: "#2c3e50", marginBottom: "16px", textAlign: "center" }}>Anticipo Mensile</h2>
            <p style={{ fontSize: "14px", color: "#7f8c8d", lineHeight: "1.6", textAlign: "center", marginBottom: "24px" }}>L'anticipo fisso mensile che ricevi, da scalare dal conguaglio provvigionale di fine anno.</p>

            <div style={{ marginBottom: "8px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#2c3e50", marginBottom: "8px" }}>Anticipo mensile (€)</label>
              <input type="number" value={monthlyAdvance} onChange={(e) => { setMonthlyAdvance(e.target.value); setError(""); }} placeholder="3500" min="0" step="100" style={{ width: "100%", padding: "12px", fontSize: "18px", borderRadius: "8px", border: error ? "2px solid #e74c3c" : "2px solid #e0e0e0", marginBottom: "8px", transition: "border 0.2s", boxSizing: "border-box" }} onFocus={(e) => !error && (e.currentTarget.style.border = "2px solid #3498db")} onBlur={(e) => !error && (e.currentTarget.style.border = "2px solid #e0e0e0")} />
              {monthlyAdvance && !error && (
                <p style={{ fontSize: "14px", color: "#7f8c8d", marginBottom: "16px" }}>
                  Anticipo annuale: {formatCurrency(parseFloat(monthlyAdvance) * 12)}
                </p>
              )}
              {error && <p style={{ fontSize: "14px", color: "#e74c3c", marginBottom: "16px" }}>{error}</p>}
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
              <button onClick={handleBack} style={{ flex: 1, backgroundColor: "transparent", color: "#7f8c8d", padding: "12px 24px", border: "1px solid #e0e0e0", borderRadius: "8px", fontSize: "16px", cursor: "pointer", transition: "background 0.2s" }} onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8f9fa")} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}>Indietro</button>
              <button onClick={handleNext} style={{ flex: 2, backgroundColor: "#3498db", color: "#fff", padding: "12px 24px", borderRadius: "8px", border: "none", fontSize: "16px", fontWeight: "600", cursor: "pointer", transition: "background 0.2s" }} onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#2980b9")} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#3498db")}>Continua</button>
            </div>
          </div>
        )}

        {/* Step 7: Conferma & Privacy */}
        {step === 7 && (
          <div>
            <h2 style={{ fontSize: "24px", fontWeight: "bold", color: "#2c3e50", marginBottom: "16px", textAlign: "center" }}>Riepilogo Configurazione</h2>

            <div style={{ backgroundColor: "#f8f9fa", borderRadius: "12px", padding: "20px", marginBottom: "24px" }}>
              <div style={{ marginBottom: "12px" }}>
                <div style={{ fontSize: "12px", color: "#7f8c8d", marginBottom: "4px" }}>Target annuale</div>
                <div style={{ fontSize: "20px", fontWeight: "bold", color: "#2c3e50" }}>{formatCurrency(parseFloat(yearlyTarget))}</div>
                <div style={{ fontSize: "14px", color: "#7f8c8d" }}>({formatCurrency(parseFloat(yearlyTarget) / 12)}/mese)</div>
              </div>

              <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: "12px", marginTop: "12px" }}>
                <div style={{ fontSize: "14px", color: "#7f8c8d", marginBottom: "8px" }}>Provvigioni base: {commissionRate}%</div>
                <div style={{ fontSize: "14px", color: "#7f8c8d", marginBottom: "8px" }}>Bonus: {formatCurrency(parseFloat(bonusAmount))} ogni {formatCurrency(parseFloat(bonusInterval))}</div>
                <div style={{ fontSize: "14px", color: "#7f8c8d", marginBottom: "8px" }}>Premio extra: {formatCurrency(parseFloat(extraBudgetReward))} ogni {formatCurrency(parseFloat(extraBudgetInterval))} oltre target</div>
                <div style={{ fontSize: "14px", color: "#7f8c8d" }}>Anticipo: {formatCurrency(parseFloat(monthlyAdvance))}/mese</div>
              </div>
            </div>

            <div style={{ backgroundColor: "#fff3cd", borderRadius: "8px", padding: "16px", marginBottom: "24px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                <input type="checkbox" checked={hideCommissions} onChange={(e) => setHideCommissions(e.target.checked)} style={{ width: "20px", height: "20px", cursor: "pointer" }} />
                <span style={{ fontSize: "14px", color: "#856404" }}>Nascondi provvigioni dalla dashboard (puoi cambiare questa opzione in seguito)</span>
              </label>
            </div>

            <p style={{ fontSize: "14px", color: "#7f8c8d", lineHeight: "1.6", textAlign: "center", marginBottom: "24px" }}>
              Il sistema calcolerà automaticamente le tue provvigioni in base alla configurazione.
            </p>

            <div style={{ display: "flex", gap: "12px" }}>
              <button onClick={handleBack} style={{ flex: 1, backgroundColor: "transparent", color: "#7f8c8d", padding: "12px 24px", border: "1px solid #e0e0e0", borderRadius: "8px", fontSize: "16px", cursor: "pointer", transition: "background 0.2s" }} onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8f9fa")} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}>Indietro</button>
              <button onClick={handleConfirm} style={{ flex: 2, backgroundColor: "#27ae60", color: "#fff", padding: "12px 24px", borderRadius: "8px", border: "none", fontSize: "16px", fontWeight: "600", cursor: "pointer", transition: "background 0.2s" }} onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#229954")} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#27ae60")}>Conferma</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
