import { useEffect } from "react";
import confetti from "canvas-confetti";

interface UseConfettiCelebrationOptions {
  enabled: boolean; // Trigger quando true
  key: string; // Unique key per localStorage (es: "monthly-target-2026-02")
  cooldownMs?: number; // Default: 24h
}

/**
 * Hook per celebrazione con confetti side cannons
 * Gestisce cooldown con localStorage per evitare ripetizioni
 */
export function useConfettiCelebration({
  enabled,
  key,
  cooldownMs = 24 * 60 * 60 * 1000, // Default 24h
}: UseConfettiCelebrationOptions): void {
  useEffect(() => {
    if (!enabled) return;

    // Check cooldown in localStorage
    const lastCelebrationKey = `confetti-celebration-${key}`;
    const lastCelebration = localStorage.getItem(lastCelebrationKey);

    if (lastCelebration) {
      const elapsed = Date.now() - parseInt(lastCelebration, 10);
      if (elapsed < cooldownMs) {
        return; // Still in cooldown
      }
    }

    // Fire side cannons confetti
    const duration = 3000; // 3 seconds
    const end = Date.now() + duration;

    const colors = ["#667eea", "#764ba2", "#f093fb", "#27ae60", "#2ecc71"];

    const frame = () => {
      const timeLeft = end - Date.now();
      if (timeLeft <= 0) return;

      const particleCount = Math.floor((timeLeft / duration) * 50);

      // Left cannon
      confetti({
        particleCount,
        angle: 60,
        spread: 55,
        origin: { x: 0.1, y: 0.8 },
        colors,
      });

      // Right cannon
      confetti({
        particleCount,
        angle: 120,
        spread: 55,
        origin: { x: 0.9, y: 0.8 },
        colors,
      });

      requestAnimationFrame(frame);
    };

    // Start animation
    frame();

    // Save timestamp to localStorage
    localStorage.setItem(lastCelebrationKey, Date.now().toString());
  }, [enabled, key, cooldownMs]);
}
