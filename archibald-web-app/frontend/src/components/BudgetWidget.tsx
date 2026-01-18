import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface BudgetWidgetProps {
  currentBudget: number; // Current month's orders total
  targetBudget: number; // Monthly target budget
  currency?: string; // Default "€"
}

export function BudgetWidget({
  currentBudget,
  targetBudget,
  currency = "EUR",
}: BudgetWidgetProps) {
  const navigate = useNavigate();
  const [animatedProgress, setAnimatedProgress] = useState(0);

  // Calculate progress percentage
  const progress = Math.min((currentBudget / targetBudget) * 100, 100);
  const remaining = Math.max(targetBudget - currentBudget, 0);

  // Color coding logic
  const getStatusColor = (
    progress: number
  ): { color: string; bgColor: string; text: string; icon: string } => {
    if (progress >= 80)
      return {
        color: "#27ae60",
        bgColor: "rgba(39, 174, 96, 0.2)",
        text: "In Target",
        icon: "🎯",
      };
    if (progress >= 50)
      return {
        color: "#f39c12",
        bgColor: "rgba(243, 156, 18, 0.2)",
        text: "Attenzione",
        icon: "⚠️",
      };
    return {
      color: "#e74c3c",
      bgColor: "rgba(231, 76, 60, 0.2)",
      text: "Critico",
      icon: "🔴",
    };
  };

  const status = getStatusColor(progress);

  // Animate progress bar on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedProgress(progress);
    }, 100);
    return () => clearTimeout(timer);
  }, [progress]);

  // Format currency using Italian locale
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  return (
    <div
      style={{
        position: "relative",
        background: "#fff",
        borderRadius: "10px",
        padding: "20px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        transition: "box-shadow 0.3s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
      }}
    >
      {/* Status Badge - Top Right */}
      <div
        style={{
          position: "absolute",
          top: "15px",
          right: "15px",
          padding: "5px 10px",
          borderRadius: "15px",
          fontSize: "12px",
          fontWeight: "bold",
          color: status.color,
          backgroundColor: status.bgColor,
          border: `1px solid ${status.color}`,
        }}
      >
        {status.icon} {status.text}
      </div>

      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "15px",
        }}
      >
        <div
          style={{
            fontSize: "18px",
            fontWeight: "bold",
            color: "#2c3e50",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          Budget Mensile
          <span
            style={{ fontSize: "14px", color: "#7f8c8d", fontWeight: "normal" }}
            title="Progressi vs target mensile"
          >
            ℹ️
          </span>
        </div>
        <button
          onClick={() => navigate("/profile")}
          style={{
            backgroundColor: "transparent",
            border: "none",
            color: "#7f8c8d",
            fontSize: "14px",
            cursor: "pointer",
            textDecoration: "underline",
            transition: "color 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#3498db")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#7f8c8d")}
        >
          Modifica target
        </button>
      </div>

      {/* Stats Section - 3 columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "15px",
          marginBottom: "20px",
        }}
        className="budget-stats"
      >
        {/* Column 1: Current Budget */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "24px",
              fontWeight: "bold",
              color: "#2c3e50",
              marginBottom: "5px",
            }}
          >
            {formatCurrency(currentBudget)}
          </div>
          <div style={{ fontSize: "12px", color: "#7f8c8d" }}>Attuale</div>
        </div>

        {/* Column 2: Progress Percentage */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "24px",
              fontWeight: "bold",
              color: status.color,
              marginBottom: "5px",
            }}
          >
            {progress.toFixed(1)}%
          </div>
          <div style={{ fontSize: "12px", color: "#7f8c8d" }}>Percentuale</div>
        </div>

        {/* Column 3: Target Budget */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "24px",
              fontWeight: "bold",
              color: "#2c3e50",
              marginBottom: "5px",
            }}
          >
            {formatCurrency(targetBudget)}
          </div>
          <div style={{ fontSize: "12px", color: "#7f8c8d" }}>Target</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div
        style={{
          background: "#e0e0e0",
          borderRadius: "10px",
          height: "20px",
          overflow: "hidden",
          marginBottom: "12px",
        }}
      >
        <div
          style={{
            width: `${animatedProgress}%`,
            height: "100%",
            background: status.color,
            transition: "width 0.3s ease",
            borderRadius: "10px",
          }}
        />
      </div>

      {/* Footer */}
      <div style={{ fontSize: "14px", color: "#7f8c8d", textAlign: "center" }}>
        {remaining > 0
          ? `Mancano ${formatCurrency(remaining)} per raggiungere il target`
          : `🎉 Target superato di ${formatCurrency(currentBudget - targetBudget)}!`}
      </div>

      {/* Responsive Media Query */}
      <style>{`
        @media (max-width: 768px) {
          .budget-stats {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
          }
        }
      `}</style>
    </div>
  );
}
