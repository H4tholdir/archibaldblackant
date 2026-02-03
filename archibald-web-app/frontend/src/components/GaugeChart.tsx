import { useEffect, useState } from "react";

interface GaugeChartProps {
  percentage: number; // 0-100
  size?: number; // Width/height in pixels
  thickness?: number; // Gauge thickness
  animate?: boolean; // Enable animation
}

export function GaugeChart({
  percentage,
  size = 300,
  thickness = 40,
  animate = true,
}: GaugeChartProps) {
  const [animatedPercentage, setAnimatedPercentage] = useState(0);
  const [animatedNeedleAngle, setAnimatedNeedleAngle] = useState(-90);

  useEffect(() => {
    if (animate) {
      // Animate from 0 to target percentage
      const duration = 1500; // ms
      const steps = 60;
      // Needle rotates from -90° (left/0%) to +90° (right/100%)
      const targetAngle = -90 + (percentage / 100) * 180;
      const angleIncrement = (targetAngle - -90) / steps;
      const percentIncrement = percentage / steps;

      let currentPercent = 0;
      let currentAngle = -90;
      let step = 0;

      const timer = setInterval(() => {
        step++;
        currentPercent = Math.min(
          percentage,
          currentPercent + percentIncrement,
        );
        currentAngle = Math.min(targetAngle, currentAngle + angleIncrement);

        setAnimatedPercentage(currentPercent);
        setAnimatedNeedleAngle(currentAngle);

        if (step >= steps || currentPercent >= percentage) {
          setAnimatedPercentage(percentage);
          setAnimatedNeedleAngle(targetAngle);
          clearInterval(timer);
        }
      }, duration / steps);

      return () => clearInterval(timer);
    } else {
      setAnimatedPercentage(percentage);
      setAnimatedNeedleAngle(-90 + (percentage / 100) * 180);
    }
  }, [percentage, animate]);

  // SVG dimensions
  const center = size / 2;
  const radius = (size - thickness) / 2;
  const circumference = Math.PI * radius; // Semi-circle

  // Calculate stroke dash
  const clampedPercentage = Math.max(0, Math.min(100, animatedPercentage));
  const strokeDashoffset =
    circumference - (circumference * clampedPercentage) / 100;

  // Determine color based on percentage
  const getColor = (pct: number): string => {
    if (pct >= 80) return "#27ae60"; // Green
    if (pct >= 60) return "#f39c12"; // Orange/Yellow
    if (pct >= 40) return "#e67e22"; // Orange
    return "#e74c3c"; // Red
  };

  const color = getColor(clampedPercentage);

  // Gauge colors for gradient segments
  const gradientId = `gauge-gradient-${Math.random()}`;

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
      }}
    >
      <svg
        width={size}
        height={size * 0.65}
        viewBox={`0 0 ${size} ${size * 0.65}`}
      >
        {/* Define gradient */}
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#e74c3c" />
            <stop offset="33%" stopColor="#e67e22" />
            <stop offset="66%" stopColor="#f39c12" />
            <stop offset="100%" stopColor="#27ae60" />
          </linearGradient>
        </defs>

        {/* Background arc (gray) */}
        <path
          d={`M ${thickness / 2} ${center}
             A ${radius} ${radius} 0 0 1 ${size - thickness / 2} ${center}`}
          fill="none"
          stroke="#e0e0e0"
          strokeWidth={thickness}
          strokeLinecap="round"
        />

        {/* Foreground arc (colored, animated) */}
        <path
          d={`M ${thickness / 2} ${center}
             A ${radius} ${radius} 0 0 1 ${size - thickness / 2} ${center}`}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{
            transition: animate ? "stroke-dashoffset 1.5s ease-out" : "none",
          }}
        />

        {/* Center ticks (optional decorative marks) */}
        {[0, 25, 50, 75, 100].map((tick) => {
          const tickAngle = 180 - (tick / 100) * 180;
          const tickRad = (tickAngle * Math.PI) / 180;
          const tickInnerRadius = radius - thickness / 2 + 5;
          const tickOuterRadius = radius - thickness / 2 - 5;
          const x1 = center + tickInnerRadius * Math.cos(tickRad);
          const y1 = center - tickInnerRadius * Math.sin(tickRad);
          const x2 = center + tickOuterRadius * Math.cos(tickRad);
          const y2 = center - tickOuterRadius * Math.sin(tickRad);

          return (
            <line
              key={tick}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#95a5a6"
              strokeWidth="2"
              opacity="0.5"
            />
          );
        })}

        {/* Needle (animated pointer) */}
        <g transform={`rotate(${animatedNeedleAngle}, ${center}, ${center})`}>
          <line
            x1={center}
            y1={center}
            x2={center}
            y2={center - radius + thickness / 2}
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <circle cx={center} cy={center} r="8" fill={color} />
          <circle cx={center} cy={center} r="4" fill="#fff" />
        </g>
      </svg>

      {/* Percentage text below gauge */}
      <div
        style={{
          fontSize: size * 0.25,
          fontWeight: "bold",
          color: color,
          marginTop: `-${size * 0.15}px`,
          textShadow: "0 2px 8px rgba(0,0,0,0.15)",
          transition: "color 0.5s ease",
        }}
      >
        {Math.round(clampedPercentage)}%
      </div>
    </div>
  );
}
