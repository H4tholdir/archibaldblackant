import { useAuth } from "../hooks/useAuth";
import { BudgetWidget } from "../components/BudgetWidget";
import { OrdersSummaryWidget } from "../components/OrdersSummaryWidget";
import { TargetVisualizationWidget } from "../components/TargetVisualizationWidget";

export function Dashboard() {
  const auth = useAuth();

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
        <BudgetWidget currentBudget={12500} targetBudget={20000} />

        {/* Orders Summary Widget */}
        <OrdersSummaryWidget todayCount={3} weekCount={12} monthCount={45} />

        {/* Target Visualization Widget */}
        <TargetVisualizationWidget
          currentProgress={67}
          targetDescription="Target Mensile"
          periodLabel="Gennaio 2026"
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
