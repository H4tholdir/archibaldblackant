import { useNavigate } from "react-router-dom";

interface OrdersSummaryWidgetProps {
  todayCount: number;
  weekCount: number;
  monthCount: number;
}

interface SummaryCardProps {
  label: string;
  count: number;
  borderColor: string;
  trend?: string; // e.g., "+15%" or "-8%"
  trendDirection?: "up" | "down" | "neutral";
  onClick?: () => void;
  ariaLabel?: string;
}

function SummaryCard({
  label,
  count,
  borderColor,
  trend,
  trendDirection = "neutral",
  onClick,
  ariaLabel,
}: SummaryCardProps) {
  const trendIcon =
    trendDirection === "up" ? "↑" : trendDirection === "down" ? "↓" : "→";
  const trendColor =
    trendDirection === "up"
      ? "#27ae60"
      : trendDirection === "down"
        ? "#e74c3c"
        : "#7f8c8d";

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
        background: "#f8f9fa",
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: "8px",
        padding: "15px",
        cursor: "pointer",
        transition: "all 0.2s ease",
        flex: 1,
        minWidth: "150px",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.02)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = "none";
      }}
      onMouseDown={(e) => {
        // Active state feedback on click
        e.currentTarget.style.background = "#e9ecef";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.background = "#f8f9fa";
      }}
    >
      {/* Count */}
      <div
        style={{
          fontSize: "32px",
          fontWeight: "bold",
          color: "#2c3e50",
        }}
      >
        {count}
      </div>

      {/* Label */}
      <div
        style={{
          fontSize: "14px",
          color: "#7f8c8d",
          marginTop: "5px",
        }}
      >
        {label}
      </div>

      {/* Trend (optional) */}
      {trend && (
        <div
          style={{
            fontSize: "12px",
            marginTop: "5px",
            color: trendColor,
            fontWeight: "bold",
          }}
        >
          {trendIcon} {trend}
        </div>
      )}
    </div>
  );
}

export function OrdersSummaryWidget({
  todayCount,
  weekCount,
  monthCount,
}: OrdersSummaryWidgetProps) {
  const navigate = useNavigate();

  // TODO Phase 17: OrderHistory should read filter query param and apply date range
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
        borderRadius: "10px",
        padding: "20px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: "18px",
          fontWeight: "bold",
          marginBottom: "15px",
          color: "#2c3e50",
        }}
      >
        Ordini Recenti
      </div>

      {/* Summary Cards Container */}
      <div
        style={{
          display: "flex",
          gap: "15px",
        }}
        className="orders-summary-cards"
      >
        {/* Card 1: Oggi */}
        <SummaryCard
          label="Oggi"
          count={todayCount}
          borderColor="#3498db"
          trend="+2"
          trendDirection="up"
          onClick={handleTodayClick}
          ariaLabel="Visualizza ordini di oggi"
        />

        {/* Card 2: Questa Settimana */}
        <SummaryCard
          label="Questa Settimana"
          count={weekCount}
          borderColor="#27ae60"
          trend="+15%"
          trendDirection="up"
          onClick={handleWeekClick}
          ariaLabel="Visualizza ordini della settimana"
        />

        {/* Card 3: Questo Mese */}
        <SummaryCard
          label="Questo Mese"
          count={monthCount}
          borderColor="#9b59b6"
          trend="-8%"
          trendDirection="down"
          onClick={handleMonthClick}
          ariaLabel="Visualizza ordini del mese"
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
