import { useState, useEffect } from "react";
import {
  getSpecialBonuses, createSpecialBonus, deleteSpecialBonus,
  getBonusConditions, createBonusCondition, achieveBonusCondition, deleteBonusCondition,
} from "../services/bonuses.service";
import type { SpecialBonus, BonusCondition } from "../services/bonuses.service";

export function BonusesTab() {
  const [specialBonuses, setSpecialBonuses] = useState<SpecialBonus[]>([]);
  const [conditions, setConditions] = useState<BonusCondition[]>([]);
  const [loadingSpecial, setLoadingSpecial] = useState(true);
  const [loadingConditions, setLoadingConditions] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state — special bonus
  const [newTitle, setNewTitle] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDate, setNewDate] = useState("");
  const [addingSpecial, setAddingSpecial] = useState(false);

  // Form state — condition
  const [condTitle, setCondTitle] = useState("");
  const [condReward, setCondReward] = useState("");
  const [condType, setCondType] = useState<"manual" | "budget">("manual");
  const [condThreshold, setCondThreshold] = useState("");
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
    if (condType === "budget" && !condThreshold) return;
    setAddingCondition(true);
    try {
      const cond = await createBonusCondition({
        title: condTitle,
        rewardAmount: parseFloat(condReward),
        conditionType: condType,
        budgetThreshold: condType === "budget" ? parseFloat(condThreshold) : undefined,
      });
      setConditions((prev) => [...prev, cond]);
      setCondTitle("");
      setCondReward("");
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

  const inputStyle: React.CSSProperties = { border: "1px solid #ddd", borderRadius: "6px", padding: "6px 10px", fontSize: "13px", outline: "none" };
  const btnStyle: React.CSSProperties = { background: "#1565c0", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 14px", fontSize: "12px", cursor: "pointer", fontWeight: 600 };
  const deleteBtnStyle: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: "#e53935" };

  return (
    <div>
      {error && (
        <div style={{ background: "#fce4ec", color: "#c62828", padding: "10px", borderRadius: "8px", marginBottom: "14px", fontSize: "13px" }}>
          {error}
        </div>
      )}

      {/* Sezione 1: Premi speciali */}
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

        {/* Riga aggiunta */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 40px", padding: "8px 10px", gap: "8px", borderTop: "1px solid #eee", background: "#fafafa", alignItems: "center" }}>
          <input style={inputStyle} placeholder="Es. Premio fiera Bologna…" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <input style={{ ...inputStyle, textAlign: "right" }} placeholder="€ 0" type="number" min="0" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
          <input style={inputStyle} type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <button style={{ ...btnStyle, padding: "6px 8px" }} onClick={handleAddSpecialBonus} disabled={addingSpecial}>＋</button>
        </div>
      </div>

      {/* Sezione 2: Condizioni obiettivo */}
      <div style={{ fontWeight: 700, fontSize: "11px", color: "#888", textTransform: "uppercase", marginBottom: "8px" }}>Condizioni obiettivo</div>
      <div style={{ border: "1px solid #e0e0e0", borderRadius: "8px", overflow: "hidden", marginBottom: "24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 100px 80px 40px", background: "#f5f5f5", padding: "6px 10px", fontSize: "11px", color: "#888", fontWeight: 700, textTransform: "uppercase", gap: "8px" }}>
          <span>Obiettivo</span><span style={{ textAlign: "center" }}>Tipo</span><span style={{ textAlign: "right" }}>Premio</span><span style={{ textAlign: "center" }}>Stato</span><span />
        </div>

        {loadingConditions ? (
          <div style={{ padding: "16px", textAlign: "center", color: "#aaa", fontSize: "13px" }}>Caricamento...</div>
        ) : conditions.length === 0 ? (
          <div style={{ padding: "12px 10px", color: "#aaa", fontSize: "13px", fontStyle: "italic" }}>Nessuna condizione obiettivo</div>
        ) : (
          conditions.map((cond) => (
            <div key={cond.id} style={{ display: "grid", gridTemplateColumns: "1fr 70px 100px 80px 40px", padding: "8px 10px", gap: "8px", borderTop: "1px solid #eee", alignItems: "center", background: cond.isAchieved ? "#f1f8e9" : "white" }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600 }}>{cond.title}</div>
                {cond.conditionType === "budget" && cond.budgetThreshold !== null && (
                  <div style={{ fontSize: "11px", color: "#888" }}>Soglia: €{cond.budgetThreshold.toLocaleString("it-IT")}</div>
                )}
              </div>
              <div style={{ textAlign: "center" }}>
                <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "10px", background: cond.conditionType === "budget" ? "#e3f2fd" : "#f3e5f5", color: cond.conditionType === "budget" ? "#1565c0" : "#7b1fa2" }}>
                  {cond.conditionType === "budget" ? "Auto" : "Manuale"}
                </span>
              </div>
              <div style={{ textAlign: "right", fontWeight: 700, color: "#27ae60" }}>+€{cond.rewardAmount.toLocaleString("it-IT")}</div>
              <div style={{ textAlign: "center" }}>
                {cond.isAchieved ? (
                  <span style={{ fontSize: "18px" }}>✅</span>
                ) : cond.conditionType === "manual" ? (
                  <button style={{ ...btnStyle, fontSize: "10px", padding: "3px 8px", background: "#4caf50" }} onClick={() => handleAchieveCondition(cond.id)}>Segna ✓</button>
                ) : (
                  <span style={{ fontSize: "11px", color: "#aaa" }}>Auto</span>
                )}
              </div>
              <button style={deleteBtnStyle} onClick={() => handleDeleteCondition(cond.id)} title="Elimina">🗑</button>
            </div>
          ))
        )}

        {/* Riga aggiunta condizione */}
        <div style={{ padding: "10px", borderTop: "1px solid #eee", background: "#fafafa" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px", gap: "8px", marginBottom: "6px" }}>
            <input style={inputStyle} placeholder="Titolo condizione…" value={condTitle} onChange={(e) => setCondTitle(e.target.value)} />
            <input style={{ ...inputStyle, textAlign: "right" }} placeholder="Premio €" type="number" min="0" value={condReward} onChange={(e) => setCondReward(e.target.value)} />
            <select style={inputStyle} value={condType} onChange={(e) => setCondType(e.target.value as "manual" | "budget")}>
              <option value="manual">Manuale</option>
              <option value="budget">Budget soglia</option>
            </select>
          </div>
          {condType === "budget" && (
            <div style={{ marginBottom: "6px" }}>
              <input style={{ ...inputStyle, width: "160px" }} placeholder="Soglia budget €" type="number" min="0" value={condThreshold} onChange={(e) => setCondThreshold(e.target.value)} />
            </div>
          )}
          <button style={btnStyle} onClick={handleAddCondition} disabled={addingCondition}>＋ Aggiungi condizione</button>
        </div>
      </div>
    </div>
  );
}
