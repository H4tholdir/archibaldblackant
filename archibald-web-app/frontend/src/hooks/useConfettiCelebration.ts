import { useEffect } from "react";
import confetti from "canvas-confetti";

type CelebrationVariant = "sideCannons" | "fireworks";

interface UseConfettiCelebrationOptions {
  enabled: boolean;
  key: string;
  variant?: CelebrationVariant;
  cooldownMs?: number;
}

function fireSideCannons(): void {
  const duration = 6000;
  const end = Date.now() + duration;
  const colors = ["#a786ff", "#fd8bbc", "#eca184", "#f8deb1"];

  const frame = () => {
    if (Date.now() > end) return;

    confetti({
      particleCount: 2,
      angle: 60,
      spread: 55,
      startVelocity: 60,
      origin: { x: 0, y: 0.5 },
      colors,
    });
    confetti({
      particleCount: 2,
      angle: 120,
      spread: 55,
      startVelocity: 60,
      origin: { x: 1, y: 0.5 },
      colors,
    });

    requestAnimationFrame(frame);
  };

  frame();
}

function fireStarFireworks(): void {
  const duration = 5000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

  const randomInRange = (min: number, max: number) =>
    Math.random() * (max - min) + min;

  const interval = window.setInterval(() => {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / duration);
    confetti({
      ...defaults,
      particleCount,
      shapes: ["star"],
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
    });
    confetti({
      ...defaults,
      particleCount,
      shapes: ["star"],
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
    });
  }, 250);
}

export function useConfettiCelebration({
  enabled,
  key,
  variant = "sideCannons",
  cooldownMs = 24 * 60 * 60 * 1000,
}: UseConfettiCelebrationOptions): void {
  useEffect(() => {
    if (!enabled) return;

    const lastCelebrationKey = `confetti-celebration-${key}`;
    const lastCelebration = localStorage.getItem(lastCelebrationKey);

    if (lastCelebration) {
      const elapsed = Date.now() - parseInt(lastCelebration, 10);
      if (elapsed < cooldownMs) {
        return;
      }
    }

    if (variant === "fireworks") {
      fireStarFireworks();
    } else {
      fireSideCannons();
    }

    localStorage.setItem(lastCelebrationKey, Date.now().toString());
  }, [enabled, key, variant, cooldownMs]);
}
