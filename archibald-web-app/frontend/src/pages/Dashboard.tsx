import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { BudgetWidget } from "../components/BudgetWidget";
import { OrdersSummaryWidget } from "../components/OrdersSummaryWidget";
import { CommissionsWidget } from "../components/CommissionsWidget";

export function Dashboard() {
  const auth = useAuth();
  const [targetData, setTargetData] = useState<{
    monthlyTarget: number;
    yearlyTarget: number;
    currency: string;
    commissionRate: number;
    bonusAmount: number;
    bonusInterval: number;
    extraBudgetInterval: number;
    extraBudgetReward: number;
    monthlyAdvance: number;
    hideCommissions: boolean;
  } | null>(null);
  const [budgetData, setBudgetData] = useState<{
    currentBudget: number;
    progress: number;
  } | null>(null);
  const [orderMetrics, setOrderMetrics] = useState<{
    todayCount: number;
    weekCount: number;
    monthCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const [targetRes, budgetRes, ordersRes] = await Promise.all([
          fetch("http://localhost:3000/api/users/me/target", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("http://localhost:3000/api/metrics/budget", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("http://localhost:3000/api/metrics/orders", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (targetRes.ok) {
          const data = await targetRes.json();
          setTargetData(data);
        } else {
          console.error(
            "[Dashboard] Failed to load target:",
            await targetRes.text(),
          );
        }

        if (budgetRes.ok) {
          const data = await budgetRes.json();
          setBudgetData({
            currentBudget: data.currentBudget,
            progress: data.progress,
          });
        } else {
          console.error(
            "[Dashboard] Failed to load budget metrics:",
            await budgetRes.text(),
          );
        }

        if (ordersRes.ok) {
          const data = await ordersRes.json();
          setOrderMetrics({
            todayCount: data.todayCount,
            weekCount: data.weekCount,
            monthCount: data.monthCount,
          });
        } else {
          console.error(
            "[Dashboard] Failed to load order metrics:",
            await ordersRes.text(),
          );
        }
      } catch (error) {
        console.error("[Dashboard] Failed to load metrics:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
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
          <h1
            style={{ margin: "0 0 5px 0", fontSize: "28px", fontWeight: "600" }}
          >
            Dashboard
          </h1>
          <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>
            Benvenuto, {auth.user?.fullName}
          </p>
        </div>
      </div>

      {/* Hero Widget - Full Width Budget */}
      <div style={{ marginBottom: "20px" }}>
        <BudgetWidget
          currentBudget={budgetData?.currentBudget ?? 0}
          targetBudget={targetData.monthlyTarget}
          currency={targetData.currency}
          yearlyTarget={targetData.yearlyTarget}
          bonusInterval={targetData.bonusInterval}
          bonusAmount={targetData.bonusAmount}
          commissionRate={targetData.commissionRate}
        />
      </div>

      {/* Secondary Widgets Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: "20px",
        }}
        className="dashboard-grid"
      >
        {/* Orders Summary Widget */}
        <OrdersSummaryWidget
          todayCount={orderMetrics?.todayCount ?? 0}
          weekCount={orderMetrics?.weekCount ?? 0}
          monthCount={orderMetrics?.monthCount ?? 0}
        />

        {/* Commissions Widget */}
        <CommissionsWidget
          currentBudget={budgetData?.currentBudget ?? 0}
          yearlyTarget={targetData.yearlyTarget}
          commissionRate={targetData.commissionRate}
          bonusAmount={targetData.bonusAmount}
          bonusInterval={targetData.bonusInterval}
          extraBudgetInterval={targetData.extraBudgetInterval}
          extraBudgetReward={targetData.extraBudgetReward}
          monthlyAdvance={targetData.monthlyAdvance}
          currency={targetData.currency}
          hideCommissions={targetData.hideCommissions}
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
