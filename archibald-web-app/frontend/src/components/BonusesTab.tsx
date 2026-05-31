import { useState, useEffect } from "react";
import type React from "react";
import {
  getSpecialBonuses, createSpecialBonus, deleteSpecialBonus,
  getBonusConditions, createBonusCondition, achieveBonusCondition, deleteBonusCondition,
} from "../services/bonuses.service";
import type { SpecialBonus, BonusCondition } from "../services/bonuses.service";

const inputStyle: React.CSSProperties = { border: "1px solid #ddd", borderRadius: "6px", padding: "6px 10px", fontSize: "13px", outline: "none" };
const btnStyle: React.CSSProperties = { background: "#1565c0", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 14px", fontSize: "12px", cursor: "pointer", fontWeight: 600 };
const deleteBtnStyle: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: "#e53935" };

export function BonusesTab() {
  const [specialBonuses, setSpecialBonuses] = useState<SpecialBonus[]>([]);
  const [conditions, setConditions] = useState<BonusCondition[]>([]);
  const [loadingSpecial, setLoadingSpecial] = useState(true);
  const [loadingConditions, setLoadingConditions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentYearRevenue, setCurrentYearRevenue] = useState(0);

  const [newTitle, setNewTitle] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDate, setNewDate] = useState("");
  const [addingSpecial, setAddingSpecial] = useState(false);

  const [condTitle, setCondTitle] = useState("");
  const [condReward, setCondReward] = useState("");
  const [condType, setCondType] = useState<"manual" | "budget" | "percent_revenue">("manual");
  const [condThreshold, setCondThreshold] = useState("");
  const [condPercentRate, setCondPercentRate] = useState("");
  const [condDeadline, setCondDeadline] = useState("");
  const [addingCondition, setAddingCondition] = useState(false);

  useEffect(() => {
    getSpecialBonuses()
      .then(setSpecialBonuses)
      .catch(() => setError("Errore caricamento premi speciali"))
      .finally(() => setLoadingSpecial(false));
    getBonusConditions()
      .then(setConditions)
      .catch(() => setError("Errore caricamento condizioni"))
      .finally(() => setLoadingConditions(false));
    // Fetch fatturato anno corrente per progress bar
    const token = localStorage.getItem('archibald_jwt') ?? '';
    fetch('/api/users/me/current-revenue', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json() as Promise<{ data: { currentYearRevenue: number } }>)
      .then(b => setCurrentYearRevenue(b.data.currentYearRevenue))
      .catch(() => null);
  }, []);

  async function handleAddSpecialBonus() {
    if (!newTitle || !newAmount || !newDate) return;
    setAddingSpecial(true);
    try {
      const bonus = await createSpecialBonus({ title: newTitle, amount: parseFloat(newAmount), receivedAt: newDate });
      setSpecialBonuses((prev) => [bonus, ...prev]);
      setNewTitle("");
      setNewAmount("");
      setNewDate("");
    } catch {
      setError("Errore aggiunta premio");
    } finally {
      setAddingSpecial(false);
    }
  }

  async function handleDeleteSpecialBonus(id: number) {
    try {
      await deleteSpecialBonus(id);
      setSpecialBonuses((prev) => prev.filter((b) => b.id !== id));
    } catch {
      setError("Errore eliminazione premio");
    }
  }

  async function handleAddCondition() {
    if (!condTitle || !condReward) return;
    if ((condType === "budget" || condType === "percent_revenue") && !condThreshold) return;
    if (condType === "percent_revenue" && !condPercentRate) return;
    setAddingCondition(true);
    try {
      const cond = await createBonusCondition({
        title: condTitle,
        rewardAmount: parseFloat(condReward) || 0,
        conditionType: condType,
        budgetThreshold: condType !== "manual" ? parseFloat(condThreshold) : undefined,
        percentRevenueRate: condType === "percent_revenue" ? parseFloat(condPercentRate) / 100 : undefined,
        deadline: condDeadline || undefined,
      });
      setConditions((prev) => [...prev, cond]);
      setCondTitle("");
      setCondReward("");
      setCondPercentRate("");
      setCondDeadline("");
      setCondThreshold("");
      setCondType("manual");
    } catch {
      setError("Errore aggiunta condizione");
    } finally {
      setAddingCondition(false);
    }
  }

  async function handleAchieveCondition(id: number) {
    try {
      const updated = await achieveBonusCondition(id);
      setConditions((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch {
      setError("Errore aggiornamento condizione");
    }
  }

  async function handleDeleteCondition(id: number) {
    try {
      await deleteBonusCondition(id);
      setConditions((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setError("Errore eliminazione condizione");
    }
  }

  return (
    <div>
      {error && (
        <div style={{ background: "#fce4ec", color: "#c62828", padding: "10px", borderRadius: "8px", marginBottom: "14px", fontSize: "13px" }}>
          {error}
        </div>
      )}

      <div style={{ fontWeight: 700, fontSize: "11px", color: "#888", textTransform: "uppercase", marginBottom: "8px" }}>Premi speciali ricevuti</div>
      <div style={{ border: "1px solid #e0e0e0", borderRadius: "8px", overflow: "hidden", marginBottom: "24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 40px", background: "#f5f5f5", padding: "6px 10px", fontSize: "11px", color: "#888", fontWeight: 700, textTransform: "uppercase", gap: "8px" }}>
          <span>Descrizione</span><span style={{ textAlign: "right" }}>Importo</span><span style={{ textAlign: "right" }}>Data</span><span />
        </div>

        {loadingSpecial ? (
          <div style={{ padding: "16px", textAlign: "center", color: "#aaa", fontSize: "13px" }}>Caricamento...</div>
        ) : specialBonuses.length === 0 ? (
          <div style={{ padding: "12px 10px", color: "#aaa", fontSize: "13px", fontStyle: "italic" }}>Nessun premio speciale registrato</div>
        ) : (
          specialBonuses.map((bonus) => (
            <div key={bonus.id} style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 40px", padding: "8px 10px", gap: "8px", borderTop: "1px solid #eee", alignItems: "center" }}>
              <span style={{ fontSize: "13px" }}>{bonus.title}</span>
              <span style={{ fontWeight: 700, color: "#e65100", textAlign: "right", whiteSpace: "nowrap" }}>€ {bonus.amount.toLocaleString("it-IT")}</span>
              <span style={{ color: "#888", textAlign: "right", fontSize: "12px" }}>{new Date(bonus.receivedAt).toLocaleDateString("it-IT")}</span>
              <button style={deleteBtnStyle} onClick={() => handleDeleteSpecialBonus(bonus.id)} title="Elimina">🗑</button>
            </div>
          ))
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 40px", padding: "8px 10px", gap: "8px", borderTop: "1px solid #eee", background: "#fafafa", alignItems: "center" }}>
          <input style={inputStyle} placeholder="Es. Premio fiera Bologna…" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <input style={{ ...inputStyle, textAlign: "right" }} placeholder="€ 0" type="text" inputMode="decimal"value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
          <input style={inputStyle} type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <button style={{ ...btnStyle, padding: "6px 8px" }} onClick={handleAddSpecialBonus} disabled={addingSpecial}>＋</button>
        </div>
      </div>

      <div style={{ fontWeight: 700, fontSize: "11px", color: "#888", textTransform: "uppercase", marginBottom: "8px" }}>Condizioni obiettivo</div>
      <div style={{ border: "1px solid #e0e0e0", borderRadius: "8px", overflow: "hidden", marginBottom: "24px" }}>
        {loadingConditions ? (
          <div style={{ padding: "16px", textAlign: "center", color: "#aaa", fontSize: "13px" }}>Caricamento...</div>
        ) : conditions.length === 0 ? (
          <div style={{ padding: "12px 10px", color: "#aaa", fontSize: "13px", fontStyle: "italic" }}>Nessuna condizione obiettivo</div>
        ) : (
          conditions.map((cond) => {
            const isExpired = cond.deadline && !cond.isAchieved && new Date(cond.deadline) < new Date();
            const progress = cond.budgetThreshold ? Math.min(1, currentYearRevenue / cond.budgetThreshold) : 0;
            const percentReward = cond.conditionType === "percent_revenue" && cond.budgetThreshold && cond.percentRevenueRate
              ? Math.max(0, (currentYearRevenue - cond.budgetThreshold)) * cond.percentRevenueRate
              : null;
            return (
              <div key={cond.id} style={{ padding: "12px", borderBottom: "1px solid #f1f5f9", background: cond.isAchieved ? "#f0fdf4" : isExpired ? "#fefce8" : "white" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>{cond.title}</span>
                      {/* Tipo badge */}
                      <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "10px",
                        background: cond.conditionType === "budget" ? "#dbeafe" : cond.conditionType === "percent_revenue" ? "#fef3c7" : "#f3e8ff",
                        color: cond.conditionType === "budget" ? "#1d4ed8" : cond.conditionType === "percent_revenue" ? "#92400e" : "#7c3aed" }}>
                        {cond.conditionType === "budget" ? "🎯 Budget soglia" : cond.conditionType === "percent_revenue" ? "📊 % Fatturato" : "✋ Manuale"}
                      </span>
                      {/* Stato badge */}
                      {cond.isAchieved ? (
                        <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "10px", background: "#dcfce7", color: "#16a34a" }}>✅ RAGGIUNTA</span>
                      ) : isExpired ? (
                        <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "10px", background: "#fef9c3", color: "#854d0e" }}>⏰ SCADUTA</span>
                      ) : (
                        <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "10px", background: "#f1f5f9", color: "#64748b" }}>▶ IN CORSO</span>
                      )}
                    </div>
                    {/* Soglia e dettagli */}
                    {cond.budgetThreshold !== null && (
                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: 4 }}>
                        Soglia: €{cond.budgetThreshold.toLocaleString("it-IT")}
                        {cond.conditionType === "percent_revenue" && cond.percentRevenueRate && (
                          <span> · Tasso: {(cond.percentRevenueRate * 100).toFixed(2)}% · Premio stimato: <strong style={{ color: "#d97706" }}>€{(percentReward ?? 0).toLocaleString("it-IT", { maximumFractionDigits: 0 })}</strong></span>
                        )}
                      </div>
                    )}
                    {/* Progress bar per budget/percent_revenue */}
                    {!cond.isAchieved && cond.budgetThreshold && currentYearRevenue > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ height: 6, borderRadius: 3, background: "#e2e8f0", overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 3, width: `${(progress * 100).toFixed(1)}%`, background: progress >= 1 ? "#16a34a" : "#2563eb", transition: "width 0.3s" }} />
                        </div>
                        <div style={{ fontSize: "11px", color: "#64748b", marginTop: 2 }}>
                          €{currentYearRevenue.toLocaleString("it-IT", { maximumFractionDigits: 0 })} / €{cond.budgetThreshold.toLocaleString("it-IT")} ({(progress * 100).toFixed(0)}%)
                        </div>
                      </div>
                    )}
                    {/* Scadenza */}
                    {cond.deadline && (
                      <div style={{ fontSize: "11px", color: isExpired ? "#854d0e" : "#94a3b8", marginTop: 4 }}>
                        ⏱ Scade il {new Date(cond.deadline).toLocaleDateString("it-IT")}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 800, color: "#16a34a", fontSize: 15 }}>
                        +€{cond.conditionType === "percent_revenue" ? (percentReward ?? cond.rewardAmount).toLocaleString("it-IT", { maximumFractionDigits: 0 }) : cond.rewardAmount.toLocaleString("it-IT")}
                      </div>
                      {cond.conditionType === "percent_revenue" && <div style={{ fontSize: 10, color: "#94a3b8" }}>stimato</div>}
                    </div>
                    {!cond.isAchieved && (
                      <button style={{ ...btnStyle, fontSize: "10px", padding: "4px 10px", background: "#16a34a" }} onClick={() => handleAchieveCondition(cond.id)}>✓</button>
                    )}
                    <button style={deleteBtnStyle} onClick={() => handleDeleteCondition(cond.id)} title="Elimina">🗑</button>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Form aggiungi condizione */}
        <div style={{ padding: "12px", borderTop: "1px solid #eee", background: "#fafafa" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "8px", marginBottom: "8px", alignItems: "center" }}>
            <input style={inputStyle} placeholder="Titolo obiettivo…" value={condTitle} onChange={(e) => setCondTitle(e.target.value)} />
            <input style={{ ...inputStyle, width: 100, textAlign: "right" }} placeholder="Premio €" type="text" inputMode="decimal" value={condReward} onChange={(e) => setCondReward(e.target.value)} />
            <select style={{ ...inputStyle, width: 150 }} value={condType} onChange={(e) => setCondType(e.target.value as typeof condType)}>
              <option value="manual">✋ Manuale</option>
              <option value="budget">🎯 Budget soglia</option>
              <option value="percent_revenue">📊 % Fatturato</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            {(condType === "budget" || condType === "percent_revenue") && (
              <input style={{ ...inputStyle, flex: 1, minWidth: 120 }} placeholder="Soglia fatturato €" type="text" inputMode="decimal" value={condThreshold} onChange={(e) => setCondThreshold(e.target.value)} />
            )}
            {condType === "percent_revenue" && (
              <input style={{ ...inputStyle, width: 120 }} placeholder="Tasso % (es. 0.5)" type="text" inputMode="decimal" value={condPercentRate} onChange={(e) => setCondPercentRate(e.target.value)} />
            )}
            <input style={{ ...inputStyle, width: 140 }} type="date" value={condDeadline} onChange={(e) => setCondDeadline(e.target.value)} title="Scadenza (opzionale)" />
          </div>
          {condType === "percent_revenue" && (
            <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 8px" }}>
              Premio = (fatturato - soglia) × tasso%. Es: €{((parseFloat(condThreshold||"0") * 1.1 - parseFloat(condThreshold||"0")) * (parseFloat(condPercentRate||"0")/100)).toFixed(0)} su +10% sopra soglia.
            </p>
          )}
          <button style={btnStyle} onClick={handleAddCondition} disabled={addingCondition}>＋ Aggiungi condizione</button>
        </div>
      </div>
    </div>
  );
}
