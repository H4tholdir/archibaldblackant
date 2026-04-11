type OperationType =
  | 'submit-order'
  | 'create-customer'
  | 'update-customer'
  | 'send-to-verona'
  | 'edit-order'
  | 'delete-order'
  | 'download-ddt-pdf'
  | 'download-invoice-pdf'
  | 'sync-order-articles'
  | 'sync-customers'
  | 'sync-orders'
  | 'sync-ddt'
  | 'sync-invoices'
  | 'sync-products'
  | 'sync-prices'
  | 'sync-customer-addresses'
  | 'read-vat-status'
  | 'refresh-customer';

type EnqueueResponse = {
  success: boolean;
  jobId: string;
  error?: string;
};

type JobStatusResponse = {
  success: boolean;
  job: {
    jobId: string;
    type: OperationType;
    userId: string;
    state: string;
    progress: number;
    progressLabel?: string;
    result: Record<string, unknown> | null;
    failedReason: string | undefined;
  };
};

type DashboardResponse = {
  success: boolean;
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    prioritized: number;
  };
  activeJobs: Array<{
    userId: string;
    jobId: string;
    type: OperationType;
  }>;
  browserPool: {
    browsers: number;
    activeContexts: number;
    maxContexts: number;
  };
};

function getAuthHeaders(): Headers {
  const token = localStorage.getItem('archibald_jwt');
  const headers = new Headers({
    'Content-Type': 'application/json',
  });
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

async function enqueueOperation(
  type: OperationType,
  data: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<EnqueueResponse> {
  const response = await fetch('/api/operations/enqueue', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ type, data, ...(idempotencyKey ? { idempotencyKey } : {}) }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const response = await fetch(`/api/operations/${jobId}/status`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function getOperationsDashboard(): Promise<DashboardResponse> {
  const response = await fetch('/api/operations/dashboard', {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function getQueueStats(): Promise<Record<string, unknown>> {
  const response = await fetch('/api/operations/stats', {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function retryJob(jobId: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/operations/${jobId}/retry`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function cancelJob(jobId: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/operations/${jobId}/cancel`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

type PollOptions = {
  intervalMs?: number;
  maxWaitMs?: number;
  onProgress?: (progress: number, label?: string) => void;
  signal?: { cancelled: boolean };
};

async function pollJobUntilDone(
  jobId: string,
  options: PollOptions = {},
): Promise<Record<string, unknown>> {
  const { intervalMs = 1500, maxWaitMs = 180_000, onProgress, signal } = options;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    if (signal?.cancelled) return {};
    try {
      const { job } = await getJobStatus(jobId);

      if (job.state === 'completed') {
        onProgress?.(100, 'Completato');
        return job.result ?? {};
      }

      if (job.state === 'failed') {
        throw new Error(job.failedReason ?? 'Operazione fallita');
      }

      if (typeof job.progress === 'number') {
        onProgress?.(job.progress, job.progressLabel);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('404')) {
        // Job not found in queue (e.g. interactive session) — keep waiting
      } else {
        throw err;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Timeout: operazione non completata entro il tempo massimo');
}

type SubscribeFn = (eventType: string, callback: (payload: unknown) => void) => () => void;

type WaitForJobOptions = PollOptions & {
  subscribe?: SubscribeFn;
  wsFallbackMs?: number;
  skipSafetyPoll?: boolean;
};

async function waitForJobViaWebSocket(
  jobId: string,
  options: WaitForJobOptions = {},
): Promise<Record<string, unknown>> {
  const { subscribe, wsFallbackMs = 5000, intervalMs, maxWaitMs, onProgress, skipSafetyPoll } = options;

  if (!subscribe) {
    return pollJobUntilDone(jobId, { intervalMs, maxWaitMs, onProgress });
  }

  return new Promise((resolve, reject) => {
    let resolved = false;
    let wsActive = false;
    const unsubscribers: Array<() => void> = [];
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    const fallbackSignal = { cancelled: false };

    const hardDeadline = setTimeout(() => {
      if (resolved) return;
      cleanup();
      reject(new Error('Timeout: operazione non completata entro il tempo massimo'));
    }, maxWaitMs ?? 180_000);

    let safetyPollTimer: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      resolved = true;
      fallbackSignal.cancelled = true;
      clearTimeout(hardDeadline);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (safetyPollTimer) clearInterval(safetyPollTimer);
      unsubscribers.forEach(u => u());
    };

    const cancelFallback = () => {
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
    };

    const resetFallback = () => {
      if (wsActive) return;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      fallbackTimer = setTimeout(() => {
        if (resolved) return;
        pollJobUntilDone(jobId, { intervalMs, maxWaitMs, onProgress, signal: fallbackSignal })
          .then((result) => { if (!resolved) { cleanup(); resolve(result); } })
          .catch((err) => { if (!resolved) { cleanup(); reject(err); } });
      }, wsFallbackMs);
    };

    const markWsActive = () => {
      wsActive = true;
      cancelFallback();
    };

    const handleEvent = (eventType: string) => (payload: unknown) => {
      if (resolved) return;
      const p = (payload ?? {}) as Record<string, unknown>;
      if (p.jobId !== jobId) return;

      markWsActive();

      if (eventType === 'JOB_PROGRESS') {
        const progress = p.progress as number;
        const label = p.label as string | undefined;
        onProgress?.(progress, label);
      } else if (eventType === 'JOB_COMPLETED') {
        cleanup();
        onProgress?.(100, 'Completato');
        resolve((p.result as Record<string, unknown>) ?? {});
      } else if (eventType === 'JOB_FAILED') {
        cleanup();
        reject(new Error((p.error as string) ?? 'Operazione fallita'));
      }
    };

    unsubscribers.push(subscribe('JOB_STARTED', handleEvent('JOB_STARTED')));
    unsubscribers.push(subscribe('JOB_PROGRESS', handleEvent('JOB_PROGRESS')));
    unsubscribers.push(subscribe('JOB_COMPLETED', handleEvent('JOB_COMPLETED')));
    unsubscribers.push(subscribe('JOB_FAILED', handleEvent('JOB_FAILED')));
    unsubscribers.push(subscribe('JOB_REQUEUED', (payload) => {
      if (resolved) return;
      const p = (payload ?? {}) as Record<string, unknown>;
      if (p.originalJobId !== jobId) return;

      markWsActive();

      const newJobId = p.newJobId as string;
      waitForJobViaWebSocket(newJobId, options)
        .then((result) => { if (!resolved) { cleanup(); resolve(result); } })
        .catch((err) => { if (!resolved) { cleanup(); reject(err); } });
    }));

    if (!skipSafetyPoll) {
      safetyPollTimer = setInterval(async () => {
        if (resolved) return;
        try {
          const { job } = await getJobStatus(jobId);
          if (resolved) return;
          if (job.state === 'completed') {
            cleanup();
            onProgress?.(100, 'Completato');
            resolve(job.result ?? {});
          } else if (job.state === 'failed') {
            cleanup();
            reject(new Error(job.failedReason ?? 'Operazione fallita'));
          }
        } catch {
          // Poll failed, will retry next interval
        }
      }, 15_000);
    }

    resetFallback();
  });
}

export {
  enqueueOperation,
  getJobStatus,
  getOperationsDashboard,
  getQueueStats,
  retryJob,
  cancelJob,
  pollJobUntilDone,
  waitForJobViaWebSocket,
  type OperationType,
  type EnqueueResponse,
  type JobStatusResponse,
  type DashboardResponse,
  type PollOptions,
  type WaitForJobOptions,
  type SubscribeFn,
};
