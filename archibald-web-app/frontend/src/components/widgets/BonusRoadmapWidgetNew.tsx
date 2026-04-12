import { useState, useEffect } from "react";
import { BonusRoadmapData } from "../../types/dashboard";
import { usePrivacy } from "../../contexts/PrivacyContext";
import { useConfettiCelebration } from "../../hooks/useConfettiCelebration";
import { formatCurrencyCompact } from "../../utils/format-currency";

interface BonusRoadmapWidgetNewProps {
  data: BonusRoadmapData;
}

export function BonusRoadmapWidgetNew({ data }: BonusRoadmapWidgetNewProps) {
  const { privacyEnabled, maskValue } = usePrivacy();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const completedBonuses = data.steps.filter((s) => s.status === "completed").length;
  const now = new Date();
  const bonusCelebrationKey = `bonus-fireworks-${now.getFullYear()}-${completedBonuses}`;

  useConfettiCelebration({
    enabled: completedBonuses > 0,
    key: bonusCelebrationKey,
    variant: "fireworks",
    cooldownMs: 24 * 60 * 60 * 1000,
  });

  const fmt = formatCurrencyCompact;

  const totalSpecialBonuses = data.specialBonuses.reduce((sum, b) => sum + b.amount, 0);
  const totalProgressiveBonuses = data.steps
    .filter((s) => s.status === "completed")
    .reduce((sum, s) => sum + s.bonusAmount, 0);
  const baseCommissions = data.balance.totalCommissionsMatured;
  const totalMaturato = baseCommissions + totalProgressiveBonuses + totalSpecialBonuses;

  const monthsElapsed = now.getMonth() + 1;

  if (privacyEnabled) {
    return (
      <div style={{ background: "#fff", borderRadius: "16px", padding: "30px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", textAlign: "center" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔒</div>
        <div style={{ fontSize: "16px", fontWeight: "600", color: "#7f8c8d" }}>Dati provvigionali nascosti</div>
        <div style={{ fontSize: "13px", color: "#95a5a6", marginTop: "8px" }}>Disattiva Privacy per visualizzare</div>
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", borderRadius: "16px", padding: isMobile ? "16px" : "24px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", overflow: "hidden" }}>

      {/* BLOCCO 1 — Hero totale maturato */}
      <div style={{ background: "linear-gradient(135deg,#1b5e20,#2e7d32)", borderRadius: "12px", padding: "16px", marginBottom: "14px", color: "#fff" }}>
        <div style={{ fontSize: "11px", opacity: 0.7, textTransform: "uppercase" as const, fontWeight: 600, marginBottom: "4px" }}>Provvigioni totali maturate {now.getFullYear()}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: isMobile ? "24px" : "32px", fontWeight: 900, letterSpacing: "-1px" }}>{maskValue(totalMaturato, "money")}</div>
            <div style={{ fontSize: "12px", opacity: 0.75, marginTop: "4px" }}>
              base {fmt(Math.max(0, baseCommissions))} · bonus {fmt(totalProgressiveBonuses)}
              {totalSpecialBonuses > 0 && ` · speciali ${fmt(totalSpecialBonuses)}`}
            </div>
          </div>
          <div style={{ textAlign: "right" as const }}>
            <div style={{ fontSize: "11px", opacity: 0.7, textTransform: "uppercase" as const, fontWeight: 600 }}>Fatturato {now.getFullYear()}</div>
            <div style={{ fontSize: "18px", fontWeight: 800 }}>{maskValue(data.currentYearRevenue, "money")}</div>
          </div>
        </div>
      </div>

      {/* BLOCCO 2 — Milestone ladder bonus progressivi */}
      <div style={{ marginBottom: "14px" }}>
        <div style={{ fontSize: "11px", color: "#888", fontWeight: 700, textTransform: "uppercase" as const, marginBottom: "8px" }}>🎁 Bonus progressivi (ogni {fmt(data.steps[0]?.threshold || 0)})</div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: "7px" }}>
          {data.steps.map((step, index) => {
            const isCompleted = step.status === "completed";
            const isActive = step.status === "active";
            const isLocked = step.status === "locked";
            const prevThreshold = index > 0 ? data.steps[index - 1].threshold : 0;
            const progressPct = isActive
              ? Math.min(100, Math.round(((data.currentYearRevenue - prevThreshold) / (step.threshold - prevThreshold)) * 100))
              : 0;
            const borderColor = isCompleted ? "#27ae60" : isActive ? "#f57c00" : "#e0e0e0";
            const bg = isCompleted ? "#e8f5e9" : isActive ? "#fff8e1" : "#f5f5f5";
            const opacity = isLocked ? (index === data.steps.length - 1 ? 0.35 : 0.55) : 1;

            return (
              <div key={index} style={{ background: bg, border: `2px solid ${borderColor}`, borderRadius: "8px", padding: "9px", textAlign: "center" as const, position: "relative" as const, opacity, minWidth: 0, overflow: "hidden" }}>
                {(isCompleted || isActive) && (
                  <div style={{ position: "absolute" as const, top: "-8px", left: "50%", transform: "translateX(-50%)", background: borderColor, color: "#fff", fontSize: "9px", fontWeight: 700, padding: "2px 7px", borderRadius: "10px", whiteSpace: "nowrap" as const }}>
                    {isCompleted ? "✅ RAGGIUNTO" : "🔥 IN CORSO"}
                  </div>
                )}
                <div style={{ marginTop: isCompleted || isActive ? "6px" : "14px", fontSize: "10px", color: "#555", fontWeight: 600 }}>Bonus #{index + 1}</div>
                <div style={{ fontSize: "15px", fontWeight: 800, color: isCompleted ? "#1b5e20" : isActive ? "#e65100" : "#bbb" }}>{step.label}</div>
                {isActive ? (
                  <>
                    <div style={{ fontSize: "11px", color: "#f57c00", fontWeight: 600 }}>mancano {fmt(data.missingToNextBonus)}</div>
                    <div style={{ background: "#e0e0e0", borderRadius: "3px", height: "4px", marginTop: "5px", overflow: "hidden" }}>
                      <div style={{ background: "#f57c00", width: `${progressPct}%`, height: "100%", borderRadius: "3px" }} />
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: "12px", color: isCompleted ? "#27ae60" : "#bbb", fontWeight: 700 }}>{step.bonusLabel}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* BLOCCO 3 — Premi extra-budget */}
      <div style={{ marginBottom: "14px" }}>
        <div style={{ fontSize: "11px", color: "#888", fontWeight: 700, textTransform: "uppercase" as const, marginBottom: "8px" }}>🏆 Premi extra-budget (oltre target annuale)</div>
        {!data.extraBudget.visible ? (
          <div style={{ background: "#f9f9f9", border: "1px solid #e8e8e8", borderRadius: "8px", padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <span style={{ fontSize: "20px" }}>🔒</span>
              <div>
                <div style={{ fontSize: "13px", color: "#555", fontWeight: 600 }}>Target annuale non ancora raggiunto</div>
                <div style={{ fontSize: "12px", color: "#999", marginTop: "1px" }}>
                  Mancano <strong style={{ color: "#e65100" }}>{fmt(data.extraBudget.missingToNextStep)}</strong> al target — premi disponibili da {fmt(data.extraBudget.yearlyTarget)}
                </div>
              </div>
            </div>
            <div style={{ background: "#e0e0e0", borderRadius: "4px", height: "6px", marginBottom: "8px", overflow: "hidden" }}>
              <div style={{ background: "linear-gradient(90deg,#43a047,#1b5e20)", width: `${Math.min(100, Math.round((data.currentYearRevenue / data.extraBudget.yearlyTarget) * 100))}%`, height: "100%", borderRadius: "4px" }} />
            </div>
            <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "12px" }}>
              {fmt(data.currentYearRevenue)} su {fmt(data.extraBudget.yearlyTarget)} ({Math.round((data.currentYearRevenue / data.extraBudget.yearlyTarget) * 100)}%)
            </div>
            <div style={{ fontSize: "10px", color: "#bbb", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: "8px" }}>Premi disponibili al raggiungimento:</div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: "6px" }}>
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} style={{ background: "#fff", border: "1px dashed #d0d0d0", borderRadius: "8px", padding: "8px", textAlign: "center" as const, opacity: 0.7 - i * 0.1, minWidth: 0, overflow: "hidden" }}>
                  <div style={{ fontSize: "9px", color: "#bbb", fontWeight: 600, marginBottom: "2px" }}>Tier {i + 1}</div>
                  <div style={{ fontSize: "13px", fontWeight: 800, color: "#ccc" }}>+{fmt(data.extraBudget.extraBudgetReward * (i + 1))}</div>
                  <div style={{ fontSize: "10px", color: "#ddd" }}>oltre {fmt(data.extraBudget.yearlyTarget + data.extraBudget.extraBudgetInterval * i)}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: "7px" }}>
            {Array.from({ length: 4 }, (_, i) => {
              const achieved = i < data.extraBudget.extraBonuses;
              const tierReward = data.extraBudget.extraBonusesAmount > 0 && data.extraBudget.extraBonuses > 0
                ? (data.extraBudget.extraBonusesAmount / data.extraBudget.extraBonuses) * (i + 1)
                : 0;
              return (
                <div key={i} style={{ background: achieved ? "#e8f5e9" : "#f5f5f5", border: `2px solid ${achieved ? "#27ae60" : "#e0e0e0"}`, borderRadius: "8px", padding: "9px", textAlign: "center" as const, opacity: achieved ? 1 : 0.6, minWidth: 0, overflow: "hidden" }}>
                  <div style={{ fontSize: "10px", color: "#555", fontWeight: 600 }}>Tier {i + 1}</div>
                  <div style={{ fontSize: "13px", fontWeight: 800, color: achieved ? "#1b5e20" : "#bbb" }}>+{fmt(data.extraBudget.extraBudgetReward * (i + 1))}</div>
                  <div style={{ fontSize: "11px", color: achieved ? "#27ae60" : "#bbb", fontWeight: 700 }}>{tierReward > 0 ? `+${fmt(tierReward)}` : ""}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* BLOCCO 4 — Premi speciali */}
      {data.specialBonuses.length > 0 && (
        <div style={{ marginBottom: "14px" }}>
          <div style={{ fontSize: "11px", color: "#888", fontWeight: 700, textTransform: "uppercase" as const, marginBottom: "8px" }}>⭐ Premi speciali</div>
          {data.specialBonuses.map((bonus) => (
            <div key={bonus.id} style={{ display: "flex", alignItems: "center", background: "#fff8e1", borderRadius: "8px", padding: "10px 14px", gap: "10px", marginBottom: "6px" }}>
              <span style={{ fontSize: "20px" }}>🎁</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: "#2c3e50", fontSize: "13px" }}>{bonus.title}</div>
                <div style={{ fontSize: "11px", color: "#888" }}>{new Date(bonus.receivedAt).toLocaleDateString("it-IT")}</div>
              </div>
              <div style={{ fontSize: "16px", fontWeight: 800, color: "#e65100" }}>+{fmt(bonus.amount)}</div>
            </div>
          ))}
          <div style={{ textAlign: "right" as const, fontSize: "12px", color: "#1565c0", cursor: "pointer" }}>
            + Gestisci premi nel Profilo →
          </div>
        </div>
      )}

      {/* BLOCCO 5 — Anticipo vs Provvigioni */}
      <div style={{ borderTop: "2px solid #f0f0f0", paddingTop: "14px" }}>
        <div style={{ fontSize: "11px", color: "#888", fontWeight: 700, textTransform: "uppercase" as const, marginBottom: "10px" }}>💵 Anticipo vs Provvigioni maturate</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px", minWidth: 0 }}>
          <div style={{ background: "#f5f5f5", borderRadius: "8px", padding: "10px" }}>
            <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Anticipo ricevuto (gen–{new Date(0, monthsElapsed - 1).toLocaleString("it-IT", { month: "short" })})</div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#2c3e50" }}>{maskValue(data.balance.totalAdvancePaid, "money")}</div>
            <div style={{ background: "#e0e0e0", borderRadius: "3px", height: "6px", marginTop: "6px", overflow: "hidden" }}>
              <div style={{ background: "#95a5a6", width: `${Math.min(100, Math.round((monthsElapsed / 12) * 100))}%`, height: "100%", borderRadius: "3px" }} />
            </div>
            <div style={{ fontSize: "11px", color: "#aaa", marginTop: "3px" }}>{monthsElapsed}/12 mesi</div>
          </div>
          <div style={{ background: "#e8f5e9", borderRadius: "8px", padding: "10px" }}>
            <div style={{ fontSize: "11px", color: "#555", marginBottom: "4px" }}>Provvigioni maturate</div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#1b5e20" }}>{maskValue(data.balance.totalCommissionsMatured, "money")}</div>
            <div style={{ background: "#c8e6c9", borderRadius: "3px", height: "6px", marginTop: "6px", overflow: "hidden" }}>
              <div style={{ background: "#27ae60", width: `${Math.min(100, Math.round((data.balance.totalCommissionsMatured / Math.max(1, data.balance.totalAdvancePaid * 12 / monthsElapsed)) * 100))}%`, height: "100%", borderRadius: "3px" }} />
            </div>
            <div style={{ fontSize: "11px", color: "#888", marginTop: "3px" }}>vs anticipo annuale</div>
          </div>
        </div>
        <div style={{ background: data.balance.balanceStatus === "positive" ? "#e8f5e9" : "#fce4ec", border: `1px solid ${data.balance.balanceStatus === "positive" ? "#27ae60" : "#e91e63"}`, borderRadius: "8px", padding: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "11px", color: "#555", marginBottom: "2px" }}>Conguaglio stimato a dicembre</div>
            <div style={{ fontSize: "11px", color: "#aaa" }}>⚠️ Proiezione — dati aggiornati in tempo reale</div>
          </div>
          <div style={{ textAlign: "right" as const }}>
            <div style={{ fontSize: "22px", fontWeight: 900, color: data.balance.balanceStatus === "positive" ? "#1b5e20" : "#c62828" }}>
              {data.balance.balance >= 0 ? "+" : ""}{maskValue(data.balance.balance, "money")}
            </div>
            <div style={{ fontSize: "11px", color: data.balance.balanceStatus === "positive" ? "#27ae60" : "#e91e63", fontWeight: 600 }}>
              {data.balance.balanceStatus === "positive" ? "a tuo favore ✅" : "scoperto ⚠️"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
