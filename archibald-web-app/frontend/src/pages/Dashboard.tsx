import { useState, useEffect, useCallback } from "react";
import { WidgetOrderConfigModal } from "../components/WidgetOrderConfigModal";
import { PrivacyToggle } from "../components/PrivacyToggle";
import { HeroStatusWidgetNew } from "../components/widgets/HeroStatusWidgetNew";
import { KpiCardsWidget } from "../components/widgets/KpiCardsWidget";
import { BonusRoadmapWidgetNew } from "../components/widgets/BonusRoadmapWidgetNew";
import { ForecastWidgetNew } from "../components/widgets/ForecastWidgetNew";
import { ActionSuggestionWidgetNew } from "../components/widgets/ActionSuggestionWidgetNew";
import { BalanceWidget } from "../components/widgets/BalanceWidget";
import { ExtraBudgetWidget } from "../components/widgets/ExtraBudgetWidget";
import { AlertsWidgetNew } from "../components/widgets/AlertsWidgetNew";
import { OrdersSummaryWidgetNew } from "../components/OrdersSummaryWidgetNew";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import type { DashboardData } from "../types/dashboard";
import type { OrdersMetrics } from "../types/dashboard";

export function Dashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(
    null,
  );
  const [orderMetrics, setOrderMetrics] = useState<OrdersMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Centralized fetch function (reusable for initial load, config update, auto-refresh)
  const fetchDashboardData = useCallback(async () => {
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
        setOrderMetrics(data);
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
  }, []);

  // Initial load
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Auto-refresh every 60s
  useAutoRefresh({
    enabled: !loading && !!dashboardData,
    intervalMs: 60000, // 1 minute
    onRefresh: fetchDashboardData,
    visibilityCheck: true,
  });

  const handleConfigUpdate = async () => {
    // Reload dashboard data after config changes
    await fetchDashboardData();
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

  if (!dashboardData || !orderMetrics) {
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
          gap: "24px",
        }}
      >
        {/* 1. Hero Status Widget with Gauge - Full Width */}
        <HeroStatusWidgetNew data={dashboardData.heroStatus} />

        {/* 2. KPI Cards Widget - 4 Fixed Cards */}
        <KpiCardsWidget cards={dashboardData.kpiCards} />

        {/* 3. Bonus Roadmap Widget Rinnovato */}
        <BonusRoadmapWidgetNew data={dashboardData.bonusRoadmap} />

        {/* 4. Forecast Widget Rinnovato */}
        <ForecastWidgetNew data={dashboardData.forecast} />

        {/* 5. Action Suggestion Widget Rinnovato */}
        <ActionSuggestionWidgetNew data={dashboardData.actionSuggestion} />

        {/* 6. Balance Widget (Anticipi vs Maturato) */}
        <BalanceWidget data={dashboardData.balance} />

        {/* 7. Orders Summary Widget with Comparisons */}
        <OrdersSummaryWidgetNew data={orderMetrics} />

        {/* 8. Extra Budget Widget (Conditional) */}
        <ExtraBudgetWidget data={dashboardData.extraBudget} />

        {/* 9. Alerts Widget Rinnovato (Conditional) */}
        <AlertsWidgetNew data={dashboardData.alerts} />
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
