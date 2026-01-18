interface TargetVisualizationWidgetProps {
  currentProgress: number; // 0-100 percentage
  targetDescription: string; // e.g., "Target Mensile"
  periodLabel: string; // e.g., "Gennaio 2026"
}

export function TargetVisualizationWidget({
  currentProgress,
  targetDescription,
  periodLabel,
}: TargetVisualizationWidgetProps) {
  // Color coding (consistent with BudgetWidget Phase 15-02)
  const getProgressColor = (progress: number): string => {
    if (progress >= 80) return "#27ae60"; // Green
    if (progress >= 50) return "#f39c12"; // Yellow
    return "#e74c3c"; // Red
  };

  // Motivational message logic (Italian, agent-facing)
  const getMotivationalMessage = (
    progress: number
  ): { text: string; icon: string } => {
    // Critical zone (<50%)
    if (progress < 30) {
      return {
        text: "Serve una spinta! Puoi recuperare 💪",
        icon: "🚨",
      };
    }
    if (progress < 50) {
      return {
        text: "A metà strada... acceleriamo! 🔥",
        icon: "⚠️",
      };
    }

    // Caution zone (50-79%)
    if (progress < 60) {
      return {
        text: "Buon ritmo, continua così! 👍",
        icon: "📈",
      };
    }
    if (progress < 70) {
      return {
        text: "Ottimo lavoro, ancora un po'! 🎯",
        icon: "💼",
      };
    }
    if (progress < 80) {
      return {
        text: "Ci sei quasi, non mollare! 🚀",
        icon: "⭐",
      };
    }

    // Target zone (>=80%)
    if (progress < 90) {
      return {
        text: "Sei in target! Mantieni il passo 🏆",
        icon: "✅",
      };
    }
    if (progress < 100) {
      return {
        text: "Eccezionale! Manca pochissimo 🎉",
        icon: "🔥",
      };
    }

    // Goal reached or exceeded
    return {
      text: "Obiettivo raggiunto! Sei un campione! 🥇",
      icon: "🎊",
    };
  };

  // Message background color by zone
  const getMessageBackground = (progress: number): string => {
    if (progress >= 80) return "rgba(39, 174, 96, 0.1)"; // Light green
    if (progress >= 50) return "rgba(243, 156, 18, 0.1)"; // Light yellow
    return "rgba(231, 76, 60, 0.1)"; // Light red
  };

  const message = getMotivationalMessage(currentProgress);

  // SVG circle calculations
  const radius = 85;
  const circumference = 2 * Math.PI * radius; // ~534
  const offset = circumference - (currentProgress / 100) * circumference;

  return (
    <div
      style={{
        background: "#f8f9fa",
        borderRadius: "12px",
        padding: "25px",
        textAlign: "center",
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: "20px",
          fontWeight: "bold",
          color: "#2c3e50",
          marginBottom: "10px",
        }}
      >
        Obiettivo
      </div>

      {/* Period Label Subtitle */}
      <div
        style={{
          fontSize: "14px",
          color: "#7f8c8d",
          marginBottom: "20px",
        }}
      >
        {periodLabel}
      </div>

      {/* SVG Circular Progress Chart */}
      <svg
        width="200"
        height="200"
        viewBox="0 0 200 200"
        style={{ margin: "0 auto", display: "block" }}
      >
        {/* Background track */}
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="#e0e0e0"
          strokeWidth="15"
        />

        {/* Progress arc */}
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke={getProgressColor(currentProgress)}
          strokeWidth="15"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 100 100)"
          style={{
            transition: "stroke-dashoffset 0.5s ease, stroke 0.3s ease",
          }}
        />

        {/* Center text - Percentage */}
        <text
          x="100"
          y="95"
          textAnchor="middle"
          fontSize="48"
          fontWeight="bold"
          fill="#2c3e50"
        >
          {currentProgress}%
        </text>

        {/* Center text - Target Description */}
        <text
          x="100"
          y="120"
          textAnchor="middle"
          fontSize="14"
          fill="#7f8c8d"
        >
          {targetDescription}
        </text>
      </svg>

      {/* Motivational Message */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "15px",
          padding: "15px",
          borderRadius: "8px",
          backgroundColor: getMessageBackground(currentProgress),
          marginTop: "20px",
        }}
      >
        {/* Icon */}
        <div style={{ fontSize: "32px" }}>{message.icon}</div>

        {/* Text */}
        <div
          style={{
            fontSize: "16px",
            fontWeight: "500",
            color: "#2c3e50",
            flex: 1,
          }}
        >
          {message.text}
        </div>
      </div>
    </div>
  );
}
