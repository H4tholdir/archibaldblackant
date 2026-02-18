type CycleSizeStatus = "OK" | "CHANGED" | "DETECTION_FAILED";

type CycleSizeWarning = {
  parser: string;
  detected: number;
  expected: number;
  status: CycleSizeStatus;
};

const CYCLE_SIZE_WARNING_PREFIX = "CYCLE_SIZE_WARNING:";

function extractCycleSizeWarnings(stderr: string): CycleSizeWarning[] {
  const warnings: CycleSizeWarning[] = [];
  for (const line of stderr.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(CYCLE_SIZE_WARNING_PREFIX)) continue;
    try {
      const json = trimmed.slice(CYCLE_SIZE_WARNING_PREFIX.length);
      const parsed = JSON.parse(json) as CycleSizeWarning;
      if (parsed.parser && typeof parsed.detected === "number" && typeof parsed.expected === "number" && parsed.status) {
        warnings.push(parsed);
      }
    } catch {
      // Ignore malformed warning lines
    }
  }
  return warnings;
}

export type { CycleSizeWarning, CycleSizeStatus };
export { extractCycleSizeWarnings };
