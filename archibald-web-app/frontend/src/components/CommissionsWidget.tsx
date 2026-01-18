import { useState } from "react";

interface CommissionsWidgetProps {
  currentBudget: number;
  yearlyTarget: number;
  commissionRate: number; // 0.18 = 18%
  bonusAmount: number; // €5,000
  bonusInterval: number; // €75,000
  extraBudgetInterval: number; // €50,000
  extraBudgetReward: number; // €6,000
  monthlyAdvance: number; // €3,500
  currency: string; // "EUR"
  hideCommissions?: boolean; // Privacy mode
}

export function CommissionsWidget(props: CommissionsWidgetProps) {
  const {
    currentBudget,
    yearlyTarget,
    commissionRate,
    bonusAmount,
    bonusInterval,
    extraBudgetInterval,
    extraBudgetReward,
    monthlyAdvance,
    currency,
    hideCommissions = false,
  } = props;

  // Collapsible sections state
  const [showMaturated, setShowMaturated] = useState(false);
  const [showExtraBudget, setShowExtraBudget] = useState(false);
  const [showAdvance, setShowAdvance] = useState(false);

  // Privacy mode: hide all commission data
  if (hideCommissions) {
    return (
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "12px",
          padding: "20px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        <div style={{ textAlign: "center", color: "#95a5a6", padding: "40px 20px" }}>
          <p style={{ fontSize: "16px", marginBottom: "8px" }}>
            🔒 Dati provvigionali nascosti
          </p>
          <p style={{ fontSize: "14px", color: "#bdc3c7" }}>
            Puoi riabilitare la visualizzazione dal tuo profilo
          </p>
        </div>
      </div>
    );
  }

  // === CALCULATIONS ===

  // 1. Base Commission (18% of revenue)
  const baseCommission = currentBudget * commissionRate;

  // 2. Progressive Bonuses (€5k every €75k)
  const bonusCount = Math.floor(currentBudget / bonusInterval);
  const totalBonuses = bonusCount * bonusAmount;

  // 3. Extra-Budget Rewards (tiers above target)
  const extraBudget = Math.max(0, currentBudget - yearlyTarget);
  const extraTiers = Math.floor(extraBudget / extraBudgetInterval);
  const totalExtraRewards = extraTiers * extraBudgetReward;

  // 4. Total Commissions
  const totalCommissions = baseCommission + totalBonuses + totalExtraRewards;

  // 5. Next Bonus Progress
  const currentProgress = currentBudget % bonusInterval;
  const progressPercent = (currentProgress / bonusInterval) * 100;
  const remaining = bonusInterval - currentProgress;

  // 6. Advance vs Maturated
  const currentMonth = new Date().getMonth() + 1; // 1-12
  const advanceReceivedSoFar = monthlyAdvance * currentMonth;
  const annualAdvance = monthlyAdvance * 12;
  const settlement = totalCommissions - annualAdvance;

  // Currency formatter
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Color based on progress
  const getProgressColor = () => {
    if (progressPercent >= 71) return "#27ae60"; // Green
    if (progressPercent >= 31) return "#f39c12"; // Yellow
    return "#95a5a6"; // Gray
  };

  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: "12px",
        padding: "24px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        transition: "box-shadow 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.15)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: "20px", gap: "8px" }}>
        <span style={{ fontSize: "24px" }}>💰</span>
        <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "600", color: "#2c3e50" }}>
          Provvigioni & Premi
        </h3>
        <span
          style={{
            marginLeft: "auto",
            fontSize: "12px",
            color: "#7f8c8d",
            backgroundColor: "#ecf0f1",
            padding: "4px 8px",
            borderRadius: "4px",
          }}
        >
          {new Date().getFullYear()}
        </span>
      </div>

      {/* === HERO SECTION: Next Bonus Progress (Always Visible) === */}
      <div
        style={{
          backgroundColor: "#f8f9fa",
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <span style={{ fontSize: "16px", fontWeight: "600", color: "#2c3e50" }}>
            🎁 Prossimo Bonus Progressivo
          </span>
          <span style={{ fontSize: "18px", fontWeight: "bold", color: getProgressColor() }}>
            {formatCurrency(bonusAmount)}
          </span>
        </div>

        {/* Progress Bar */}
        <div
          style={{
            backgroundColor: "#e0e0e0",
            borderRadius: "8px",
            height: "24px",
            overflow: "hidden",
            marginBottom: "8px",
            position: "relative",
          }}
        >
          <div
            style={{
              backgroundColor: getProgressColor(),
              height: "100%",
              width: `${progressPercent}%`,
              transition: "width 0.3s ease-out",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: "12px", fontWeight: "600", color: "#fff" }}>
              {progressPercent.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Progress Labels */}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#7f8c8d", marginBottom: "12px" }}>
          <span>{formatCurrency(Math.floor(currentBudget / bonusInterval) * bonusInterval)}</span>
          <span>{formatCurrency((Math.floor(currentBudget / bonusInterval) + 1) * bonusInterval)}</span>
        </div>

        {/* Motivational Message */}
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: "6px",
            padding: "12px",
            border: "1px solid #e0e0e0",
          }}
        >
          <p style={{ margin: 0, fontSize: "14px", color: "#2c3e50", textAlign: "center" }}>
            {progressPercent >= 90 ? (
              <>
                <span style={{ fontSize: "16px", marginRight: "4px" }}>🔥</span>
                <strong>Ci sei quasi!</strong> Mancano solo {formatCurrency(remaining)}
              </>
            ) : progressPercent >= 50 ? (
              <>
                <span style={{ fontSize: "16px", marginRight: "4px" }}>💪</span>
                Ancora {formatCurrency(remaining)} per sbloccare il bonus!
              </>
            ) : (
              <>
                <span style={{ fontSize: "16px", marginRight: "4px" }}>🎯</span>
                Continua così! Mancano {formatCurrency(remaining)} al prossimo bonus.
              </>
            )}
          </p>
        </div>
      </div>

      {/* === COLLAPSIBLE SECTION 1: Total Commissions Maturated === */}
      <div style={{ marginBottom: "12px", borderTop: "1px solid #ecf0f1", paddingTop: "12px" }}>
        <button
          onClick={() => setShowMaturated(!showMaturated)}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "transparent",
            border: "none",
            padding: "8px 0",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "600",
            color: "#2c3e50",
          }}
        >
          <span>📊 Provvigioni Maturate</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px", color: "#27ae60" }}>
              {formatCurrency(totalCommissions)}
            </span>
            <span style={{ fontSize: "12px", color: "#7f8c8d" }}>
              {showMaturated ? "▼" : "▶"}
            </span>
          </div>
        </button>

        {showMaturated && (
          <div style={{ paddingLeft: "12px", paddingTop: "8px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                <span style={{ color: "#7f8c8d" }}>Provvigioni Base ({(commissionRate * 100).toFixed(0)}%)</span>
                <span style={{ color: "#2c3e50", fontWeight: "500" }}>{formatCurrency(baseCommission)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                <span style={{ color: "#7f8c8d" }}>Bonus Progressivi ({bonusCount}×{formatCurrency(bonusAmount)})</span>
                <span style={{ color: "#2c3e50", fontWeight: "500" }}>{formatCurrency(totalBonuses)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                <span style={{ color: "#7f8c8d" }}>Premi Extra-Budget ({extraTiers}×{formatCurrency(extraBudgetReward)})</span>
                <span style={{ color: "#2c3e50", fontWeight: "500" }}>{formatCurrency(totalExtraRewards)}</span>
              </div>
            </div>
            <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #ecf0f1", fontSize: "12px", color: "#95a5a6" }}>
              📊 Su {formatCurrency(currentBudget)} di fatturato
            </div>
          </div>
        )}
      </div>

      {/* === COLLAPSIBLE SECTION 2: Extra-Budget Tiers === */}
      <div style={{ marginBottom: "12px", borderTop: "1px solid #ecf0f1", paddingTop: "12px" }}>
        <button
          onClick={() => setShowExtraBudget(!showExtraBudget)}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "transparent",
            border: "none",
            padding: "8px 0",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "600",
            color: "#2c3e50",
          }}
        >
          <span>🏆 Premi Extra-Budget</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "14px", color: "#7f8c8d" }}>
              Tier {extraTiers}/4
            </span>
            <span style={{ fontSize: "12px", color: "#7f8c8d" }}>
              {showExtraBudget ? "▼" : "▶"}
            </span>
          </div>
        </button>

        {showExtraBudget && (
          <div style={{ paddingLeft: "12px", paddingTop: "8px" }}>
            {currentBudget >= yearlyTarget ? (
              <>
                <p style={{ fontSize: "13px", color: "#27ae60", marginBottom: "12px" }}>
                  Oltre il target: {formatCurrency(extraBudget)} (+{((extraBudget / yearlyTarget) * 100).toFixed(1)}%)
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {[1, 2, 3, 4].map((tier) => {
                    const tierThreshold = tier * extraBudgetInterval;
                    const tierReward = tier * extraBudgetReward;
                    const reached = extraBudget >= tierThreshold;
                    const active = !reached && tier === extraTiers + 1;

                    return (
                      <div
                        key={tier}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px",
                          backgroundColor: reached ? "#d5f4e6" : active ? "#fff3cd" : "#f8f9fa",
                          borderRadius: "6px",
                          border: `1px solid ${reached ? "#27ae60" : active ? "#f39c12" : "#e0e0e0"}`,
                        }}
                      >
                        <span style={{ fontSize: "16px" }}>
                          {reached ? "✅" : active ? "🎯" : "⚪"}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "13px", fontWeight: "600", color: "#2c3e50" }}>
                            Tier {tier} → {formatCurrency(tierReward)}
                          </div>
                          <div style={{ fontSize: "11px", color: "#7f8c8d" }}>
                            +{formatCurrency(tierThreshold)} oltre target
                          </div>
                        </div>
                        {reached && (
                          <span style={{ fontSize: "12px", color: "#27ae60", fontWeight: "600" }}>
                            RAGGIUNTO
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p style={{ fontSize: "13px", color: "#7f8c8d", margin: "8px 0" }}>
                Raggiungi il target annuale di {formatCurrency(yearlyTarget)} per sbloccare i premi extra-budget
              </p>
            )}
          </div>
        )}
      </div>

      {/* === COLLAPSIBLE SECTION 3: Advance vs Maturated === */}
      <div style={{ borderTop: "1px solid #ecf0f1", paddingTop: "12px" }}>
        <button
          onClick={() => setShowAdvance(!showAdvance)}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "transparent",
            border: "none",
            padding: "8px 0",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "600",
            color: "#2c3e50",
          }}
        >
          <span>💵 Anticipo vs Maturato</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                fontSize: "14px",
                color: settlement >= 0 ? "#27ae60" : "#e74c3c",
                fontWeight: "600",
              }}
            >
              {settlement >= 0 ? "+" : ""}{formatCurrency(settlement)}
            </span>
            <span style={{ fontSize: "12px", color: "#7f8c8d" }}>
              {showAdvance ? "▼" : "▶"}
            </span>
          </div>
        </button>

        {showAdvance && (
          <div style={{ paddingLeft: "12px", paddingTop: "8px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* Advance Bar */}
              <div>
                <div style={{ fontSize: "12px", color: "#7f8c8d", marginBottom: "4px" }}>
                  Anticipo ricevuto finora (gen-{new Date().toLocaleString("it-IT", { month: "short" })}):
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      flex: 1,
                      height: "8px",
                      backgroundColor: "#e0e0e0",
                      borderRadius: "4px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${(advanceReceivedSoFar / annualAdvance) * 100}%`,
                        backgroundColor: "#95a5a6",
                        transition: "width 0.3s ease-out",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: "14px", fontWeight: "600", color: "#2c3e50" }}>
                    {formatCurrency(advanceReceivedSoFar)}
                  </span>
                </div>
              </div>

              {/* Maturated Bar */}
              <div>
                <div style={{ fontSize: "12px", color: "#7f8c8d", marginBottom: "4px" }}>
                  Provvigioni maturate (oggi):
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      flex: 1,
                      height: "8px",
                      backgroundColor: "#e0e0e0",
                      borderRadius: "4px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min((totalCommissions / annualAdvance) * 100, 100)}%`,
                        backgroundColor: "#27ae60",
                        transition: "width 0.3s ease-out",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: "14px", fontWeight: "600", color: "#27ae60" }}>
                    {formatCurrency(totalCommissions)}
                  </span>
                </div>
              </div>

              {/* Settlement */}
              <div
                style={{
                  backgroundColor: settlement >= 0 ? "#d5f4e6" : "#ffe5e5",
                  borderRadius: "6px",
                  padding: "12px",
                  border: `1px solid ${settlement >= 0 ? "#27ae60" : "#e74c3c"}`,
                }}
              >
                <div style={{ fontSize: "13px", color: "#7f8c8d", marginBottom: "4px" }}>
                  Conguaglio stimato fine anno:
                </div>
                <div style={{ fontSize: "18px", fontWeight: "bold", color: settlement >= 0 ? "#27ae60" : "#e74c3c" }}>
                  {settlement >= 0 ? "+" : ""}{formatCurrency(settlement)} {settlement >= 0 ? "✅" : "⚠️"}
                </div>
                <div style={{ fontSize: "11px", color: "#95a5a6", marginTop: "4px" }}>
                  {settlement >= 0 ? "A tuo favore" : "Da restituire"}
                </div>
              </div>

              {/* Disclaimer */}
              <div style={{ fontSize: "11px", color: "#95a5a6", marginTop: "4px" }}>
                ⚠️ Ricorda: conguaglio finale a dicembre. Dati basati su proiezione attuale.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
