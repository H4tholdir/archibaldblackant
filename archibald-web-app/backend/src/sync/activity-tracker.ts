type AgentStatus = 'active' | 'idle' | 'offline';

const ACTIVE_THRESHOLD_MS = 2 * 60 * 60 * 1000;
const IDLE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function getAgentStatus(lastActivityAt: Date | null, now: Date = new Date()): AgentStatus {
  if (!lastActivityAt) return 'offline';
  const elapsed = now.getTime() - lastActivityAt.getTime();
  if (elapsed <= ACTIVE_THRESHOLD_MS) return 'active';
  if (elapsed <= IDLE_THRESHOLD_MS) return 'idle';
  return 'offline';
}

export { getAgentStatus, ACTIVE_THRESHOLD_MS, IDLE_THRESHOLD_MS };
export type { AgentStatus };
