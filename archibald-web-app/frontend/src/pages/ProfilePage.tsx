import { useState, useEffect } from "react";
import { formatCurrencyWithCurrency } from "../utils/format-currency";
import { useKeyboardScroll } from "../hooks/useKeyboardScroll";

interface TargetData {
  yearlyTarget: number;
  monthlyTarget: number;
  currency: string;
  commissionRate: number;
  bonusAmount: number;
  bonusInterval: number;
  extraBudgetInterval: number;
  extraBudgetReward: number;
  monthlyAdvance: number;
  hideCommissions: boolean;
  updatedAt?: string;
}

interface Toast {
  message: string;
  type: "success" | "error";
}

export function ProfilePage() {
  const { scrollFieldIntoView, keyboardPaddingStyle } = useKeyboardScroll();
  const lastUserJson = localStorage.getItem("archibald_last_user");
  const lastUser = lastUserJson ? JSON.parse(lastUserJson) as { fullName?: string } : null;
  const fullName = lastUser?.fullName ?? "Utente";

  // Current target state (from API)
  const [currentTarget, setCurrentTarget] = useState<TargetData | null>(null);

  // Edit form state (separate from current to enable cancel/reset)
  const [editYearlyTarget, setEditYearlyTarget] = useState<string>("");
  const [editCurrency, setEditCurrency] = useState<string>("EUR");
  const [editCommissionRate, setEditCommissionRate] = useState<string>("");
  const [editBonusAmount, setEditBonusAmount] = useState<string>("");
  const [editBonusInterval, setEditBonusInterval] = useState<string>("");
  const [editExtraBudgetInterval, setEditExtraBudgetInterval] =
    useState<string>("");
  const [editExtraBudgetReward, setEditExtraBudgetReward] =
    useState<string>("");
  const [editMonthlyAdvance, setEditMonthlyAdvance] = useState<string>("");
  const [editHideCommissions, setEditHideCommissions] =
    useState<boolean>(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [validationError, setValidationError] = useState<string>("");

  // Load current target on mount
  useEffect(() => {
    const fetchTarget = async () => {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/users/me/target", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const json = await response.json();
          const data: TargetData = json.data ?? json;
          setCurrentTarget(data);

          // Initialize edit form with current values
          setEditYearlyTarget((data.yearlyTarget ?? 0).toString());
          setEditCurrency(data.currency || "EUR");
          setEditCommissionRate(((data.commissionRate ?? 0) * 100).toString());
          setEditBonusAmount((data.bonusAmount ?? 0).toString());
          setEditBonusInterval((data.bonusInterval ?? 0).toString());
          setEditExtraBudgetInterval((data.extraBudgetInterval ?? 0).toString());
          setEditExtraBudgetReward((data.extraBudgetReward ?? 0).toString());
          setEditMonthlyAdvance((data.monthlyAdvance ?? 0).toString());
          setEditHideCommissions(data.hideCommissions ?? false);
        } else {
          console.error(
            "[ProfilePage] Failed to load target:",
            await response.text(),
          );
        }
      } catch (error) {
        console.error("[ProfilePage] Failed to load target:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTarget();
  }, []);

  // Auto-hide toast after 5 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Validate form
  const validateForm = (): boolean => {
    const yearly = parseFloat(editYearlyTarget);
    const rate = parseFloat(editCommissionRate);
    const bonus = parseFloat(editBonusAmount);
    const bonusInt = parseFloat(editBonusInterval);
    const extraInt = parseFloat(editExtraBudgetInterval);
    const extraRew = parseFloat(editExtraBudgetReward);
    const advance = parseFloat(editMonthlyAdvance);

    if (isNaN(yearly) || yearly <= 0) {
      setValidationError("L'obiettivo annuale deve essere maggiore di zero");
      return false;
    }

    if (isNaN(rate) || rate <= 0 || rate > 100) {
      setValidationError("La percentuale provvigioni deve essere tra 0 e 100");
      return false;
    }

    if (isNaN(bonus) || bonus < 0) {
      setValidationError("Il bonus deve essere un valore valido");
      return false;
    }

    if (isNaN(bonusInt) || bonusInt <= 0) {
      setValidationError("L'intervallo bonus deve essere maggiore di zero");
      return false;
    }

    if (isNaN(extraInt) || extraInt <= 0) {
      setValidationError(
        "L'intervallo extra-budget deve essere maggiore di zero",
      );
      return false;
    }

    if (isNaN(extraRew) || extraRew < 0) {
      setValidationError("Il premio extra-budget deve essere un valore valido");
      return false;
    }

    if (isNaN(advance) || advance < 0) {
      setValidationError("L'anticipo mensile deve essere un valore valido");
      return false;
    }

    setValidationError("");
    return true;
  };

  // Check if form has changes
  const hasChanges = (): boolean => {
    if (!currentTarget) return false;

    return (
      parseFloat(editYearlyTarget) !== currentTarget.yearlyTarget ||
      editCurrency !== currentTarget.currency ||
      parseFloat(editCommissionRate) / 100 !== currentTarget.commissionRate ||
      parseFloat(editBonusAmount) !== currentTarget.bonusAmount ||
      parseFloat(editBonusInterval) !== currentTarget.bonusInterval ||
      parseFloat(editExtraBudgetInterval) !==
        currentTarget.extraBudgetInterval ||
      parseFloat(editExtraBudgetReward) !== currentTarget.extraBudgetReward ||
      parseFloat(editMonthlyAdvance) !== currentTarget.monthlyAdvance ||
      editHideCommissions !== currentTarget.hideCommissions
    );
  };

  // Save handler
  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    const token = localStorage.getItem("archibald_jwt");

    try {
      const response = await fetch("/api/users/me/target", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          yearlyTarget: parseFloat(editYearlyTarget),
          currency: editCurrency,
          commissionRate: parseFloat(editCommissionRate) / 100,
          bonusAmount: parseFloat(editBonusAmount),
          bonusInterval: parseFloat(editBonusInterval),
          extraBudgetInterval: parseFloat(editExtraBudgetInterval),
          extraBudgetReward: parseFloat(editExtraBudgetReward),
          monthlyAdvance: parseFloat(editMonthlyAdvance),
          hideCommissions: editHideCommissions,
        }),
      });

      if (response.ok) {
        const data: TargetData = await response.json();
        setCurrentTarget(data);
        setToast({
          message: "Configurazione aggiornata con successo! ✓",
          type: "success",
        });
        setValidationError("");
      } else {
        setToast({
          message: "Errore nel salvare la configurazione. Riprova.",
          type: "error",
        });
      }
    } catch (error) {
      console.error("[ProfilePage] Save failed:", error);
      setToast({
        message: "Errore di connessione. Riprova.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  // Cancel/Reset handler
  const handleCancel = () => {
    if (!currentTarget) return;

    // Reset form to current values
    setEditYearlyTarget((currentTarget.yearlyTarget ?? 0).toString());
    setEditCurrency(currentTarget.currency || "EUR");
    setEditCommissionRate(((currentTarget.commissionRate ?? 0) * 100).toString());
    setEditBonusAmount((currentTarget.bonusAmount ?? 0).toString());
    setEditBonusInterval((currentTarget.bonusInterval ?? 0).toString());
    setEditExtraBudgetInterval((currentTarget.extraBudgetInterval ?? 0).toString());
    setEditExtraBudgetReward((currentTarget.extraBudgetReward ?? 0).toString());
    setEditMonthlyAdvance((currentTarget.monthlyAdvance ?? 0).toString());
    setEditHideCommissions(currentTarget.hideCommissions ?? false);
    setValidationError("");
  };

  const formatCurrency = (amount: number, currency: string) =>
    formatCurrencyWithCurrency(amount, currency);

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Non disponibile";
    return new Date(dateString).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Loading state
  if (loading) {
    return (
      <div style={styles.container}>
        <p style={{ fontSize: "18px", color: "#7f8c8d", textAlign: "center" }}>
          Caricamento profilo...
        </p>
      </div>
    );
  }

  // Error state
  if (!currentTarget) {
    return (
      <div style={styles.container}>
        <p style={{ fontSize: "18px", color: "#e74c3c", textAlign: "center" }}>
          Errore nel caricare il profilo.
        </p>
      </div>
    );
  }

  return (
    <div style={{ ...styles.container, ...keyboardPaddingStyle }}>
      {/* Toast notification */}
      {toast && (
        <div
          style={{
            ...styles.toast,
            backgroundColor: toast.type === "success" ? "#27ae60" : "#e74c3c",
          }}
        >
          {toast.message}
        </div>
      )}

      <h1 style={styles.pageTitle}>Profilo Utente</h1>

      {/* Section 1: User Info (read-only) */}
      <div style={styles.card}>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <span style={{ fontSize: "48px" }}>👤</span>
          <div>
            <h2 style={styles.sectionTitle}>{fullName}</h2>
          </div>
        </div>
      </div>

      {/* Section 2: Configuration Editor */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Configurazione Obiettivi</h2>

        {/* Current values display */}
        <div
          style={{
            backgroundColor: "#ecf0f1",
            padding: "15px",
            borderRadius: "8px",
            marginBottom: "20px",
          }}
        >
          <p
            style={{
              fontSize: "14px",
              color: "#7f8c8d",
              margin: "0 0 8px 0",
              fontWeight: "bold",
            }}
          >
            Configurazione attuale:
          </p>
          <p style={{ fontSize: "16px", color: "#2c3e50", margin: "4px 0" }}>
            <strong>Target annuale:</strong>{" "}
            {formatCurrency(currentTarget.yearlyTarget, currentTarget.currency)}{" "}
            (mensile:{" "}
            {formatCurrency(
              currentTarget.monthlyTarget,
              currentTarget.currency,
            )}
            )
          </p>
          <p style={{ fontSize: "16px", color: "#2c3e50", margin: "4px 0" }}>
            <strong>Provvigioni:</strong>{" "}
            {(currentTarget.commissionRate * 100).toFixed(1)}%
          </p>
          <p
            style={{ fontSize: "14px", color: "#7f8c8d", margin: "8px 0 0 0" }}
          >
            Ultimo aggiornamento: {formatDate(currentTarget.updatedAt)}
          </p>
        </div>

        {/* Edit form */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Yearly Target */}
          <div>
            <label style={styles.label}>Target Annuale ({editCurrency})</label>
            <input
              type="number"
              value={editYearlyTarget}
              onChange={(e) => setEditYearlyTarget(e.target.value)}
              onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
              style={styles.input}
              step="100"
            />
            <p
              style={{ fontSize: "14px", color: "#7f8c8d", margin: "4px 0 0" }}
            >
              Mensile:{" "}
              {formatCurrency(
                Math.round(parseFloat(editYearlyTarget || "0") / 12),
                editCurrency,
              )}
            </p>
          </div>

          {/* Currency */}
          <div>
            <label style={styles.label}>Valuta</label>
            <select
              value={editCurrency}
              onChange={(e) => setEditCurrency(e.target.value)}
              onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
              style={styles.input}
            >
              <option value="EUR">EUR (€)</option>
              <option value="USD">USD ($)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>

          {/* Commission Rate */}
          <div>
            <label style={styles.label}>Provvigioni Base (%)</label>
            <input
              type="number"
              value={editCommissionRate}
              onChange={(e) => setEditCommissionRate(e.target.value)}
              onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
              style={styles.input}
              step="0.5"
              min="0"
              max="100"
            />
            <p
              style={{ fontSize: "14px", color: "#7f8c8d", margin: "4px 0 0" }}
            >
              Su{" "}
              {formatCurrency(
                parseFloat(editYearlyTarget || "0"),
                editCurrency,
              )}
              , riceverai{" "}
              {formatCurrency(
                (parseFloat(editYearlyTarget || "0") *
                  parseFloat(editCommissionRate || "0")) /
                  100,
                editCurrency,
              )}{" "}
              di provvigioni base
            </p>
          </div>

          {/* Progressive Bonus */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "15px",
            }}
          >
            <div>
              <label style={styles.label}>Bonus Progressivo</label>
              <input
                type="number"
                value={editBonusAmount}
                onChange={(e) => setEditBonusAmount(e.target.value)}
                onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
                style={styles.input}
                step="100"
              />
            </div>
            <div>
              <label style={styles.label}>Ogni (Intervallo)</label>
              <input
                type="number"
                value={editBonusInterval}
                onChange={(e) => setEditBonusInterval(e.target.value)}
                onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
                style={styles.input}
                step="1000"
              />
            </div>
          </div>

          {/* Extra-Budget Rewards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "15px",
            }}
          >
            <div>
              <label style={styles.label}>Premio Extra-Budget</label>
              <input
                type="number"
                value={editExtraBudgetReward}
                onChange={(e) => setEditExtraBudgetReward(e.target.value)}
                onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
                style={styles.input}
                step="100"
              />
            </div>
            <div>
              <label style={styles.label}>Intervallo Extra-Budget</label>
              <input
                type="number"
                value={editExtraBudgetInterval}
                onChange={(e) => setEditExtraBudgetInterval(e.target.value)}
                onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
                style={styles.input}
                step="1000"
              />
            </div>
          </div>

          {/* Monthly Advance */}
          <div>
            <label style={styles.label}>Anticipo Mensile</label>
            <input
              type="number"
              value={editMonthlyAdvance}
              onChange={(e) => setEditMonthlyAdvance(e.target.value)}
              onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
              style={styles.input}
              step="100"
            />
            <p
              style={{ fontSize: "14px", color: "#7f8c8d", margin: "4px 0 0" }}
            >
              Totale anticipato nell'anno:{" "}
              {formatCurrency(
                parseFloat(editMonthlyAdvance || "0") * 12,
                editCurrency,
              )}
            </p>
          </div>

          {/* Privacy Toggle */}
          <div>
            <label
              style={{
                ...styles.label,
                display: "flex",
                alignItems: "center",
                gap: "10px",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={editHideCommissions}
                onChange={(e) => setEditHideCommissions(e.target.checked)}
                onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
                style={{ width: "20px", height: "20px", cursor: "pointer" }}
              />
              Nascondi dati provvigionali dai widget della dashboard
            </label>
          </div>

          {/* Validation Error */}
          {validationError && (
            <div
              style={{
                backgroundColor: "#ffe0e0",
                color: "#e74c3c",
                padding: "12px",
                borderRadius: "8px",
                fontSize: "14px",
              }}
            >
              {validationError}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: "15px", marginTop: "10px" }}>
            <button
              onClick={handleSave}
              disabled={!hasChanges() || saving}
              style={{
                ...styles.buttonPrimary,
                ...((!hasChanges() || saving) && styles.buttonDisabled),
              }}
            >
              {saving ? "Salvataggio..." : "Salva Modifiche"}
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              style={styles.buttonSecondary}
            >
              Annulla
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Inline styles
const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: "800px",
    margin: "0 auto",
    padding: "20px",
  },
  pageTitle: {
    fontSize: "28px",
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: "20px",
  },
  card: {
    backgroundColor: "#f8f9fa",
    borderRadius: "12px",
    padding: "20px",
    marginBottom: "20px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  },
  sectionTitle: {
    fontSize: "20px",
    fontWeight: "600",
    color: "#2c3e50",
    marginBottom: "16px",
    marginTop: 0,
  },
  label: {
    display: "block",
    fontSize: "14px",
    fontWeight: "600",
    color: "#2c3e50",
    marginBottom: "6px",
  },
  input: {
    width: "100%",
    padding: "10px",
    fontSize: "16px",
    borderRadius: "8px",
    border: "2px solid #e0e0e0",
    backgroundColor: "#fff",
    boxSizing: "border-box" as const,
  },
  buttonPrimary: {
    backgroundColor: "#3498db",
    color: "#fff",
    padding: "12px 24px",
    borderRadius: "8px",
    border: "none",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: "600",
    transition: "background-color 0.2s",
  },
  buttonSecondary: {
    backgroundColor: "#95a5a6",
    color: "#fff",
    padding: "12px 24px",
    borderRadius: "8px",
    border: "none",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: "600",
    transition: "background-color 0.2s",
  },
  buttonDisabled: {
    backgroundColor: "#bdc3c7",
    cursor: "not-allowed",
    opacity: 0.6,
  },
  toast: {
    position: "fixed" as const,
    top: "20px",
    right: "20px",
    padding: "12px 20px",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "16px",
    fontWeight: "600",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    zIndex: 9999,
  },
};
