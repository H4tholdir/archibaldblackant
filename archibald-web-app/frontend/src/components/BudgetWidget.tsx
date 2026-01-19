import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface BudgetWidgetProps {
  currentBudget: number;
  targetBudget: number;
  currency?: string;
  // Commission data for enhanced motivation
  yearlyTarget?: number;
  bonusInterval?: number;
  bonusAmount?: number;
  commissionRate?: number;
}

export function BudgetWidget({
  currentBudget,
  targetBudget,
  currency = "EUR",
  bonusInterval = 75000,
  bonusAmount = 5000,
  commissionRate = 0.18,
}: BudgetWidgetProps) {
  const navigate = useNavigate();
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [animatedBonusProgress, setAnimatedBonusProgress] = useState(0);

  // Format currency - MUST be declared before getHeroStatus() uses it
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Calculate monthly progress
  const monthlyProgress = Math.min((currentBudget / targetBudget) * 100, 100);
  const remaining = Math.max(targetBudget - currentBudget, 0);

  // Calculate next bonus progress
  const currentBonusProgress = currentBudget % bonusInterval;
  const bonusProgress = (currentBonusProgress / bonusInterval) * 100;
  const nextBonusRemaining = bonusInterval - currentBonusProgress;
  const nextBonusThreshold =
    Math.floor(currentBudget / bonusInterval + 1) * bonusInterval;

  // Calculate earned commission so far
  const earnedCommission = currentBudget * commissionRate;
  const bonusesEarned = Math.floor(currentBudget / bonusInterval) * bonusAmount;
  const totalEarned = earnedCommission + bonusesEarned;

  // Status logic (prioritize bonus over monthly target)
  const getHeroStatus = (): {
    color: string;
    bgGradient: string;
    message: string;
    icon: string;
    subMessage: string;
  } => {
    // Check if close to next bonus (within 10%)
    if (bonusProgress >= 90) {
      return {
        color: "#8e44ad",
        bgGradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        message: "Bonus Imminente! 🔥",
        icon: "🎯",
        subMessage: `Solo ${formatCurrency(nextBonusRemaining)} al prossimo bonus!`,
      };
    }

    // Check if close to next bonus (within 25%)
    if (bonusProgress >= 75) {
      return {
        color: "#e67e22",
        bgGradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
        message: "Quasi al Bonus! 💪",
        icon: "🚀",
        subMessage: `${formatCurrency(nextBonusRemaining)} per €${(bonusAmount / 1000).toFixed(0)}k bonus`,
      };
    }

    // Check monthly target status
    if (monthlyProgress >= 100) {
      return {
        color: "#27ae60",
        bgGradient: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
        message: "Target Superato! 🎉",
        icon: "✅",
        subMessage: `Continua così verso i €${(nextBonusThreshold / 1000).toFixed(0)}k!`,
      };
    }

    if (monthlyProgress >= 80) {
      return {
        color: "#27ae60",
        bgGradient: "linear-gradient(135deg, #0ba360 0%, #3cba92 100%)",
        message: "Eccellente Andamento! 💚",
        icon: "🎯",
        subMessage: `Solo ${formatCurrency(remaining)} al target mensile`,
      };
    }

    if (monthlyProgress >= 50) {
      return {
        color: "#f39c12",
        bgGradient: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
        message: "Sulla Buona Strada 👍",
        icon: "📈",
        subMessage: `${formatCurrency(remaining)} da recuperare`,
      };
    }

    return {
      color: "#e74c3c",
      bgGradient: "linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)",
      message: "Serve Uno Sprint! 💪",
      icon: "⚡",
      subMessage: `${formatCurrency(remaining)} per raggiungere il target`,
    };
  };

  const heroStatus = getHeroStatus();

  // Animate progress bars on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedProgress(monthlyProgress);
      setAnimatedBonusProgress(bonusProgress);
    }, 100);
    return () => clearTimeout(timer);
  }, [monthlyProgress, bonusProgress]);

  return (
    <div
      style={{
        position: "relative",
        background: heroStatus.bgGradient,
        borderRadius: "16px",
        padding: "30px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        transition: "all 0.3s ease",
        color: "#fff",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.15)";
      }}
    >
      {/* Header with Status Message */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "25px",
          flexWrap: "wrap",
          gap: "15px",
        }}
      >
        <div>
          <h2
            style={{
              margin: "0 0 8px 0",
              fontSize: "32px",
              fontWeight: "bold",
              textShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
          >
            {heroStatus.icon} {heroStatus.message}
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: "16px",
              opacity: 0.95,
              fontWeight: "500",
            }}
          >
            {heroStatus.subMessage}
          </p>
        </div>
        <button
          onClick={() => navigate("/profile")}
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.25)",
            border: "1px solid rgba(255, 255, 255, 0.4)",
            color: "#fff",
            fontSize: "14px",
            padding: "8px 16px",
            borderRadius: "20px",
            cursor: "pointer",
            fontWeight: "600",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.35)";
            e.currentTarget.style.transform = "scale(1.05)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.25)";
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          Modifica Target
        </button>
      </div>

      {/* Main Stats Grid - 4 columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "20px",
          marginBottom: "30px",
        }}
        className="budget-hero-stats"
      >
        {/* Stat 1: Current Budget */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.15)",
            borderRadius: "12px",
            padding: "20px 15px",
            textAlign: "center",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
          }}
        >
          <div
            style={{
              fontSize: "28px",
              fontWeight: "bold",
              marginBottom: "8px",
              textShadow: "0 2px 4px rgba(0,0,0,0.2)",
            }}
          >
            {formatCurrency(currentBudget)}
          </div>
          <div style={{ fontSize: "13px", opacity: 0.9, fontWeight: "600" }}>
            Budget Attuale
          </div>
        </div>

        {/* Stat 2: Monthly Target */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.15)",
            borderRadius: "12px",
            padding: "20px 15px",
            textAlign: "center",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
          }}
        >
          <div
            style={{
              fontSize: "28px",
              fontWeight: "bold",
              marginBottom: "8px",
              textShadow: "0 2px 4px rgba(0,0,0,0.2)",
            }}
          >
            {formatCurrency(targetBudget)}
          </div>
          <div style={{ fontSize: "13px", opacity: 0.9, fontWeight: "600" }}>
            Target Mensile
          </div>
        </div>

        {/* Stat 3: Provvigioni Maturate */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.15)",
            borderRadius: "12px",
            padding: "20px 15px",
            textAlign: "center",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
          }}
        >
          <div
            style={{
              fontSize: "28px",
              fontWeight: "bold",
              marginBottom: "8px",
              textShadow: "0 2px 4px rgba(0,0,0,0.2)",
            }}
          >
            {formatCurrency(totalEarned)}
          </div>
          <div style={{ fontSize: "13px", opacity: 0.9, fontWeight: "600" }}>
            Provvigioni Maturate
          </div>
        </div>

        {/* Stat 4: Next Bonus Amount */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.25)",
            borderRadius: "12px",
            padding: "20px 15px",
            textAlign: "center",
            backdropFilter: "blur(10px)",
            border: "2px solid rgba(255, 255, 255, 0.4)",
          }}
        >
          <div
            style={{
              fontSize: "28px",
              fontWeight: "bold",
              marginBottom: "8px",
              textShadow: "0 2px 4px rgba(0,0,0,0.2)",
            }}
          >
            {formatCurrency(bonusAmount)}
          </div>
          <div style={{ fontSize: "13px", opacity: 0.9, fontWeight: "600" }}>
            Prossimo Bonus
          </div>
        </div>
      </div>

      {/* Progress Section: Monthly Target */}
      <div style={{ marginBottom: "25px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "10px",
          }}
        >
          <span style={{ fontSize: "14px", fontWeight: "600", opacity: 0.95 }}>
            Progressione Target Mensile
          </span>
          <span style={{ fontSize: "16px", fontWeight: "bold" }}>
            {monthlyProgress.toFixed(1)}%
          </span>
        </div>
        <div
          style={{
            background: "rgba(255, 255, 255, 0.2)",
            borderRadius: "12px",
            height: "28px",
            overflow: "hidden",
            border: "1px solid rgba(255, 255, 255, 0.3)",
          }}
        >
          <div
            style={{
              width: `${animatedProgress}%`,
              height: "100%",
              background: "rgba(255, 255, 255, 0.9)",
              transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              paddingRight: "12px",
              fontWeight: "bold",
              color: heroStatus.color,
              fontSize: "13px",
            }}
          >
            {animatedProgress > 15 && `${monthlyProgress.toFixed(0)}%`}
          </div>
        </div>
      </div>

      {/* Progress Section: Next Bonus */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "10px",
          }}
        >
          <span style={{ fontSize: "14px", fontWeight: "600", opacity: 0.95 }}>
            Progressione Prossimo Bonus ({formatCurrency(nextBonusThreshold)})
          </span>
          <span style={{ fontSize: "16px", fontWeight: "bold" }}>
            {bonusProgress.toFixed(1)}%
          </span>
        </div>
        <div
          style={{
            background: "rgba(255, 255, 255, 0.2)",
            borderRadius: "12px",
            height: "28px",
            overflow: "hidden",
            border: "1px solid rgba(255, 255, 255, 0.3)",
          }}
        >
          <div
            style={{
              width: `${animatedBonusProgress}%`,
              height: "100%",
              background:
                bonusProgress >= 75
                  ? "linear-gradient(90deg, #ffd700 0%, #ffed4e 100%)"
                  : "rgba(255, 255, 255, 0.7)",
              transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              paddingRight: "12px",
              fontWeight: "bold",
              color: bonusProgress >= 75 ? "#8e44ad" : heroStatus.color,
              fontSize: "13px",
            }}
          >
            {animatedBonusProgress > 15 && `${bonusProgress.toFixed(0)}%`}
          </div>
        </div>
        <div
          style={{
            marginTop: "10px",
            fontSize: "13px",
            textAlign: "center",
            opacity: 0.9,
            fontWeight: "600",
          }}
        >
          {nextBonusRemaining > 0
            ? `Mancano ${formatCurrency(nextBonusRemaining)} per il bonus da ${formatCurrency(bonusAmount)}`
            : `🎉 Hai raggiunto il bonus!`}
        </div>
      </div>

      {/* Responsive Media Query */}
      <style>{`
        @media (max-width: 1024px) {
          .budget-hero-stats {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 640px) {
          .budget-hero-stats {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
