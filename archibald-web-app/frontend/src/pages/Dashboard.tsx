import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { BudgetWidget } from "../components/BudgetWidget";
import { OrdersSummaryWidget } from "../components/OrdersSummaryWidget";
import { TargetVisualizationWidget } from "../components/TargetVisualizationWidget";

export function Dashboard() {
  const auth = useAuth();
  const [targetData, setTargetData] = useState<{
    monthlyTarget: number;
    currency: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTarget = async () => {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(
          "http://localhost:3000/api/users/me/target",
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setTargetData(data);
        } else {
          console.error(
            "[Dashboard] Failed to load target:",
            await response.text()
          );
        }
      } catch (error) {
        console.error("[Dashboard] Target fetch error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTarget();
  }, []);

  if (loading) {
    return (
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "20px",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: "18px", color: "#7f8c8d" }}>
          Caricamento dashboard...
        </p>
      </div>
    );
  }

  if (!targetData) {
    return (
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "20px",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: "18px", color: "#e74c3c" }}>
          Errore nel caricare il target.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "20px",
      }}
    >
      {/* Header Section */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "30px",
          flexWrap: "wrap",
          gap: "15px",
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 5px 0", fontSize: "28px", fontWeight: "600" }}>
            Dashboard
          </h1>
          <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>
            Benvenuto, {auth.user?.fullName}
          </p>
        </div>
      </div>

      {/* Widget Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: "20px",
        }}
        className="dashboard-grid"
      >
        {/* Budget Widget */}
        <BudgetWidget
          currentBudget={0}
          targetBudget={targetData.monthlyTarget}
          currency={targetData.currency}
        />

        {/* Orders Summary Widget */}
        <OrdersSummaryWidget todayCount={3} weekCount={12} monthCount={45} />

        {/* Target Visualization Widget */}
        <TargetVisualizationWidget
          currentProgress={0}
          targetDescription="Target Mensile"
          periodLabel={new Date().toLocaleDateString("it-IT", {
            month: "long",
            year: "numeric",
          })}
        />
      </div>

      {/* Responsive Grid Media Query via inline style tag */}
      <style>{`
        @media (min-width: 768px) {
          .dashboard-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
