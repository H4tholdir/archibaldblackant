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
  | 'sync-prices';

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
};

async function pollJobUntilDone(
  jobId: string,
  options: PollOptions = {},
): Promise<Record<string, unknown>> {
  const { intervalMs = 1500, maxWaitMs = 180_000, onProgress } = options;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const { job } = await getJobStatus(jobId);

    if (job.state === 'completed') {
      onProgress?.(100, 'Completato');
      return job.result ?? {};
    }

    if (job.state === 'failed') {
      throw new Error(job.failedReason ?? 'Operazione fallita');
    }

    if (typeof job.progress === 'number') {
      onProgress?.(job.progress);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Timeout: operazione non completata entro il tempo massimo');
}

export {
  enqueueOperation,
  getJobStatus,
  getOperationsDashboard,
  getQueueStats,
  retryJob,
  cancelJob,
  pollJobUntilDone,
  type OperationType,
  type EnqueueResponse,
  type JobStatusResponse,
  type DashboardResponse,
  type PollOptions,
};
