import { useNavigate } from "react-router-dom";

interface OrdersSummaryWidgetProps {
  todayCount: number;
  weekCount: number;
  monthCount: number;
}

interface SummaryCardProps {
  label: string;
  count: number;
  icon: string;
  color: string;
  onClick?: () => void;
  ariaLabel?: string;
}

function SummaryCard({
  label,
  count,
  icon,
  color,
  onClick,
  ariaLabel,
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
        borderRadius: "12px",
        padding: "20px",
        cursor: "pointer",
        transition: "all 0.3s ease",
        flex: 1,
        minWidth: "150px",
        border: `2px solid ${color}`,
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = `0 8px 20px ${color}40`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Background Icon */}
      <div
        style={{
          position: "absolute",
          top: "-10px",
          right: "-10px",
          fontSize: "80px",
          opacity: 0.08,
        }}
      >
        {icon}
      </div>

      {/* Icon Badge */}
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "12px",
          background: `${color}15`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "24px",
          marginBottom: "15px",
        }}
      >
        {icon}
      </div>

      {/* Count */}
      <div
        style={{
          fontSize: "36px",
          fontWeight: "bold",
          color: color,
          marginBottom: "8px",
        }}
      >
        {count}
      </div>

      {/* Label */}
      <div
        style={{
          fontSize: "14px",
          color: "#7f8c8d",
          fontWeight: "600",
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function OrdersSummaryWidget({
  todayCount,
  weekCount,
  monthCount,
}: OrdersSummaryWidgetProps) {
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
        borderRadius: "12px",
        padding: "25px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "20px",
        }}
      >
        <div>
          <h3
            style={{
              margin: "0 0 5px 0",
              fontSize: "20px",
              fontWeight: "bold",
              color: "#2c3e50",
            }}
          >
            📦 Ordini Recenti
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: "13px",
              color: "#7f8c8d",
            }}
          >
            Panoramica temporale
          </p>
        </div>
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
          icon="⚡"
          color="#3498db"
          onClick={handleTodayClick}
          ariaLabel="Visualizza ordini di oggi"
        />

        {/* Card 2: Questa Settimana */}
        <SummaryCard
          label="Questa Settimana"
          count={weekCount}
          icon="📊"
          color="#27ae60"
          onClick={handleWeekClick}
          ariaLabel="Visualizza ordini della settimana"
        />

        {/* Card 3: Questo Mese */}
        <SummaryCard
          label="Questo Mese"
          count={monthCount}
          icon="📈"
          color="#9b59b6"
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
