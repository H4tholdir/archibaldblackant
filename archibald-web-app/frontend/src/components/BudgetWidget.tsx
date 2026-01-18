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
  // Calculate progress percentage
  const progress = Math.min((currentBudget / targetBudget) * 100, 100);
  const remaining = Math.max(targetBudget - currentBudget, 0);

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
              color: "#2c3e50",
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
            width: `${progress}%`,
            height: "100%",
            background: "#3498db",
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
