import { useState, useEffect } from "react";
import { OrdersSummaryWidget } from "../components/OrdersSummaryWidget";
import { WidgetOrderConfigModal } from "../components/WidgetOrderConfigModal";
import { PrivacyToggle } from "../components/PrivacyToggle";
import { HeroStatusWidget } from "../components/widgets/HeroStatusWidget";
import { KpiCardsWidget } from "../components/widgets/KpiCardsWidget";
import { BonusRoadmapWidget } from "../components/widgets/BonusRoadmapWidget";
import { ForecastWidget } from "../components/widgets/ForecastWidget";
import { ActionSuggestionWidget } from "../components/widgets/ActionSuggestionWidget";
import { BalanceWidget } from "../components/widgets/BalanceWidget";
import { ExtraBudgetWidget } from "../components/widgets/ExtraBudgetWidget";
import { AlertsWidget } from "../components/widgets/AlertsWidget";
import type { DashboardData } from "../types/dashboard";

export function Dashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(
    null,
  );
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
        const [dashboardRes, ordersRes] = await Promise.all([
          fetch("/api/widget/dashboard-data", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("/api/metrics/orders", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (dashboardRes.ok) {
          const data = await dashboardRes.json();
          setDashboardData(data);
        } else {
          console.error(
            "[Dashboard] Failed to load dashboard data:",
            await dashboardRes.text(),
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
        console.error("[Dashboard] Failed to load dashboard data:", error);
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
      const [dashboardRes, ordersRes] = await Promise.all([
        fetch("/api/widget/dashboard-data", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/metrics/orders", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (dashboardRes.ok) {
        const data = await dashboardRes.json();
        setDashboardData(data);
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
      console.error("[Dashboard] Failed to reload dashboard data:", error);
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

  if (!dashboardData) {
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
          Errore nel caricare i dati della dashboard.
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

      {/* Header with Privacy Toggle and Config Button */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: "15px",
          marginBottom: "20px",
        }}
      >
        <PrivacyToggle />
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

      {/* Widgets Container */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        {/* 1. Hero Status Widget - Full Width */}
        <HeroStatusWidget data={dashboardData.heroStatus} />

        {/* 2. KPI Cards Widget - 4 Fixed Cards */}
        <KpiCardsWidget cards={dashboardData.kpiCards} />

        {/* 3. Bonus Roadmap Widget */}
        <BonusRoadmapWidget data={dashboardData.bonusRoadmap} />

        {/* 4. Forecast Widget */}
        <ForecastWidget data={dashboardData.forecast} />

        {/* 5. Action Suggestion Widget */}
        <ActionSuggestionWidget data={dashboardData.actionSuggestion} />

        {/* 6. Balance Widget (Anticipi vs Maturato) */}
        <BalanceWidget data={dashboardData.balance} />

        {/* 7. Orders Summary Widget (Existing) */}
        <OrdersSummaryWidget
          todayCount={orderMetrics?.todayCount ?? 0}
          weekCount={orderMetrics?.weekCount ?? 0}
          monthCount={orderMetrics?.monthCount ?? 0}
        />

        {/* 8. Extra Budget Widget (Conditional - Visible only if exceeded target) */}
        <ExtraBudgetWidget data={dashboardData.extraBudget} />

        {/* 9. Alerts Widget (Conditional - Visible if at risk) */}
        <AlertsWidget data={dashboardData.alerts} />
      </div>

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
