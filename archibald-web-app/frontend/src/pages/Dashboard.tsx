import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { BudgetWidget } from "../components/BudgetWidget";
import { OrdersSummaryWidget } from "../components/OrdersSummaryWidget";
import { CommissionsWidget } from "../components/CommissionsWidget";
import { WarehouseStatsWidget } from "../components/WarehouseStatsWidget";
import { WidgetOrderConfigModal } from "../components/WidgetOrderConfigModal";

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
  const [showConfigModal, setShowConfigModal] = useState(false);

  useEffect(() => {
    const fetchDashboardData = async () => {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const [targetRes, budgetRes, ordersRes] = await Promise.all([
          fetch("/api/users/me/target", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("/api/metrics/budget", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("/api/metrics/orders", {
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

  const handleConfigUpdate = async () => {
    // Reload dashboard data after config changes
    const token = localStorage.getItem("archibald_jwt");
    if (!token) return;

    try {
      const [budgetRes, ordersRes] = await Promise.all([
        fetch("/api/metrics/budget", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/metrics/orders", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (budgetRes.ok) {
        const data = await budgetRes.json();
        setBudgetData({
          currentBudget: data.currentBudget,
          progress: data.progress,
        });
      }

      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setOrderMetrics({
          todayCount: data.todayCount,
          weekCount: data.weekCount,
          monthCount: data.monthCount,
        });
      }
    } catch (error) {
      console.error("[Dashboard] Failed to reload metrics:", error);
    }
  };

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
      {/* Logo Section */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          marginBottom: "30px",
          padding: "20px 0",
        }}
      >
        <img
          src="/formicaneralogo.png"
          alt="Formicanera"
          style={{
            maxWidth: "300px",
            width: "100%",
            height: "auto",
          }}
        />
      </div>

      {/* Widget Configuration Button */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: "20px",
        }}
      >
        <button
          onClick={() => setShowConfigModal(true)}
          style={{
            padding: "12px 20px",
            backgroundColor: "#3498db",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: "500",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            boxShadow: "0 2px 8px rgba(52, 152, 219, 0.3)",
            transition: "all 0.2s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "#2980b9";
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow =
              "0 4px 12px rgba(52, 152, 219, 0.4)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "#3498db";
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow =
              "0 2px 8px rgba(52, 152, 219, 0.3)";
          }}
        >
          <span style={{ fontSize: "16px" }}>⚙️</span>
          Configura Ordini Widget
        </button>
      </div>

      {/* Hero Widget - Full Width Budget */}
      <div style={{ marginBottom: "20px" }}>
        <BudgetWidget
          currentBudget={budgetData?.currentBudget ?? 0}
          targetBudget={targetData?.monthlyTarget ?? 0}
          currency={targetData?.currency ?? "EUR"}
          yearlyTarget={targetData?.yearlyTarget ?? 0}
          bonusInterval={targetData?.bonusInterval ?? 75000}
          bonusAmount={targetData?.bonusAmount ?? 5000}
          commissionRate={targetData?.commissionRate ?? 0.18}
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
          yearlyTarget={targetData?.yearlyTarget ?? 0}
          commissionRate={targetData?.commissionRate ?? 0.18}
          bonusAmount={targetData?.bonusAmount ?? 5000}
          bonusInterval={targetData?.bonusInterval ?? 75000}
          extraBudgetInterval={targetData?.extraBudgetInterval ?? 50000}
          extraBudgetReward={targetData?.extraBudgetReward ?? 6000}
          monthlyAdvance={targetData?.monthlyAdvance ?? 3500}
          currency={targetData?.currency ?? "EUR"}
          hideCommissions={targetData?.hideCommissions ?? false}
        />

        {/* Warehouse Stats Widget (Phase 5) */}
        <WarehouseStatsWidget />
      </div>

      {/* Responsive Grid Media Query via inline style tag */}
      <style>{`
        @media (min-width: 768px) {
          .dashboard-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
      `}</style>

      {/* Widget Order Configuration Modal */}
      <WidgetOrderConfigModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        year={new Date().getFullYear()}
        month={new Date().getMonth() + 1}
        onUpdate={handleConfigUpdate}
      />
    </div>
  );
}
