import { fetchWithRetry } from '../utils/fetch-with-retry';

export type AgentQueueTask = {
  taskId: string;
  userId: string;
  taskType: string;
  status: 'enqueued' | 'running' | 'completed' | 'failed' | 'cancelled';
  enqueuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  payload: Record<string, unknown>;
};

export type QueueState = {
  active: AgentQueueTask[];
  recent: AgentQueueTask[];
};

export async function submitToConductor(
  tasks: Array<{ type: string; payload: Record<string, unknown> }>,
): Promise<{ taskIds: string[]; batchId?: string }> {
  const response = await fetchWithRetry('/api/agent-queue/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `HTTP ${response.status}: ${response.statusText}`,
    );
  }

  return response.json();
}

export async function getQueueState(): Promise<QueueState> {
  const response = await fetchWithRetry('/api/agent-queue/state');

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `HTTP ${response.status}: ${response.statusText}`,
    );
  }

  return response.json();
}

export async function cancelQueueTask(taskId: string): Promise<{ ok: boolean }> {
  const response = await fetchWithRetry(`/api/agent-queue/${taskId}/cancel`, { method: 'POST' });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `HTTP ${response.status}: ${response.statusText}`,
    );
  }

  return response.json();
}
