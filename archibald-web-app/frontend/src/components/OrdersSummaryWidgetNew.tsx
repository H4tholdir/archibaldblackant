import { useNavigate } from "react-router-dom";
import type { OrdersMetrics } from "../types/dashboard";

interface OrdersSummaryWidgetNewProps {
  data: OrdersMetrics;
}

interface SummaryCardProps {
  label: string;
  count: number;
  icon: string;
  color: string;
  onClick?: () => void;
  ariaLabel?: string;
  comparison?: {
    previousValue: number;
    absoluteDelta: number;
    percentageDelta: number;
    label: string;
  };
}

function SummaryCard({
  label,
  count,
  icon,
  color,
  onClick,
  ariaLabel,
  comparison,
}: SummaryCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      style={{
        background: "#fff",
        borderRadius: "16px",
        padding: "24px",
        cursor: "pointer",
        transition: "all 0.3s ease",
        flex: 1,
        minWidth: "180px",
        border: `2px solid ${color}`,
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-6px)";
        e.currentTarget.style.boxShadow = `0 12px 28px ${color}30`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
      }}
    >
      {/* Background Icon */}
      <div
        style={{
          position: "absolute",
          top: "-15px",
          right: "-15px",
          fontSize: "100px",
          opacity: 0.06,
        }}
      >
        {icon}
      </div>

      {/* Icon Badge */}
      <div
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "14px",
          background: `${color}15`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "28px",
          marginBottom: "16px",
        }}
      >
        {icon}
      </div>

      {/* Count */}
      <div
        style={{
          fontSize: "42px",
          fontWeight: "bold",
          color: color,
          marginBottom: "10px",
          lineHeight: "1",
        }}
      >
        {count}
      </div>

      {/* Label */}
      <div
        style={{
          fontSize: "15px",
          color: "#7f8c8d",
          fontWeight: "600",
          marginBottom: comparison ? "12px" : "0",
        }}
      >
        {label}
      </div>

      {/* Comparison */}
      {comparison && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              color: "#95a5a6",
              fontWeight: "500",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            {comparison.label}
          </div>
          <div
            style={{
              fontSize: "13px",
              color: comparison.absoluteDelta >= 0 ? "#27ae60" : "#e74c3c",
              fontWeight: "600",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor:
                comparison.absoluteDelta >= 0 ? "#e8f8f0" : "#fdeaea",
              padding: "6px 10px",
              borderRadius: "8px",
            }}
          >
            <span style={{ fontSize: "16px" }}>
              {comparison.absoluteDelta >= 0 ? "📈" : "📉"}
            </span>
            <span>
              {comparison.absoluteDelta >= 0 ? "+" : ""}
              {comparison.absoluteDelta} (
              {comparison.absoluteDelta >= 0 ? "+" : ""}
              {comparison.percentageDelta.toFixed(0)}%)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function OrdersSummaryWidgetNew({ data }: OrdersSummaryWidgetNewProps) {
  const navigate = useNavigate();

  const handleTodayClick = () => {
    navigate("/orders?filter=today");
  };

  const handleWeekClick = () => {
    navigate("/orders?filter=week");
  };

  const handleMonthClick = () => {
    navigate("/orders?filter=month");
  };

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "16px",
        padding: "30px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "24px",
        }}
      >
        <div>
          <h3
            style={{
              margin: "0 0 6px 0",
              fontSize: "22px",
              fontWeight: "bold",
              color: "#2c3e50",
            }}
          >
            📦 Ordini Recenti
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "#7f8c8d",
            }}
          >
            Panoramica temporale con comparazioni
          </p>
        </div>
      </div>

      {/* Summary Cards Container */}
      <div
        style={{
          display: "flex",
          gap: "20px",
        }}
        className="orders-summary-cards"
      >
        {/* Card 1: Oggi */}
        <SummaryCard
          label="Oggi"
          count={data.todayCount}
          icon="⚡"
          color="#3498db"
          onClick={handleTodayClick}
          ariaLabel="Visualizza ordini di oggi"
          comparison={
            data.comparisonYesterday
              ? {
                  previousValue: data.comparisonYesterday.previousValue,
                  absoluteDelta: data.comparisonYesterday.absoluteDelta,
                  percentageDelta: data.comparisonYesterday.percentageDelta,
                  label: "vs Ieri",
                }
              : undefined
          }
        />

        {/* Card 2: Questa Settimana */}
        <SummaryCard
          label="Questa Settimana"
          count={data.weekCount}
          icon="📊"
          color="#27ae60"
          onClick={handleWeekClick}
          ariaLabel="Visualizza ordini della settimana"
          comparison={
            data.comparisonLastWeek
              ? {
                  previousValue: data.comparisonLastWeek.previousValue,
                  absoluteDelta: data.comparisonLastWeek.absoluteDelta,
                  percentageDelta: data.comparisonLastWeek.percentageDelta,
                  label: data.comparisonLastWeek.label,
                }
              : undefined
          }
        />

        {/* Card 3: Questo Mese */}
        <SummaryCard
          label="Questo Mese"
          count={data.monthCount}
          icon="📈"
          color="#9b59b6"
          onClick={handleMonthClick}
          ariaLabel="Visualizza ordini del mese"
          comparison={
            data.comparisonLastMonth
              ? {
                  previousValue: data.comparisonLastMonth.previousValue,
                  absoluteDelta: data.comparisonLastMonth.absoluteDelta,
                  percentageDelta: data.comparisonLastMonth.percentageDelta,
                  label: data.comparisonLastMonth.label,
                }
              : undefined
          }
        />
      </div>

      {/* Responsive Media Query */}
      <style>{`
        @media (max-width: 768px) {
          .orders-summary-cards {
            flex-direction: column !important;
          }
        }
      `}</style>
    </div>
  );
}
