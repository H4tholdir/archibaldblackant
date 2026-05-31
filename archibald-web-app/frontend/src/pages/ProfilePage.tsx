import { useState, useEffect } from "react";
import { formatCurrencyWithCurrency } from "../utils/format-currency";
import { useKeyboardScroll } from "../hooks/useKeyboardScroll";
import { BonusesTab } from "../components/BonusesTab";
import { AgentNotificationProfileForm } from "../components/AgentNotificationProfileForm";
import { NotificationTemplateEditor } from "../components/NotificationTemplateEditor";
import { MfaSetupPage } from "./MfaSetupPage";
import * as authApi from "../api/auth";
import { useAuth } from "../hooks/useAuth";

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

type CommissionAdvance = { id: number; amount: number; description: string | null; advance_date: string };

export function ProfilePage() {
  const { scrollFieldIntoView, keyboardPaddingStyle } = useKeyboardScroll();
  const { user } = useAuth();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [displayName, setDisplayName] = useState(user?.fullName || 'Utente');

  // Update displayName when user loads
  if (user?.fullName && displayName === 'Utente' && user.fullName !== 'Utente') {
    setDisplayName(user.fullName);
  }
  const username = user?.username || "";

  // Anticipi extra provvigioni
  const [advances, setAdvances] = useState<CommissionAdvance[]>([]);
  const [advancesTotal, setAdvancesTotal] = useState(0);
  const [newAdvanceAmount, setNewAdvanceAmount] = useState('');
  const [newAdvanceDesc, setNewAdvanceDesc] = useState('');
  const [addingAdvance, setAddingAdvance] = useState(false);

  const [activeTab, setActiveTab] = useState<"target" | "premi">("target");

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

  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [mfaSetupToken, setMfaSetupToken] = useState<string | null>(null);
  const [mfaSetupLoading, setMfaSetupLoading] = useState(false);

  // Load MFA status on mount
  useEffect(() => {
    const token = localStorage.getItem("archibald_jwt");
    if (!token) return;
    authApi.getMe(token)
      .then((data) => { if (data.success) setMfaEnabled(data.data?.user.mfaEnabled ?? false); })
      .catch(() => {});
  }, []);

  const handleEnableMfa = async () => {
    const token = localStorage.getItem("archibald_jwt");
    if (!token) return;
    setMfaSetupLoading(true);
    try {
      const res = await authApi.mfaBeginSetup(token);
      if (res.success && res.setupToken) {
        setMfaSetupToken(res.setupToken);
      } else {
        setToast({ message: res.error ?? 'Errore avvio setup MFA', type: 'error' });
      }
    } catch {
      setToast({ message: 'Errore di connessione', type: 'error' });
    } finally {
      setMfaSetupLoading(false);
    }
  };

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
          const data: TargetData = await response.json();
          setCurrentTarget(data);

          // Initialize edit form with current values
          setEditYearlyTarget(data.yearlyTarget.toString());
          setEditCurrency(data.currency);
          setEditCommissionRate((data.commissionRate * 100).toString());
          setEditBonusAmount(data.bonusAmount.toString());
          setEditBonusInterval(data.bonusInterval.toString());
          setEditExtraBudgetInterval(data.extraBudgetInterval.toString());
          setEditExtraBudgetReward(data.extraBudgetReward.toString());
          setEditMonthlyAdvance(data.monthlyAdvance.toString());
          setEditHideCommissions(data.hideCommissions);
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

  // Fetch anticipi extra
  useEffect(() => {
    const token = localStorage.getItem('archibald_jwt');
    if (!token) return;
    fetch('/api/users/me/advances', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json() as Promise<{ data: { advances: CommissionAdvance[]; total: number } }>)
      .then(b => { setAdvances(b.data.advances); setAdvancesTotal(b.data.total); })
      .catch(() => null);
  }, []);

  const handleSaveName = async () => {
    if (!nameDraft.trim()) return;
    setSavingName(true);
    const token = localStorage.getItem('archibald_jwt');
    try {
      const res = await fetch('/api/users/me/profile', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: nameDraft.trim() }),
      });
      if (res.ok) { setDisplayName(nameDraft.trim()); setEditingName(false); }
    } catch { /* ignora */ } finally { setSavingName(false); }
  };

  const handleAddAdvance = async () => {
    const amount = parseFloat(newAdvanceAmount);
    if (!amount || amount <= 0) return;
    setAddingAdvance(true);
    const token = localStorage.getItem('archibald_jwt');
    try {
      const res = await fetch('/api/users/me/advances', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, description: newAdvanceDesc || undefined }),
      });
      if (res.ok) {
        const body = await res.json() as { data: CommissionAdvance };
        setAdvances(prev => [body.data, ...prev]);
        setAdvancesTotal(prev => prev + amount);
        setNewAdvanceAmount('');
        setNewAdvanceDesc('');
      }
    } catch { /* ignora */ } finally { setAddingAdvance(false); }
  };

  const handleDeleteAdvance = async (id: number, amount: number) => {
    const token = localStorage.getItem('archibald_jwt');
    await fetch(`/api/users/me/advances/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setAdvances(prev => prev.filter(a => a.id !== id));
    setAdvancesTotal(prev => prev - amount);
  };

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
    setEditYearlyTarget(currentTarget.yearlyTarget.toString());
    setEditCurrency(currentTarget.currency);
    setEditCommissionRate((currentTarget.commissionRate * 100).toString());
    setEditBonusAmount(currentTarget.bonusAmount.toString());
    setEditBonusInterval(currentTarget.bonusInterval.toString());
    setEditExtraBudgetInterval(currentTarget.extraBudgetInterval.toString());
    setEditExtraBudgetReward(currentTarget.extraBudgetReward.toString());
    setEditMonthlyAdvance(currentTarget.monthlyAdvance.toString());
    setEditHideCommissions(currentTarget.hideCommissions);
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

      {/* Section 1: User Info + Dati Notifiche */}
      <div style={styles.card}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
          {/* Avatar colorato con iniziali */}
          <div style={{
            width: 60, height: 60, borderRadius: '50%',
            background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: 'white' }}>
              {displayName.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'}
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingName ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                  autoFocus
                  style={{ flex: 1, border: '1.5px solid #2563eb', borderRadius: 8, padding: '6px 10px', fontSize: 16, fontWeight: 700, outline: 'none' }}
                />
                <button onClick={() => void handleSaveName()} disabled={savingName} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, padding: '6px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                  {savingName ? '…' : 'Salva'}
                </button>
                <button onClick={() => setEditingName(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#94a3b8' }}>×</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ ...styles.sectionTitle, margin: 0, fontSize: 20 }}>{displayName}</h2>
                <button onClick={() => { setNameDraft(displayName); setEditingName(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#94a3b8' }} title="Modifica nome">✏️</button>
              </div>
            )}
            <p style={{ color: "#7f8c8d", fontSize: "13px", margin: "2px 0 0" }}>@{username}</p>
          </div>
        </div>
        <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "16px" }}>
          <p style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "12px", marginTop: 0 }}>
            I dati seguenti vengono usati come mittente nelle email e messaggi WhatsApp ai clienti.
          </p>
          <AgentNotificationProfileForm />
        </div>
      </div>

      {/* Section 2: Security */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Sicurezza</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ margin: 0, fontWeight: 600, color: '#2c3e50' }}>Autenticazione a due fattori (2FA)</p>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: '#7f8c8d' }}>
              {mfaEnabled === null ? 'Caricamento...' : mfaEnabled ? 'Attiva — il tuo account è protetto con OTP.' : 'Non attiva — consigliata per account admin.'}
            </p>
          </div>
          {mfaEnabled === false && (
            <button
              onClick={handleEnableMfa}
              disabled={mfaSetupLoading}
              style={{ ...styles.buttonPrimary, fontSize: 14, padding: '10px 18px', ...(mfaSetupLoading ? styles.buttonDisabled : {}) }}
            >
              {mfaSetupLoading ? 'Avvio...' : 'Abilita 2FA'}
            </button>
          )}
          {mfaEnabled === true && (
            <span style={{ background: '#27ae60', color: '#fff', padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
              Attiva
            </span>
          )}
        </div>
      </div>

      {/* MFA Setup Modal */}
      {mfaSetupToken && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, maxWidth: 460, width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <MfaSetupPage
              setupToken={mfaSetupToken}
              completeLabel="Ho finito"
              onComplete={() => {
                setMfaSetupToken(null);
                setMfaEnabled(true);
                setToast({ message: '2FA attivato con successo!', type: 'success' });
              }}
            />
          </div>
        </div>
      )}

      {/* Section 3: Configuration Editor */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Configurazione Obiettivi</h2>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e0e0e0", marginBottom: "20px" }}>
          <button
            onClick={() => setActiveTab("target")}
            style={{ padding: "8px 18px", border: "none", background: "none", cursor: "pointer", fontSize: "14px", fontWeight: activeTab === "target" ? 700 : 400, color: activeTab === "target" ? "#1565c0" : "#888", borderBottom: activeTab === "target" ? "3px solid #1565c0" : "3px solid transparent", marginBottom: "-2px" }}
          >
            🎯 Target
          </button>
          <button
            onClick={() => setActiveTab("premi")}
            style={{ padding: "8px 18px", border: "none", background: "none", cursor: "pointer", fontSize: "14px", fontWeight: activeTab === "premi" ? 700 : 400, color: activeTab === "premi" ? "#1565c0" : "#888", borderBottom: activeTab === "premi" ? "3px solid #1565c0" : "3px solid transparent", marginBottom: "-2px" }}
          >
            🏆 Premi
          </button>
        </div>

        {activeTab === "target" && (
          <>
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
                <input autoComplete="off"
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
                <input autoComplete="off"
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
                  <input autoComplete="off"
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
                  <input autoComplete="off"
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
                  <input autoComplete="off"
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
                  <input autoComplete="off"
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
                <input autoComplete="off"
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

              {/* Anticipi extra provvigioni */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px', marginTop: '8px' }}>
                <label style={styles.label}>Anticipi extra provvigioni</label>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 10px' }}>
                  Importi richiesti in anticipo al di fuori dell'anticipo mensile fisso. Vengono scalati dal conguaglio di fine anno.
                </p>
                {/* Lista anticipi esistenti */}
                {advances.map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', borderRadius: 8, padding: '8px 12px', marginBottom: 6, border: '1px solid #f1f5f9' }}>
                    <div>
                      <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>
                        {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(a.amount)}
                      </span>
                      {a.description && <span style={{ color: '#64748b', fontSize: 12, marginLeft: 8 }}>{a.description}</span>}
                      <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 8 }}>{new Date(a.advance_date).toLocaleDateString('it-IT')}</span>
                    </div>
                    <button onClick={() => void handleDeleteAdvance(a.id, a.amount)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#e53935' }}>🗑</button>
                  </div>
                ))}
                {advances.length > 0 && (
                  <p style={{ fontSize: 13, color: '#475569', fontWeight: 700, margin: '8px 0' }}>
                    Totale anticipi extra: {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(advancesTotal)}
                  </p>
                )}
                {/* Aggiungi nuovo anticipo */}
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <input
                    type="text" inputMode="decimal"
                    placeholder="Importo €"
                    value={newAdvanceAmount}
                    onChange={e => setNewAdvanceAmount(e.target.value)}
                    style={{ ...styles.input, width: 110, flex: 'none' }}
                  />
                  <input
                    type="text"
                    placeholder="Descrizione (opz.)"
                    value={newAdvanceDesc}
                    onChange={e => setNewAdvanceDesc(e.target.value)}
                    style={{ ...styles.input, flex: 1, minWidth: 120 }}
                  />
                  <button
                    onClick={() => void handleAddAdvance()}
                    disabled={addingAdvance || !newAdvanceAmount}
                    style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 13, flexShrink: 0 }}
                  >
                    + Aggiungi
                  </button>
                </div>
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
                  <input autoComplete="off"
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
          </>
        )}

        {activeTab === "premi" && <BonusesTab />}
      </div>

      {/* Section 4: Template messaggi globali */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>✏️ Template messaggi globali</h2>
        <p style={{ fontSize: "12px", color: "#64748b", marginTop: 0, marginBottom: "16px", lineHeight: 1.5 }}>
          Questi template si applicano a <strong>tutti i clienti</strong>. Se un cliente ha template personalizzati
          (configurabili dal tab Notifiche nella scheda cliente), quelli hanno la precedenza.
        </p>
        <NotificationTemplateEditor />
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
